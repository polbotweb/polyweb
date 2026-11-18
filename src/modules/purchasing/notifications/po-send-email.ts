/** Gabarit e-mail `purchasing.po-send` : envoi du bon de commande au fournisseur (PDF joint). */
import { defineEmailTemplate } from "@/core/notifications/email-templates";
import type { Locale } from "@i18n/config";

export const PURCHASE_ORDER_SEND_TEMPLATE = "purchasing.po-send";

type Data = { readonly number: string; readonly title: string; readonly supplierName: string; readonly overrideSubject?: string; readonly overrideBody?: string };

const STRINGS: Record<Locale, { subject: string; heading: string; greeting: string; body: string; footnote: string }> = {
  fr: { subject: "Bon de commande {number}", heading: "Bon de commande", greeting: "Bonjour,", body: "Veuillez trouver ci-joint le bon de commande {number} ({title}).", footnote: "Cet e-mail a été envoyé automatiquement." },
  en: { subject: "Purchase order {number}", heading: "Purchase order", greeting: "Hello,", body: "Please find attached purchase order {number} ({title}).", footnote: "This email was sent automatically." },
  es: { subject: "Pedido de compra {number}", heading: "Pedido de compra", greeting: "Hola:", body: "Adjunto encontrará el pedido de compra {number} ({title}).", footnote: "Este correo se ha enviado automáticamente." },
  ar: { subject: "أمر شراء {number}", heading: "أمر شراء", greeting: "مرحبًا،", body: "تجدون رفقته أمر الشراء {number} ({title}).", footnote: "تم إرسال هذا البريد تلقائيًا." },
};

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

export const purchaseOrderSendEmail = defineEmailTemplate<Data>({
  id: PURCHASE_ORDER_SEND_TEMPLATE,
  parse: (d) => (typeof d.number === "string" && d.number && typeof d.title === "string" && typeof d.supplierName === "string" ? {
      number: d.number, title: d.title, supplierName: d.supplierName,
      overrideSubject: typeof d.overrideSubject === "string" ? d.overrideSubject : undefined,
      overrideBody: typeof d.overrideBody === "string" ? d.overrideBody : undefined,
    } : null),
  render: (data, ctx) => {
    const { locale } = ctx;
    const s = STRINGS[locale];
    const values = { number: data.number, title: data.title, supplierName: data.supplierName };
    return { subject: fill(data.overrideSubject ?? s.subject, values), heading: s.heading, greeting: `${s.greeting} ${data.supplierName}`, body: fill(data.overrideBody ?? s.body, values), buttonText: data.number, buttonUrl: ctx.siteUrl, footnote: s.footnote };
  },
});
