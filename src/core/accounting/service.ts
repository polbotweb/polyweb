/**
 * Paramétrage comptable par tenant (`organizationId`, `null` = plateforme) : lecture de la
 * configuration effective, enregistrement des rôles / journaux, gestion des comptes du plan,
 * attribution des codes de lettrage. Toute écriture est auditée dans la même transaction.
 */
import { Effect } from "effect";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { auditLog } from "@database/schemas/audit-log.schema";
import { dbTry } from "@/lib/effect/run";
import type { DbError } from "@/lib/effect/errors";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/failure";
import { nextSequenceValue } from "@/core/numbering";
import {
  DEFAULT_ACCOUNTING_CONFIG, letteringCode, resolveAccountingConfig, validateAccount, validateAccountingSettings,
  type AccountingConfig, type AccountRole, type ChartAccount, type Journal, type JournalKind,
} from "./chart";
import { accountingAccounts, accountingSettings } from "./schema";

type Executor = Pick<ReturnType<typeof getDrizzle>, "select">;

const tenant = (column: Parameters<typeof eq>[0], organizationId: string | null): SQL =>
  organizationId === null ? isNull(column) : eq(column, organizationId);

const audit = (tx: DbTransaction, input: { actorId: string | null; organizationId: string | null; action: string; resourceId: string; metadata: Record<string, unknown> }) =>
  dbTry("accounting.audit", () => tx.insert(auditLog).values({
    userId: input.actorId, action: input.action, resource: "accounting", resourceId: input.resourceId,
    organizationId: input.organizationId, module: "accounting", outcome: "success", metadata: input.metadata,
  }));

/** Configuration effective du tenant (défauts si rien n'est paramétré). */
export const accountingConfig = (organizationId: string | null, executor: Executor = getDrizzle()): Effect.Effect<AccountingConfig, DbError> =>
  Effect.gen(function* () {
    const accounts = yield* dbTry("accounting.accounts", () => executor.select().from(accountingAccounts)
      .where(tenant(accountingAccounts.organizationId, organizationId)).orderBy(asc(accountingAccounts.code)));
    const [settings] = yield* dbTry("accounting.settings", () => executor.select().from(accountingSettings)
      .where(tenant(accountingSettings.organizationId, organizationId)).limit(1));
    if (accounts.length === 0 && !settings) return DEFAULT_ACCOUNTING_CONFIG;
    return resolveAccountingConfig({
      accounts: accounts.map((row) => ({ code: row.code, label: row.label, kind: row.kind, active: row.active })),
      roleCodes: settings?.roleCodes ?? {},
      journals: settings?.journals ?? {},
      letteringEnabled: settings?.letteringEnabled ?? true,
    });
  });

/** Comptes propres au tenant (ajouts, renommages, désactivations) pour l'écran d'administration. */
export const listTenantAccounts = (organizationId: string | null) =>
  dbTry("accounting.accounts.list", () => getDrizzle().select().from(accountingAccounts)
    .where(tenant(accountingAccounts.organizationId, organizationId)).orderBy(asc(accountingAccounts.code)));

export const accountingService = {
  /** Enregistre les rôles et journaux (les champs vides reviennent au défaut). */
  saveSettings: (organizationId: string | null, input: { readonly roleCodes: Partial<Record<AccountRole, string>>; readonly journals: Partial<Record<JournalKind, Journal>>; readonly letteringEnabled: boolean }, actorId: string) =>
    Effect.gen(function* () {
      const current = yield* accountingConfig(organizationId);
      const valid = yield* validateAccountingSettings(input, current.accounts).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      return yield* dbTransaction("accounting.settings.save", (tx) => Effect.gen(function* () {
        const [existing] = yield* dbTry("accounting.settings.find", () => tx.select().from(accountingSettings)
          .where(tenant(accountingSettings.organizationId, organizationId)).limit(1).for("update"));
        const values = { organizationId, roleCodes: valid.roleCodes, journals: valid.journals, letteringEnabled: input.letteringEnabled, updatedBy: actorId };
        const [row] = existing
          ? yield* dbTry("accounting.settings.update", () => tx.update(accountingSettings).set(values).where(eq(accountingSettings.id, existing.id)).returning())
          : yield* dbTry("accounting.settings.insert", () => tx.insert(accountingSettings).values(values).returning());
        yield* audit(tx, { actorId, organizationId, action: "accounting.settings.update", resourceId: row!.id, metadata: { before: existing ? { roleCodes: existing.roleCodes, journals: existing.journals, letteringEnabled: existing.letteringEnabled } : null, after: { roleCodes: valid.roleCodes, journals: valid.journals, letteringEnabled: input.letteringEnabled } } });
        return row!;
      }));
    }),

  /** Ajoute ou renomme un compte du plan (numéro unique par tenant). */
  upsertAccount: (organizationId: string | null, input: ChartAccount & { readonly active?: boolean }, actorId: string) =>
    Effect.gen(function* () {
      const valid = yield* validateAccount(input).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      return yield* dbTransaction("accounting.account.upsert", (tx) => Effect.gen(function* () {
        const [existing] = yield* dbTry("accounting.account.find", () => tx.select().from(accountingAccounts)
          .where(and(tenant(accountingAccounts.organizationId, organizationId), eq(accountingAccounts.code, valid.code))).limit(1).for("update"));
        const values = { organizationId, code: valid.code, label: valid.label, kind: valid.kind, active: input.active ?? true, updatedBy: actorId };
        const [row] = existing
          ? yield* dbTry("accounting.account.update", () => tx.update(accountingAccounts).set(values).where(eq(accountingAccounts.id, existing.id)).returning())
          : yield* dbTry("accounting.account.insert", () => tx.insert(accountingAccounts).values(values).returning());
        yield* audit(tx, { actorId, organizationId, action: existing ? "accounting.account.update" : "accounting.account.create", resourceId: row!.id, metadata: { code: valid.code, label: valid.label, kind: valid.kind, active: values.active } });
        return row!;
      }));
    }),

  /** Désactive (ou réactive) un compte propre au tenant ; un compte utilisé par un rôle reste refusé. */
  setAccountActive: (organizationId: string | null, code: string, active: boolean, actorId: string) =>
    Effect.gen(function* () {
      const config = yield* accountingConfig(organizationId);
      if (!active && Object.values(config.roles).some((account) => account.code === code)) {
        return yield* fail("BAD_REQUEST", "Ce compte est affecté à un rôle comptable : changez d'abord le rôle.");
      }
      return yield* dbTransaction("accounting.account.active", (tx) => Effect.gen(function* () {
        const [row] = yield* dbTry("accounting.account.setActive", () => tx.update(accountingAccounts).set({ active, updatedBy: actorId })
          .where(and(tenant(accountingAccounts.organizationId, organizationId), eq(accountingAccounts.code, code))).returning());
        if (!row) return yield* fail("NOT_FOUND", "Compte introuvable.");
        yield* audit(tx, { actorId, organizationId, action: "accounting.account.active", resourceId: row.id, metadata: { code, active } });
        return row;
      }));
    }),
};

/** Prochain code de lettrage du tenant (séquence sans trou, dans la transaction appelante). */
export const nextLetteringCode = (tx: DbTransaction, organizationId: string | null) =>
  nextSequenceValue(tx, { organizationId, key: "accounting.lettering", period: "" }).pipe(Effect.map(letteringCode));
