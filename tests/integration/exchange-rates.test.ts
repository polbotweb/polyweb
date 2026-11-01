/**
 * core/fx — service des taux : import BCE idempotent (fetch simulé, aucun réseau), forçage manuel
 * prioritaire, taux croisé/inverse, fraîcheur bornée, verrou de la devise de tenue.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { organization } from "@database/schemas";
import { exchangeRates } from "@database/schemas/exchange-rates.schema";
import { appRuntime } from "@/lib/effect/runtime";
import { rateEquals, parseRate } from "@/core/fx";
import { fetchEcbRates, findRate, fxSettings, lockBaseCurrency, setBaseCurrency, setManualRate } from "@/core/fx/service";

const run = <A, E>(e: Effect.Effect<A, E, never>) => appRuntime.runPromise(e);
const runExit = <A, E>(e: Effect.Effect<A, E, never>) => appRuntime.runPromiseExit(e);
const ORG = `fx-test-${Date.now()}`;
// Dates de 1999 : aucune collision avec de vrais taux importés en dev.
const XML = `<gesmes:Envelope><Cube>
<Cube time='1999-03-05'><Cube currency='USD' rate='1.1'/><Cube currency='GBP' rate='0.8'/></Cube>
<Cube time='1999-03-04'><Cube currency='USD' rate='1.2'/><Cube currency='GBP' rate='0.75'/></Cube>
</Cube></gesmes:Envelope>`;
const fakeFetch = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;

beforeAll(async () => {
  await getDrizzle().insert(organization).values({ id: ORG, name: "FX test", slug: ORG, createdAt: new Date() });
});
afterAll(async () => {
  await getDrizzle().delete(exchangeRates).where(and(isNull(exchangeRates.organizationId), lt(exchangeRates.rateDate, "2000-01-01")));
  await getDrizzle().delete(organization).where(eq(organization.id, ORG));
});

describe("core/fx service", () => {
  it("importe le flux BCE de façon idempotente", async () => {
    expect(await run(fetchEcbRates(fakeFetch(XML)))).toEqual({ days: 2, imported: 4, latest: "1999-03-05" });
    await run(fetchEcbRates(fakeFetch(XML)));
    const rows = await getDrizzle().select().from(exchangeRates).where(and(isNull(exchangeRates.organizationId), lt(exchangeRates.rateDate, "2000-01-01")));
    expect(rows).toHaveLength(4);
  });
  it("échoue proprement sur HTTP 503 ou XML invalide", async () => {
    expect(Exit.isFailure(await runExit(fetchEcbRates(fakeFetch("", 503))))).toBe(true);
    expect(Exit.isFailure(await runExit(fetchEcbRates(fakeFetch("<html/>"))))).toBe(true);
  });
  it("résout direct, inverse, croisé et le week-end (dernier jour coté)", async () => {
    const usd = await run(findRate(ORG, "EUR", "USD", "1999-03-05"));
    expect(usd.source).toBe("ecb");
    expect(rateEquals(usd.rate, await run(parseRate("1.1")))).toBe(true);
    const back = await run(findRate(ORG, "USD", "EUR", "1999-03-04"));
    expect(rateEquals(back.rate, { numerator: 5n, denominator: 6n })).toBe(true);
    const cross = await run(findRate(ORG, "USD", "GBP", "1999-03-07"));
    expect(cross.date).toBe("1999-03-05");
    expect(rateEquals(cross.rate, { numerator: 8n, denominator: 11n })).toBe(true);
    expect(Exit.isFailure(await runExit(findRate(ORG, "EUR", "USD", "1999-03-20")))).toBe(true);
    expect(Exit.isFailure(await runExit(findRate(ORG, "EUR", "USD", "1999-03-01")))).toBe(true);
  });
  it("le forçage manuel prime à date égale, pas sur un taux BCE plus récent", async () => {
    await run(setManualRate({ organizationId: ORG, from: "USD", to: "EUR", date: "1999-03-05", rate: "0.9" }));
    const forced = await run(findRate(ORG, "EUR", "USD", "1999-03-05"));
    expect(forced.source).toBe("manual");
    expect(rateEquals(forced.rate, { numerator: 10n, denominator: 9n })).toBe(true);
    await run(setManualRate({ organizationId: ORG, from: "USD", to: "EUR", date: "1999-03-04", rate: "0.5" }));
    expect((await run(findRate(ORG, "USD", "EUR", "1999-03-05"))).rate).toEqual({ numerator: 9n, denominator: 10n });
    // Autre organisation : forçage invisible.
    expect((await run(findRate(null, "EUR", "USD", "1999-03-05"))).source).toBe("ecb");
    expect(Exit.isFailure(await runExit(setManualRate({ organizationId: ORG, from: "EUR", to: "EUR", date: "1999-03-05", rate: "1" })))).toBe(true);
    expect(Exit.isFailure(await runExit(setManualRate({ organizationId: ORG, from: "USD", to: "EUR", date: "1999-03-05", rate: "0" })))).toBe(true);
  });
  it("verrouille la devise de tenue", async () => {
    expect((await run(fxSettings(ORG))).baseCurrency).toBe("EUR");
    await run(setBaseCurrency(ORG, "CHF"));
    expect(await run(lockBaseCurrency(ORG))).toBe("CHF");
    expect(await run(lockBaseCurrency(ORG))).toBe("CHF");
    expect(Exit.isFailure(await runExit(setBaseCurrency(ORG, "EUR")))).toBe(true);
    expect((await run(setBaseCurrency(ORG, "CHF"))).baseCurrency).toBe("CHF");
  });
});
