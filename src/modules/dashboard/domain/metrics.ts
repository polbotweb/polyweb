/**
 * Tableau de bord ERP — assemblage pur des agrégats SQL en indicateurs. Règles (docs/erp-dashboard.md) :
 *
 * - CA facturé = factures émises (ISSUED, PARTIALLY_PAID, PAID, CREDITED) − avoirs émis, à la date
 *   d'émission, + commandes boutique payées (PAID, SHIPPED, DELIVERED) **non rattachées à une facture
 *   comptée**, à la date de paiement : une commande liée à une facture n'est comptée qu'une fois (via la facture) ;
 * - encaissé = encaissements Sales (date d'encaissement) + commandes boutique comptées ci-dessus (TTC) ;
 * - marge boutique = CA HT des commandes − coût d'achat (coût moyen pondéré des réceptions) ;
 * - marge brute approchée = CA HT − achats reçus HT de la période (variation de stock ignorée).
 */

export interface InvoiceBucketRow { readonly bucket: string; readonly invoicedNet: number; readonly invoicedGross: number; readonly creditedNet: number; readonly creditedGross: number; readonly invoices: number; readonly creditNotes: number }
export interface ShopBucketRow { readonly bucket: string; readonly net: number; readonly gross: number; readonly orders: number; readonly cogs: number; readonly uncostedUnits: number }
export interface AmountBucketRow { readonly bucket: string; readonly amount: number }

export interface RevenueBucket {
  readonly bucket: string;
  readonly invoicedNet: number;
  readonly creditedNet: number;
  readonly shopNet: number;
  readonly revenueNet: number;
  readonly revenueGross: number;
  readonly paid: number;
  readonly purchases: number;
  readonly shopCogs: number;
  readonly shopMargin: number;
  readonly grossMargin: number;
  readonly invoices: number;
  readonly creditNotes: number;
  readonly orders: number;
  readonly uncostedUnits: number;
}

export type RevenueTotals = Omit<RevenueBucket, "bucket">;

const ZERO: RevenueTotals = {
  invoicedNet: 0, creditedNet: 0, shopNet: 0, revenueNet: 0, revenueGross: 0, paid: 0, purchases: 0,
  shopCogs: 0, shopMargin: 0, grossMargin: 0, invoices: 0, creditNotes: 0, orders: 0, uncostedUnits: 0,
};

const byBucket = <T extends { readonly bucket: string }>(rows: readonly T[]) => new Map(rows.map((r) => [r.bucket, r]));

/** Série complète (périodes vides incluses, à zéro) ; une ligne hors périodes est ignorée. */
export const revenueSeries = (input: {
  readonly buckets: readonly string[];
  readonly invoices: readonly InvoiceBucketRow[];
  readonly shop: readonly ShopBucketRow[];
  readonly payments: readonly AmountBucketRow[];
  readonly purchases: readonly AmountBucketRow[];
}): { readonly rows: readonly RevenueBucket[]; readonly totals: RevenueTotals } => {
  const inv = byBucket(input.invoices);
  const shop = byBucket(input.shop);
  const pay = byBucket(input.payments);
  const pur = byBucket(input.purchases);
  const rows = input.buckets.map((bucket): RevenueBucket => {
    const i = inv.get(bucket);
    const s = shop.get(bucket);
    const invoicedNet = i?.invoicedNet ?? 0;
    const creditedNet = i?.creditedNet ?? 0;
    const shopNet = s?.net ?? 0;
    const revenueNet = invoicedNet - creditedNet + shopNet;
    const purchases = pur.get(bucket)?.amount ?? 0;
    const shopCogs = s?.cogs ?? 0;
    return {
      bucket, invoicedNet, creditedNet, shopNet, revenueNet,
      revenueGross: (i?.invoicedGross ?? 0) - (i?.creditedGross ?? 0) + (s?.gross ?? 0),
      paid: (pay.get(bucket)?.amount ?? 0) + (s?.gross ?? 0),
      purchases, shopCogs, shopMargin: shopNet - shopCogs, grossMargin: revenueNet - purchases,
      invoices: i?.invoices ?? 0, creditNotes: i?.creditNotes ?? 0, orders: s?.orders ?? 0, uncostedUnits: s?.uncostedUnits ?? 0,
    };
  });
  const totals = rows.reduce<RevenueTotals>((acc, r) => {
    const next = { ...acc };
    for (const k of Object.keys(ZERO) as (keyof RevenueTotals)[]) next[k] = acc[k] + r[k];
    return next;
  }, ZERO);
  return { rows, totals };
};

/** Taux de marge en points de base (1 % = 100), `null` sans chiffre d'affaires. */
export const marginRateBp = (margin: number, revenueNet: number): number | null =>
  revenueNet > 0 ? Math.round((margin * 10_000) / revenueNet) : null;

export interface StockItemRow { readonly itemId: string; readonly sku: string; readonly name: string; readonly level: number; readonly reserved: number; readonly unitCost: number | null }
export interface StockItem extends StockItemRow { readonly available: number; readonly valuation: number | null; readonly low: boolean }

/**
 * Stock : disponible = niveau − réservations actives ; valorisation = niveau positif × coût moyen
 * pondéré (arrondi à l'unité mineure par article) ; alerte quand disponible ≤ seuil.
 */
export const stockSummary = (rows: readonly StockItemRow[], threshold: number) => {
  const items = rows.map((r): StockItem => {
    const available = r.level - r.reserved;
    return { ...r, available, valuation: r.unitCost === null ? null : Math.round(Math.max(r.level, 0) * r.unitCost), low: available <= threshold };
  });
  const low = items.filter((i) => i.low).sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));
  return {
    items,
    low,
    totals: {
      items: items.length,
      units: items.reduce((s, i) => s + Math.max(i.level, 0), 0),
      reserved: items.reduce((s, i) => s + i.reserved, 0),
      valuation: items.reduce((s, i) => s + (i.valuation ?? 0), 0),
      uncosted: items.filter((i) => i.unitCost === null && i.level > 0).length,
      lowCount: low.length,
    },
  };
};

export interface Receivables { readonly outstanding: number; readonly overdue: number; readonly openInvoices: number; readonly overdueInvoices: number; readonly pendingOrders: number }
