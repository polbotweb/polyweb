/**
 * API publique du module Boutique (lecture seule, `shop:read`) : commandes
 * (avec lignes à la lecture par id) et produits (avec variantes).
 * Aucune écriture sur les commandes (paiement / expédition = parcours internes).
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { ApiObjectSchema, ApiResourceDefinition, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { dbTry } from "@/lib/effect/run";
import { ORDER_STATUSES } from "../domain/orders";
import { SHOP_STATUSES } from "../domain/workflow";
import { products, productVariants } from "../schema";
import { orderLines, orders } from "../schema/orders";

type OrderRow = typeof orders.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

export const serializeOrder = (r: OrderRow) => ({
  id: r.id,
  number: r.number,
  status: r.status,
  locale: r.locale,
  email: r.email,
  customerName: r.customerName,
  phone: r.phone,
  shippingAddress: { line1: r.addressLine1, line2: r.addressLine2, postcode: r.postcode, city: r.city, country: r.country },
  shippingMethod: r.shippingMethod,
  currency: r.currency,
  shippingMinor: r.shippingMinor,
  netMinor: r.netMinor,
  taxMinor: r.taxMinor,
  grossMinor: r.grossMinor,
  taxTreatment: r.taxTreatment,
  salesDocumentId: r.salesDocumentId,
  paidAt: iso(r.paidAt),
  shippedAt: iso(r.shippedAt),
  cancelledAt: iso(r.cancelledAt),
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const serializeVariant = (v: VariantRow) => ({ id: v.id, sku: v.sku, position: v.position, priceMinor: v.priceMinor, currency: v.currency, available: v.available });

export const serializeProduct = (r: ProductRow, variants: readonly VariantRow[]) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  status: r.status,
  publishedAt: iso(r.publishedAt),
  variants: variants.map(serializeVariant),
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const orderReader = tableReader<OrderRow, ReturnType<typeof serializeOrder>>(
  {
    name: "orders",
    columns: { id: orders.id, createdAt: orders.createdAt, organizationId: orders.organizationId },
    select: (where, limit) => getDrizzle().select().from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit),
    filters: [
      { name: "status", description: "Statut.", values: ORDER_STATUSES, where: (v) => eq(orders.status, v as OrderRow["status"]) },
      { name: "number", description: "Numéro de commande exact.", where: (v) => eq(orders.number, v) },
      { name: "email", description: "E-mail client exact.", where: (v) => eq(orders.email, v.trim().toLowerCase()) },
    ],
  },
  serializeOrder,
);

const variantsOf = (ids: readonly string[]) =>
  ids.length === 0
    ? Effect.succeed([] as VariantRow[])
    : dbTry("api.products.variants", () => getDrizzle().select().from(productVariants).where(inArray(productVariants.productId, [...ids])).orderBy(asc(productVariants.position)));

const withVariants = (rows: readonly ProductRow[]) =>
  variantsOf(rows.map((r) => r.id)).pipe(Effect.map((variants) => rows.map((r) => serializeProduct(r, variants.filter((v) => v.productId === r.id)))));

const productReader = tableReader<ProductRow, ProductRow>(
  {
    name: "products",
    columns: { id: products.id, createdAt: products.createdAt, organizationId: products.organizationId },
    select: (where, limit) => getDrizzle().select().from(products).where(where).orderBy(desc(products.createdAt), desc(products.id)).limit(limit),
    filters: [
      { name: "status", description: "Statut éditorial.", values: SHOP_STATUSES, where: (v) => eq(products.status, v as ProductRow["status"]) },
      { name: "sku", description: "Produit ayant une variante de ce SKU.", where: (v) => sql`exists (select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.sku} = ${v})` },
    ],
  },
  (row) => row,
);

const stamps = { createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time", nullable: true } } as const;

const orderSchema: ApiObjectSchema = {
  properties: {
    id: { type: "string" },
    number: { type: "string" },
    status: { type: "string", enum: ORDER_STATUSES },
    locale: { type: "string" },
    email: { type: "string" },
    customerName: { type: "string" },
    phone: { type: "string", nullable: true },
    shippingAddress: { type: "object", description: "line1, line2, postcode, city, country." },
    shippingMethod: { type: "string" },
    currency: { type: "string" },
    shippingMinor: { type: "integer" },
    netMinor: { type: "integer" },
    taxMinor: { type: "integer" },
    grossMinor: { type: "integer" },
    taxTreatment: { type: "string" },
    salesDocumentId: { type: "string", nullable: true, description: "Facture associée." },
    paidAt: { type: "string", format: "date-time", nullable: true },
    shippedAt: { type: "string", format: "date-time", nullable: true },
    cancelledAt: { type: "string", format: "date-time", nullable: true },
    lines: { type: "array", description: "Lignes (lecture par id uniquement).", items: { type: "object" } },
    ...stamps,
  },
  required: ["id", "number", "status", "currency", "grossMinor", "createdAt"],
};

const productSchema: ApiObjectSchema = {
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    status: { type: "string", enum: SHOP_STATUSES },
    publishedAt: { type: "string", format: "date-time", nullable: true },
    variants: { type: "array", description: "id, sku, position, priceMinor, currency, available.", items: { type: "object" } },
    ...stamps,
  },
  required: ["id", "slug", "title", "status", "variants", "createdAt"],
};

export const ordersResource: ApiResourceDefinition<unknown> = {
  name: "orders",
  module: "shop",
  description: "Commandes de la boutique.",
  scope: "shop:read",
  filters: orderReader.filters,
  schema: orderSchema,
  list: orderReader.list,
  get: (tenant, id) =>
    Effect.gen(function* () {
      const row = yield* orderReader.find(tenant, id);
      if (!row) return undefined;
      const lines = yield* dbTry("api.orders.lines", () => getDrizzle().select().from(orderLines).where(eq(orderLines.orderId, row.id)).orderBy(asc(orderLines.position)));
      return {
        ...serializeOrder(row),
        lines: lines.map((l) => ({ position: l.position, variantId: l.variantId, sku: l.sku, description: l.description, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, lineTotalMinor: l.lineTotalMinor, taxCategory: l.taxCategory })),
      };
    }),
};

export const productsResource: ApiResourceDefinition<unknown> = {
  name: "products",
  module: "shop",
  description: "Produits du catalogue, avec variantes (SKU, prix, disponibilité).",
  scope: "shop:read",
  filters: productReader.filters,
  schema: productSchema,
  list: (tenant, query) =>
    productReader.list(tenant, query).pipe(Effect.flatMap((page) => withVariants(page.items).pipe(Effect.map((items) => ({ items, last: page.last }))))),
  get: (tenant, id) => productReader.find(tenant, id).pipe(Effect.flatMap((row) => (row ? withVariants([row]).pipe(Effect.map((items) => items[0])) : Effect.succeed(undefined)))),
};

export const shopApi: ModuleApiDeclaration = {
  module: "shop",
  resources: [ordersResource, productsResource],
  events: [
    { name: "order.paid", description: "Commande payée." },
    { name: "order.shipped", description: "Commande expédiée." },
    { name: "order.refunded", description: "Commande remboursée." },
  ],
};
