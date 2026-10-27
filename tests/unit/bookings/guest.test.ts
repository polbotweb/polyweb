import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";
import { addIsoDays, BOOKING_HORIZON_DAYS, guestToken, isBookableDate, validateGuest, verifyGuestToken } from "@/modules/bookings/domain/guest";
import { guestConfirmationEmail } from "@/modules/bookings/public/email";
import { fill, getBookingsPublicTranslations } from "@/modules/bookings/i18n/public";
import { manageUrlPath, publicBasePath } from "@/modules/bookings/public/paths";

const fields = (input: Parameters<typeof validateGuest>[0], capacity = 4) => {
  const exit = Effect.runSyncExit(Effect.flip(validateGuest(input, capacity)));
  return Exit.isSuccess(exit) ? exit.value.fields : [];
};
const ok = { customerName: " Ada Lovelace ", customerEmail: " ADA@Example.TEST ", customerPhone: " +33 6 12 34 56 78 ", partySize: 2, notes: "  " };

describe("bookings — visiteur", () => {
  it("valide et normalise les coordonnées", () => {
    const exit = Effect.runSyncExit(validateGuest(ok, 4));
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ customerName: "Ada Lovelace", customerEmail: "ada@example.test", customerPhone: "+33 6 12 34 56 78", partySize: 2, notes: null });
    expect(Effect.runSync(validateGuest({ ...ok, customerPhone: "" }, 4)).customerPhone).toBeNull();
  });

  it("renvoie toutes les erreurs de champ d'un coup", () => {
    expect(fields({ customerName: "A", customerEmail: "nope", customerPhone: "abc", partySize: 9, notes: "x".repeat(1001) })).toEqual(["customerName", "customerEmail", "customerPhone", "partySize", "notes"]);
    expect(fields({ ...ok, customerName: "Ada\nBcc: x@y.z" })).toEqual(["customerName"]);
    expect(fields({ ...ok, customerEmail: `${"a".repeat(250)}@x.io` })).toEqual(["customerEmail"]);
    expect(fields({ ...ok, partySize: 0 })).toEqual(["partySize"]);
    expect(fields({ ...ok, partySize: Number.NaN })).toEqual(["partySize"]);
    expect(fields({ ...ok, partySize: 1.5 })).toEqual(["partySize"]);
  });

  it("borne les dates réservables (aujourd'hui → horizon)", () => {
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isBookableDate("2026-10-26", "2026-10-26")).toBe(true);
    expect(isBookableDate("2026-10-25", "2026-10-26")).toBe(false);
    expect(isBookableDate(addIsoDays("2026-10-26", BOOKING_HORIZON_DAYS), "2026-10-26")).toBe(true);
    expect(isBookableDate(addIsoDays("2026-10-26", BOOKING_HORIZON_DAYS + 1), "2026-10-26")).toBe(false);
    for (const bad of ["2026-02-30", "2026-13-01", "26-10-2026", "", "2026-10-26T00:00"]) expect(isBookableDate(bad, "2026-01-01")).toBe(false);
  });

  it("signe le lien de gestion (lié à l'id et au secret, comparaison stricte)", () => {
    const token = guestToken("s3cret", "booking-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(verifyGuestToken("s3cret", "booking-1", token)).toBe(true);
    expect(verifyGuestToken("s3cret", "booking-2", token)).toBe(false);
    expect(verifyGuestToken("other", "booking-1", token)).toBe(false);
    expect(verifyGuestToken("s3cret", "booking-1", `${token.slice(0, 31)}${token[31] === "A" ? "B" : "A"}`)).toBe(false);
    for (const bad of [null, undefined, "", "short", `${token}x`]) expect(verifyGuestToken("s3cret", "booking-1", bad)).toBe(false);
  });

  it("construit les chemins publics par tenant", () => {
    expect(publicBasePath("fr", { organizationId: null, slug: null, name: null })).toBe("/fr/bookings");
    expect(publicBasePath("ar", { organizationId: "o", slug: "acme", name: "Acme" })).toBe("/ar/acme/bookings");
    expect(manageUrlPath("en", { organizationId: null, slug: null, name: null }, "id 1", "a+b")).toBe("/en/bookings/manage/id%201?t=a%2Bb");
  });

  it("traduit les 4 locales (mêmes clés) et remplit les gabarits", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
    const fr = keys(getBookingsPublicTranslations("fr"));
    for (const locale of ["en", "es", "ar"] as const) expect(keys(getBookingsPublicTranslations(locale))).toEqual(fr);
    expect(fill("Hi {name}, {n}/{missing}", { name: "Ada", n: 2 })).toBe("Hi Ada, 2/{missing}");
  });

  it("rend l'e-mail de confirmation (échappé, RTL, sujet sur une ligne)", () => {
    const mail = guestConfirmationEmail({ locale: "ar", customerName: "<b>Ada</b>", resourceName: "Salle\r\nBcc: x", when: "lundi 11 janvier 2027 09:00 – 10:00", partySize: 2, manageUrl: "https://example.test/ar/bookings/manage/1?t=abc" });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject).toContain("Salle Bcc: x");
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).not.toContain("<b>Ada</b>");
    expect(mail.html).toContain("https://example.test/ar/bookings/manage/1?t=abc");
    expect(mail.text).toContain("https://example.test/ar/bookings/manage/1?t=abc");
    const fr = guestConfirmationEmail({ locale: "fr", customerName: "Ada", resourceName: "Salle A", when: "demain", partySize: 3, manageUrl: "https://x.test/m" });
    expect(fr.subject).toBe("Demande de réservation : Salle A — Polyweb");
    expect(fr.text).toContain("« Salle A » le demain (3 personne(s))");
  });
});
