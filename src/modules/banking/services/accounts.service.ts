/**
 * Comptes bancaires et profils CSV par organisation (B1, B2). L'IBAN est validé (clé mod 97) et
 * n'apparaît jamais en clair dans l'audit (masqué). Un compte ayant des lignes n'est pas supprimé :
 * il est archivé (traçabilité, FEC).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { maskIban } from "@/core/secrets";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { validateBankAccount, type BankAccountInput } from "../domain/accounts";
import { validateCsvProfile, type CsvProfile } from "../domain/parsers/csv";
import { bankAccounts, bankCsvProfiles, bankTransactions } from "../schema";
import { bankingAudit, tenant } from "./shared";

export type BankAccountRow = typeof bankAccounts.$inferSelect;

export const bankAccountsService = {
  list: (organizationId: string | null, includeArchived = false) =>
    dbTry("banking.accounts.list", () => getDrizzle().select().from(bankAccounts)
      .where(includeArchived ? tenant(bankAccounts.organizationId, organizationId) : and(tenant(bankAccounts.organizationId, organizationId), eq(bankAccounts.status, "active")))
      .orderBy(asc(bankAccounts.label))),

  get: (organizationId: string | null, id: string) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("banking.accounts.get", () => getDrizzle().select().from(bankAccounts).where(and(eq(bankAccounts.id, id), tenant(bankAccounts.organizationId, organizationId))).limit(1));
      if (!row) return yield* fail("NOT_FOUND", "Compte bancaire introuvable.");
      return row;
    }),

  save: (organizationId: string | null, id: string | null, input: BankAccountInput, actorId: string) =>
    Effect.gen(function* () {
      const valid = yield* validateBankAccount(input).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      if (valid.csvProfileId) {
        const [profile] = yield* dbTry("banking.accounts.profile", () => getDrizzle().select({ id: bankCsvProfiles.id }).from(bankCsvProfiles)
          .where(and(eq(bankCsvProfiles.id, valid.csvProfileId!), tenant(bankCsvProfiles.organizationId, organizationId))).limit(1));
        if (!profile) return yield* fail("BAD_REQUEST", "Profil CSV introuvable.");
      }
      return yield* dbTransaction("banking.accounts.save", (tx) =>
        Effect.gen(function* () {
          if (valid.iban) {
            const [dup] = yield* dbTry("banking.accounts.dup", () => tx.select({ id: bankAccounts.id }).from(bankAccounts)
              .where(and(tenant(bankAccounts.organizationId, organizationId), eq(bankAccounts.iban, valid.iban!), id ? sql`${bankAccounts.id} <> ${id}` : sql`true`)).limit(1));
            if (dup) return yield* fail("CONFLICT", "Un compte avec cet IBAN existe déjà.");
          }
          let rows: BankAccountRow[];
          if (id) {
            const [current] = yield* dbTry("banking.accounts.lock", () => tx.select().from(bankAccounts).where(and(eq(bankAccounts.id, id), tenant(bankAccounts.organizationId, organizationId))).limit(1).for("update"));
            if (!current) return yield* fail("NOT_FOUND", "Compte bancaire introuvable.");
            if (current.currency !== valid.currency) {
              const [used] = yield* dbTry("banking.accounts.used", () => tx.select({ id: bankTransactions.id }).from(bankTransactions).where(eq(bankTransactions.bankAccountId, id)).limit(1));
              if (used) return yield* fail("BAD_REQUEST", "Devise non modifiable : le compte a déjà des lignes.");
            }
            rows = yield* dbTry("banking.accounts.update", () => tx.update(bankAccounts).set(valid).where(eq(bankAccounts.id, id)).returning());
          } else {
            rows = yield* dbTry("banking.accounts.insert", () => tx.insert(bankAccounts).values({ ...valid, organizationId, createdBy: actorId }).returning());
          }
          const row = rows[0]!;
          yield* bankingAudit(tx, { actorId, action: id ? "banking.account.update" : "banking.account.create", resource: "bank_account", resourceId: row.id, organizationId, metadata: { label: row.label, iban: maskIban(row.iban), currency: row.currency, ledgerAccount: row.ledgerAccount, journalCode: row.journalCode } });
          return row;
        }));
    }),

  setStatus: (organizationId: string | null, id: string, status: "active" | "archived", actorId: string) =>
    dbTransaction("banking.accounts.status", (tx) =>
      Effect.gen(function* () {
        const [row] = yield* dbTry("banking.accounts.status", () => tx.update(bankAccounts).set({ status }).where(and(eq(bankAccounts.id, id), tenant(bankAccounts.organizationId, organizationId))).returning());
        if (!row) return yield* fail("NOT_FOUND", "Compte bancaire introuvable.");
        yield* bankingAudit(tx, { actorId, action: status === "archived" ? "banking.account.archive" : "banking.account.restore", resource: "bank_account", resourceId: id, organizationId });
        return row;
      })),
};

export const csvProfilesService = {
  list: (organizationId: string | null) =>
    dbTry("banking.csv.list", () => getDrizzle().select().from(bankCsvProfiles).where(tenant(bankCsvProfiles.organizationId, organizationId)).orderBy(asc(bankCsvProfiles.name))),

  get: (organizationId: string | null, id: string) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("banking.csv.get", () => getDrizzle().select().from(bankCsvProfiles).where(and(eq(bankCsvProfiles.id, id), tenant(bankCsvProfiles.organizationId, organizationId))).limit(1));
      if (!row) return yield* fail("NOT_FOUND", "Profil CSV introuvable.");
      return row;
    }),

  save: (organizationId: string | null, id: string | null, name: string, profile: CsvProfile, actorId: string) =>
    Effect.gen(function* () {
      const cleanName = name.trim();
      if (!cleanName || cleanName.length > 80) return yield* fail("BAD_REQUEST", "Nom de profil invalide.");
      const valid = yield* validateCsvProfile(profile).pipe(Effect.catch((error) => fail("BAD_REQUEST", error.message)));
      return yield* dbTransaction("banking.csv.save", (tx) =>
        Effect.gen(function* () {
          const [dup] = yield* dbTry("banking.csv.dup", () => tx.select({ id: bankCsvProfiles.id }).from(bankCsvProfiles)
            .where(and(tenant(bankCsvProfiles.organizationId, organizationId), eq(bankCsvProfiles.name, cleanName), id ? sql`${bankCsvProfiles.id} <> ${id}` : sql`true`)).limit(1));
          if (dup) return yield* fail("CONFLICT", "Un profil porte déjà ce nom.");
          const [row] = id
            ? yield* dbTry("banking.csv.update", () => tx.update(bankCsvProfiles).set({ name: cleanName, profile: valid }).where(and(eq(bankCsvProfiles.id, id), tenant(bankCsvProfiles.organizationId, organizationId))).returning())
            : yield* dbTry("banking.csv.insert", () => tx.insert(bankCsvProfiles).values({ organizationId, name: cleanName, profile: valid, createdBy: actorId }).returning());
          if (!row) return yield* fail("NOT_FOUND", "Profil CSV introuvable.");
          yield* bankingAudit(tx, { actorId, action: id ? "banking.csvProfile.update" : "banking.csvProfile.create", resource: "bank_csv_profile", resourceId: row.id, organizationId, metadata: { name: cleanName } });
          return row;
        }));
    }),

  remove: (organizationId: string | null, id: string, actorId: string) =>
    dbTransaction("banking.csv.remove", (tx) =>
      Effect.gen(function* () {
        const [row] = yield* dbTry("banking.csv.delete", () => tx.delete(bankCsvProfiles).where(and(eq(bankCsvProfiles.id, id), tenant(bankCsvProfiles.organizationId, organizationId))).returning());
        if (!row) return yield* fail("NOT_FOUND", "Profil CSV introuvable.");
        yield* bankingAudit(tx, { actorId, action: "banking.csvProfile.delete", resource: "bank_csv_profile", resourceId: id, organizationId, metadata: { name: row.name } });
        return true;
      })),
};
