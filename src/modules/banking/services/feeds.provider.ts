/**
 * Client GoCardless Bank Account Data (API v2) du connecteur générique `BankFeedProvider` : simple
 * `fetch` (aucune dépendance, injectable en test), jeton court redemandé à chaque opération (rien
 * n'est conservé en mémoire), délai maximal par appel. Les identifiants ne sont jamais journalisés.
 *
 * Note : GoCardless n'ouvre plus de nouveaux comptes Bank Account Data depuis juillet 2025 ; les
 * comptes existants fonctionnent. D'autres agrégateurs se branchent sur la même interface.
 */
import { Effect } from "effect";
import { gocardlessStatus, type BankFeedProvider, type FeedAccount, type FeedCredentials, type FeedProviderError } from "../domain/feeds";

export const GOCARDLESS_BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";
const TIMEOUT_MS = 20_000;
type Json = Record<string, unknown>;

export const providerError = (status: number | null, detail: string): FeedProviderError => ({ _tag: "FeedProviderError", status, detail: detail.slice(0, 300) });
const isProviderError = (error: unknown): error is FeedProviderError => !!error && typeof error === "object" && (error as FeedProviderError)._tag === "FeedProviderError";

export const makeGoCardlessProvider = (fetchImpl: typeof fetch = fetch, baseUrl = GOCARDLESS_BASE_URL): BankFeedProvider => {
  const call = (path: string, init: { readonly method?: string; readonly body?: unknown; readonly token?: string }) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method: init.method ?? "GET",
          headers: { accept: "application/json", "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const text = await response.text();
        const json: unknown = text ? JSON.parse(text) : {};
        if (!response.ok) {
          const body = json && typeof json === "object" ? json as Json : {};
          throw providerError(response.status, String(body.detail ?? body.summary ?? response.statusText));
        }
        return json;
      },
      catch: (error) => (isProviderError(error) ? error : providerError(null, error instanceof Error ? error.message : "réseau")),
    });
  const object = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : {});
  const token = (credentials: FeedCredentials) =>
    call("/token/new/", { method: "POST", body: { secret_id: credentials.secretId, secret_key: credentials.secretKey } }).pipe(
      Effect.flatMap((json) => {
        const access = object(json).access;
        return typeof access === "string" ? Effect.succeed(access) : Effect.fail(providerError(null, "jeton absent"));
      }),
    );
  return {
    key: "gocardless",
    institutions: (credentials, country) => Effect.gen(function* () {
      const access = yield* token(credentials);
      const json = yield* call(`/institutions/?country=${encodeURIComponent(country.toUpperCase().slice(0, 2))}`, { token: access });
      const list = Array.isArray(json) ? json.map(object) : [];
      return list.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? ""), bic: typeof row.bic === "string" ? row.bic : null, maxHistoryDays: Number(row.transaction_total_days) || null })).filter((row) => row.id);
    }),
    createLink: (credentials, request) => Effect.gen(function* () {
      const access = yield* token(credentials);
      const agreement = object(yield* call("/agreements/enduser/", { method: "POST", token: access, body: { institution_id: request.institutionId, max_historical_days: request.historyDays, access_valid_for_days: 90, access_scope: ["balances", "details", "transactions"] } }));
      const requisition = object(yield* call("/requisitions/", { method: "POST", token: access, body: { redirect: request.redirectUrl, institution_id: request.institutionId, reference: request.reference, agreement: agreement.id, user_language: request.language.toUpperCase() } }));
      if (typeof requisition.id !== "string" || typeof requisition.link !== "string") return yield* Effect.fail(providerError(null, "réquisition incomplète"));
      return { requisitionId: requisition.id, link: requisition.link, agreementExpiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() };
    }),
    linkedAccounts: (credentials, requisitionId) => Effect.gen(function* () {
      const access = yield* token(credentials);
      const requisition = object(yield* call(`/requisitions/${encodeURIComponent(requisitionId)}/`, { token: access }));
      const ids = Array.isArray(requisition.accounts) ? requisition.accounts.filter((id): id is string => typeof id === "string") : [];
      const accounts: FeedAccount[] = [];
      for (const id of ids.slice(0, 20)) {
        const account = object(object(yield* call(`/accounts/${encodeURIComponent(id)}/details/`, { token: access })).account);
        accounts.push({ id, iban: typeof account.iban === "string" ? account.iban : null, currency: typeof account.currency === "string" ? account.currency : null, name: typeof account.name === "string" ? account.name : null });
      }
      return { status: gocardlessStatus(String(requisition.status ?? "")), accounts };
    }),
    transactions: (credentials, accountId, from, to) => Effect.gen(function* () {
      const access = yield* token(credentials);
      const transactions = object(object(yield* call(`/accounts/${encodeURIComponent(accountId)}/transactions/?date_from=${from}&date_to=${to}`, { token: access })).transactions);
      return { booked: Array.isArray(transactions.booked) ? transactions.booked : [], pending: Array.isArray(transactions.pending) ? transactions.pending : [] };
    }),
  };
};
