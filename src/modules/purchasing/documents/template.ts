/** Gabarit HTML imprimable d'une commande fournisseur (valeurs échappées, RTL arabe). */
import type { Locale } from "@i18n/config";
import { escapeHtml as e, printDocument } from "@/core/documents";
import { formatMoney, isCurrencyCode } from "@/core/money";
import { getPurchasingTranslations } from "../i18n";

export interface PrintablePurchaseOrder {
  readonly number: string | null;
  readonly title: string;
  readonly status: string;
  readonly currency: string;
  readonly expectedDate: string | null;
  readonly notes: string | null;
  readonly netMinor: number;
  readonly taxMinor: number;
  readonly grossMinor: number;
  readonly supplierName: string;
  readonly supplierAddress: string | null;
  readonly supplierVatNumber: string | null;
  readonly warehouseName: string | null;
  readonly lines: readonly {
    readonly sku: string | null;
    readonly description: string | null;
    readonly quantity: number;
    readonly unitPriceMinor: number;
    readonly netMinor: number;
  }[];
}

export const purchaseOrderPdfFilename = (doc: Pick<PrintablePurchaseOrder, "number">) =>
  `purchase-order-${(doc.number ?? "draft").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;

export function renderPurchaseOrderHtml(doc: PrintablePurchaseOrder, locale: Locale, themeCss = ""): string {
  const t = getPurchasingTranslations(locale);
  const currency = isCurrencyCode(doc.currency) ? doc.currency : "EUR";
  const moneyOf = (minor: number) => formatMoney({ amountMinor: minor, currency }, locale);
  const rows = doc.lines.map((line) => `<tr><td>${e(line.sku ?? "")}</td><td>${e(line.description ?? "")}</td><td>${line.quantity}</td><td>${e(moneyOf(line.unitPriceMinor))}</td><td>${e(moneyOf(line.netMinor))}</td></tr>`).join("");
  const body = `
    <header>
      <h1>${e(t.admin.orders)} ${e(doc.number ?? t.statuses.DRAFT)}</h1>
      <p>${e(doc.title)}</p>
    </header>
    <section>
      <p><strong>${e(t.fields.supplier)}</strong> ${e(doc.supplierName)}</p>
      ${doc.supplierAddress ? `<p>${e(doc.supplierAddress)}</p>` : ""}
      ${doc.supplierVatNumber ? `<p>${e(t.fields.vatNumber)} : ${e(doc.supplierVatNumber)}</p>` : ""}
      ${doc.warehouseName ? `<p><strong>${e(t.fields.warehouse)}</strong> ${e(doc.warehouseName)}</p>` : ""}
      ${doc.expectedDate ? `<p><strong>${e(t.fields.expectedDate)}</strong> ${e(doc.expectedDate)}</p>` : ""}
    </section>
    <table>
      <thead><tr><th>${e(t.fields.sku)}</th><th>${e(t.fields.description)}</th><th>${e(t.fields.quantity)}</th><th>${e(t.fields.unitPrice)}</th><th>${e(t.fields.net)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p><strong>${e(t.fields.net)}</strong> ${e(moneyOf(doc.netMinor))}</p>
    ${doc.notes ? `<p>${e(doc.notes)}</p>` : ""}
  `;
  return printDocument({ locale, title: `${t.admin.orders} ${doc.number ?? ""}`.trim(), css: themeCss, body });
}
