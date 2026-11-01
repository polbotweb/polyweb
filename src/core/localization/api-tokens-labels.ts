import type { Locale } from "@i18n/config";

/** Libellés de l'écran « Jetons d'API » (4 locales). Les scopes viennent du registre `@/core/api`. */
export interface ApiTokensLabels {
  revoked: string; createdTitle: string; usage: string; siteNote: (site: string) => string;
  newToken: string; name: string; scopes: string; expires: string; expiresHint: string;
  rateLimit: string; rateLimitHint: (def: number) => string; create: string; none: string;
  caption: string; prefix: string; lastUsed: string; expiresCol: string; rateCol: string; state: string; actions: string;
  stateRevoked: string; stateExpired: string; stateActive: string; revoke: string; revokeFor: (name: string) => string;
  defaultRate: (def: number) => string; perMinute: (n: number) => string; openapi: string; denied: string;
  scopeRead: (resource: string) => string; scopeWrite: (resource: string) => string; core: Record<string, string>;
}

const fr: ApiTokensLabels = {
  revoked: "Jeton révoqué.", createdTitle: "Jeton créé — copiez-le maintenant, il ne sera plus affiché :",
  usage: "Utilisation : en-tête Authorization: Bearer <jeton> sur /api/v1/…",
  siteNote: (s) => `Site : ${s}. Chaque jeton est limité à ce site. Seule une empreinte SHA-256 est conservée.`,
  newToken: "Nouveau jeton", name: "Nom", scopes: "Portées", expires: "Expiration (jours)", expiresHint: "Entre 1 et 3650 jours. Vide : n'expire jamais.",
  rateLimit: "Limite de débit (requêtes par minute)", rateLimitHint: (d) => `Entre 1 et 100 000. Vide : défaut de la plateforme (${d}/min). Au-delà : réponse 429 avec en-têtes RateLimit.`,
  create: "Créer le jeton", none: "Aucun jeton.", caption: "Jetons d'API du site",
  prefix: "Préfixe", lastUsed: "Dernière utilisation", expiresCol: "Expire", rateCol: "Débit", state: "État", actions: "Actions",
  stateRevoked: "révoqué", stateExpired: "expiré", stateActive: "actif", revoke: "Révoquer", revokeFor: (n) => `Révoquer le jeton ${n}`,
  defaultRate: (d) => `défaut (${d}/min)`, perMinute: (n) => `${n}/min`, openapi: "Spec OpenAPI", denied: "Permission refusée",
  scopeRead: (r) => `Lire : ${r}`, scopeWrite: (r) => `Écrire : ${r}`,
  core: {
    "content:read": "Lire tous les contenus (y compris types non publics)",
    "content:write": "Créer / modifier / supprimer des contenus, lire les brouillons",
    "forms:read": "Lire les soumissions de formulaires", "search:read": "Interroger la recherche",
  },
};
const en: ApiTokensLabels = {
  revoked: "Token revoked.", createdTitle: "Token created — copy it now, it will not be shown again:",
  usage: "Usage: header Authorization: Bearer <token> on /api/v1/…",
  siteNote: (s) => `Site: ${s}. Each token is restricted to this site. Only a SHA-256 hash is stored.`,
  newToken: "New token", name: "Name", scopes: "Scopes", expires: "Expiry (days)", expiresHint: "Between 1 and 3650 days. Empty: never expires.",
  rateLimit: "Rate limit (requests per minute)", rateLimitHint: (d) => `Between 1 and 100,000. Empty: platform default (${d}/min). Above it: 429 response with RateLimit headers.`,
  create: "Create token", none: "No tokens.", caption: "Site API tokens",
  prefix: "Prefix", lastUsed: "Last used", expiresCol: "Expires", rateCol: "Rate", state: "Status", actions: "Actions",
  stateRevoked: "revoked", stateExpired: "expired", stateActive: "active", revoke: "Revoke", revokeFor: (n) => `Revoke token ${n}`,
  defaultRate: (d) => `default (${d}/min)`, perMinute: (n) => `${n}/min`, openapi: "OpenAPI spec", denied: "Permission denied",
  scopeRead: (r) => `Read: ${r}`, scopeWrite: (r) => `Write: ${r}`,
  core: {
    "content:read": "Read all content (including non-public types)",
    "content:write": "Create / edit / delete content, read drafts",
    "forms:read": "Read form submissions", "search:read": "Query search",
  },
};
const es: ApiTokensLabels = {
  revoked: "Token revocado.", createdTitle: "Token creado — cópielo ahora, no se volverá a mostrar:",
  usage: "Uso: cabecera Authorization: Bearer <token> en /api/v1/…",
  siteNote: (s) => `Sitio: ${s}. Cada token está limitado a este sitio. Solo se guarda una huella SHA-256.`,
  newToken: "Nuevo token", name: "Nombre", scopes: "Permisos", expires: "Caducidad (días)", expiresHint: "Entre 1 y 3650 días. Vacío: no caduca nunca.",
  rateLimit: "Límite de solicitudes (por minuto)", rateLimitHint: (d) => `Entre 1 y 100 000. Vacío: valor por defecto de la plataforma (${d}/min). Por encima: respuesta 429 con cabeceras RateLimit.`,
  create: "Crear token", none: "Ningún token.", caption: "Tokens de API del sitio",
  prefix: "Prefijo", lastUsed: "Último uso", expiresCol: "Caduca", rateCol: "Límite", state: "Estado", actions: "Acciones",
  stateRevoked: "revocado", stateExpired: "caducado", stateActive: "activo", revoke: "Revocar", revokeFor: (n) => `Revocar el token ${n}`,
  defaultRate: (d) => `por defecto (${d}/min)`, perMinute: (n) => `${n}/min`, openapi: "Especificación OpenAPI", denied: "Permiso denegado",
  scopeRead: (r) => `Leer: ${r}`, scopeWrite: (r) => `Escribir: ${r}`,
  core: {
    "content:read": "Leer todos los contenidos (incluidos tipos no públicos)",
    "content:write": "Crear / editar / eliminar contenidos, leer borradores",
    "forms:read": "Leer envíos de formularios", "search:read": "Consultar la búsqueda",
  },
};
const ar: ApiTokensLabels = {
  revoked: "تم إلغاء الرمز.", createdTitle: "تم إنشاء الرمز — انسخه الآن، فلن يُعرض مرة أخرى:",
  usage: "الاستخدام: الترويسة Authorization: Bearer <الرمز> على /api/v1/…",
  siteNote: (s) => `الموقع: ${s}. كل رمز مقصور على هذا الموقع. لا يُحفظ إلا بصمة SHA-256.`,
  newToken: "رمز جديد", name: "الاسم", scopes: "الصلاحيات", expires: "الصلاحية (أيام)", expiresHint: "بين 1 و3650 يومًا. فارغ: لا ينتهي أبدًا.",
  rateLimit: "حد الطلبات (في الدقيقة)", rateLimitHint: (d) => `بين 1 و100000. فارغ: القيمة الافتراضية للمنصة (${d} في الدقيقة). عند التجاوز: استجابة 429 مع ترويسات RateLimit.`,
  create: "إنشاء الرمز", none: "لا توجد رموز.", caption: "رموز API للموقع",
  prefix: "البادئة", lastUsed: "آخر استخدام", expiresCol: "ينتهي", rateCol: "الحد", state: "الحالة", actions: "إجراءات",
  stateRevoked: "ملغى", stateExpired: "منتهي", stateActive: "نشط", revoke: "إلغاء", revokeFor: (n) => `إلغاء الرمز ${n}`,
  defaultRate: (d) => `افتراضي (${d} في الدقيقة)`, perMinute: (n) => `${n} في الدقيقة`, openapi: "مواصفات OpenAPI", denied: "تم رفض الإذن",
  scopeRead: (r) => `قراءة: ${r}`, scopeWrite: (r) => `كتابة: ${r}`,
  core: {
    "content:read": "قراءة كل المحتويات (بما فيها الأنواع غير العامة)",
    "content:write": "إنشاء المحتويات وتعديلها وحذفها، وقراءة المسودات",
    "forms:read": "قراءة إرسالات النماذج", "search:read": "الاستعلام في البحث",
  },
};

const all: Record<Locale, ApiTokensLabels> = { fr, en, es, ar };
export const getApiTokensLabels = (locale: Locale): ApiTokensLabels => all[locale] ?? fr;

/**
 * Libellé d'un scope : texte dédié pour les scopes du cœur, sinon « Lire / Écrire : <ressources> »
 * à partir des ressources du registre qui le déclarent.
 */
export const describeScope = (
  t: ApiTokensLabels,
  scope: string,
  resources: ReadonlyArray<{ readonly name: string; readonly scope: string; readonly writeScope?: string }>,
): string => {
  const core = t.core[scope];
  if (core) return core;
  const reads = resources.filter((r) => r.scope === scope).map((r) => r.name);
  const writes = resources.filter((r) => r.writeScope === scope).map((r) => r.name);
  return [reads.length ? t.scopeRead(reads.join(", ")) : null, writes.length ? t.scopeWrite(writes.join(", ")) : null].filter(Boolean).join(" · ") || scope;
};
