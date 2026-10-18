import { PATHS, listFiles, listTree, claimTestsByPattern } from './utils';
import { i18n, type Lang } from './i18n';

const AUTH_LIB_FILES = [
  'auth.ts', 'auth-client.ts', 'auth-data.ts', 'auth-guards.ts',
  'permissions.ts', 'audit.ts', 'rate-limit.ts', 'sanitize.ts',
];

const FLOWS: Record<Lang, string> = {
  en: '- Sign up (username + email + password)\n- Email login\n- Email verification\n- Password reset\n- Account deletion (GDPR)\n- Admin impersonation',
  fr: "- Inscription (username + email + mot de passe)\n- Connexion par email\n- Vérification d'email\n- Réinitialisation de mot de passe\n- Suppression de compte (RGPD)\n- Impersonation admin",
  ar: '- التسجيل (اسم المستخدم + البريد + كلمة المرور)\n- تسجيل الدخول بالبريد الإلكتروني\n- التحقق من البريد الإلكتروني\n- إعادة تعيين كلمة المرور\n- حذف الحساب (RGPD)\n- انتحال هوية المسؤول',
  es: '- Registro (username + email + contraseña)\n- Inicio de sesión por email\n- Verificación de email\n- Restablecimiento de contraseña\n- Eliminación de cuenta (RGPD)\n- Impersonación de admin',
};

const ROLES: Record<Lang, string> = {
  en: '- **user** — standard access\n- **admin** — full access + impersonation\n- Organizations: creation, invitations, members, custom roles',
  fr: '- **user** — accès standard\n- **admin** — accès complet + impersonation\n- Organisations : création, invitations, membres, rôles personnalisés',
  ar: '- **user** — وصول قياسي\n- **admin** — وصول كامل + انتحال الهوية\n- المنظمات: الإنشاء، الدعوات، الأعضاء، الأدوار المخصصة',
  es: '- **user** — acceso estándar\n- **admin** — acceso completo + impersonación\n- Organizaciones: creación, invitaciones, miembros, roles personalizados',
};

const SECURITY: Record<Lang, string> = {
  en: '- Automatic audit trail on all sensitive actions\n- In-memory rate limiting\n- Input sanitization\n- Guards on protected routes\n- `middleware.ts` injects auth session on every request',
  fr: '- Audit trail automatique sur toutes les actions sensibles\n- Rate limiting in-memory\n- Sanitization des inputs\n- Guards sur les routes protégées\n- `middleware.ts` injecte la session auth sur chaque requête',
  ar: '- سجل تدقيق تلقائي على جميع الإجراءات الحساسة\n- تحديد معدل الطلبات في الذاكرة\n- تطهير المدخلات\n- حراسة المسارات المحمية\n- `middleware.ts` يضخ جلسة المصادقة في كل طلب',
  es: '- Audit trail automático en todas las acciones sensibles\n- Rate limiting en memoria\n- Sanitización de inputs\n- Guards en rutas protegidas\n- `middleware.ts` inyecta la sesión auth en cada petición',
};

export async function generateAuth(lang: Lang, assigned: Set<string> = new Set()): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let out = `## ${s.auth[lang]}\n\n`;

  // ── Files (auth-relevant only) ───────────────────────────────────────────
  out += `### ${sub.files[lang]}\n\n`;
  out += '```\n';
  const libFiles = await listFiles(PATHS.lib);
  const authLibFiles = libFiles.filter(f => AUTH_LIB_FILES.includes(f)).sort();
  if (authLibFiles.length > 0) {
    out += 'src/lib/ (auth)\n';
    for (const f of authLibFiles) out += `  ${f}\n`;
  }
  // Actions: top-level only (admin/, org/, index.ts — no individual files)
  const actionsTree = await listTree(PATHS.actions, 1, 1);
  if (actionsTree) out += `src/actions/\n${actionsTree}`;
  out += 'src/middleware.ts\n';
  out += '```\n\n';

  // ── Flows ────────────────────────────────────────────────────────────────
  out += `### ${sub.flows[lang]}\n\n${FLOWS[lang]}\n\n`;

  // ── Roles & Organizations ────────────────────────────────────────────────
  out += `### ${sub.roles[lang]}\n\n${ROLES[lang]}\n\n`;

  // ── Security & Audit ─────────────────────────────────────────────────────
  out += `### ${sub.security[lang]}\n\n${SECURITY[lang]}\n\n`;

  // ── Tests ────────────────────────────────────────────────────────────────
  const testFiles = await claimTestsByPattern([
    'auth', 'audit', 'permissions', 'rate-limit', 'middleware',
    'auth-guards', 'production-hardening', 'extract-ip', 'mask-utils',
  ], assigned);
  if (testFiles.length > 0) {
    out += `### ${sub.tests[lang]}\n\n`;
    for (const f of testFiles) out += `- \`${f}\`\n`;
    out += '\n';
  }

  return out;
}
