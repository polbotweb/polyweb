import { PATHS, listTree, getScriptsByPrefix, claimTestsByPattern } from './utils';
import { i18n, type Lang } from './i18n';

const PROVIDERS_DESC: Record<Lang, string> = {
  en: '- **Brevo** (`SMTP_PROVIDER=BREVO`)\n- **Resend** (`SMTP_PROVIDER=RESEND`)\n- **Nodemailer** (`SMTP_PROVIDER=NODEMAILER`) — standard SMTP\n\nProvider selected via `SMTP_PROVIDER` environment variable.',
  fr: "- **Brevo** (`SMTP_PROVIDER=BREVO`)\n- **Resend** (`SMTP_PROVIDER=RESEND`)\n- **Nodemailer** (`SMTP_PROVIDER=NODEMAILER`) — SMTP standard\n\nLe provider est sélectionné via la variable d'environnement `SMTP_PROVIDER`.",
  ar: '- **Brevo** (`SMTP_PROVIDER=BREVO`)\n- **Resend** (`SMTP_PROVIDER=RESEND`)\n- **Nodemailer** (`SMTP_PROVIDER=NODEMAILER`)\n\nيتم تحديد المزود عبر متغير البيئة `SMTP_PROVIDER`.',
  es: '- **Brevo** (`SMTP_PROVIDER=BREVO`)\n- **Resend** (`SMTP_PROVIDER=RESEND`)\n- **Nodemailer** (`SMTP_PROVIDER=NODEMAILER`) — SMTP estándar\n\nProveedor seleccionado mediante la variable de entorno `SMTP_PROVIDER`.',
};

const TEMPLATES_DESC: Record<Lang, string> = {
  en: 'i18n email templates for: email verification, password reset, organisation invitations.',
  fr: "Templates d'email i18n pour : vérification d'email, réinitialisation de mot de passe, invitations organisations.",
  ar: 'قوالب بريد إلكتروني متعددة اللغات لـ: التحقق من البريد، إعادة تعيين كلمة المرور، دعوات المنظمات.',
  es: 'Templates de email i18n para: verificación de email, restablecimiento de contraseña, invitaciones de organizaciones.',
};

export async function generateEmail(lang: Lang, assigned: Set<string> = new Set()): Promise<string> {
  const s = i18n.sections;
  const sub = i18n.subsections;

  let out = `## ${s.email[lang]}\n\n`;

  // ── Files (smtp source only, no runtime log files) ─────────────────────
  out += `### ${sub.files[lang]}\n\n`;
  out += '```\n';
  const smtpTree = await listTree(PATHS.smtp);
  if (smtpTree) out += `src/smtp/\n${smtpTree}`;
  out += `logs/ ← email dead-letter queue (JSONL, one file per day)\n`;
  out += '```\n\n';

  // ── Providers ────────────────────────────────────────────────────────────
  out += `### ${sub.providers[lang]}\n\n${PROVIDERS_DESC[lang]}\n\n`;

  // ── Templates ────────────────────────────────────────────────────────────
  out += `### ${sub.templates[lang]}\n\n${TEMPLATES_DESC[lang]}\n\n`;

  // ── Commands ─────────────────────────────────────────────────────────────
  const commands = await getScriptsByPrefix(['smtp', 'logs']);
  if (commands) out += `### ${sub.commands[lang]}\n\n${commands}\n\n`;

  // ── Tests ────────────────────────────────────────────────────────────────
  const testFiles = await claimTestsByPattern(['smtp', 'send-email', 'contact-form-template'], assigned);
  if (testFiles.length > 0) {
    out += `### ${sub.tests[lang]}\n\n`;
    for (const f of testFiles) out += `- \`${f}\`\n`;
    out += '\n';
  }

  return out;
}
