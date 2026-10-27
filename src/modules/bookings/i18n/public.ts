/** Libellés du parcours de réservation public (visiteur) et de l'e-mail de confirmation — 4 locales. */
import type { Locale } from "@i18n/config";
import type { GuestField } from "../domain/guest";

export type BookingsPublicTranslations = {
  title: string; intro: string; noResources: string; capacity: string; slotLength: string; bookResource: string; back: string;
  date: string; dateHint: string; showSlots: string; timezoneNote: string; slotsLegend: string; noSlots: string; dateInvalid: string;
  guestLegend: string; name: string; email: string; emailHint: string; phone: string; phoneHint: string; party: string; notes: string; optional: string; required: string;
  submit: string; errorSummary: string; errors: Record<GuestField, string>; slotTaken: string; rateLimited: string; generic: string;
  manageTitle: string; created: string; emailSent: string; status: string; resource: string; when: string; partySize: string; reference: string;
  cancel: string; cancelNote: string; cancelled: string; notCancellable: string; invalidLink: string; keepLink: string;
  deposit: string; depositDue: string; payDeposit: string; depositPaid: string; paymentReturn: string; payUnavailable: string;
  mail: { subject: string; heading: string; greeting: string; body: string; button: string; footnote: string };
};

const translations: Record<Locale, BookingsPublicTranslations> = {
  fr: {
    title: "Réserver", intro: "Choisissez une ressource, puis un créneau libre.", noResources: "Aucune ressource n'est réservable pour le moment.",
    capacity: "Jusqu'à {n} personne(s)", slotLength: "Créneaux de {n} min", bookResource: "Réserver : {name}", back: "Toutes les ressources",
    date: "Date", dateHint: "Format AAAA-MM-JJ, jusqu'à {n} jours à l'avance.", showSlots: "Afficher les créneaux", timezoneNote: "Heures affichées dans le fuseau {tz}.",
    slotsLegend: "Créneaux disponibles le {date}", noSlots: "Aucun créneau libre ce jour-là. Essayez une autre date.", dateInvalid: "Date non réservable : choisissez une date entre aujourd'hui et {max}.",
    guestLegend: "Vos coordonnées", name: "Nom complet", email: "Adresse e-mail", emailHint: "La confirmation et le lien d'annulation y seront envoyés.",
    phone: "Téléphone", phoneHint: "Chiffres, espaces et + uniquement.", party: "Nombre de personnes", notes: "Message", optional: "facultatif", required: "obligatoire",
    submit: "Envoyer la demande", errorSummary: "Le formulaire contient des erreurs :",
    errors: { customerName: "Indiquez votre nom (2 à 120 caractères).", customerEmail: "Indiquez une adresse e-mail valide.", customerPhone: "Numéro de téléphone invalide.", partySize: "Nombre de personnes invalide pour cette ressource.", notes: "Message trop long (1 000 caractères au plus).", slot: "Choisissez un créneau." },
    slotTaken: "Ce créneau n'est plus disponible : choisissez-en un autre.", rateLimited: "Trop de demandes, réessayez dans quelques minutes.", generic: "Une erreur est survenue, réessayez plus tard.",
    manageTitle: "Votre réservation", created: "Votre demande de réservation est enregistrée.", emailSent: "Un e-mail de confirmation contenant ce lien vous a été envoyé.",
    status: "Statut", resource: "Ressource", when: "Créneau", partySize: "Personnes", reference: "Référence",
    cancel: "Annuler la réservation", cancelNote: "L'annulation libère le créneau ; elle est définitive.", cancelled: "Votre réservation est annulée.",
    notCancellable: "Cette réservation ne peut plus être annulée en ligne.", invalidLink: "Lien de réservation invalide.", keepLink: "Conservez cette page : son adresse permet de consulter ou d'annuler la réservation.",
    deposit: "Acompte", depositDue: "Acompte de {amount} à régler avant {time} ; sans paiement, la demande expire et le créneau est libéré.", payDeposit: "Payer l'acompte", depositPaid: "Acompte réglé", paymentReturn: "Paiement en cours de vérification : cette page indiquera la confirmation dès réception.", payUnavailable: "Le paiement en ligne est momentanément indisponible. Réessayez dans quelques minutes.",
    mail: { subject: "Demande de réservation : {resource}", heading: "Demande de réservation enregistrée", greeting: "Bonjour {name},", body: "Votre demande pour « {resource} » le {when} ({party} personne(s)) est bien enregistrée.", button: "Consulter ou annuler", footnote: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail ou annulez-la avec le bouton ci-dessus." },
  },
  en: {
    title: "Book", intro: "Choose a resource, then a free time slot.", noResources: "Nothing is available to book right now.",
    capacity: "Up to {n} people", slotLength: "{n}-minute slots", bookResource: "Book: {name}", back: "All resources",
    date: "Date", dateHint: "Format YYYY-MM-DD, up to {n} days ahead.", showSlots: "Show time slots", timezoneNote: "Times shown in the {tz} time zone.",
    slotsLegend: "Available slots on {date}", noSlots: "No free slot on that day. Try another date.", dateInvalid: "Date not bookable: choose a date between today and {max}.",
    guestLegend: "Your details", name: "Full name", email: "Email address", emailHint: "The confirmation and cancellation link will be sent there.",
    phone: "Phone", phoneHint: "Digits, spaces and + only.", party: "Number of people", notes: "Message", optional: "optional", required: "required",
    submit: "Send request", errorSummary: "The form contains errors:",
    errors: { customerName: "Enter your name (2 to 120 characters).", customerEmail: "Enter a valid email address.", customerPhone: "Invalid phone number.", partySize: "Invalid number of people for this resource.", notes: "Message too long (1,000 characters max).", slot: "Choose a time slot." },
    slotTaken: "This slot is no longer available: please choose another one.", rateLimited: "Too many requests, try again in a few minutes.", generic: "Something went wrong, please try again later.",
    manageTitle: "Your booking", created: "Your booking request has been recorded.", emailSent: "A confirmation email containing this link has been sent to you.",
    status: "Status", resource: "Resource", when: "Time slot", partySize: "People", reference: "Reference",
    cancel: "Cancel booking", cancelNote: "Cancelling frees the slot; it cannot be undone.", cancelled: "Your booking is cancelled.",
    notCancellable: "This booking can no longer be cancelled online.", invalidLink: "Invalid booking link.", keepLink: "Keep this page: its address lets you view or cancel the booking.",
    deposit: "Deposit", depositDue: "A deposit of {amount} is due before {time}; without payment the request expires and the slot is released.", payDeposit: "Pay the deposit", depositPaid: "Deposit paid", paymentReturn: "Payment is being verified: this page will show the confirmation as soon as it is received.", payUnavailable: "Online payment is temporarily unavailable. Please try again in a few minutes.",
    mail: { subject: "Booking request: {resource}", heading: "Booking request received", greeting: "Hello {name},", body: "Your request for “{resource}” on {when} ({party} people) has been recorded.", button: "View or cancel", footnote: "If you did not make this request, ignore this email or cancel it with the button above." },
  },
  es: {
    title: "Reservar", intro: "Elija un recurso y luego un horario libre.", noResources: "No hay nada disponible para reservar por ahora.",
    capacity: "Hasta {n} personas", slotLength: "Horarios de {n} min", bookResource: "Reservar: {name}", back: "Todos los recursos",
    date: "Fecha", dateHint: "Formato AAAA-MM-DD, hasta {n} días de antelación.", showSlots: "Mostrar horarios", timezoneNote: "Horas mostradas en la zona horaria {tz}.",
    slotsLegend: "Horarios disponibles el {date}", noSlots: "No hay horarios libres ese día. Pruebe otra fecha.", dateInvalid: "Fecha no reservable: elija una fecha entre hoy y {max}.",
    guestLegend: "Sus datos", name: "Nombre completo", email: "Correo electrónico", emailHint: "Allí recibirá la confirmación y el enlace de cancelación.",
    phone: "Teléfono", phoneHint: "Solo dígitos, espacios y +.", party: "Número de personas", notes: "Mensaje", optional: "opcional", required: "obligatorio",
    submit: "Enviar solicitud", errorSummary: "El formulario contiene errores:",
    errors: { customerName: "Indique su nombre (de 2 a 120 caracteres).", customerEmail: "Indique un correo electrónico válido.", customerPhone: "Número de teléfono no válido.", partySize: "Número de personas no válido para este recurso.", notes: "Mensaje demasiado largo (1000 caracteres como máximo).", slot: "Elija un horario." },
    slotTaken: "Este horario ya no está disponible: elija otro.", rateLimited: "Demasiadas solicitudes, inténtelo de nuevo en unos minutos.", generic: "Se produjo un error, inténtelo más tarde.",
    manageTitle: "Su reserva", created: "Su solicitud de reserva ha quedado registrada.", emailSent: "Le hemos enviado un correo de confirmación con este enlace.",
    status: "Estado", resource: "Recurso", when: "Horario", partySize: "Personas", reference: "Referencia",
    cancel: "Cancelar la reserva", cancelNote: "La cancelación libera el horario y es definitiva.", cancelled: "Su reserva está cancelada.",
    notCancellable: "Esta reserva ya no se puede cancelar en línea.", invalidLink: "Enlace de reserva no válido.", keepLink: "Conserve esta página: su dirección permite consultar o cancelar la reserva.",
    deposit: "Depósito", depositDue: "Debe abonar un depósito de {amount} antes de {time}; sin pago, la solicitud caduca y el horario queda libre.", payDeposit: "Pagar el depósito", depositPaid: "Depósito pagado", paymentReturn: "Pago en verificación: esta página mostrará la confirmación en cuanto se reciba.", payUnavailable: "El pago en línea no está disponible por el momento. Inténtelo de nuevo en unos minutos.",
    mail: { subject: "Solicitud de reserva: {resource}", heading: "Solicitud de reserva registrada", greeting: "Hola, {name}:", body: "Su solicitud para «{resource}» el {when} ({party} personas) ha quedado registrada.", button: "Consultar o cancelar", footnote: "Si no realizó esta solicitud, ignore este correo o cancélela con el botón de arriba." },
  },
  ar: {
    title: "الحجز", intro: "اختر موردًا ثم موعدًا متاحًا.", noResources: "لا يوجد ما يمكن حجزه حاليًا.",
    capacity: "حتى {n} أشخاص", slotLength: "مواعيد مدتها {n} دقيقة", bookResource: "احجز: {name}", back: "كل الموارد",
    date: "التاريخ", dateHint: "الصيغة YYYY-MM-DD، حتى {n} يومًا مسبقًا.", showSlots: "عرض المواعيد", timezoneNote: "الأوقات معروضة حسب المنطقة الزمنية {tz}.",
    slotsLegend: "المواعيد المتاحة يوم {date}", noSlots: "لا توجد مواعيد متاحة في هذا اليوم. جرّب تاريخًا آخر.", dateInvalid: "تاريخ غير متاح للحجز: اختر تاريخًا بين اليوم و{max}.",
    guestLegend: "بياناتك", name: "الاسم الكامل", email: "البريد الإلكتروني", emailHint: "سيُرسل إليه التأكيد ورابط الإلغاء.",
    phone: "الهاتف", phoneHint: "أرقام ومسافات وعلامة + فقط.", party: "عدد الأشخاص", notes: "رسالة", optional: "اختياري", required: "إلزامي",
    submit: "إرسال الطلب", errorSummary: "يحتوي النموذج على أخطاء:",
    errors: { customerName: "أدخل اسمك (من 2 إلى 120 حرفًا).", customerEmail: "أدخل بريدًا إلكترونيًا صالحًا.", customerPhone: "رقم هاتف غير صالح.", partySize: "عدد أشخاص غير صالح لهذا المورد.", notes: "الرسالة طويلة جدًا (1000 حرف كحد أقصى).", slot: "اختر موعدًا." },
    slotTaken: "هذا الموعد لم يعد متاحًا: اختر موعدًا آخر.", rateLimited: "طلبات كثيرة جدًا، أعد المحاولة بعد بضع دقائق.", generic: "حدث خطأ، أعد المحاولة لاحقًا.",
    manageTitle: "حجزك", created: "تم تسجيل طلب الحجز الخاص بك.", emailSent: "أُرسل إليك بريد تأكيد يحتوي على هذا الرابط.",
    status: "الحالة", resource: "المورد", when: "الموعد", partySize: "الأشخاص", reference: "المرجع",
    cancel: "إلغاء الحجز", cancelNote: "الإلغاء يحرر الموعد وهو نهائي.", cancelled: "تم إلغاء حجزك.",
    notCancellable: "لم يعد من الممكن إلغاء هذا الحجز عبر الإنترنت.", invalidLink: "رابط حجز غير صالح.", keepLink: "احتفظ بهذه الصفحة: عنوانها يتيح عرض الحجز أو إلغاءه.",
    deposit: "العربون", depositDue: "يجب دفع عربون قدره {amount} قبل {time}؛ وبدون الدفع ينتهي الطلب ويُحرَّر الموعد.", payDeposit: "دفع العربون", depositPaid: "تم دفع العربون", paymentReturn: "جارٍ التحقق من الدفع: ستعرض هذه الصفحة التأكيد فور استلامه.", payUnavailable: "الدفع عبر الإنترنت غير متاح مؤقتًا. يُرجى المحاولة بعد بضع دقائق.",
    mail: { subject: "طلب حجز: {resource}", heading: "تم تسجيل طلب الحجز", greeting: "مرحبًا {name}،", body: "تم تسجيل طلبك لـ«{resource}» بتاريخ {when} ({party} أشخاص).", button: "عرض الحجز أو إلغاؤه", footnote: "إن لم تكن صاحب هذا الطلب، تجاهل هذا البريد أو ألغِ الطلب بالزر أعلاه." },
  },
};

export function getBookingsPublicTranslations(locale: Locale): BookingsPublicTranslations {
  return translations[locale] ?? translations.fr;
}

/** Remplace les `{clé}` d'un libellé. */
export const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
