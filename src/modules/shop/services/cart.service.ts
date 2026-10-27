/**
 * Service Effect du panier. Un panier est identifié soit par un cookie invité signé
 * (`domain/cart-token.ts`), soit par l'utilisateur connecté ; à la connexion, le panier invité
 * est fusionné dans celui de l'utilisateur. Le panier ne stocke que variante + quantité : prix,
 * libellé, publication et disponibilité sont relus à chaque affichage et revalidés à la commande.
 */
import { Effect } from "effect";
import { and, asc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import type { Locale } from "@i18n/config";
import { isCurrencyCode, type CurrencyCode } from "@/core/money";
import { logisticsStockPort } from "@/modules/logistics/services/logistics.service";
import { products, productTranslations, productVariants } from "../schema";
import { cartLines, carts } from "../schema/orders";
import { MAX_CART_LINES, validateQuantity } from "../domain/pricing";
import { CART_TTL_SECONDS } from "../domain/cart-token";
import type { InvalidCartError } from "../domain/errors";

export type CartRow = typeof carts.$inferSelect;
type Executor = ReturnType<typeof getDrizzle> | DbTransaction;

const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const domain = <A>(effect: Effect.Effect<A, InvalidCartError>) => Effect.catch(effect, (error: InvalidCartError) => fail("BAD_REQUEST", error.message));

export interface CartOwner {
  readonly organizationId: string | null;
  /** Panier invité (id issu d'un cookie déjà vérifié). */
  readonly cartId?: string | null;
  readonly userId?: string | null;
}

export interface CartLineView {
  readonly lineId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly productSlug: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly lineTotalMinor: number;
  readonly currency: CurrencyCode;
  /** Variante publiée et proposée à la vente. */
  readonly purchasable: boolean;
  /** Stock disponible si l'article est suivi en Logistics (null = non suivi). */
  readonly available: number | null;
}

export interface CartView {
  readonly cart: CartRow | null;
  readonly lines: readonly CartLineView[];
  readonly currency: CurrencyCode | null;
  readonly totalMinor: number;
  readonly itemCount: number;
  /** Toutes les lignes sont commandables (publiées, en stock). */
  readonly orderable: boolean;
}

const findCart = (executor: Executor, owner: CartOwner, forUpdate = false) =>
  Effect.gen(function* () {
    const condition = owner.userId
      ? and(eq(carts.userId, owner.userId), sameTenant(carts.organizationId, owner.organizationId))
      : owner.cartId ? and(eq(carts.id, owner.cartId), isNull(carts.userId), sameTenant(carts.organizationId, owner.organizationId)) : null;
    if (!condition) return null;
    const rows = yield* dbTry("shop.cart.find", () => {
      const query = executor.select().from(carts).where(condition).limit(1);
      return forUpdate ? query.for("update") : query;
    });
    return rows[0] ?? null;
  });

const createCart = (tx: DbTransaction, owner: CartOwner) =>
  dbTry("shop.cart.create", () =>
    tx.insert(carts).values({ organizationId: owner.organizationId, userId: owner.userId ?? null })
      .onConflictDoNothing().returning(),
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.flatMap(findCart(tx, owner, true), (found) => (found ? Effect.succeed(found) : fail("CONFLICT", "Panier indisponible."))))));

/** Variante vendable du tenant (produit publié, variante disponible). */
const findPurchasableVariant = (executor: Executor, variantId: string, organizationId: string | null) =>
  dbTry("shop.cart.variant", () =>
    executor.select({ variant: productVariants }).from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.id, variantId), eq(productVariants.available, true), eq(products.status, "PUBLISHED"), sameTenant(products.organizationId, organizationId)))
      .limit(1),
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row.variant) : fail("NOT_FOUND", "Article indisponible."))));

const linesOf = (executor: Executor, cartId: string) =>
  dbTry("shop.cart.lines", () => executor.select().from(cartLines).where(eq(cartLines.cartId, cartId)).orderBy(asc(cartLines.createdAt), asc(cartLines.id)));

const touch = (tx: DbTransaction, cartId: string, currency: string | null) =>
  dbTry("shop.cart.touch", () => tx.update(carts).set({ currency, updatedAt: new Date() }).where(eq(carts.id, cartId)));

/** Devise du panier recalculée d'après ses lignes (null si vide). */
const refreshCurrency = (tx: DbTransaction, cartId: string) =>
  Effect.gen(function* () {
    const rows = yield* dbTry("shop.cart.currency", () =>
      tx.select({ currency: productVariants.currency }).from(cartLines).innerJoin(productVariants, eq(productVariants.id, cartLines.variantId)).where(eq(cartLines.cartId, cartId)).limit(1));
    yield* touch(tx, cartId, rows[0]?.currency ?? null);
  });

export const cartService = {
  /** Panier détaillé (lecture seule) pour l'affichage, dans la langue demandée. */
  view: (owner: CartOwner, locale: Locale) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const cart = yield* findCart(db, owner);
      if (!cart) return { cart: null, lines: [], currency: null, totalMinor: 0, itemCount: 0, orderable: false } satisfies CartView;
      const rows = yield* dbTry("shop.cart.view", () =>
        db.select({
          line: cartLines, variant: productVariants, product: products,
          translatedTitle: productTranslations.title, translatedSlug: productTranslations.slug,
        }).from(cartLines)
          .innerJoin(productVariants, eq(productVariants.id, cartLines.variantId))
          .innerJoin(products, eq(products.id, productVariants.productId))
          .leftJoin(productTranslations, and(eq(productTranslations.productId, products.id), eq(productTranslations.locale, locale)))
          .where(eq(cartLines.cartId, cart.id))
          .orderBy(asc(cartLines.createdAt), asc(cartLines.id)));
      const availability = yield* logisticsStockPort.availabilityByVariant(owner.organizationId, rows.map((row) => row.variant.id));
      const lines = rows.flatMap((row): CartLineView[] => {
        const currency = row.variant.currency.toUpperCase();
        if (!isCurrencyCode(currency)) return [];
        const available = availability.get(row.variant.id) ?? null;
        return [{
          lineId: row.line.id, variantId: row.variant.id, sku: row.variant.sku,
          productTitle: row.translatedTitle ?? row.product.title, productSlug: row.translatedSlug ?? row.product.slug,
          quantity: row.line.quantity, unitPriceMinor: row.variant.priceMinor, lineTotalMinor: row.variant.priceMinor * row.line.quantity, currency,
          purchasable: row.variant.available && row.product.status === "PUBLISHED" && sameOrg(row.product.organizationId, owner.organizationId),
          available,
        }];
      });
      const currency = lines[0]?.currency ?? null;
      return {
        cart, lines, currency,
        totalMinor: lines.reduce((total, line) => total + line.lineTotalMinor, 0),
        itemCount: lines.reduce((total, line) => total + line.quantity, 0),
        orderable: lines.length > 0 && lines.every((line) => line.purchasable && line.currency === currency && (line.available === null || line.available >= line.quantity)),
      } satisfies CartView;
    }),

  /**
   * Ajoute une variante (cumul des quantités, plafonné à la quantité maximale) ; crée le panier
   * au besoin et renvoie son id (à signer dans le cookie pour un invité).
   */
  addItem: (owner: CartOwner, variantId: string, quantity: number) =>
    dbTransaction("shop.cart.add", (tx) =>
      Effect.gen(function* () {
        yield* domain(validateQuantity(quantity));
        const variant = yield* findPurchasableVariant(tx, variantId, owner.organizationId);
        const cart = (yield* findCart(tx, owner, true)) ?? (yield* createCart(tx, owner));
        const lines = yield* linesOf(tx, cart.id);
        if (cart.currency && cart.currency !== variant.currency && lines.length > 0) return yield* fail("BAD_REQUEST", "Devise différente de celle du panier.");
        const existing = lines.find((line) => line.variantId === variant.id);
        if (!existing && lines.length >= MAX_CART_LINES) return yield* fail("BAD_REQUEST", "Panier plein.");
        const next = Math.min(99, (existing?.quantity ?? 0) + quantity);
        yield* dbTry("shop.cart.line.upsert", () =>
          tx.insert(cartLines).values({ cartId: cart.id, variantId: variant.id, quantity: next })
            .onConflictDoUpdate({ target: [cartLines.cartId, cartLines.variantId], set: { quantity: next, updatedAt: new Date() } }));
        yield* touch(tx, cart.id, variant.currency);
        return cart;
      })),

  /** Fixe la quantité d'une ligne (0 = suppression). */
  setQuantity: (owner: CartOwner, lineId: string, quantity: number) =>
    dbTransaction("shop.cart.quantity", (tx) =>
      Effect.gen(function* () {
        const cart = yield* findCart(tx, owner, true);
        if (!cart) return yield* fail("NOT_FOUND", "Panier introuvable.");
        if (quantity === 0) {
          yield* dbTry("shop.cart.line.delete", () => tx.delete(cartLines).where(and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id))));
        } else {
          yield* domain(validateQuantity(quantity));
          const updated = yield* dbTry("shop.cart.line.update", () =>
            tx.update(cartLines).set({ quantity }).where(and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id))).returning({ id: cartLines.id }));
          if (updated.length === 0) return yield* fail("NOT_FOUND", "Ligne introuvable.");
        }
        yield* refreshCurrency(tx, cart.id);
        return cart;
      })),

  /** Vide le panier (après création de la commande). */
  clear: (tx: DbTransaction, cartId: string) => dbTry("shop.cart.clear", () => tx.delete(cartLines).where(eq(cartLines.cartId, cartId))),

  /**
   * Fusionne le panier invité dans celui de l'utilisateur (quantités cumulées, plafonnées) puis
   * supprime le panier invité. Les lignes d'une autre devise que le panier utilisateur sont ignorées.
   */
  mergeGuestCart: (organizationId: string | null, guestCartId: string, userId: string) =>
    dbTransaction("shop.cart.merge", (tx) =>
      Effect.gen(function* () {
        const guest = yield* findCart(tx, { organizationId, cartId: guestCartId }, true);
        if (!guest) return null;
        const owner = { organizationId, userId };
        const target = (yield* findCart(tx, owner, true)) ?? (yield* createCart(tx, owner));
        const [guestLines, targetLines] = yield* Effect.all([linesOf(tx, guest.id), linesOf(tx, target.id)]);
        const currency = targetLines.length > 0 ? target.currency : guest.currency;
        const variants = guestLines.length === 0 ? [] : yield* dbTry("shop.cart.merge.variants", () =>
          tx.select({ id: productVariants.id, currency: productVariants.currency }).from(productVariants).where(inArray(productVariants.id, guestLines.map((line) => line.variantId))));
        let count = targetLines.length;
        for (const line of guestLines) {
          if (variants.find((v) => v.id === line.variantId)?.currency !== currency) continue;
          const existing = targetLines.find((t) => t.variantId === line.variantId);
          if (!existing && count >= MAX_CART_LINES) continue;
          if (!existing) count += 1;
          const quantity = Math.min(99, (existing?.quantity ?? 0) + line.quantity);
          yield* dbTry("shop.cart.merge.line", () =>
            tx.insert(cartLines).values({ cartId: target.id, variantId: line.variantId, quantity })
              .onConflictDoUpdate({ target: [cartLines.cartId, cartLines.variantId], set: { quantity, updatedAt: new Date() } }));
        }
        yield* dbTry("shop.cart.merge.drop", () => tx.delete(carts).where(eq(carts.id, guest.id)));
        yield* refreshCurrency(tx, target.id);
        return target;
      })),

  /** Supprime les paniers invités inactifs depuis plus que la durée de vie du cookie. */
  purgeStaleGuestCarts: (now: Date = new Date()) =>
    dbTry("shop.cart.purge", () =>
      getDrizzle().delete(carts).where(and(isNull(carts.userId), lt(carts.updatedAt, new Date(now.getTime() - CART_TTL_SECONDS * 1000)))).returning({ id: carts.id }),
    ).pipe(Effect.map((rows) => rows.length)),
};

const sameOrg = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);

/** Expression SQL réutilisée par les tests d'intégration (nombre de lignes d'un panier). */
export const cartLineCount = (cartId: string) =>
  dbTry("shop.cart.count", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(cartLines).where(eq(cartLines.cartId, cartId))).pipe(Effect.map(([row]) => Number(row?.n ?? 0)));
