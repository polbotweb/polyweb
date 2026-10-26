/**
 * Gabarit HTML imprimable d'un document de vente (devis, facture, avoir) — fonction pure :
 * valeurs échappées, montants via core/money, sens d'écriture par locale (RTL pour l'arabe).
 * Le rendu PDF est fait par le port `PdfRenderer` (`@/core/documents`).
 */
import type { Locale } from "@i18n/config";
import { escapeHtml as e, printDocument } from "@/core/documents";
import { formatMoney, isCurrencyCode } from "@/core/money";
import { amountDue } from "../domain/payments";
import { getSalesTranslations } from "../i18n";
import type { SalesDocumentDetail } from "../loaders/salesDocument.loader";

export type PrintableSalesDocument = Pick<SalesDocumentDetail,
  "kind" | "number" | "title" | "status" | "currency" | "customerName" | "customerAddress" | "customerVatNumber" | "customerEmail"
  | "issueDate" | "dueDate" | "validUntil" | "netMinor" | "taxMinor" | "grossMinor" | "paidMinor" | "creditedMinor" | "taxMention" | "notes"> & {
  readonly lines: readonly Pick<SalesDocumentDetail["lines"][number], "description" | "quantity" | "unitPriceMinor" | "discountPercent" | "ratePercent" | "netMinor">[];
};

export interface SalesPrintOptions {
  readonly locale: Locale;
  /** Nom de l'émetteur (paramètres du site / organisation). */
  readonly sellerName?: string;
  /** CSS du thème actif (variables de couleur) — les `url()` distantes sont retirées. */
  readonly themeCss?: string;
}

const decimal = (value: string, locale: Locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(Number(value));

/** Nom de fichier du PDF (ASCII, sans séparateur de chemin). */
export const salesPdfFilename = (doc: Pick<PrintableSalesDocument, "kind" | "number">) =>
  `${doc.kind}-${(doc.number ?? "draft").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;

export function renderSalesDocumentHtml(doc: PrintableSalesDocument, { locale, sellerName, themeCss }: SalesPrintOptions): string {
  const t = getSalesTranslations(locale);
  const money = (minor: number) => e(isCurrencyCode(doc.currency) ? formatMoney({ amountMinor: minor, currency: doc.currency }, locale) : `${minor} ${doc.currency}`);
  const heading = `${t.kinds[doc.kind]} ${doc.number ?? t.admin.draftNumber}`;
  const row = (label: string, value: string | null | undefined) => (value ? `<tr><th scope="row">${e(label)}</th><td>${e(value)}</td></tr>` : "");
  const totalRow = (label: string, value: string, strong = false) => `<tr><th scope="row">${strong ? `<strong>${e(label)}</strong>` : e(label)}</th><td class="num">${strong ? `<strong>${value}</strong>` : value}</td></tr>`;
  const isInvoice = doc.kind === "invoice";
  const due = amountDue({ grossMinor: doc.grossMinor, paidMinor: doc.paidMinor, creditedMinor: doc.creditedMinor });
  const lines = doc.lines.map((line) => `<tr><td>${e(line.description)}</td><td class="num">${e(decimal(line.quantity, locale))}</td><td class="num">${money(line.unitPriceMinor)}</td><td class="num">${e(decimal(line.discountPercent, locale))} %</td><td class="num">${e(decimal(line.ratePercent, locale))} %</td><td class="num">${money(line.netMinor)}</td></tr>`).join("");
  const body = `
<header class="accent grid"><div><h1>${e(heading)}</h1><p class="muted">${e(doc.title)}</p></div>${sellerName ? `<div><strong>${e(sellerName)}</strong></div>` : ""}</header>
<section class="grid">
  <table aria-label="${e(t.fields.customerName)}"><tbody>${row(t.fields.customerName, doc.customerName)}${row(t.fields.customerAddress, doc.customerAddress)}${row(t.fields.customerVatNumber, doc.customerVatNumber)}${row(t.fields.customerEmail, doc.customerEmail)}</tbody></table>
  <table aria-label="${e(t.fields.issueDate)}"><tbody>${row(t.fields.issueDate, doc.issueDate)}${row(t.fields.dueDate, doc.dueDate)}${row(t.fields.validUntil, doc.validUntil)}</tbody></table>
</section>
<h2>${e(t.lines.title)}</h2>
<table><thead><tr><th scope="col">${e(t.lines.description)}</th><th scope="col" class="num">${e(t.lines.quantity)}</th><th scope="col" class="num">${e(t.lines.unitPrice)}</th><th scope="col" class="num">${e(t.lines.discount)}</th><th scope="col" class="num">${e(t.lines.rate)}</th><th scope="col" class="num">${e(t.lines.net)}</th></tr></thead><tbody>${lines}</tbody></table>
<table class="totals"><tbody>${totalRow(t.fields.net, money(doc.netMinor))}${totalRow(t.fields.tax, money(doc.taxMinor))}${totalRow(t.fields.gross, money(doc.grossMinor), true)}${isInvoice ? totalRow(t.fields.paid, money(doc.paidMinor)) : ""}${isInvoice && doc.creditedMinor > 0 ? totalRow(t.fields.credited, money(doc.creditedMinor)) : ""}${isInvoice ? totalRow(t.fields.due, money(due), true) : ""}</tbody></table>
${doc.taxMention ? `<p class="muted">${e(t.fields.mention)} : ${e(doc.taxMention)}</p>` : ""}
${doc.notes ? `<p>${e(doc.notes)}</p>` : ""}`;
  return printDocument({ locale, title: heading, css: themeCss, body });
}
