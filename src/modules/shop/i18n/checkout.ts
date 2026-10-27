/** Libellés du tunnel de vente public (panier, commande, suivi), 4 locales. */
import type { Locale } from "@i18n/config";
import type { CheckoutField } from "../domain/errors";
import type { ShippingMethod } from "../domain/checkout";
import type { OrderStatus } from "../domain/orders";

export type CheckoutNoticeKey =
  | "added" | "updated" | "errorSummary" | "outOfStock" | "unavailable" | "cartChanged" | "rateLimited" | "generic"
  | "payUnavailable" | "paymentReturn" | "paymentCancelled" | "emptyCart" | "invalidQuantity" | "cartFull" | "currencyMismatch";

export interface CheckoutTranslations {
  cart: string; cartIntro: string; emptyCart: string; continueShopping: string; product: string; unitPrice: string; quantity: string; lineTotal: string;
  update: string; remove: string; removeLine: string; total: string; totalNote: string; checkout: string; addToCart: string; addQuantity: string;
  inStock: string; lowStock: string; notTracked: string; notOrderable: string; checkoutTitle: string; contactLegend: string; addressLegend: string;
  shippingLegend: string; summary: string; email: string; emailHint: string; name: string; phone: string; addressLine1: string; addressLine2: string;
  postcode: string; city: string; country: string; countryHint: string; required: string; optional: string; placeOrder: string; secureNote: string;
  subtotal: string; shipping: string; net: string; vat: string; gross: string; vatIncluded: string; vatExport: string; orderTitle: string;
  orderNumber: string; status: string; placedOn: string; payNow: string; payDeadline: string; deliverTo: string; itemsLegend: string; invalidLink: string;
  cartLink: string; free: string; updateShipping: string; errorSummaryTitle: string;
  shippingMethods: Record<ShippingMethod, string>;
  shippingHints: Record<ShippingMethod, string>;
  statuses: Record<OrderStatus, string>;
  errors: Record<CheckoutField, string>;
  notices: Record<CheckoutNoticeKey, string>;
}

const fr: CheckoutTranslations = {
  cart: "Panier", cartIntro: "Vérifiez les articles avant de passer commande.", emptyCart: "Votre panier est vide.", continueShopping: "Continuer mes achats",
  product: "Article", unitPrice: "Prix unitaire", quantity: "Quantité", lineTotal: "Total", update: "Mettre à jour", remove: "Retirer", removeLine: "Retirer {name} du panier",
  total: "Total TTC", totalNote: "Les frais de livraison sont calculés à l’étape suivante.", checkout: "Passer commande", addToCart: "Ajouter au panier", addQuantity: "Quantité pour {name}",
  inStock: "En stock", lowStock: "Plus que {n} en stock", notTracked: "Disponible", notOrderable: "Indisponible dans cette quantité", checkoutTitle: "Commande",
  contactLegend: "Coordonnées", addressLegend: "Adresse de livraison", shippingLegend: "Mode de livraison", summary: "Récapitulatif",
  email: "Adresse e-mail", emailHint: "Le lien de suivi de la commande vous sera affiché après le paiement.", name: "Nom complet", phone: "Téléphone",
  addressLine1: "Adresse", addressLine2: "Complément d’adresse", postcode: "Code postal", city: "Ville", country: "Pays", countryHint: "Code pays à deux lettres (ex. FR).",
  required: "obligatoire", optional: "facultatif", placeOrder: "Commander et payer", secureNote: "Vous serez redirigé vers la page de paiement sécurisée de notre prestataire ; aucune donnée de carte ne transite par ce site.",
  subtotal: "Articles", shipping: "Livraison", net: "Total HT", vat: "TVA {rate} %", gross: "Total à payer", vatIncluded: "TVA incluse.", vatExport: "Exportation : TVA non facturée.",
  orderTitle: "Commande {number}", orderNumber: "Numéro", status: "Statut", placedOn: "Passée le", payNow: "Payer maintenant", payDeadline: "À régler avant le {date}.",
  deliverTo: "Livraison à", itemsLegend: "Articles commandés", invalidLink: "Ce lien de commande n’est pas valide.", cartLink: "Panier ({n})", free: "Gratuit",
  updateShipping: "Recalculer la livraison", errorSummaryTitle: "Le formulaire contient des erreurs",
  shippingMethods: { standard: "Standard", express: "Express", pickup: "Retrait sur place" },
  shippingHints: { standard: "3 à 5 jours ouvrés.", express: "1 à 2 jours ouvrés.", pickup: "Gratuit, sur rendez-vous." },
  statuses: { PENDING_PAYMENT: "En attente de paiement", PAID: "Payée", SHIPPED: "Expédiée", DELIVERED: "Livrée", CANCELLED: "Annulée", EXPIRED: "Expirée", REFUNDED: "Remboursée" },
  errors: {
    email: "Saisissez une adresse e-mail valide.", customerName: "Saisissez votre nom (2 à 120 caractères).", phone: "Saisissez un numéro de téléphone valide.",
    addressLine1: "Saisissez l’adresse de livraison.", addressLine2: "Le complément d’adresse est trop long.", postcode: "Saisissez le code postal.",
    city: "Saisissez la ville.", country: "Choisissez un pays de livraison desservi.", shippingMethod: "Choisissez un mode de livraison disponible pour ce pays.",
  },
  notices: {
    added: "Article ajouté au panier.", updated: "Panier mis à jour.", errorSummary: "Le formulaire contient des erreurs.", outOfStock: "Stock insuffisant pour {sku} : ajustez la quantité.",
    unavailable: "Un article n’est plus disponible.", cartChanged: "Votre panier a changé : vérifiez-le avant de commander.", rateLimited: "Trop de tentatives. Réessayez dans quelques minutes.",
    generic: "Une erreur est survenue. Réessayez.", payUnavailable: "Le paiement en ligne est momentanément indisponible. Réessayez dans quelques minutes.",
    paymentReturn: "Merci ! Le paiement est en cours de confirmation.", paymentCancelled: "Paiement interrompu : vous pouvez le reprendre ci-dessous.", emptyCart: "Votre panier est vide.",
    invalidQuantity: "Quantité invalide (1 à 99).", cartFull: "Votre panier est plein.", currencyMismatch: "Cet article n’est pas vendu dans la devise de votre panier.",
  },
};

const en: CheckoutTranslations = {
  cart: "Cart", cartIntro: "Review your items before checking out.", emptyCart: "Your cart is empty.", continueShopping: "Continue shopping",
  product: "Item", unitPrice: "Unit price", quantity: "Quantity", lineTotal: "Total", update: "Update", remove: "Remove", removeLine: "Remove {name} from the cart",
  total: "Total incl. VAT", totalNote: "Shipping is calculated at the next step.", checkout: "Check out", addToCart: "Add to cart", addQuantity: "Quantity for {name}",
  inStock: "In stock", lowStock: "Only {n} left in stock", notTracked: "Available", notOrderable: "Not available in this quantity", checkoutTitle: "Checkout",
  contactLegend: "Contact details", addressLegend: "Shipping address", shippingLegend: "Shipping method", summary: "Summary",
  email: "Email address", emailHint: "The order tracking link is shown after payment.", name: "Full name", phone: "Phone",
  addressLine1: "Address", addressLine2: "Address line 2", postcode: "Postcode", city: "City", country: "Country", countryHint: "Two-letter country code (e.g. FR).",
  required: "required", optional: "optional", placeOrder: "Place order and pay", secureNote: "You will be redirected to our provider's secure payment page; no card data passes through this site.",
  subtotal: "Items", shipping: "Shipping", net: "Total excl. VAT", vat: "VAT {rate}%", gross: "Amount due", vatIncluded: "VAT included.", vatExport: "Export: no VAT charged.",
  orderTitle: "Order {number}", orderNumber: "Number", status: "Status", placedOn: "Placed on", payNow: "Pay now", payDeadline: "Payment due before {date}.",
  deliverTo: "Deliver to", itemsLegend: "Ordered items", invalidLink: "This order link is not valid.", cartLink: "Cart ({n})", free: "Free",
  updateShipping: "Recalculate shipping", errorSummaryTitle: "The form contains errors",
  shippingMethods: { standard: "Standard", express: "Express", pickup: "In-store pickup" },
  shippingHints: { standard: "3 to 5 business days.", express: "1 to 2 business days.", pickup: "Free, by appointment." },
  statuses: { PENDING_PAYMENT: "Awaiting payment", PAID: "Paid", SHIPPED: "Shipped", DELIVERED: "Delivered", CANCELLED: "Cancelled", EXPIRED: "Expired", REFUNDED: "Refunded" },
  errors: {
    email: "Enter a valid email address.", customerName: "Enter your name (2 to 120 characters).", phone: "Enter a valid phone number.",
    addressLine1: "Enter the shipping address.", addressLine2: "Address line 2 is too long.", postcode: "Enter the postcode.",
    city: "Enter the city.", country: "Choose a country we ship to.", shippingMethod: "Choose a shipping method available for this country.",
  },
  notices: {
    added: "Item added to the cart.", updated: "Cart updated.", errorSummary: "The form contains errors.", outOfStock: "Not enough stock for {sku}: adjust the quantity.",
    unavailable: "An item is no longer available.", cartChanged: "Your cart changed: review it before checking out.", rateLimited: "Too many attempts. Try again in a few minutes.",
    generic: "Something went wrong. Please try again.", payUnavailable: "Online payment is temporarily unavailable. Please try again in a few minutes.",
    paymentReturn: "Thank you! Your payment is being confirmed.", paymentCancelled: "Payment interrupted: you can resume it below.", emptyCart: "Your cart is empty.",
    invalidQuantity: "Invalid quantity (1 to 99).", cartFull: "Your cart is full.", currencyMismatch: "This item is not sold in your cart's currency.",
  },
};

const es: CheckoutTranslations = {
  cart: "Carrito", cartIntro: "Revise los artículos antes de realizar el pedido.", emptyCart: "Su carrito está vacío.", continueShopping: "Seguir comprando",
  product: "Artículo", unitPrice: "Precio unitario", quantity: "Cantidad", lineTotal: "Total", update: "Actualizar", remove: "Quitar", removeLine: "Quitar {name} del carrito",
  total: "Total IVA incl.", totalNote: "Los gastos de envío se calculan en el paso siguiente.", checkout: "Realizar pedido", addToCart: "Añadir al carrito", addQuantity: "Cantidad de {name}",
  inStock: "En stock", lowStock: "Solo quedan {n}", notTracked: "Disponible", notOrderable: "No disponible en esta cantidad", checkoutTitle: "Pedido",
  contactLegend: "Datos de contacto", addressLegend: "Dirección de envío", shippingLegend: "Método de envío", summary: "Resumen",
  email: "Correo electrónico", emailHint: "El enlace de seguimiento del pedido se muestra tras el pago.", name: "Nombre completo", phone: "Teléfono",
  addressLine1: "Dirección", addressLine2: "Complemento de dirección", postcode: "Código postal", city: "Ciudad", country: "País", countryHint: "Código de país de dos letras (p. ej. ES).",
  required: "obligatorio", optional: "opcional", placeOrder: "Pedir y pagar", secureNote: "Se le redirigirá a la página de pago segura de nuestro proveedor; ningún dato de tarjeta pasa por este sitio.",
  subtotal: "Artículos", shipping: "Envío", net: "Total sin IVA", vat: "IVA {rate} %", gross: "Total a pagar", vatIncluded: "IVA incluido.", vatExport: "Exportación: IVA no facturado.",
  orderTitle: "Pedido {number}", orderNumber: "Número", status: "Estado", placedOn: "Realizado el", payNow: "Pagar ahora", payDeadline: "Pagar antes del {date}.",
  deliverTo: "Entrega en", itemsLegend: "Artículos pedidos", invalidLink: "Este enlace de pedido no es válido.", cartLink: "Carrito ({n})", free: "Gratis",
  updateShipping: "Recalcular el envío", errorSummaryTitle: "El formulario contiene errores",
  shippingMethods: { standard: "Estándar", express: "Exprés", pickup: "Recogida en tienda" },
  shippingHints: { standard: "De 3 a 5 días hábiles.", express: "De 1 a 2 días hábiles.", pickup: "Gratis, con cita previa." },
  statuses: { PENDING_PAYMENT: "Pendiente de pago", PAID: "Pagado", SHIPPED: "Enviado", DELIVERED: "Entregado", CANCELLED: "Cancelado", EXPIRED: "Caducado", REFUNDED: "Reembolsado" },
  errors: {
    email: "Introduzca un correo electrónico válido.", customerName: "Introduzca su nombre (de 2 a 120 caracteres).", phone: "Introduzca un teléfono válido.",
    addressLine1: "Introduzca la dirección de envío.", addressLine2: "El complemento de dirección es demasiado largo.", postcode: "Introduzca el código postal.",
    city: "Introduzca la ciudad.", country: "Elija un país al que enviamos.", shippingMethod: "Elija un método de envío disponible para este país.",
  },
  notices: {
    added: "Artículo añadido al carrito.", updated: "Carrito actualizado.", errorSummary: "El formulario contiene errores.", outOfStock: "Stock insuficiente para {sku}: ajuste la cantidad.",
    unavailable: "Un artículo ya no está disponible.", cartChanged: "Su carrito ha cambiado: revíselo antes de pedir.", rateLimited: "Demasiados intentos. Inténtelo de nuevo en unos minutos.",
    generic: "Se ha producido un error. Inténtelo de nuevo.", payUnavailable: "El pago en línea no está disponible temporalmente. Inténtelo de nuevo en unos minutos.",
    paymentReturn: "¡Gracias! El pago se está confirmando.", paymentCancelled: "Pago interrumpido: puede reanudarlo a continuación.", emptyCart: "Su carrito está vacío.",
    invalidQuantity: "Cantidad no válida (de 1 a 99).", cartFull: "Su carrito está lleno.", currencyMismatch: "Este artículo no se vende en la moneda de su carrito.",
  },
};

const ar: CheckoutTranslations = {
  cart: "السلة", cartIntro: "راجع المنتجات قبل إتمام الطلب.", emptyCart: "سلتك فارغة.", continueShopping: "متابعة التسوق",
  product: "المنتج", unitPrice: "سعر الوحدة", quantity: "الكمية", lineTotal: "المجموع", update: "تحديث", remove: "إزالة", removeLine: "إزالة {name} من السلة",
  total: "المجموع شامل الضريبة", totalNote: "تُحسب رسوم الشحن في الخطوة التالية.", checkout: "إتمام الطلب", addToCart: "أضف إلى السلة", addQuantity: "الكمية من {name}",
  inStock: "متوفر", lowStock: "بقي {n} فقط", notTracked: "متوفر", notOrderable: "غير متوفر بهذه الكمية", checkoutTitle: "الطلب",
  contactLegend: "بيانات الاتصال", addressLegend: "عنوان الشحن", shippingLegend: "طريقة الشحن", summary: "الملخص",
  email: "البريد الإلكتروني", emailHint: "يظهر رابط تتبع الطلب بعد الدفع.", name: "الاسم الكامل", phone: "الهاتف",
  addressLine1: "العنوان", addressLine2: "تكملة العنوان", postcode: "الرمز البريدي", city: "المدينة", country: "البلد", countryHint: "رمز البلد من حرفين (مثل FR).",
  required: "إلزامي", optional: "اختياري", placeOrder: "اطلب وادفع", secureNote: "سيتم تحويلك إلى صفحة الدفع الآمنة لدى مزودنا؛ لا تمر بيانات البطاقة عبر هذا الموقع.",
  subtotal: "المنتجات", shipping: "الشحن", net: "المجموع دون ضريبة", vat: "ضريبة القيمة المضافة {rate}٪", gross: "المبلغ المستحق", vatIncluded: "شامل الضريبة.", vatExport: "تصدير: دون ضريبة القيمة المضافة.",
  orderTitle: "الطلب {number}", orderNumber: "الرقم", status: "الحالة", placedOn: "تاريخ الطلب", payNow: "ادفع الآن", payDeadline: "يُدفع قبل {date}.",
  deliverTo: "التسليم إلى", itemsLegend: "المنتجات المطلوبة", invalidLink: "رابط الطلب هذا غير صالح.", cartLink: "السلة ({n})", free: "مجاني",
  updateShipping: "إعادة حساب الشحن", errorSummaryTitle: "يحتوي النموذج على أخطاء",
  shippingMethods: { standard: "عادي", express: "سريع", pickup: "الاستلام من المتجر" },
  shippingHints: { standard: "من 3 إلى 5 أيام عمل.", express: "من يوم إلى يومي عمل.", pickup: "مجاني، بموعد مسبق." },
  statuses: { PENDING_PAYMENT: "بانتظار الدفع", PAID: "مدفوع", SHIPPED: "تم الشحن", DELIVERED: "تم التسليم", CANCELLED: "ملغى", EXPIRED: "منتهي الصلاحية", REFUNDED: "مسترد" },
  errors: {
    email: "أدخل بريدًا إلكترونيًا صالحًا.", customerName: "أدخل اسمك (من 2 إلى 120 حرفًا).", phone: "أدخل رقم هاتف صالحًا.",
    addressLine1: "أدخل عنوان الشحن.", addressLine2: "تكملة العنوان طويلة جدًا.", postcode: "أدخل الرمز البريدي.",
    city: "أدخل المدينة.", country: "اختر بلدًا نشحن إليه.", shippingMethod: "اختر طريقة شحن متاحة لهذا البلد.",
  },
  notices: {
    added: "تمت إضافة المنتج إلى السلة.", updated: "تم تحديث السلة.", errorSummary: "يحتوي النموذج على أخطاء.", outOfStock: "المخزون غير كافٍ لـ {sku}: عدّل الكمية.",
    unavailable: "أحد المنتجات لم يعد متوفرًا.", cartChanged: "تغيّرت سلتك: راجعها قبل الطلب.", rateLimited: "محاولات كثيرة جدًا. أعد المحاولة بعد بضع دقائق.",
    generic: "حدث خطأ. أعد المحاولة.", payUnavailable: "الدفع الإلكتروني غير متاح مؤقتًا. أعد المحاولة بعد بضع دقائق.",
    paymentReturn: "شكرًا! جارٍ تأكيد الدفع.", paymentCancelled: "توقف الدفع: يمكنك استئنافه أدناه.", emptyCart: "سلتك فارغة.",
    invalidQuantity: "كمية غير صالحة (من 1 إلى 99).", cartFull: "سلتك ممتلئة.", currencyMismatch: "هذا المنتج لا يُباع بعملة سلتك.",
  },
};

const translations: Record<Locale, CheckoutTranslations> = { fr, en, es, ar };

export const getCheckoutTranslations = (locale: Locale): CheckoutTranslations => translations[locale];

/** Remplace les jetons `{clé}` (valeurs déjà échappées par Astro à l'affichage). */
export const fill = (template: string, values: Readonly<Record<string, string | number>>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
