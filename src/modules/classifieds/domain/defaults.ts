/**
 * Catégories et attributs seedés par site (idempotent, `ensureSiteClassifieds`).
 * Libellés et options dans les 4 locales ; l'administration peut ensuite tout adapter.
 * Les attributs posés sur un nœud sont hérités par ses descendants (une même clé
 * sur un descendant remplace celle de l'ancêtre).
 */
import type { Locale } from "@i18n/config";
import type { AttributeKind, LocaleMap } from "@/core/attributes";

export interface SeedOption { readonly key: string; readonly labels: LocaleMap }
export interface SeedAttribute {
  readonly key: string;
  readonly kind: AttributeKind;
  readonly required: boolean;
  readonly filterable: boolean;
  readonly labels: LocaleMap;
  readonly unit?: string;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly options?: readonly SeedOption[];
}
export interface SeedCategory {
  readonly slug: string;
  readonly translations: LocaleMap;
  readonly children?: readonly SeedCategory[];
  readonly attributes?: readonly SeedAttribute[];
}

/** Année max pour les attributs « année » (année civile + 1). */
export const seedYearMax = () => new Date().getFullYear() + 1;

export const DEFAULT_CLASSIFIED_CATEGORIES: readonly SeedCategory[] = [
  { slug: "immobilier", translations: { fr: "Immobilier", en: "Real estate", es: "Inmobiliaria", ar: "عقارات" }, children: [
    { slug: "locations", translations: { fr: "Locations", en: "Rentals", es: "Alquileres", ar: "إيجارات" } },
    { slug: "ventes", translations: { fr: "Ventes", en: "Sales", es: "Ventas", ar: "مبيعات" } }
  ], attributes: [
    { key: "type_bien", kind: "select", required: true, filterable: true, labels: { fr: "Type de bien", en: "Property type", es: "Tipo de inmueble", ar: "نوع العقار" }, options: [
      { key: "appartement", labels: { fr: "Appartement", en: "Apartment", es: "Piso", ar: "شقة" } },
      { key: "maison", labels: { fr: "Maison", en: "House", es: "Casa", ar: "منزل" } },
      { key: "terrain", labels: { fr: "Terrain", en: "Land", es: "Terreno", ar: "أرض" } },
      { key: "parking", labels: { fr: "Parking", en: "Parking", es: "Garaje", ar: "موقف" } },
      { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
    ] },
    { key: "surface", kind: "number", required: false, filterable: true, labels: { fr: "Surface", en: "Floor area", es: "Superficie", ar: "المساحة" }, unit: "m²", minValue: 0 },
    { key: "pieces", kind: "integer", required: false, filterable: true, labels: { fr: "Pièces", en: "Rooms", es: "Habitaciones", ar: "غرف" }, minValue: 1 },
    { key: "chambres", kind: "integer", required: false, filterable: true, labels: { fr: "Chambres", en: "Bedrooms", es: "Dormitorios", ar: "غرف نوم" }, minValue: 0 },
    { key: "etage", kind: "integer", required: false, filterable: false, labels: { fr: "Étage", en: "Floor", es: "Planta", ar: "الطابق" } },
    { key: "ascenseur", kind: "boolean", required: false, filterable: true, labels: { fr: "Ascenseur", en: "Elevator", es: "Ascensor", ar: "مصعد" } },
    { key: "meuble", kind: "boolean", required: false, filterable: true, labels: { fr: "Meublé", en: "Furnished", es: "Amueblado", ar: "مفروش" } },
    { key: "dpe", kind: "select", required: false, filterable: true, labels: { fr: "DPE", en: "Energy rating", es: "Certificado energético", ar: "تصنيف الطاقة" }, options: [
      { key: "a", labels: { fr: "A", en: "A", es: "A", ar: "A" } },
      { key: "b", labels: { fr: "B", en: "B", es: "B", ar: "B" } },
      { key: "c", labels: { fr: "C", en: "C", es: "C", ar: "C" } },
      { key: "d", labels: { fr: "D", en: "D", es: "D", ar: "D" } },
      { key: "e", labels: { fr: "E", en: "E", es: "E", ar: "E" } },
      { key: "f", labels: { fr: "F", en: "F", es: "F", ar: "F" } },
      { key: "g", labels: { fr: "G", en: "G", es: "G", ar: "G" } },
      { key: "na", labels: { fr: "Non renseigné", en: "Not provided", es: "No indicado", ar: "غير محدد" } }
    ] },
    { key: "terrain", kind: "number", required: false, filterable: true, labels: { fr: "Surface du terrain", en: "Land area", es: "Superficie del terreno", ar: "مساحة الأرض" }, unit: "m²", minValue: 0 }
  ] },
  { slug: "vehicules", translations: { fr: "Véhicules", en: "Vehicles", es: "Vehículos", ar: "مركبات" }, children: [
    { slug: "voitures", translations: { fr: "Voitures", en: "Cars", es: "Coches", ar: "سيارات" }, attributes: [
      { key: "annee", kind: "integer", required: true, filterable: true, labels: { fr: "Année", en: "Year", es: "Año", ar: "السنة" }, minValue: 1950 },
      { key: "kilometrage", kind: "integer", required: true, filterable: true, labels: { fr: "Kilométrage", en: "Mileage", es: "Kilometraje", ar: "المسافة" }, unit: "km", minValue: 0 },
      { key: "carburant", kind: "select", required: true, filterable: true, labels: { fr: "Carburant", en: "Fuel", es: "Combustible", ar: "الوقود" }, options: [
        { key: "essence", labels: { fr: "Essence", en: "Petrol", es: "Gasolina", ar: "بنزين" } },
        { key: "diesel", labels: { fr: "Diesel", en: "Diesel", es: "Diésel", ar: "ديزل" } },
        { key: "hybride", labels: { fr: "Hybride", en: "Hybrid", es: "Híbrido", ar: "هجين" } },
        { key: "electrique", labels: { fr: "Électrique", en: "Electric", es: "Eléctrico", ar: "كهربائي" } },
        { key: "gpl", labels: { fr: "GPL", en: "LPG", es: "GLP", ar: "غاز" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] },
      { key: "boite", kind: "select", required: false, filterable: true, labels: { fr: "Boîte", en: "Gearbox", es: "Cambio", ar: "ناقل الحركة" }, options: [
        { key: "manuelle", labels: { fr: "Manuelle", en: "Manual", es: "Manual", ar: "يدوي" } },
        { key: "automatique", labels: { fr: "Automatique", en: "Automatic", es: "Automático", ar: "أوتوماتيكي" } }
      ] },
      { key: "premiere_main", kind: "boolean", required: false, filterable: true, labels: { fr: "Première main", en: "First owner", es: "Primer propietario", ar: "المالك الأول" } },
      { key: "couleur", kind: "text", required: false, filterable: false, labels: { fr: "Couleur", en: "Color", es: "Color", ar: "اللون" } },
      { key: "nb_portes", kind: "select", required: false, filterable: true, labels: { fr: "Nombre de portes", en: "Doors", es: "Puertas", ar: "عدد الأبواب" }, options: [
        { key: "2", labels: { fr: "2", en: "2", es: "2", ar: "2" } },
        { key: "3", labels: { fr: "3", en: "3", es: "3", ar: "3" } },
        { key: "4", labels: { fr: "4", en: "4", es: "4", ar: "4" } },
        { key: "5", labels: { fr: "5", en: "5", es: "5", ar: "5" } }
      ] },
      { key: "puissance", kind: "integer", required: false, filterable: true, labels: { fr: "Puissance", en: "Power", es: "Potencia", ar: "القدرة" }, unit: "ch", minValue: 0 }
    ] },
    { slug: "motos", translations: { fr: "Motos", en: "Motorbikes", es: "Motos", ar: "دراجات نارية" }, attributes: [
      { key: "annee", kind: "integer", required: true, filterable: true, labels: { fr: "Année", en: "Year", es: "Año", ar: "السنة" }, minValue: 1950 },
      { key: "kilometrage", kind: "integer", required: true, filterable: true, labels: { fr: "Kilométrage", en: "Mileage", es: "Kilometraje", ar: "المسافة" }, unit: "km", minValue: 0 },
      { key: "carburant", kind: "select", required: true, filterable: true, labels: { fr: "Carburant", en: "Fuel", es: "Combustible", ar: "الوقود" }, options: [
        { key: "essence", labels: { fr: "Essence", en: "Petrol", es: "Gasolina", ar: "بنزين" } },
        { key: "diesel", labels: { fr: "Diesel", en: "Diesel", es: "Diésel", ar: "ديزل" } },
        { key: "hybride", labels: { fr: "Hybride", en: "Hybrid", es: "Híbrido", ar: "هجين" } },
        { key: "electrique", labels: { fr: "Électrique", en: "Electric", es: "Eléctrico", ar: "كهربائي" } },
        { key: "gpl", labels: { fr: "GPL", en: "LPG", es: "GLP", ar: "غاز" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] },
      { key: "boite", kind: "select", required: false, filterable: true, labels: { fr: "Boîte", en: "Gearbox", es: "Cambio", ar: "ناقل الحركة" }, options: [
        { key: "manuelle", labels: { fr: "Manuelle", en: "Manual", es: "Manual", ar: "يدوي" } },
        { key: "automatique", labels: { fr: "Automatique", en: "Automatic", es: "Automático", ar: "أوتوماتيكي" } }
      ] },
      { key: "premiere_main", kind: "boolean", required: false, filterable: true, labels: { fr: "Première main", en: "First owner", es: "Primer propietario", ar: "المالك الأول" } },
      { key: "couleur", kind: "text", required: false, filterable: false, labels: { fr: "Couleur", en: "Color", es: "Color", ar: "اللون" } },
      { key: "cylindree", kind: "integer", required: false, filterable: true, labels: { fr: "Cylindrée", en: "Engine size", es: "Cilindrada", ar: "سعة المحرك" }, unit: "cm³", minValue: 0 },
      { key: "type_moto", kind: "select", required: false, filterable: true, labels: { fr: "Type de moto", en: "Bike type", es: "Tipo de moto", ar: "نوع الدراجة" }, options: [
        { key: "roadster", labels: { fr: "Roadster", en: "Roadster", es: "Roadster", ar: "رودستر" } },
        { key: "sportive", labels: { fr: "Sportive", en: "Sport", es: "Deportiva", ar: "رياضي" } },
        { key: "custom", labels: { fr: "Custom", en: "Custom", es: "Custom", ar: "مخصص" } },
        { key: "trail", labels: { fr: "Trail", en: "Trail", es: "Trail", ar: "ترايل" } },
        { key: "scooter", labels: { fr: "Scooter", en: "Scooter", es: "Scooter", ar: "سكوتر" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] }
    ] },
    { slug: "utilitaires", translations: { fr: "Utilitaires", en: "Vans", es: "Utilitarios", ar: "نقل" }, attributes: [
      { key: "annee", kind: "integer", required: true, filterable: true, labels: { fr: "Année", en: "Year", es: "Año", ar: "السنة" }, minValue: 1950 },
      { key: "kilometrage", kind: "integer", required: true, filterable: true, labels: { fr: "Kilométrage", en: "Mileage", es: "Kilometraje", ar: "المسافة" }, unit: "km", minValue: 0 },
      { key: "carburant", kind: "select", required: true, filterable: true, labels: { fr: "Carburant", en: "Fuel", es: "Combustible", ar: "الوقود" }, options: [
        { key: "essence", labels: { fr: "Essence", en: "Petrol", es: "Gasolina", ar: "بنزين" } },
        { key: "diesel", labels: { fr: "Diesel", en: "Diesel", es: "Diésel", ar: "ديزل" } },
        { key: "hybride", labels: { fr: "Hybride", en: "Hybrid", es: "Híbrido", ar: "هجين" } },
        { key: "electrique", labels: { fr: "Électrique", en: "Electric", es: "Eléctrico", ar: "كهربائي" } },
        { key: "gpl", labels: { fr: "GPL", en: "LPG", es: "GLP", ar: "غاز" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] },
      { key: "boite", kind: "select", required: false, filterable: true, labels: { fr: "Boîte", en: "Gearbox", es: "Cambio", ar: "ناقل الحركة" }, options: [
        { key: "manuelle", labels: { fr: "Manuelle", en: "Manual", es: "Manual", ar: "يدوي" } },
        { key: "automatique", labels: { fr: "Automatique", en: "Automatic", es: "Automático", ar: "أوتوماتيكي" } }
      ] },
      { key: "premiere_main", kind: "boolean", required: false, filterable: true, labels: { fr: "Première main", en: "First owner", es: "Primer propietario", ar: "المالك الأول" } },
      { key: "couleur", kind: "text", required: false, filterable: false, labels: { fr: "Couleur", en: "Color", es: "Color", ar: "اللون" } },
      { key: "volume", kind: "number", required: false, filterable: true, labels: { fr: "Volume utile", en: "Load volume", es: "Volumen útil", ar: "الحجم المفيد" }, unit: "m³", minValue: 0 }
    ] },
    { slug: "autres-vehicules", translations: { fr: "Autres véhicules", en: "Other vehicles", es: "Otros vehículos", ar: "مركبات أخرى" }, attributes: [
      { key: "type_vehicule", kind: "select", required: true, filterable: true, labels: { fr: "Type de véhicule", en: "Vehicle type", es: "Tipo de vehículo", ar: "نوع المركبة" }, options: [
        { key: "velo", labels: { fr: "Vélo", en: "Bicycle", es: "Bicicleta", ar: "دراجة" } },
        { key: "bateau", labels: { fr: "Bateau", en: "Boat", es: "Barco", ar: "قارب" } },
        { key: "caravane", labels: { fr: "Caravane", en: "Caravan", es: "Caravana", ar: "كرفان" } },
        { key: "camping_car", labels: { fr: "Camping-car", en: "Motorhome", es: "Autocaravana", ar: "سيارة تخييم" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] },
      { key: "annee", kind: "integer", required: false, filterable: true, labels: { fr: "Année", en: "Year", es: "Año", ar: "السنة" }, minValue: 1950 }
    ] }
  ] },
  { slug: "emploi", translations: { fr: "Emploi", en: "Jobs", es: "Empleo", ar: "وظائف" }, children: [
    { slug: "offres", translations: { fr: "Offres d'emploi", en: "Job offers", es: "Ofertas de empleo", ar: "عروض عمل" } },
    { slug: "demandes", translations: { fr: "Demandes d'emploi", en: "Job seekers", es: "Demandas de empleo", ar: "طلبات عمل" } }
  ], attributes: [
    { key: "type_contrat", kind: "select", required: true, filterable: true, labels: { fr: "Type de contrat", en: "Contract type", es: "Tipo de contrato", ar: "نوع العقد" }, options: [
      { key: "cdi", labels: { fr: "CDI", en: "Permanent", es: "Indefinido", ar: "دائم" } },
      { key: "cdd", labels: { fr: "CDD", en: "Fixed-term", es: "Temporal", ar: "مؤقت" } },
      { key: "interim", labels: { fr: "Intérim", en: "Temp work", es: "Interino", ar: "عمل مؤقت" } },
      { key: "stage", labels: { fr: "Stage", en: "Internship", es: "Prácticas", ar: "تدريب" } },
      { key: "alternance", labels: { fr: "Alternance", en: "Apprenticeship", es: "Alternancia", ar: "تلمذة" } },
      { key: "freelance", labels: { fr: "Freelance", en: "Freelance", es: "Autónomo", ar: "مستقل" } },
      { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
    ] },
    { key: "temps_travail", kind: "select", required: false, filterable: true, labels: { fr: "Temps de travail", en: "Working time", es: "Jornada", ar: "وقت العمل" }, options: [
      { key: "temps_plein", labels: { fr: "Temps plein", en: "Full time", es: "Jornada completa", ar: "دوام كامل" } },
      { key: "temps_partiel", labels: { fr: "Temps partiel", en: "Part time", es: "Jornada parcial", ar: "دوام جزئي" } }
    ] },
    { key: "experience", kind: "select", required: false, filterable: true, labels: { fr: "Expérience", en: "Experience", es: "Experiencia", ar: "الخبرة" }, options: [
      { key: "debutant", labels: { fr: "Débutant", en: "Entry level", es: "Principiante", ar: "مبتدئ" } },
      { key: "1_2", labels: { fr: "1-2 ans", en: "1-2 years", es: "1-2 años", ar: "1-2 سنة" } },
      { key: "3_5", labels: { fr: "3-5 ans", en: "3-5 years", es: "3-5 años", ar: "3-5 سنوات" } },
      { key: "5_plus", labels: { fr: "5 ans et plus", en: "5+ years", es: "5 años o más", ar: "5 سنوات فأكثر" } }
    ] },
    { key: "teletravail", kind: "select", required: false, filterable: true, labels: { fr: "Télétravail", en: "Remote work", es: "Teletrabajo", ar: "عمل عن بعد" }, options: [
      { key: "non", labels: { fr: "Non", en: "No", es: "No", ar: "لا" } },
      { key: "partiel", labels: { fr: "Partiel", en: "Hybrid", es: "Parcial", ar: "جزئي" } },
      { key: "complet", labels: { fr: "Complet", en: "Fully remote", es: "Completo", ar: "كامل" } }
    ] },
    { key: "periode_remuneration", kind: "select", required: false, filterable: false, labels: { fr: "Période de rémunération", en: "Pay period", es: "Periodo de remuneración", ar: "فترة الأجر" }, options: [
      { key: "horaire", labels: { fr: "Horaire", en: "Hourly", es: "Por hora", ar: "ساعي" } },
      { key: "mensuel", labels: { fr: "Mensuel", en: "Monthly", es: "Mensual", ar: "شهري" } },
      { key: "annuel", labels: { fr: "Annuel", en: "Yearly", es: "Anual", ar: "سنوي" } }
    ] }
  ] },
  { slug: "services", translations: { fr: "Services", en: "Services", es: "Servicios", ar: "خدمات" }, children: [
    { slug: "cours-formations", translations: { fr: "Cours et formations", en: "Lessons and training", es: "Clases y formación", ar: "دروس وتدريب" } },
    { slug: "bricolage-depannage", translations: { fr: "Bricolage et dépannage", en: "DIY and repairs", es: "Bricolaje y reparaciones", ar: "إصلاحات" } },
    { slug: "entretien-maison", translations: { fr: "Entretien de la maison", en: "Home cleaning", es: "Limpieza del hogar", ar: "عناية بالمنزل" } },
    { slug: "evenements", translations: { fr: "Événements", en: "Events", es: "Eventos", ar: "مناسبات" } },
    { slug: "autres-services", translations: { fr: "Autres services", en: "Other services", es: "Otros servicios", ar: "خدمات أخرى" } }
  ], attributes: [
    { key: "lieu_intervention", kind: "select", required: false, filterable: true, labels: { fr: "Lieu d'intervention", en: "Place of work", es: "Lugar de intervención", ar: "مكان التدخل" }, options: [
      { key: "domicile", labels: { fr: "À domicile", en: "At home", es: "A domicilio", ar: "في المنزل" } },
      { key: "sur_place", labels: { fr: "Sur place", en: "On site", es: "En el local", ar: "في الموقع" } },
      { key: "en_ligne", labels: { fr: "En ligne", en: "Online", es: "En línea", ar: "عبر الإنترنت" } }
    ] },
    { key: "se_deplace", kind: "boolean", required: false, filterable: true, labels: { fr: "Se déplace", en: "Travels to client", es: "Se desplaza", ar: "ينتقل" } },
    { key: "rayon", kind: "integer", required: false, filterable: true, labels: { fr: "Rayon", en: "Radius", es: "Radio", ar: "نطاق" }, unit: "km", minValue: 0 }
  ] },
  { slug: "electronique", translations: { fr: "Informatique et électronique", en: "Electronics", es: "Informática y electrónica", ar: "إلكترونيات" }, children: [
    { slug: "ordinateurs", translations: { fr: "Ordinateurs et tablettes", en: "Computers and tablets", es: "Ordenadores y tabletas", ar: "حواسيب وأجهزة لوحية" }, attributes: [
      { key: "marque", kind: "text", required: false, filterable: true, labels: { fr: "Marque", en: "Brand", es: "Marca", ar: "العلامة" } },
      { key: "type_appareil", kind: "select", required: true, filterable: true, labels: { fr: "Type d'appareil", en: "Device type", es: "Tipo de aparato", ar: "نوع الجهاز" }, options: [
        { key: "portable", labels: { fr: "PC portable", en: "Laptop", es: "Portátil", ar: "حاسوب محمول" } },
        { key: "bureau", labels: { fr: "Ordinateur de bureau", en: "Desktop", es: "Sobremesa", ar: "حاسوب مكتبي" } },
        { key: "tablette", labels: { fr: "Tablette", en: "Tablet", es: "Tableta", ar: "جهاز لوحي" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] },
      { key: "ram", kind: "integer", required: false, filterable: true, labels: { fr: "Mémoire vive", en: "RAM", es: "Memoria RAM", ar: "الذاكرة" }, unit: "Go", minValue: 0 },
      { key: "stockage", kind: "integer", required: false, filterable: true, labels: { fr: "Stockage", en: "Storage", es: "Almacenamiento", ar: "التخزين" }, unit: "Go", minValue: 0 }
    ] },
    { slug: "telephonie", translations: { fr: "Téléphonie", en: "Phones", es: "Telefonía", ar: "هواتف" }, attributes: [
      { key: "marque", kind: "text", required: false, filterable: true, labels: { fr: "Marque", en: "Brand", es: "Marca", ar: "العلامة" } },
      { key: "stockage", kind: "select", required: false, filterable: true, labels: { fr: "Stockage", en: "Storage", es: "Almacenamiento", ar: "التخزين" }, options: [
        { key: "64", labels: { fr: "64 Go", en: "64 GB", es: "64 GB", ar: "64 غيغا" } },
        { key: "128", labels: { fr: "128 Go", en: "128 GB", es: "128 GB", ar: "128 غيغا" } },
        { key: "256", labels: { fr: "256 Go", en: "256 GB", es: "256 GB", ar: "256 غيغا" } },
        { key: "512", labels: { fr: "512 Go", en: "512 GB", es: "512 GB", ar: "512 غيغا" } },
        { key: "1024", labels: { fr: "1 To", en: "1 TB", es: "1 TB", ar: "1 تيرا" } }
      ] }
    ] },
    { slug: "image-son", translations: { fr: "Image et son", en: "Image and sound", es: "Imagen y sonido", ar: "صورة وصوت" }, attributes: [
      { key: "marque", kind: "text", required: false, filterable: true, labels: { fr: "Marque", en: "Brand", es: "Marca", ar: "العلامة" } },
      { key: "type_appareil", kind: "select", required: true, filterable: true, labels: { fr: "Type d'appareil", en: "Device type", es: "Tipo de aparato", ar: "نوع الجهاز" }, options: [
        { key: "tv", labels: { fr: "TV", en: "TV", es: "TV", ar: "تلفاز" } },
        { key: "audio", labels: { fr: "Audio", en: "Audio", es: "Audio", ar: "صوت" } },
        { key: "photo", labels: { fr: "Photo", en: "Photo", es: "Foto", ar: "تصوير" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] }
    ] },
    { slug: "accessoires", translations: { fr: "Accessoires", en: "Accessories", es: "Accesorios", ar: "ملحقات" }, attributes: [
      { key: "marque", kind: "text", required: false, filterable: true, labels: { fr: "Marque", en: "Brand", es: "Marca", ar: "العلامة" } }
    ] }
  ] },
  { slug: "maison", translations: { fr: "Maison", en: "Home", es: "Hogar", ar: "منزل" }, children: [
    { slug: "meubles", translations: { fr: "Meubles", en: "Furniture", es: "Muebles", ar: "أثاث" }, attributes: [
      { key: "type_meuble", kind: "select", required: true, filterable: true, labels: { fr: "Type de meuble", en: "Furniture type", es: "Tipo de mueble", ar: "نوع الأثاث" }, options: [
        { key: "canape", labels: { fr: "Canapé", en: "Sofa", es: "Sofá", ar: "أريكة" } },
        { key: "table", labels: { fr: "Table", en: "Table", es: "Mesa", ar: "طاولة" } },
        { key: "lit", labels: { fr: "Lit", en: "Bed", es: "Cama", ar: "سرير" } },
        { key: "chaise", labels: { fr: "Chaise", en: "Chair", es: "Silla", ar: "كرسي" } },
        { key: "rangement", labels: { fr: "Rangement", en: "Storage", es: "Almacenaje", ar: "تخزين" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] }
    ] },
    { slug: "electromenager", translations: { fr: "Électroménager", en: "Appliances", es: "Electrodomésticos", ar: "أجهزة منزلية" }, attributes: [
      { key: "type_appareil", kind: "select", required: true, filterable: true, labels: { fr: "Type d'appareil", en: "Appliance type", es: "Tipo de aparato", ar: "نوع الجهاز" }, options: [
        { key: "froid", labels: { fr: "Froid", en: "Cooling", es: "Frío", ar: "تبريد" } },
        { key: "lavage", labels: { fr: "Lavage", en: "Laundry", es: "Lavado", ar: "غسيل" } },
        { key: "cuisson", labels: { fr: "Cuisson", en: "Cooking", es: "Cocción", ar: "طبخ" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] },
      { key: "marque", kind: "text", required: false, filterable: true, labels: { fr: "Marque", en: "Brand", es: "Marca", ar: "العلامة" } },
      { key: "classe_energie", kind: "select", required: false, filterable: true, labels: { fr: "Classe énergie", en: "Energy class", es: "Clase energética", ar: "فئة الطاقة" }, options: [
        { key: "a", labels: { fr: "A", en: "A", es: "A", ar: "A" } },
        { key: "b", labels: { fr: "B", en: "B", es: "B", ar: "B" } },
        { key: "c", labels: { fr: "C", en: "C", es: "C", ar: "C" } },
        { key: "d", labels: { fr: "D", en: "D", es: "D", ar: "D" } },
        { key: "e", labels: { fr: "E", en: "E", es: "E", ar: "E" } },
        { key: "f", labels: { fr: "F", en: "F", es: "F", ar: "F" } },
        { key: "g", labels: { fr: "G", en: "G", es: "G", ar: "G" } }
      ] }
    ] },
    { slug: "decoration", translations: { fr: "Décoration", en: "Decor", es: "Decoración", ar: "ديكور" } },
    { slug: "jardin", translations: { fr: "Jardin", en: "Garden", es: "Jardín", ar: "حديقة" }, attributes: [
      { key: "type_article", kind: "select", required: false, filterable: true, labels: { fr: "Type d'article", en: "Item type", es: "Tipo de artículo", ar: "نوع المنتج" }, options: [
        { key: "tondeuse", labels: { fr: "Tondeuse", en: "Lawn mower", es: "Cortacésped", ar: "جزازة" } },
        { key: "salon", labels: { fr: "Salon de jardin", en: "Garden furniture", es: "Muebles de jardín", ar: "أثاث حديقة" } },
        { key: "outil", labels: { fr: "Outil", en: "Tool", es: "Herramienta", ar: "أداة" } },
        { key: "plante", labels: { fr: "Plante", en: "Plant", es: "Planta", ar: "نبات" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] }
    ] }
  ] },
  { slug: "loisirs", translations: { fr: "Loisirs", en: "Leisure", es: "Ocio", ar: "ترفيه" }, children: [
    { slug: "sport", translations: { fr: "Sport", en: "Sports", es: "Deporte", ar: "رياضة" }, attributes: [
      { key: "sport", kind: "text", required: false, filterable: true, labels: { fr: "Sport", en: "Sport", es: "Deporte", ar: "الرياضة" } },
      { key: "taille", kind: "select", required: false, filterable: true, labels: { fr: "Taille", en: "Size", es: "Talla", ar: "المقاس" }, options: [
        { key: "xs", labels: { fr: "XS", en: "XS", es: "XS", ar: "XS" } },
        { key: "s", labels: { fr: "S", en: "S", es: "S", ar: "S" } },
        { key: "m", labels: { fr: "M", en: "M", es: "M", ar: "M" } },
        { key: "l", labels: { fr: "L", en: "L", es: "L", ar: "L" } },
        { key: "xl", labels: { fr: "XL", en: "XL", es: "XL", ar: "XL" } },
        { key: "xxl", labels: { fr: "XXL", en: "XXL", es: "XXL", ar: "XXL" } }
      ] }
    ] },
    { slug: "culture", translations: { fr: "Culture et livres", en: "Culture and books", es: "Cultura y libros", ar: "ثقافة وكتب" } },
    { slug: "jeux", translations: { fr: "Jeux", en: "Games", es: "Juegos", ar: "ألعاب" }, attributes: [
      { key: "plateforme", kind: "select", required: false, filterable: true, labels: { fr: "Plateforme", en: "Platform", es: "Plataforma", ar: "المنصة" }, options: [
        { key: "pc", labels: { fr: "PC", en: "PC", es: "PC", ar: "حاسوب" } },
        { key: "playstation", labels: { fr: "PlayStation", en: "PlayStation", es: "PlayStation", ar: "بلايستيشن" } },
        { key: "xbox", labels: { fr: "Xbox", en: "Xbox", es: "Xbox", ar: "إكس بوكس" } },
        { key: "nintendo", labels: { fr: "Nintendo", en: "Nintendo", es: "Nintendo", ar: "نينتندو" } },
        { key: "autre", labels: { fr: "Autre", en: "Other", es: "Otro", ar: "أخرى" } }
      ] }
    ] },
    { slug: "collections", translations: { fr: "Collections", en: "Collectibles", es: "Colecciones", ar: "مقتنيات" } }
  ] },
  { slug: "dons", translations: { fr: "Dons", en: "Donations", es: "Donaciones", ar: "تبرعات" } },
  { slug: "autres", translations: { fr: "Autres", en: "Other", es: "Otros", ar: "أخرى" } }
];

export function categoryName(translations: LocaleMap, locale: string, slug: string): string {
  const loc = (["fr", "en", "es", "ar"] as const).includes(locale as Locale) ? (locale as Locale) : "fr";
  return translations[loc] || translations.fr || slug;
}

/** Parcours préfixe (parents avant enfants) pour le seed et l'héritage. */
export function flattenCategories(tree: readonly SeedCategory[], parentSlug: string | null = null): { node: SeedCategory; parentSlug: string | null; position: number }[] {
  const out: { node: SeedCategory; parentSlug: string | null; position: number }[] = [];
  tree.forEach((node, position) => {
    out.push({ node, parentSlug, position });
    if (node.children?.length) out.push(...flattenCategories(node.children, node.slug));
  });
  return out;
}

/** Chaîne d'ancêtres d'un slug, de la racine vers la feuille (feuille incluse). */
export function ancestorSlugs(tree: readonly SeedCategory[], slug: string): string[] {
  const walk = (nodes: readonly SeedCategory[], trail: string[]): string[] | null => {
    for (const node of nodes) {
      const next = [...trail, node.slug];
      if (node.slug === slug) return next;
      if (node.children?.length) {
        const found = walk(node.children, next);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(tree, []) ?? [slug];
}

export function findSeedCategory(tree: readonly SeedCategory[], slug: string): SeedCategory | null {
  for (const node of tree) {
    if (node.slug === slug) return node;
    if (node.children?.length) {
      const found = findSeedCategory(node.children, slug);
      if (found) return found;
    }
  }
  return null;
}

/** Feuille ? (une annonce doit être classée dans une feuille). */
export function isLeafCategory(node: SeedCategory): boolean {
  return !node.children || node.children.length === 0;
}
