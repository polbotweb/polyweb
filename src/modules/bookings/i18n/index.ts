/** Libellés back-office du module bookings (ressources, réservations, disponibilités — 4 locales). */
import type { Locale } from "@i18n/config";
import type { BookingStatus } from "../domain/workflow";
import type { ResourceKind } from "../domain/resource";

export type BookingsTranslations = {
  meta: { description: string };
  admin: {
    title: string; bookings: string; resources: string; availability: string;
    newBooking: string; newResource: string; edit: string; view: string; back: string;
    empty: string; noResources: string; noSlots: string; listLabel: string;
    save: string; create: string; delete: string; saved: string; created: string; deleted: string; facetStatus: string;
    lockedNote: string; none: string; addWindow: string; removeWindow: string; showSlots: string; book: string;
    confirmDelete: string; timesIn: string;
    bulk: { cancel: string; noShow: string; complete: string };
  };
  fields: {
    number: string; title: string; status: string; resource: string; date: string; time: string; duration: string; startsAt: string; endsAt: string;
    customerName: string; customerEmail: string; partySize: string; notes: string; confirmedAt: string;
    code: string; name: string; kind: string; capacity: string; timezone: string; slotMinutes: string; windows: string; weekday: string; start: string; end: string; active: string;
  };
  actions: { moveTo: string };
  statuses: Record<BookingStatus, string>;
  kinds: Record<ResourceKind, string>;
  /** Jours de la semaine, dimanche = 0. */
  weekdays: readonly [string, string, string, string, string, string, string];
};

const translations: Record<Locale, BookingsTranslations> = {
  fr: {
    meta: { description: "Ressources réservables, plages d'ouverture et réservations sans chevauchement." },
    admin: {
      title: "Réservations", bookings: "Réservations", resources: "Ressources", availability: "Disponibilités",
      newBooking: "Nouvelle réservation", newResource: "Nouvelle ressource", edit: "Modifier", view: "Ouvrir", back: "Toutes les réservations",
      empty: "Aucune réservation.", noResources: "Aucune ressource.", noSlots: "Aucun créneau libre ce jour-là.", listLabel: "Liste des réservations",
      save: "Enregistrer", create: "Créer", delete: "Supprimer", saved: "Enregistré.", created: "Créé.", deleted: "Supprimé.", facetStatus: "Statut",
      lockedNote: "Réservation non modifiable dans ce statut.", none: "—", addWindow: "Ajouter une plage", removeWindow: "Retirer",
      showSlots: "Voir les créneaux", book: "Réserver", confirmDelete: "Supprimer définitivement ?", timesIn: "Heures locales de la ressource",
      bulk: { cancel: "Annuler", noShow: "Absent", complete: "Terminer" },
    },
    fields: {
      number: "N° de réservation", title: "Intitulé", status: "Statut", resource: "Ressource", date: "Date", time: "Heure", duration: "Durée (min)", startsAt: "Début", endsAt: "Fin",
      customerName: "Client", customerEmail: "E-mail du client", partySize: "Nombre de personnes", notes: "Notes", confirmedAt: "Confirmée le",
      code: "Code", name: "Nom", kind: "Type", capacity: "Capacité", timezone: "Fuseau horaire", slotMinutes: "Pas des créneaux (min)", windows: "Plages d'ouverture", weekday: "Jour", start: "Début", end: "Fin", active: "Active",
    },
    actions: { moveTo: "Passer à" },
    statuses: { REQUESTED: "Demandée", CONFIRMED: "Confirmée", CHECKED_IN: "Arrivée", COMPLETED: "Terminée", CANCELLED: "Annulée", NO_SHOW: "Absent" },
    kinds: { room: "Salle", staff: "Personne", equipment: "Équipement" },
    weekdays: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  },
  en: {
    meta: { description: "Bookable resources, opening hours and non-overlapping bookings." },
    admin: {
      title: "Bookings", bookings: "Bookings", resources: "Resources", availability: "Availability",
      newBooking: "New booking", newResource: "New resource", edit: "Edit", view: "Open", back: "All bookings",
      empty: "No bookings.", noResources: "No resources.", noSlots: "No free slot that day.", listLabel: "Bookings list",
      save: "Save", create: "Create", delete: "Delete", saved: "Saved.", created: "Created.", deleted: "Deleted.", facetStatus: "Status",
      lockedNote: "This booking cannot be edited in its current status.", none: "—", addWindow: "Add a time window", removeWindow: "Remove",
      showSlots: "Show slots", book: "Book", confirmDelete: "Delete permanently?", timesIn: "Resource local time",
      bulk: { cancel: "Cancel", noShow: "No-show", complete: "Complete" },
    },
    fields: {
      number: "Booking no.", title: "Title", status: "Status", resource: "Resource", date: "Date", time: "Time", duration: "Duration (min)", startsAt: "Start", endsAt: "End",
      customerName: "Customer", customerEmail: "Customer email", partySize: "Party size", notes: "Notes", confirmedAt: "Confirmed on",
      code: "Code", name: "Name", kind: "Type", capacity: "Capacity", timezone: "Time zone", slotMinutes: "Slot step (min)", windows: "Opening hours", weekday: "Day", start: "Start", end: "End", active: "Active",
    },
    actions: { moveTo: "Move to" },
    statuses: { REQUESTED: "Requested", CONFIRMED: "Confirmed", CHECKED_IN: "Checked in", COMPLETED: "Completed", CANCELLED: "Cancelled", NO_SHOW: "No-show" },
    kinds: { room: "Room", staff: "Staff", equipment: "Equipment" },
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  es: {
    meta: { description: "Recursos reservables, horarios de apertura y reservas sin solapamientos." },
    admin: {
      title: "Reservas", bookings: "Reservas", resources: "Recursos", availability: "Disponibilidad",
      newBooking: "Nueva reserva", newResource: "Nuevo recurso", edit: "Editar", view: "Abrir", back: "Todas las reservas",
      empty: "No hay reservas.", noResources: "No hay recursos.", noSlots: "No hay huecos libres ese día.", listLabel: "Lista de reservas",
      save: "Guardar", create: "Crear", delete: "Eliminar", saved: "Guardado.", created: "Creado.", deleted: "Eliminado.", facetStatus: "Estado",
      lockedNote: "La reserva no se puede modificar en este estado.", none: "—", addWindow: "Añadir franja", removeWindow: "Quitar",
      showSlots: "Ver huecos", book: "Reservar", confirmDelete: "¿Eliminar definitivamente?", timesIn: "Hora local del recurso",
      bulk: { cancel: "Cancelar", noShow: "No presentado", complete: "Finalizar" },
    },
    fields: {
      number: "N.º de reserva", title: "Título", status: "Estado", resource: "Recurso", date: "Fecha", time: "Hora", duration: "Duración (min)", startsAt: "Inicio", endsAt: "Fin",
      customerName: "Cliente", customerEmail: "Correo del cliente", partySize: "Número de personas", notes: "Notas", confirmedAt: "Confirmada el",
      code: "Código", name: "Nombre", kind: "Tipo", capacity: "Capacidad", timezone: "Zona horaria", slotMinutes: "Intervalo de huecos (min)", windows: "Horario de apertura", weekday: "Día", start: "Inicio", end: "Fin", active: "Activo",
    },
    actions: { moveTo: "Pasar a" },
    statuses: { REQUESTED: "Solicitada", CONFIRMED: "Confirmada", CHECKED_IN: "Llegada", COMPLETED: "Finalizada", CANCELLED: "Cancelada", NO_SHOW: "No presentado" },
    kinds: { room: "Sala", staff: "Persona", equipment: "Equipo" },
    weekdays: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  },
  ar: {
    meta: { description: "موارد قابلة للحجز وساعات العمل وحجوزات دون تداخل." },
    admin: {
      title: "الحجوزات", bookings: "الحجوزات", resources: "الموارد", availability: "التوفر",
      newBooking: "حجز جديد", newResource: "مورد جديد", edit: "تعديل", view: "فتح", back: "كل الحجوزات",
      empty: "لا توجد حجوزات.", noResources: "لا توجد موارد.", noSlots: "لا توجد مواعيد متاحة في هذا اليوم.", listLabel: "قائمة الحجوزات",
      save: "حفظ", create: "إنشاء", delete: "حذف", saved: "تم الحفظ.", created: "تم الإنشاء.", deleted: "تم الحذف.", facetStatus: "الحالة",
      lockedNote: "لا يمكن تعديل الحجز في هذه الحالة.", none: "—", addWindow: "إضافة فترة", removeWindow: "إزالة",
      showSlots: "عرض المواعيد", book: "احجز", confirmDelete: "حذف نهائيًا؟", timesIn: "التوقيت المحلي للمورد",
      bulk: { cancel: "إلغاء", noShow: "لم يحضر", complete: "إنهاء" },
    },
    fields: {
      number: "رقم الحجز", title: "العنوان", status: "الحالة", resource: "المورد", date: "التاريخ", time: "الوقت", duration: "المدة (دقيقة)", startsAt: "البداية", endsAt: "النهاية",
      customerName: "العميل", customerEmail: "بريد العميل", partySize: "عدد الأشخاص", notes: "ملاحظات", confirmedAt: "أُكّد في",
      code: "الرمز", name: "الاسم", kind: "النوع", capacity: "السعة", timezone: "المنطقة الزمنية", slotMinutes: "مدة الموعد (دقيقة)", windows: "ساعات العمل", weekday: "اليوم", start: "البداية", end: "النهاية", active: "نشط",
    },
    actions: { moveTo: "نقل إلى" },
    statuses: { REQUESTED: "مطلوب", CONFIRMED: "مؤكَّد", CHECKED_IN: "حاضر", COMPLETED: "منتهٍ", CANCELLED: "ملغى", NO_SHOW: "لم يحضر" },
    kinds: { room: "قاعة", staff: "شخص", equipment: "معدّات" },
    weekdays: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  },
};

export function getBookingsTranslations(locale: Locale): BookingsTranslations {
  return translations[locale];
}
