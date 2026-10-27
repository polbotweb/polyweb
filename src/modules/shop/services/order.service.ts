/**
 * Service Effect des commandes boutique.
 *
 * Création (`checkout`) en UNE transaction : panier verrouillé et revalidé (publication,
 * devise), saisie validée, prix/TVA recalculés côté serveur (module Tax), numéro sans trou
 * (core/numbering, annulé avec la transaction en cas d'échec), lignes figées, stock réservé
 * (Logistics, entrepôts verrouillés) et panier vidé. Le lien de paiement core/payments est
 * ensuite demandé ; si le fournisseur échoue, la commande est annulée et le stock libéré.
 *
 * Les transitions système (payé, échu, remboursé) sont dans `../payments.ts` ; l'administration
 * n'applique que `ADMIN_ORDER_TRANSITIONS`, chacune revalidée par le workflow.
 */
import { Effect } from "effect";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { AppConfig } from "@/lib/effect/config";
import { canTransition } from "@/core/workflow";
import { assignDocumentNumber } from "@/core/numbering";
import { isCurrencyCode } from "@/core/money";
import { startCheckout } from "@/core/payments";
import type { Locale } from "@i18n/config";
import { logisticsStockPort } from "@/modules/logistics/services/logistics.service";
import { InsufficientStockError } from "@/modules/logistics/domain/errors";
import { taxActiveRates } from "@/modules/tax/loaders/tax-rate-admin.loader";
import { sales } from "@/modules/sales/schema";
import { logistics } from "@/modules/logistics/schema";
import { products, productTranslations, productVariants } from "../schema";
import { cartLines, carts, orderLines, orders } from "../schema/orders";
import { priceOrder, type PricedLine } from "../domain/pricing";
import { shopSettingsFromEnv, validateCheckout, type CheckoutInput } from "../domain/checkout";
import { ADMIN_ORDER_TRANSITIONS, DEFAULT_ORDER_NUMBERING, ORDER_NUMBERING_KEY, orderWorkflow, type OrderStatus } from "../domain/orders";
import { OutOfStockError } from "../domain/errors";
import { orderAccessToken } from "../domain/cart-token";

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;

export const SHOP_ORDER_PAYMENT_PURPOSE = "shop-order";
/** Durée de réservation du stock / validité du lien de paiement. */
export const ORDER_PAYMENT_WINDOW_MINUTES = 60;
export const SHIPPING_LINE_SKU = "SHIPPING";

export const reservationReference = (orderId: string) => `order:${orderId}`;

const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

const tenantRates = (organizationId: string | null) =>
  Effect.map(Effect.all([taxActiveRates(null), organizationId ? taxActiveRates(organizationId) : Effect.succeed([])]), ([platform, own]) => [...own, ...platform]);

export const lockOrder = (tx: DbTransaction, id: string) =>
  dbTry("shop.order.lock", () => tx.select().from(orders).where(eq(orders.id, id)).limit(1).for("update")).pipe(Effect.map(([row]) => row ?? null));

export const orderLinesOf = (orderId: string) =>
  dbTry("shop.order.lines", () => getDrizzle().select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.position)));

/** Annulation système ou admin d'une commande non payée : statut + libération du stock. */
const cancelPending = (tx: DbTransaction, order: OrderRow, to: "CANCELLED" | "EXPIRED", now: Date) =>
  Effect.gen(function* () {
    yield* dbTry("shop.order.cancel", () =>
      tx.update(orders).set({ status: to, cancelledAt: to === "CANCELLED" ? now : null }).where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_PAYMENT"))));
    yield* logisticsStockPort.releaseReservations(tx, reservationReference(order.id));
  });

export interface CheckoutRequest {
  readonly organizationId: string | null;
  readonly cartId: string;
  readonly userId: string | null;
  readonly locale: Locale;
  readonly input: CheckoutInput;
  readonly now?: Date;
}

export interface OrderUrls {
  readonly successUrl: string;
  readonly cancelUrl: string;
}

/** Crée la commande (statut PENDING_PAYMENT) ; ne contacte pas le fournisseur de paiement. */
export const createOrder = (request: CheckoutRequest) =>
  Effect.gen(function* () {
    const now = request.now ?? new Date();
    const config = yield* AppConfig;
    const settings = shopSettingsFromEnv(config.env);
    const valid = yield* validateCheckout(request.input, settings);
    const rates = yield* tenantRates(request.organizationId);
    return yield* dbTransaction("shop.order.create", (tx) =>
      Effect.gen(function* () {
        const [cart] = yield* dbTry("shop.order.cart", () =>
          tx.select().from(carts).where(and(eq(carts.id, request.cartId), sameTenant(carts.organizationId, request.organizationId))).limit(1).for("update"));
        // Le panier doit appartenir au demandeur : panier invité ↔ pas d'utilisateur, sinon le sien.
        if (!cart || (cart.userId ?? null) !== request.userId) return yield* fail("NOT_FOUND", "Panier introuvable.");
        const rows = yield* dbTry("shop.order.cartLines", () =>
          tx.select({ line: cartLines, variant: productVariants, product: products, translatedTitle: productTranslations.title })
            .from(cartLines)
            .innerJoin(productVariants, eq(productVariants.id, cartLines.variantId))
            .innerJoin(products, eq(products.id, productVariants.productId))
            .leftJoin(productTranslations, and(eq(productTranslations.productId, products.id), eq(productTranslations.locale, request.locale)))
            .where(eq(cartLines.cartId, cart.id))
            .orderBy(asc(cartLines.createdAt), asc(cartLines.id)));
        if (rows.length === 0) return yield* fail("BAD_REQUEST", "Panier vide.");
        const currency = rows[0]!.variant.currency.toUpperCase();
        if (!isCurrencyCode(currency)) return yield* fail("BAD_REQUEST", "Devise non prise en charge.");
        for (const row of rows) {
          const purchasable = row.variant.available && row.product.status === "PUBLISHED" && (row.product.organizationId ?? null) === request.organizationId;
          if (!purchasable || row.variant.currency.toUpperCase() !== currency) return yield* fail("CONFLICT", `Article ${row.variant.sku} indisponible.`);
        }
        const goods: PricedLine[] = rows.map((row) => ({ key: row.variant.id, unitGrossMinor: row.variant.priceMinor, quantity: row.line.quantity, category: "standard" }));
        const shipping: PricedLine[] = valid.shippingMinor > 0 ? [{ key: SHIPPING_LINE_SKU, unitGrossMinor: valid.shippingMinor, quantity: 1, category: "standard" }] : [];
        const pricing = yield* priceOrder([...goods, ...shipping], {
          currency, sellerCountry: settings.sellerCountry, buyerCountry: valid.country, ossRegistered: settings.ossRegistered, date: now.toISOString().slice(0, 10), rates,
        });
        if (pricing.gross.amountMinor <= 0) return yield* fail("BAD_REQUEST", "Montant de commande nul.");
        const { number } = yield* assignDocumentNumber(tx, { organizationId: request.organizationId, key: ORDER_NUMBERING_KEY, scheme: DEFAULT_ORDER_NUMBERING, date: now.toISOString().slice(0, 10) });
        const expiresAt = new Date(now.getTime() + ORDER_PAYMENT_WINDOW_MINUTES * 60_000);
        const [order] = yield* dbTry("shop.order.insert", () =>
          tx.insert(orders).values({
            organizationId: request.organizationId, number, locale: request.locale, userId: request.userId,
            email: valid.email, customerName: valid.customerName, phone: valid.phone,
            addressLine1: valid.addressLine1, addressLine2: valid.addressLine2, postcode: valid.postcode, city: valid.city, country: valid.country,
            shippingMethod: valid.shippingMethod, shippingMinor: valid.shippingMinor, currency,
            netMinor: pricing.net.amountMinor, taxMinor: pricing.tax.amountMinor, grossMinor: pricing.gross.amountMinor,
            taxTreatment: pricing.treatment, taxCountry: pricing.taxCountry,
            taxBreakdown: pricing.byRate.map((rate) => ({ ratePercent: rate.ratePercent, baseMinor: rate.base.amountMinor, taxMinor: rate.tax.amountMinor })),
            expiresAt, createdAt: now,
          }).returning());
        yield* dbTry("shop.order.lines.insert", () =>
          tx.insert(orderLines).values(rows.map((row, index) => ({
            orderId: order!.id, position: index + 1, variantId: row.variant.id, sku: row.variant.sku,
            description: (row.translatedTitle ?? row.product.title).slice(0, 200), quantity: row.line.quantity,
            unitPriceMinor: row.variant.priceMinor, lineTotalMinor: row.variant.priceMinor * row.line.quantity, taxCategory: "standard" as const,
          }))));
        yield* logisticsStockPort.reserveVariants(tx, {
          organizationId: request.organizationId, reference: reservationReference(order!.id), expiresAt, now,
          lines: rows.map((row) => ({ variantId: row.variant.id, sku: row.variant.sku, quantity: row.line.quantity })),
        }).pipe(Effect.catchTag("InsufficientStockError", (error: InsufficientStockError) =>
          Effect.fail(new OutOfStockError({ sku: error.sku, available: error.available, requested: error.requested }))));
        yield* dbTry("shop.order.cart.clear", () => tx.delete(cartLines).where(eq(cartLines.cartId, cart.id)));
        return order!;
      }));
  }).pipe(Effect.withSpan("shop.order.create"));

/** Lien de paiement hébergé de la commande (réutilisé tant que la session est valable). */
export const startOrderPayment = (order: OrderRow, urls: OrderUrls, now: Date = new Date()) =>
  Effect.gen(function* () {
    if (order.status !== "PENDING_PAYMENT" || order.expiresAt.getTime() <= now.getTime()) return yield* fail("CONFLICT", "Commande non payable.");
    const currency = order.currency.toUpperCase();
    if (!isCurrencyCode(currency)) return yield* fail("BAD_REQUEST", "Devise non prise en charge.");
    const started = yield* startCheckout({
      organizationId: order.organizationId, purpose: SHOP_ORDER_PAYMENT_PURPOSE, subjectId: order.id,
      amount: { amountMinor: order.grossMinor, currency }, description: `Commande ${order.number}`,
      customerEmail: order.email, successUrl: urls.successUrl, cancelUrl: urls.cancelUrl, expiresAt: order.expiresAt,
      metadata: { orderId: order.id, orderNumber: order.number }, now,
    });
    if (order.paymentId !== started.payment.id) {
      yield* dbTry("shop.order.payment", () => getDrizzle().update(orders).set({ paymentId: started.payment.id }).where(eq(orders.id, order.id)));
    }
    return started;
  });

/**
 * Tunnel complet : commande puis lien de paiement. Échec du fournisseur → commande annulée et
 * stock libéré (aucune réservation orpheline), l'erreur est propagée à la page.
 */
export const checkoutOrder = (request: CheckoutRequest, urlsFor: (order: OrderRow, accessToken: string) => OrderUrls) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const order = yield* createOrder(request);
    const token = orderAccessToken(order.id, config.signingSecret);
    const started = yield* startOrderPayment(order, urlsFor(order, token), request.now).pipe(
      Effect.tapError(() =>
        dbTransaction("shop.order.compensate", (tx) => cancelPending(tx, order, "CANCELLED", new Date())).pipe(Effect.ignore)),
    );
    return { order, accessToken: token, url: started.url };
  });

export interface OrderAdminFilters {
  readonly status?: OrderStatus;
  readonly search?: string;
  readonly from?: string;
  readonly to?: string;
}

export const ORDERS_PAGE_SIZE = 50;

export const orderService = {
  /** Commande d'un tenant (introuvable ou autre tenant → null, sans fuite). */
  byId: (id: string, organizationId: string | null) =>
    dbTry("shop.order.byId", () => getDrizzle().select().from(orders).where(and(eq(orders.id, id), sameTenant(orders.organizationId, organizationId))).limit(1))
      .pipe(Effect.map(([row]) => row ?? null)),

  /** Liste admin filtrée (statut, recherche n° / e-mail / nom, période de création), plus récentes d'abord. */
  list: (organizationId: string | null, filters: OrderAdminFilters, page = 1) =>
    Effect.gen(function* () {
      const conditions: (SQL | undefined)[] = [sameTenant(orders.organizationId, organizationId)];
      if (filters.status) conditions.push(eq(orders.status, filters.status));
      const search = filters.search?.trim().slice(0, 100);
      if (search) {
        const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        conditions.push(or(ilike(orders.number, pattern), ilike(orders.email, pattern), ilike(orders.customerName, pattern)));
      }
      if (filters.from) conditions.push(gte(orders.createdAt, new Date(`${filters.from}T00:00:00Z`)));
      if (filters.to) conditions.push(lt(orders.createdAt, new Date(new Date(`${filters.to}T00:00:00Z`).getTime() + 86_400_000)));
      const where = and(...conditions);
      const offset = (Math.max(1, Math.floor(page)) - 1) * ORDERS_PAGE_SIZE;
      const [rows, totals] = yield* Effect.all([
        dbTry("shop.order.list", () => getDrizzle().select().from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.number)).limit(ORDERS_PAGE_SIZE).offset(offset)),
        dbTry("shop.order.count", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(orders).where(where)),
      ]);
      return { rows, total: Number(totals[0]?.n ?? 0) };
    }),

  /** Transition déclenchée par l'administration (SHIPPED, DELIVERED, CANCELLED d'une commande non payée). */
  transition: (id: string, organizationId: string | null, to: OrderStatus, now: Date = new Date()) =>
    dbTransaction("shop.order.transition", (tx) =>
      Effect.gen(function* () {
        if (!ADMIN_ORDER_TRANSITIONS.includes(to)) return yield* fail("FORBIDDEN", "Transition réservée au système.");
        const order = yield* lockOrder(tx, id);
        if (!order || (order.organizationId ?? null) !== organizationId) return yield* fail("NOT_FOUND", "Commande introuvable.");
        if (!canTransition(orderWorkflow, order.status, to)) return yield* fail("CONFLICT", `Transition ${order.status} → ${to} interdite.`);
        if (to === "CANCELLED") {
          yield* cancelPending(tx, order, "CANCELLED", now);
        } else {
          yield* dbTry("shop.order.status", () =>
            tx.update(orders).set({ status: to, ...(to === "SHIPPED" ? { shippedAt: now } : {}) }).where(eq(orders.id, id)));
        }
        const [updated] = yield* dbTry("shop.order.reload", () => tx.select().from(orders).where(eq(orders.id, id)).limit(1));
        return updated!;
      })),

  /**
   * Lien optionnel vers une facture Sales et/ou une expédition Logistics du MÊME tenant
   * (null = délier). Voir docs/shop-checkout.md : le stock est sorti au paiement, une expédition
   * liée sert au suivi — ne pas la passer SHIPPED avec des lignes, sous peine de double sortie.
   */
  link: (id: string, organizationId: string | null, links: { readonly salesDocumentId?: string | null; readonly shipmentId?: string | null }) =>
    dbTransaction("shop.order.link", (tx) =>
      Effect.gen(function* () {
        const order = yield* lockOrder(tx, id);
        if (!order || (order.organizationId ?? null) !== organizationId) return yield* fail("NOT_FOUND", "Commande introuvable.");
        const patch: { salesDocumentId?: string | null; shipmentId?: string | null } = {};
        if (links.salesDocumentId !== undefined) {
          if (links.salesDocumentId) {
            const [doc] = yield* dbTry("shop.order.link.sales", () =>
              tx.select({ id: sales.id }).from(sales).where(and(eq(sales.id, links.salesDocumentId!), sameTenant(sales.organizationId, organizationId))).limit(1));
            if (!doc) return yield* fail("NOT_FOUND", "Document de vente introuvable.");
          }
          patch.salesDocumentId = links.salesDocumentId || null;
        }
        if (links.shipmentId !== undefined) {
          if (links.shipmentId) {
            const [shipment] = yield* dbTry("shop.order.link.shipment", () =>
              tx.select({ id: logistics.id }).from(logistics).where(and(eq(logistics.id, links.shipmentId!), sameTenant(logistics.organizationId, organizationId))).limit(1));
            if (!shipment) return yield* fail("NOT_FOUND", "Expédition introuvable.");
          }
          patch.shipmentId = links.shipmentId || null;
        }
        if (Object.keys(patch).length === 0) return order;
        const [updated] = yield* dbTry("shop.order.link.update", () => tx.update(orders).set(patch).where(eq(orders.id, id)).returning());
        return updated!;
      })),

  /** Commandes d'un utilisateur (espace client), plus récentes d'abord. */
  forUser: (userId: string, organizationId: string | null) =>
    dbTry("shop.order.forUser", () =>
      getDrizzle().select().from(orders).where(and(eq(orders.userId, userId), sameTenant(orders.organizationId, organizationId))).orderBy(desc(orders.createdAt)).limit(50)),

  /** Commandes par ids (tests, exports). */
  byIds: (ids: readonly string[]) =>
    ids.length === 0 ? Effect.succeed([] as OrderRow[]) : dbTry("shop.order.byIds", () => getDrizzle().select().from(orders).where(inArray(orders.id, [...ids]))),

  cancelPending,
};
