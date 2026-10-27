/** Libellés de la page publique de paiement d'une facture (lien signé) — 4 locales. */
import type { Locale } from "@i18n/config";

export type SalesPayTranslations = {
  title: string; invoice: string; customer: string; amountDue: string; dueDate: string; pay: string; secureNote: string;
  settled: string; processing: string; unavailable: string; invalidLink: string; adminLink: string; adminHint: string;
};

const translations: Record<Locale, SalesPayTranslations> = {
  fr: {
    title: "Paiement de facture", invoice: "Facture", customer: "Client", amountDue: "Restant dû", dueDate: "Échéance", pay: "Payer {amount} par carte",
    secureNote: "Vous serez redirigé vers la page de paiement sécurisée de notre prestataire ; aucune donnée de carte ne transite par ce site.",
    settled: "Cette facture est réglée. Merci.", processing: "Paiement en cours de vérification : cette page indiquera le règlement dès réception.",
    unavailable: "Le paiement en ligne est momentanément indisponible. Réessayez dans quelques minutes.", invalidLink: "Ce lien de paiement n'est pas valide.", adminLink: "Lien de paiement en ligne", adminHint: "À transmettre au client : il ouvre une page sécurisée de paiement par carte du restant dû. Le lien est propre à cette facture ; ne le publiez pas.",
  },
  en: {
    title: "Invoice payment", invoice: "Invoice", customer: "Customer", amountDue: "Amount due", dueDate: "Due date", pay: "Pay {amount} by card",
    secureNote: "You will be redirected to our provider's secure payment page; no card data passes through this site.",
    settled: "This invoice is paid. Thank you.", processing: "Payment is being verified: this page will show the settlement as soon as it is received.",
    unavailable: "Online payment is temporarily unavailable. Please try again in a few minutes.", invalidLink: "This payment link is not valid.", adminLink: "Online payment link", adminHint: "Send it to the customer: it opens a secure card payment page for the amount due. The link is unique to this invoice; do not publish it.",
  },
  es: {
    title: "Pago de factura", invoice: "Factura", customer: "Cliente", amountDue: "Importe pendiente", dueDate: "Vencimiento", pay: "Pagar {amount} con tarjeta",
    secureNote: "Se le redirigirá a la página de pago segura de nuestro proveedor; ningún dato de tarjeta pasa por este sitio.",
    settled: "Esta factura está pagada. Gracias.", processing: "Pago en verificación: esta página mostrará el pago en cuanto se reciba.",
    unavailable: "El pago en línea no está disponible por el momento. Inténtelo de nuevo en unos minutos.", invalidLink: "Este enlace de pago no es válido.", adminLink: "Enlace de pago en línea", adminHint: "Envíelo al cliente: abre una página segura de pago con tarjeta del importe pendiente. El enlace es propio de esta factura; no lo publique.",
  },
  ar: {
    title: "دفع الفاتورة", invoice: "الفاتورة", customer: "العميل", amountDue: "المبلغ المستحق", dueDate: "تاريخ الاستحقاق", pay: "ادفع {amount} بالبطاقة",
    secureNote: "ستتم إعادة توجيهك إلى صفحة الدفع الآمنة لدى مزوّدنا؛ لا تمر أي بيانات بطاقة عبر هذا الموقع.",
    settled: "تم سداد هذه الفاتورة. شكرًا لك.", processing: "جارٍ التحقق من الدفع: ستعرض هذه الصفحة السداد فور استلامه.",
    unavailable: "الدفع عبر الإنترنت غير متاح مؤقتًا. يُرجى المحاولة بعد بضع دقائق.", invalidLink: "رابط الدفع هذا غير صالح.", adminLink: "رابط الدفع عبر الإنترنت", adminHint: "أرسله إلى العميل: يفتح صفحة آمنة للدفع بالبطاقة للمبلغ المستحق. الرابط خاص بهذه الفاتورة؛ لا تنشره.",
  },
};

export function getSalesPayTranslations(locale: Locale): SalesPayTranslations {
  return translations[locale] ?? translations.fr;
}
