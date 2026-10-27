/**
 * Tunnel de vente public (plateforme) : panier invité (cookie signé) ou utilisateur connecté,
 * commande et paiement hébergé. Anti-abus aligné sur les formulaires publics : limite de débit
 * par IP, pot de miel `_hp`, jeton temporel signé `_ts`. Tout est Effect ; les pages Astro
 * n'appellent que ces fonctions (via `./pages.ts`).
 */
import { createHash } from "node:crypto";
import { Effect } from "effect";
import type { Locale } from "@i18n/config";
import { AppConfig } from "@/lib/effect/config";
import { RateLimitedError } from "@/lib/effect/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEventEffect } from "@/lib/audit";
import { checkTimestampToken } from "@/modules/forms/domain/forms";
import { EU_COUNTRIES } from "@/modules/tax/domain/rules";
import { cartService, type CartOwner, type CartView } from "../services/cart.service";
import { checkoutOrder, orderLinesOf, orderService, quoteOrder, startOrderPayment, type OrderRow } from "../services/order.service";
import { NON_EU_SHIPPING_COUNTRIES, shippingOptions, shopSettingsFromEnv, type CheckoutInput } from "../domain/checkout";
import { signCartToken, verifyCartToken, verifyOrderAccessToken } from "../domain/cart-token";
import { CHECKOUT_FIELDS } from "../domain/errors";

/** Le catalogue public est celui de la plateforme. */
export const SHOP_PUBLIC_ORGANIZATION: string | null = null;

export const shopPaths = {
  cart: (locale: Locale) => `/${locale}/shop/cart`,
  checkout: (locale: Locale) => `/${locale}/shop/checkout`,
  order: (locale: Locale, id: string, token: string) => `/${locale}/shop/order/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`,
};

/** Pays de livraison proposés (UE puis hors UE), triés par code. */
export const SHIPPING_COUNTRIES: readonly string[] = [...EU_COUNTRIES, ...NON_EU_SHIPPING_COUNTRIES].sort();

export interface Visitor {
  /** Valeur brute du cookie panier (non vérifiée). */
  readonly cookie: string | null;
  readonly userId: string | null;
}

/**
 * Propriétaire du panier : l'utilisateur connecté (le panier invité éventuel y est fusionné,
 * le cookie doit alors être effacé) ou le panier invité du cookie vérifié.
 */
export const resolveOwner = (visitor: Visitor) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const guestCartId = verifyCartToken(visitor.cookie, config.signingSecret);
    if (visitor.userId) {
      if (guestCartId) yield* cartService.mergeGuestCart(SHOP_PUBLIC_ORGANIZATION, guestCartId, visitor.userId);
      return { owner: { organizationId: SHOP_PUBLIC_ORGANIZATION, userId: visitor.userId } satisfies CartOwner, clearCookie: visitor.cookie !== null };
    }
    return { owner: { organizationId: SHOP_PUBLIC_ORGANIZATION, cartId: guestCartId } satisfies CartOwner, clearCookie: visitor.cookie !== null && guestCartId === null };
  });

/** Ajout au panier ; renvoie le jeton signé à poser en cookie pour un invité (null sinon). */
export const addToCart = (owner: CartOwner, variantId: string, quantity: number) =>
  Effect.gen(function* () {
    const cart = yield* cartService.addItem(owner, variantId, quantity);
    if (owner.userId) return null;
    const config = yield* AppConfig;
    return signCartToken(cart.id, config.signingSecret);
  });

export const parseQuantity = (raw: string) => (/^\d{1,3}$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN);

export interface CheckoutSubmission extends Partial<Record<keyof CheckoutInput, string>> {
  readonly _hp?: string;
  readonly _ts?: string;
}

export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly locale: Locale;
  readonly now?: Date;
}

const RATE_LIMIT = { window: 600, max: Number(process.env.SHOP_CHECKOUT_RATE_LIMIT ?? 10) };
const ipHashOf = (ip: string | null) => (ip ? createHash("sha256").update(`polyweb:${ip}`).digest("hex").slice(0, 32) : null);

export type CheckoutOutcome = { readonly kind: "redirect"; readonly url: string } | { readonly kind: "discarded" };

/** Saisie brute du formulaire, champs connus uniquement. */
export const checkoutInputOf = (raw: Readonly<Partial<Record<string, string>>>): CheckoutInput =>
  Object.fromEntries(CHECKOUT_FIELDS.map((field) => [field, raw[field] ?? ""])) as unknown as CheckoutInput;

/** Commande depuis le panier : redirige vers la page de paiement hébergée. */
export const submitCheckout = (owner: CartOwner, raw: CheckoutSubmission, meta: RequestMeta) =>
  Effect.gen(function* () {
    const ipHash = ipHashOf(meta.ip);
    const rl = checkRateLimit(`shop-checkout:${ipHash ?? "anon"}`, RATE_LIMIT);
    if (!rl.allowed) return yield* new RateLimitedError({ retryAfterSeconds: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)) });
    if ((raw._hp ?? "").trim() !== "" || !(yield* checkTimestampToken(raw._ts))) return { kind: "discarded" } satisfies CheckoutOutcome as CheckoutOutcome;
    const view = yield* cartService.view(owner, meta.locale);
    if (!view.cart || view.lines.length === 0) return yield* Effect.fail({ _tag: "EmptyCart" as const });
    const config = yield* AppConfig;
    const result = yield* checkoutOrder(
      { organizationId: owner.organizationId, cartId: view.cart.id, userId: owner.userId ?? null, locale: meta.locale, input: checkoutInputOf({ ...raw }), now: meta.now },
      (order, token) => {
        const page = `${config.siteUrl}${shopPaths.order(meta.locale, order.id, token)}`;
        return { successUrl: `${page}&paid=1`, cancelUrl: `${page}&cancelled=1` };
      },
    );
    yield* logAuditEventEffect({ action: "SHOP_ORDER_CREATE", resource: "order", resourceId: result.order.id, metadata: { number: result.order.number, grossMinor: result.order.grossMinor }, ipAddress: meta.ip, userAgent: meta.userAgent });
    return { kind: "redirect", url: result.url } satisfies CheckoutOutcome as CheckoutOutcome;
  });

/** Aperçu du tunnel : options de livraison du pays et totaux (TVA comprise). */
export const checkoutPreview = (view: CartView, country: string, method: string) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const settings = shopSettingsFromEnv(config.env);
    const target = SHIPPING_COUNTRIES.includes(country) ? country : settings.sellerCountry;
    const options = shippingOptions(settings.sellerCountry, target);
    const chosen = options.find((option) => option.method === method) ?? options[0]!;
    if (!view.currency || view.lines.length === 0) return { country: target, options, chosen, pricing: null };
    const pricing = yield* quoteOrder(SHOP_PUBLIC_ORGANIZATION, view.lines.map((line) => ({ variantId: line.variantId, unitPriceMinor: line.unitPriceMinor, quantity: line.quantity })), view.currency, target, chosen.priceMinor).pipe(
      Effect.map((value) => value as typeof value | null),
      Effect.catch((error) => (error._tag === "DbError" ? Effect.fail(error) : Effect.logWarning("[shop] aperçu de prix impossible", error._tag).pipe(Effect.as(null)))),
    );
    return { country: target, options, chosen, pricing };
  });

/** Commande publique si le jeton est valide ; `null` sinon (même réponse : pas d'oracle d'existence). */
export const publicOrder = (id: string, token: string | null | undefined) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    if (!verifyOrderAccessToken(id, token, config.signingSecret)) return null;
    const order = yield* orderService.byId(id, SHOP_PUBLIC_ORGANIZATION);
    if (!order) return null;
    const lines = yield* orderLinesOf(order.id);
    return { order, lines };
  });

export const orderPayable = (order: Pick<OrderRow, "status" | "expiresAt">, now: Date = new Date()) =>
  order.status === "PENDING_PAYMENT" && order.expiresAt.getTime() > now.getTime();

/** Reprise du paiement depuis la page de commande (lien signé) ; `null` si rien à payer. */
export const payOrder = (id: string, token: string, locale: Locale, now: Date = new Date()) =>
  Effect.gen(function* () {
    const found = yield* publicOrder(id, token);
    if (!found || !orderPayable(found.order, now)) return null;
    const config = yield* AppConfig;
    const page = `${config.siteUrl}${shopPaths.order(locale, id, token)}`;
    const started = yield* startOrderPayment(found.order, { successUrl: `${page}&paid=1`, cancelUrl: `${page}&cancelled=1` }, now);
    return started.url;
  });
