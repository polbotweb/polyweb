/**
 * Liens du portail : chemins du portail (purs) et résolution, APRÈS contrôle de propriété, vers les
 * parcours existants à lien signé (`?t=`) — paiement de facture, suivi/retour de commande,
 * gestion/annulation de réservation. Le jeton n'est jamais émis pour un enregistrement d'autrui.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import type { Locale } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { organization } from "@database/schemas/auth.schema";
import { AppConfig } from "@/lib/effect/config";
import { dbTry } from "@/lib/effect/run";
import { payLinkPath, payLinkToken } from "@/modules/sales/payments";
import { orderAccessToken } from "@/modules/shop/domain/cart-token";
import { guestToken } from "@/modules/bookings/domain/guest";
import { manageUrlPath } from "@/modules/bookings/public/paths";
import { ownedBooking, ownedInvoice, ownedOrder } from "../services/portal.service";

export const PORTAL_TARGETS = ["invoice-pay", "order", "booking"] as const;
export type PortalTarget = (typeof PORTAL_TARGETS)[number];

const enc = encodeURIComponent;
export const portalPaths = {
  home: (locale: Locale) => `/${locale}/account`,
  invoicePdf: (locale: Locale, id: string) => `/${locale}/account/invoices/${enc(id)}/pdf`,
  invoicePay: (locale: Locale, id: string) => `/${locale}/account/invoices/${enc(id)}/pay`,
  order: (locale: Locale, id: string) => `/${locale}/account/orders/${enc(id)}`,
  booking: (locale: Locale, id: string) => `/${locale}/account/bookings/${enc(id)}`,
};

const orgSlug = (organizationId: string | null) =>
  organizationId === null
    ? Effect.succeed<string | null>(null)
    : dbTry("portal.org.slug", () => getDrizzle().select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId)).limit(1))
        .pipe(Effect.map((rows) => rows[0]?.slug ?? null));

/** Lien signé vers le parcours cible si l'enregistrement appartient au compte, sinon null. */
export const resolvePortalTarget = (userId: string, target: PortalTarget, id: string, locale: Locale) =>
  Effect.gen(function* () {
    const { signingSecret } = yield* AppConfig;
    if (target === "invoice-pay") {
      const owned = yield* ownedInvoice(userId, id);
      return owned ? payLinkPath(locale, owned.id, payLinkToken(signingSecret, owned.id)) : null;
    }
    if (target === "order") {
      const owned = yield* ownedOrder(userId, id);
      return owned ? `/${locale}/shop/order/${enc(owned.id)}?t=${enc(orderAccessToken(owned.id, signingSecret))}` : null;
    }
    const owned = yield* ownedBooking(userId, id);
    if (!owned) return null;
    const slug = yield* orgSlug(owned.organizationId);
    if (owned.organizationId !== null && !slug) return null;
    return manageUrlPath(locale, { organizationId: owned.organizationId, slug, name: null }, owned.id, guestToken(signingSecret, owned.id));
  });
