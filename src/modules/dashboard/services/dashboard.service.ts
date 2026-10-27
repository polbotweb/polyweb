/**
 * Tableau de bord ERP — agrégats SQL en lecture seule, isolés par tenant (`organizationId`,
 * `null` = plateforme) et par devise. Paramètres toujours liés (jamais interpolés), une requête
 * par indicateur, exécutées en parallèle. Règles métier : `../domain/metrics.ts`.
 */
import { Effect } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { getDrizzle } from "@/database/drizzle";
import { dbTry } from "@/lib/effect/run";
import type { CurrencyCode } from "@/core/money";
import { OPEN_INVOICE_STATUSES } from "@/modules/sales/domain/workflow";
import { REVENUE_ORDER_STATUSES } from "@/modules/shop/domain/orders";
import { SHIPPING_LINE_SKU } from "@/modules/shop/services/order.service";
import { bucketStarts, type DashboardFilters } from "../domain/period";
import { revenueSeries, stockSummary, type AmountBucketRow, type InvoiceBucketRow, type Receivables, type ShopBucketRow, type StockItemRow } from "../domain/metrics";

/** Factures comptées dans le CA (émises, y compris soldées ou créditées ; jamais brouillon / annulée). */
export const COUNTED_INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID", "CREDITED"] as const;
/** Garde-fou mémoire : au-delà, la liste de stock est tronquée (signalé à l'écran). */
export const MAX_STOCK_ITEMS = 5000;

const list = (values: readonly string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);
/** Prédicat tenant indexable (`IS NULL` pour la plateforme, égalité sinon). */
const tenant = (column: SQL, organizationId: string | null) => (organizationId === null ? sql`${column} IS NULL` : sql`${column} = ${organizationId}`);
const bucket = (expr: SQL, f: DashboardFilters) => sql`to_char(date_trunc(${f.granularity}, ${expr}), 'YYYY-MM-DD')`;
/** Bornes d'horodatage : [from 00:00, to + 1 jour 00:00[ (UTC). */
const tsRange = (column: SQL, f: DashboardFilters) => sql`${column} >= ${f.from}::date AND ${column} < (${f.to}::date + 1)`;

/** Entier sûr depuis un agrégat Postgres (bigint renvoyé en texte) ; au-delà de 2^53 : défaut explicite. */
const int = (v: unknown): number => {
  const n = Number(v ?? 0);
  if (!Number.isSafeInteger(n)) throw new RangeError(`dashboard: agrégat hors des entiers sûrs (${String(v)})`);
  return n;
};

const execute = <T extends Record<string, unknown>>(operation: string, query: SQL) =>
  dbTry(`dashboard.${operation}`, () => getDrizzle().execute<T>(query)).pipe(Effect.map((r) => r.rows));

/** Coût moyen pondéré par article (réceptions × prix d'achat de la ligne de commande), même tenant et devise. */
const unitCosts = (organizationId: string | null, currency: CurrencyCode) => sql`
  SELECT rl.item_id, sum(rl.quantity::numeric * pol.unit_price_minor) / sum(rl.quantity) AS unit_cost
  FROM purchasing_receipt_lines rl
  JOIN purchasing_order_lines pol ON pol.id = rl.order_line_id
  JOIN purchasing_orders po ON po.id = pol.order_id
  WHERE ${tenant(sql`po.organization_id`, organizationId)} AND po.currency = ${currency}
  GROUP BY rl.item_id`;

const invoiceRows = (organizationId: string | null, f: DashboardFilters) =>
  execute<{ bucket: string; invoiced_net: string; invoiced_gross: string; credited_net: string; credited_gross: string; invoices: number; credit_notes: number }>("invoices", sql`
    SELECT ${bucket(sql`d.issue_date::timestamp`, f)} AS bucket,
      coalesce(sum(d.net_minor) FILTER (WHERE d.kind = 'invoice'), 0)::bigint AS invoiced_net,
      coalesce(sum(d.gross_minor) FILTER (WHERE d.kind = 'invoice'), 0)::bigint AS invoiced_gross,
      coalesce(sum(d.net_minor) FILTER (WHERE d.kind = 'credit_note'), 0)::bigint AS credited_net,
      coalesce(sum(d.gross_minor) FILTER (WHERE d.kind = 'credit_note'), 0)::bigint AS credited_gross,
      (count(*) FILTER (WHERE d.kind = 'invoice'))::int AS invoices,
      (count(*) FILTER (WHERE d.kind = 'credit_note'))::int AS credit_notes
    FROM sales_documents d
    WHERE ${tenant(sql`d.organization_id`, organizationId)} AND d.currency = ${f.currency}
      AND d.issue_date BETWEEN ${f.from}::date AND ${f.to}::date
      AND ((d.kind = 'invoice' AND d.status IN (${list(COUNTED_INVOICE_STATUSES)})) OR (d.kind = 'credit_note' AND d.status = 'ISSUED'))
    GROUP BY 1`,
  ).pipe(Effect.map((rows) => rows.map((r): InvoiceBucketRow => ({
    bucket: r.bucket, invoicedNet: int(r.invoiced_net), invoicedGross: int(r.invoiced_gross), creditedNet: int(r.credited_net),
    creditedGross: int(r.credited_gross), invoices: int(r.invoices), creditNotes: int(r.credit_notes),
  }))));

/**
 * Commandes boutique payées, à la date de paiement, **hors** commandes rattachées à une facture
 * comptée (pas de double comptage) ; coût d'achat des lignes produit (hors port) au coût moyen pondéré.
 */
const shopRows = (organizationId: string | null, f: DashboardFilters) =>
  execute<{ bucket: string; net: string; gross: string; orders: number; cogs: string; uncosted_units: string }>("shop", sql`
    WITH counted AS (
      SELECT o.id, o.net_minor, o.gross_minor, o.paid_at
      FROM orders o
      LEFT JOIN sales_documents d ON d.id = o.sales_document_id AND d.kind = 'invoice' AND d.status IN (${list(COUNTED_INVOICE_STATUSES)})
      WHERE ${tenant(sql`o.organization_id`, organizationId)} AND o.currency = ${f.currency}
        AND o.status IN (${list(REVENUE_ORDER_STATUSES)}) AND o.paid_at IS NOT NULL AND ${tsRange(sql`o.paid_at`, f)}
        AND d.id IS NULL
    ),
    items AS (
      SELECT DISTINCT ON (li.variant_id) li.id, li.variant_id
      FROM logistics_items li
      WHERE ${tenant(sql`li.organization_id`, organizationId)} AND li.variant_id IS NOT NULL
      ORDER BY li.variant_id, li.created_at, li.id
    ),
    costs AS (${unitCosts(organizationId, f.currency)}),
    line_costs AS (
      SELECT ol.order_id,
        coalesce(sum(ol.quantity * c.unit_cost) FILTER (WHERE c.unit_cost IS NOT NULL), 0) AS cogs,
        coalesce(sum(ol.quantity) FILTER (WHERE c.unit_cost IS NULL), 0) AS uncosted_units
      FROM order_lines ol
      JOIN counted ON counted.id = ol.order_id
      LEFT JOIN items ON items.variant_id = ol.variant_id
      LEFT JOIN costs c ON c.item_id = items.id
      WHERE ol.sku <> ${SHIPPING_LINE_SKU}
      GROUP BY ol.order_id
    )
    SELECT ${bucket(sql`counted.paid_at`, f)} AS bucket,
      coalesce(sum(counted.net_minor), 0)::bigint AS net,
      coalesce(sum(counted.gross_minor), 0)::bigint AS gross,
      count(*)::int AS orders,
      round(coalesce(sum(lc.cogs), 0))::bigint AS cogs,
      coalesce(sum(lc.uncosted_units), 0)::bigint AS uncosted_units
    FROM counted LEFT JOIN line_costs lc ON lc.order_id = counted.id
    GROUP BY 1`,
  ).pipe(Effect.map((rows) => rows.map((r): ShopBucketRow => ({
    bucket: r.bucket, net: int(r.net), gross: int(r.gross), orders: int(r.orders), cogs: int(r.cogs), uncostedUnits: int(r.uncosted_units),
  }))));

/** Encaissements Sales sur factures du tenant, à la date d'encaissement. */
const paymentRows = (organizationId: string | null, f: DashboardFilters) =>
  execute<{ bucket: string; amount: string }>("payments", sql`
    SELECT ${bucket(sql`p.paid_at::timestamp`, f)} AS bucket, coalesce(sum(p.amount_minor), 0)::bigint AS amount
    FROM sales_payments p
    JOIN sales_documents d ON d.id = p.document_id
    WHERE ${tenant(sql`d.organization_id`, organizationId)} AND d.kind = 'invoice' AND p.currency = ${f.currency}
      AND p.paid_at BETWEEN ${f.from}::date AND ${f.to}::date
    GROUP BY 1`,
  ).pipe(Effect.map((rows) => rows.map((r): AmountBucketRow => ({ bucket: r.bucket, amount: int(r.amount) }))));

/** Achats reçus HT (quantité reçue × prix d'achat), à la date de réception. */
const purchaseRows = (organizationId: string | null, f: DashboardFilters) =>
  execute<{ bucket: string; amount: string }>("purchases", sql`
    SELECT ${bucket(sql`r.received_at`, f)} AS bucket, round(coalesce(sum(rl.quantity::numeric * pol.unit_price_minor), 0))::bigint AS amount
    FROM purchasing_receipt_lines rl
    JOIN purchasing_receipts r ON r.id = rl.receipt_id
    JOIN purchasing_order_lines pol ON pol.id = rl.order_line_id
    JOIN purchasing_orders po ON po.id = pol.order_id
    WHERE ${tenant(sql`r.organization_id`, organizationId)} AND po.currency = ${f.currency} AND ${tsRange(sql`r.received_at`, f)}
    GROUP BY 1`,
  ).pipe(Effect.map((rows) => rows.map((r): AmountBucketRow => ({ bucket: r.bucket, amount: int(r.amount) }))));

/** Encours client à date (indépendant de la période) et commandes en attente de paiement non échues. */
const receivables = (organizationId: string | null, currency: CurrencyCode, today: string, now: Date) =>
  Effect.all([
    execute<{ outstanding: string; overdue: string; open_invoices: number; overdue_invoices: number }>("receivables", sql`
      SELECT coalesce(sum(d.gross_minor - d.paid_minor - d.credited_minor), 0)::bigint AS outstanding,
        coalesce(sum(d.gross_minor - d.paid_minor - d.credited_minor) FILTER (WHERE d.due_date < ${today}::date), 0)::bigint AS overdue,
        count(*)::int AS open_invoices,
        (count(*) FILTER (WHERE d.due_date < ${today}::date))::int AS overdue_invoices
      FROM sales_documents d
      WHERE ${tenant(sql`d.organization_id`, organizationId)} AND d.currency = ${currency}
        AND d.kind = 'invoice' AND d.status IN (${list(OPEN_INVOICE_STATUSES)})`),
    execute<{ pending: number }>("pendingOrders", sql`
      SELECT count(*)::int AS pending FROM orders o
      WHERE ${tenant(sql`o.organization_id`, organizationId)} AND o.currency = ${currency}
        AND o.status = 'PENDING_PAYMENT' AND o.expires_at > ${now.toISOString()}::timestamp`),
  ], { concurrency: 2 }).pipe(Effect.map(([[r], [p]]): Receivables => ({
    outstanding: int(r?.outstanding), overdue: int(r?.overdue), openInvoices: int(r?.open_invoices),
    overdueInvoices: int(r?.overdue_invoices), pendingOrders: int(p?.pending),
  })));

/** Niveaux (somme des mouvements), réservations actives non échues et coût moyen par article. */
const stockRows = (organizationId: string | null, currency: CurrencyCode, now: Date) =>
  execute<{ item_id: string; sku: string; name: string; level: string; reserved: string; unit_cost: string | null }>("stock", sql`
    WITH levels AS (
      SELECT m.item_id, sum(m.delta)::bigint AS level FROM logistics_stock_movements m
      WHERE ${tenant(sql`m.organization_id`, organizationId)} GROUP BY m.item_id
    ),
    reserved AS (
      SELECT s.item_id, sum(s.quantity)::bigint AS reserved FROM logistics_stock_reservations s
      WHERE ${tenant(sql`s.organization_id`, organizationId)} AND s.status = 'active' AND s.expires_at > ${now.toISOString()}::timestamp
      GROUP BY s.item_id
    ),
    costs AS (${unitCosts(organizationId, currency)})
    SELECT i.id AS item_id, i.sku, i.name, coalesce(l.level, 0) AS level, coalesce(r.reserved, 0) AS reserved, c.unit_cost::text AS unit_cost
    FROM logistics_items i
    LEFT JOIN levels l ON l.item_id = i.id
    LEFT JOIN reserved r ON r.item_id = i.id
    LEFT JOIN costs c ON c.item_id = i.id
    WHERE ${tenant(sql`i.organization_id`, organizationId)}
    ORDER BY i.sku, i.id
    LIMIT ${MAX_STOCK_ITEMS + 1}`,
  ).pipe(Effect.map((rows) => ({
    truncated: rows.length > MAX_STOCK_ITEMS,
    rows: rows.slice(0, MAX_STOCK_ITEMS).map((r): StockItemRow => ({
      itemId: r.item_id, sku: r.sku, name: r.name, level: int(r.level), reserved: int(r.reserved),
      unitCost: r.unit_cost === null ? null : Number(r.unit_cost),
    })),
  })));

export const dashboardService = {
  /** Chiffre d'affaires, encaissements, achats et marges par période. */
  revenue: (organizationId: string | null, filters: DashboardFilters) =>
    Effect.all([invoiceRows(organizationId, filters), shopRows(organizationId, filters), paymentRows(organizationId, filters), purchaseRows(organizationId, filters)], { concurrency: 4 }).pipe(
      Effect.map(([invoices, shop, payments, purchases]) => revenueSeries({ buckets: bucketStarts(filters.from, filters.to, filters.granularity), invoices, shop, payments, purchases })),
      Effect.withSpan("dashboard.revenue"),
    ),
  receivables: (organizationId: string | null, currency: CurrencyCode, today: string, now: Date = new Date()) =>
    receivables(organizationId, currency, today, now).pipe(Effect.withSpan("dashboard.receivables")),
  /** Stock valorisé et alertes (disponible ≤ seuil). */
  stock: (organizationId: string | null, currency: CurrencyCode, threshold: number, now: Date = new Date()) =>
    stockRows(organizationId, currency, now).pipe(
      Effect.map(({ rows, truncated }) => ({ ...stockSummary(rows, threshold), truncated })),
      Effect.withSpan("dashboard.stock"),
    ),
};
