/**
 * Gabarit e-mail `sales.invoice-reminder` (N4-A / N6-A) : relance d'une facture échue envoyée
 * au client, 4 langues, texte + HTML. Bouton vers le lien de paiement signé si les paiements en
 * ligne sont actifs, sinon vers l'espace client.
 */
import { CURRENCY_EXPONENTS, formatMoney, type CurrencyCode } from "@/core/money";
import { defineEmailTemplate } from "@/core/notifications/email-templates";
import type { Locale } from "@i18n/config";

export const INVOICE_REMINDER_TEMPLATE = "sales.invoice-reminder";

type InvoiceReminderData = {
  readonly number: string;
  readonly level: number;
  readonly daysOverdue: number;
  readonly dueDate: string;
  readonly amountDueMinor: number;
  readonly currency: CurrencyCode;
  /** Chemin relatif (lien de paiement signé) ou `null` → espace client. */
  readonly payPath: string | null;
};

interface Strings {
  readonly subject: string;
  readonly heading: string;
  readonly greeting: string;
  readonly body: string;
  readonly pay: string;
  readonly account: string;
  readonly footnote: string;
}

const STRINGS: Record<Locale, Strings> = {
  fr: {
    subject: "Relance : facture {number} échue depuis {days} jours",
    heading: "Facture en attente de règlement",
    greeting: "Bonjour,",
    body: "Sauf erreur de notre part, la facture {number} arrivée à échéance le {due} reste impayée. Montant restant dû : {amount}.",
    pay: "Régler la facture",
    account: "Voir mes factures",
    footnote: "Si vous avez déjà effectué le règlement, merci de ne pas tenir compte de ce message.",
  },
  en: {
    subject: "Reminder: invoice {number} is {days} days overdue",
    heading: "Invoice awaiting payment",
    greeting: "Hello,",
    body: "Unless we are mistaken, invoice {number}, due on {due}, is still unpaid. Amount due: {amount}.",
    pay: "Pay the invoice",
    account: "View my invoices",
    footnote: "If you have already paid, please disregard this message.",
  },
  es: {
    subject: "Recordatorio: la factura {number} lleva {days} días vencida",
    heading: "Factura pendiente de pago",
    greeting: "Hola:",
    body: "Salvo error por nuestra parte, la factura {number}, con vencimiento el {due}, sigue pendiente de pago. Importe pendiente: {amount}.",
    pay: "Pagar la factura",
    account: "Ver mis facturas",
    footnote: "Si ya ha realizado el pago, ignore este mensaje.",
  },
  ar: {
    subject: "تذكير: الفاتورة {number} متأخرة منذ {days} يومًا",
    heading: "فاتورة في انتظار السداد",
    greeting: "مرحبًا،",
    body: "ما لم نكن مخطئين، لا تزال الفاتورة {number} المستحقة بتاريخ {due} غير مسددة. المبلغ المستحق: {amount}.",
    pay: "سداد الفاتورة",
    account: "عرض فواتيري",
    footnote: "إذا كنت قد سددت المبلغ بالفعل، يُرجى تجاهل هذه الرسالة.",
  },
};

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

const int = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

export const invoiceReminderEmail = defineEmailTemplate<InvoiceReminderData>({
  id: INVOICE_REMINDER_TEMPLATE,
  parse: (d) => {
    const level = int(d.level), days = int(d.daysOverdue), amount = int(d.amountDueMinor);
    if (typeof d.number !== "string" || !d.number || level === null || days === null || amount === null) return null;
    if (typeof d.currency !== "string" || !Object.hasOwn(CURRENCY_EXPONENTS, d.currency)) return null;
    if (typeof d.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate)) return null;
    if (d.payPath !== null && (typeof d.payPath !== "string" || !d.payPath.startsWith("/") || d.payPath.startsWith("//"))) return null;
    return { number: d.number, level, daysOverdue: days, dueDate: d.dueDate, amountDueMinor: amount, currency: d.currency as CurrencyCode, payPath: d.payPath };
  },
  render: (data, { locale, siteUrl }) => {
    const t = STRINGS[locale];
    const due = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${data.dueDate}T00:00:00Z`));
    const values = { number: data.number, days: String(data.daysOverdue), due, amount: formatMoney({ amountMinor: data.amountDueMinor, currency: data.currency }, locale) };
    return {
      subject: fill(t.subject, values),
      heading: t.heading,
      greeting: t.greeting,
      body: fill(t.body, values),
      buttonText: data.payPath ? t.pay : t.account,
      buttonUrl: `${siteUrl}${data.payPath ?? `/${locale}/account`}`,
      footnote: t.footnote,
    };
  },
});
