import { PATHS, listTree, claimTestsByPattern } from './utils';
import { i18n, type Lang } from './i18n';

const DESCRIPTION: Record<Lang, string> = {
  en: 'Atomic CMS is organized around shared CMS/platform capabilities and first-class domain modules. The foundation covers localised content, shared media, taxonomy, SEO, search, publication workflow, revisions, locks, engagement/moderation boundaries, notifications, audit, cache and the reusable Admin Resource model. Blog is the first complete editorial module; Services is the second validation module. Transactional domains such as booking, enrollment, inventory, payments and orders remain separate cores.',
  fr: "Atomic CMS est organisé autour de capacités CMS/plateforme partagées et de modules métier de premier rang. Le socle couvre le contenu localisé, les médias partagés, la taxonomie, le SEO, la recherche, le workflow de publication, les révisions, les verrous, les frontières d'engagement/modération, les notifications, l'audit, le cache et le modèle Admin Resource réutilisable. Le Blog est le premier module éditorial complet ; Services est le deuxième module de validation. Les domaines transactionnels comme la réservation, l'inscription, le stock, le paiement et les commandes restent des cœurs séparés.",
  ar: 'يعتمد Atomic CMS على قدرات مشتركة في المنصة وCMS وعلى وحدات مجال مستقلة. ويغطي المحتوى متعدد اللغات والوسائط المشتركة والتصنيف وSEO والبحث وسير النشر والإصدارات والأقفال وحدود التفاعل والإشراف والإشعارات والتدقيق والتخزين المؤقت ونموذج موارد الإدارة القابل لإعادة الاستخدام. المدونة هي أول وحدة تحريرية مكتملة، والخدمات هي الوحدة الثانية للتحقق. تبقى المجالات المعاملاتية مثل الحجز والتسجيل والمخزون والمدفوعات والطلبات نوى منفصلة.',
  es: 'Atomic CMS se organiza en capacidades compartidas de plataforma/CMS y módulos de dominio de primera clase. La base cubre contenido localizado, medios compartidos, taxonomía, SEO, búsqueda, flujo de publicación, revisiones, bloqueos, límites de interacción/moderación, notificaciones, auditoría, caché y el modelo reutilizable de Admin Resource. Blog es el primer módulo editorial completo; Services es el segundo módulo de validación. Los dominios transaccionales como reservas, inscripciones, inventario, pagos y pedidos permanecen como núcleos separados.',
};

export async function generateCMS(lang: Lang, assigned: Set<string> = new Set()): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let out = `## ${s.cms[lang]}\n\n`;

  // ── Files ────────────────────────────────────────────────────────────────
  out += `### ${sub.files[lang]}\n\n`;
  out += '```\n';
  const coreTree = await listTree(PATHS.core, 0, 2);
  if (coreTree) out += `src/core/\n${coreTree}`;
  const modulesTree = await listTree(PATHS.modules, 0, 4);
  if (modulesTree) out += `src/modules/\n${modulesTree}`;
  const pagesTree = await listTree(PATHS.pages, 0, 2);
  if (pagesTree) out += `src/pages/\n${pagesTree}`;
  const layoutsTree = await listTree(PATHS.layouts);
  if (layoutsTree) out += `src/layouts/\n${layoutsTree}`;
  out += '```\n\n';

  out += `${DESCRIPTION[lang]}\n\n`;

  // ── Tests ────────────────────────────────────────────────────────────────
  const testFiles = await claimTestsByPattern([
    'cms-admin', 'cms-audit', 'admin-pages', 'admin-navigation',
    'admin-versions', 'admin-sections', 'admin-menus', 'admin-site',
    'admin-social', 'admin-contact', 'admin-hours', 'admin-theme',
    'admin-consent', 'admin-roles', 'admin-helpers',
    'content-import', 'content-locking', 'export-data',
    'navigation-menus', 'navigation-tree', 'navigation-cycle',
    'contact-api', 'consent-cms', 'legal-cms', 'media-loader',
    'services', 'service', 'blog', 'blog-admin', 'blog-lifecycle',
    'blog-taxonomy', 'blog-revision', 'blog-lock',
  ], assigned);
  if (testFiles.length > 0) {
    out += `### ${sub.tests[lang]}\n\n`;
    for (const f of testFiles) out += `- \`${f}\`\n`;
    out += '\n';
  }

  return out;
}
