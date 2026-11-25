/**
 * Flux bancaires automatiques (D3, B19) — DÉSACTIVÉS par défaut (`feedsEnabled`). Identifiants
 * PROPRES à chaque organisation, scellés AES-256-GCM (core/secrets, usage dédié), jamais renvoyés
 * ni journalisés (indice masqué seulement). Les transactions synchronisées passent par l'import
 * commun (dédoublonnage, lignes provisoires, règles, rapprochement automatique).
 */
import { and, eq } from "drizzle-orm";
import { Effect, Result } from "effect";
import { getDrizzle } from "@database/drizzle";
import { maskSecret, openSecret, sealSecret } from "@/core/secrets";
import { fail } from "@/lib/effect/action";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { gocardlessTransaction, type BankFeedProvider, type FeedCredentials, type FeedProviderError } from "../domain/feeds";
import type { ParsedFile, ParsedTransaction } from "../domain/parsers";
import { bankAccounts, bankFeedConnections } from "../schema";
import { makeGoCardlessProvider } from "./feeds.provider";
import { importStatement } from "./import.service";
import { notifyBanking } from "./notify.service";
import { bankingSettingsService } from "./settings.service";
import { bankingAudit, bankingToday, tenant } from "./shared";

const SECRET_PURPOSE = "banking.feed.gocardless";
const DAY = 86_400_000;
const minusDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);

let provider: BankFeedProvider = makeGoCardlessProvider();
/** Remplace le connecteur (tests, autre agrégateur). */
export const setBankFeedProviderForTests = (next: BankFeedProvider | null): void => { provider = next ?? makeGoCardlessProvider(); };

const requireFeeds = (organizationId: string | null) =>
  bankingSettingsService.get(organizationId).pipe(Effect.flatMap((settings) => (settings.feedsEnabled ? Effect.succeed(settings) : fail("FORBIDDEN", "Les flux bancaires automatiques sont désactivés (Réglages banque)."))));

const loadConnection = (organizationId: string | null, id: string) =>
  dbTry("banking.feed.get", () => getDrizzle().select().from(bankFeedConnections).where(and(eq(bankFeedConnections.id, id), tenant(bankFeedConnections.organizationId, organizationId))).limit(1))
    .pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Connexion introuvable."))));

const credentialsOf = (sealed: string) =>
  openSecret(SECRET_PURPOSE, sealed).pipe(
    Effect.map((plain) => JSON.parse(plain) as FeedCredentials),
    Effect.catch(() => fail("BAD_REQUEST", "Identifiants du flux illisibles : ressaisissez-les.")),
  );

const providerFailure = (error: FeedProviderError) => fail("BAD_REQUEST", `Agrégateur bancaire : ${error.detail}${error.status ? ` (HTTP ${error.status})` : ""}`);

export const publicFeedView = (row: typeof bankFeedConnections.$inferSelect) => {
  const { sealedCredentials, ...rest } = row;
  return { ...rest, hasCredentials: sealedCredentials.length > 0 };
};

export const bankFeedsService = {
  list: (organizationId: string | null) =>
    dbTry("banking.feed.list", () => getDrizzle().select().from(bankFeedConnections).where(tenant(bankFeedConnections.organizationId, organizationId))).pipe(Effect.map((rows) => rows.map(publicFeedView))),

  /** Crée une connexion pour un compte bancaire (ou remplace ses identifiants). */
  saveCredentials: (organizationId: string | null, input: { readonly bankAccountId: string; readonly secretId: string; readonly secretKey: string; readonly connectionId?: string | null }, actorId: string) =>
    Effect.gen(function* () {
      yield* requireFeeds(organizationId);
      const secretId = input.secretId.trim(), secretKey = input.secretKey.trim();
      if (secretId.length < 8 || secretKey.length < 16 || secretId.length > 200 || secretKey.length > 500) return yield* fail("BAD_REQUEST", "Identifiants GoCardless invalides.");
      const [account] = yield* dbTry("banking.feed.account", () => getDrizzle().select({ id: bankAccounts.id }).from(bankAccounts).where(and(eq(bankAccounts.id, input.bankAccountId), tenant(bankAccounts.organizationId, organizationId))).limit(1));
      if (!account) return yield* fail("NOT_FOUND", "Compte bancaire introuvable.");
      const sealed = yield* sealSecret(SECRET_PURPOSE, JSON.stringify({ secretId, secretKey })).pipe(Effect.catch(() => fail("INTERNAL_SERVER_ERROR", "Chiffrement indisponible.")));
      return yield* dbTransaction("banking.feed.save", (tx) => Effect.gen(function* () {
        const values = { sealedCredentials: sealed, credentialsHint: maskSecret(secretId), bankAccountId: account.id, lastError: null, updatedAt: new Date() };
        const rows = input.connectionId
          ? yield* dbTry("banking.feed.update", () => tx.update(bankFeedConnections).set(values).where(and(eq(bankFeedConnections.id, input.connectionId!), tenant(bankFeedConnections.organizationId, organizationId))).returning())
          : yield* dbTry("banking.feed.insert", () => tx.insert(bankFeedConnections).values({ ...values, organizationId, provider: "gocardless", status: "pending", createdBy: actorId }).returning());
        const row = rows[0];
        if (!row) return yield* fail("NOT_FOUND", "Connexion introuvable.");
        yield* bankingAudit(tx, { actorId, action: "banking.feed.credentials", resource: "bank_feed_connection", resourceId: row.id, organizationId, metadata: { bankAccountId: account.id, hint: maskSecret(secretId) } });
        return publicFeedView(row);
      }));
    }),

  institutions: (organizationId: string | null, connectionId: string, country: string) =>
    Effect.gen(function* () {
      yield* requireFeeds(organizationId);
      const connection = yield* loadConnection(organizationId, connectionId);
      const credentials = yield* credentialsOf(connection.sealedCredentials);
      return yield* provider.institutions(credentials, country).pipe(Effect.catch(providerFailure));
    }),

  /** Lien de consentement DSP2 (90 jours) vers la banque choisie. */
  startLink: (organizationId: string | null, connectionId: string, input: { readonly institutionId: string; readonly redirectUrl: string; readonly language: string }, actorId: string) =>
    Effect.gen(function* () {
      const settings = yield* requireFeeds(organizationId);
      if (!/^[A-Za-z0-9_-]{2,100}$/.test(input.institutionId)) return yield* fail("BAD_REQUEST", "Banque invalide.");
      const connection = yield* loadConnection(organizationId, connectionId);
      const credentials = yield* credentialsOf(connection.sealedCredentials);
      const link = yield* provider.createLink(credentials, { institutionId: input.institutionId, redirectUrl: input.redirectUrl, reference: `${connection.id}-${Date.now()}`, historyDays: settings.feedHistoryDays, language: input.language }).pipe(Effect.catch(providerFailure));
      yield* dbTransaction("banking.feed.link", (tx) => Effect.gen(function* () {
        yield* dbTry("banking.feed.link.update", () => tx.update(bankFeedConnections).set({ institutionId: input.institutionId, requisitionId: link.requisitionId, status: "pending", expiresAt: link.agreementExpiresAt ? new Date(link.agreementExpiresAt) : null, lastError: null, updatedAt: new Date() }).where(eq(bankFeedConnections.id, connection.id)));
        yield* bankingAudit(tx, { actorId, action: "banking.feed.link", resource: "bank_feed_connection", resourceId: connection.id, organizationId, metadata: { institutionId: input.institutionId } });
      }));
      return { link: link.link };
    }),

  /** Après consentement : statut et compte externe associé (même IBAN que le compte, sinon le premier). */
  refresh: (organizationId: string | null, connectionId: string, actorId: string | null) =>
    Effect.gen(function* () {
      yield* requireFeeds(organizationId);
      const connection = yield* loadConnection(organizationId, connectionId);
      if (!connection.requisitionId) return yield* fail("BAD_REQUEST", "Aucun consentement en cours.");
      const credentials = yield* credentialsOf(connection.sealedCredentials);
      const linked = yield* provider.linkedAccounts(credentials, connection.requisitionId).pipe(Effect.catch(providerFailure));
      const [account] = connection.bankAccountId ? yield* dbTry("banking.feed.refresh.account", () => getDrizzle().select().from(bankAccounts).where(eq(bankAccounts.id, connection.bankAccountId!)).limit(1)) : [];
      const iban = account?.iban?.replace(/\s+/g, "").toUpperCase() ?? null;
      const external = linked.accounts.find((candidate) => !!iban && candidate.iban?.replace(/\s+/g, "").toUpperCase() === iban) ?? linked.accounts[0] ?? null;
      const status = linked.status === "linked" && !external ? "error" as const : linked.status;
      yield* dbTransaction("banking.feed.refresh", (tx) => Effect.gen(function* () {
        yield* dbTry("banking.feed.refresh.update", () => tx.update(bankFeedConnections).set({ status, externalAccountId: external?.id ?? null, lastError: status === "error" ? "Aucun compte accessible" : null, updatedAt: new Date() }).where(eq(bankFeedConnections.id, connection.id)));
        yield* bankingAudit(tx, { actorId, action: "banking.feed.refresh", resource: "bank_feed_connection", resourceId: connection.id, organizationId, metadata: { status, accounts: linked.accounts.length } });
      }));
      return { status, accounts: linked.accounts.length };
    }),

  /** Synchronise une connexion liée (transactions comptabilisées + en attente) via l'import commun. */
  sync: (organizationId: string | null, connectionId: string, actorId: string | null) =>
    Effect.gen(function* () {
      const settings = yield* requireFeeds(organizationId);
      const connection = yield* loadConnection(organizationId, connectionId);
      if (connection.status !== "linked" || !connection.externalAccountId || !connection.bankAccountId) return yield* fail("BAD_REQUEST", "Connexion non liée.");
      const bankAccountId = connection.bankAccountId;
      if (connection.expiresAt && connection.expiresAt.getTime() < Date.now()) {
        yield* dbTry("banking.feed.expired", () => getDrizzle().update(bankFeedConnections).set({ status: "expired", updatedAt: new Date() }).where(eq(bankFeedConnections.id, connection.id)));
        return yield* fail("BAD_REQUEST", "Consentement bancaire expiré : renouvelez-le.");
      }
      const credentials = yield* credentialsOf(connection.sealedCredentials);
      const today = bankingToday();
      const from = connection.lastSyncedDate ? minusDays(connection.lastSyncedDate, 3) : minusDays(today, settings.feedHistoryDays);
      const fetched = yield* Effect.result(provider.transactions(credentials, connection.externalAccountId, from, today));
      if (Result.isFailure(fetched)) {
        const error = fetched.failure;
        yield* dbTransaction("banking.feed.error", (tx) => Effect.gen(function* () {
          yield* dbTry("banking.feed.error.update", () => tx.update(bankFeedConnections).set({ status: error.status === 401 || error.status === 403 ? "expired" : "error", lastError: error.detail, updatedAt: new Date() }).where(eq(bankFeedConnections.id, connection.id)));
          yield* notifyBanking(tx, { organizationId, settings, kind: "feedError", resourceType: "bank_feed_connection", resourceId: connection.id, data: { error: error.detail }, dedupeKey: `banking:feed-error:${connection.id}:${today}` });
        }));
        return yield* providerFailure(error);
      }
      const convert = (rows: readonly unknown[], provisional: boolean) =>
        Effect.forEach(rows.slice(0, settings.maxLines), (raw) => Effect.result(gocardlessTransaction(raw, provisional)))
          .pipe(Effect.map((results) => results.flatMap((result) => (Result.isSuccess(result) ? [result.success] : []))));
      const booked: ParsedTransaction[] = yield* convert(fetched.success.booked, false);
      const pending: ParsedTransaction[] = yield* convert(fetched.success.pending, true);
      const [account] = yield* dbTry("banking.feed.sync.account", () => getDrizzle().select().from(bankAccounts).where(eq(bankAccounts.id, bankAccountId)).limit(1));
      const currency = account?.currency ?? "EUR";
      const statement = (kind: "notification" | "intraday", transactions: ParsedTransaction[]) => ({
        format: "camt053" as const, kind, externalId: `feed-${today}`, sequence: null, accountIdentifier: null, currency, fromDate: from, toDate: today,
        openingBalanceMinor: null, closingBalanceMinor: null, transactions: transactions.filter((line) => line.currency === currency),
      });
      const parsed: ParsedFile = { format: "camt053", statements: [statement("notification", booked), statement("intraday", pending)].filter((s) => s.transactions.length > 0) };
      const bytes = new TextEncoder().encode(JSON.stringify({ connection: connection.id, booked: fetched.success.booked, pending: fetched.success.pending }));
      const outcome = parsed.statements.length > 0
        ? yield* importStatement(organizationId, { bankAccountId, bytes, fileName: `gocardless-${today}.json`, source: "feed", parsed }, actorId)
        : null;
      yield* dbTry("banking.feed.synced", () => getDrizzle().update(bankFeedConnections).set({ lastSyncAt: new Date(), lastSyncedDate: today, lastError: null, updatedAt: new Date() }).where(eq(bankFeedConnections.id, connection.id)));
      return { booked: booked.length, pending: pending.length, inserted: outcome?.inserted ?? 0, autoMatched: outcome?.autoMatched ?? 0 };
    }),

  /** Déconnecte : identifiants effacés, connexion désactivée (historique conservé). */
  disconnect: (organizationId: string | null, connectionId: string, actorId: string) =>
    dbTransaction("banking.feed.disconnect", (tx) => Effect.gen(function* () {
      const rows = yield* dbTry("banking.feed.disable", () => tx.update(bankFeedConnections).set({ status: "disabled", sealedCredentials: "", requisitionId: null, externalAccountId: null, updatedAt: new Date() })
        .where(and(eq(bankFeedConnections.id, connectionId), tenant(bankFeedConnections.organizationId, organizationId))).returning({ id: bankFeedConnections.id }));
      if (!rows[0]) return yield* fail("NOT_FOUND", "Connexion introuvable.");
      yield* bankingAudit(tx, { actorId, action: "banking.feed.disconnect", resource: "bank_feed_connection", resourceId: connectionId, organizationId });
      return { id: connectionId };
    })),
};
