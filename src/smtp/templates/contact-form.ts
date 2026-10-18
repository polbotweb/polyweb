import type { Locale } from '@i18n/config';
import { isRTL } from '@i18n/utils';

interface ContactFormEmailOptions {
  locale: Locale;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  reason: string;
  message: string;
  urgent: boolean;
  ipAddress: string | null;
}

const translations: Record<string, {
  subject: string;
  subjectUrgent: string;
  heading: string;
  fieldName: string;
  fieldEmail: string;
  fieldPhone: string;
  fieldReason: string;
  fieldMessage: string;
  urgentLabel: string;
  footer: string;
}> = {
  fr: {
    subject: 'Nouveau message de contact',
    subjectUrgent: '[URGENT] Nouveau message de contact',
    heading: 'Nouveau message depuis le formulaire de contact',
    fieldName: 'Nom',
    fieldEmail: 'Email',
    fieldPhone: 'Téléphone',
    fieldReason: 'Motif',
    fieldMessage: 'Message',
    urgentLabel: 'URGENT',
    footer: 'Ce message a été envoyé via le formulaire de contact du site.',
  },
  en: {
    subject: 'New contact message',
    subjectUrgent: '[URGENT] New contact message',
    heading: 'New message from contact form',
    fieldName: 'Name',
    fieldEmail: 'Email',
    fieldPhone: 'Phone',
    fieldReason: 'Reason',
    fieldMessage: 'Message',
    urgentLabel: 'URGENT',
    footer: 'This message was sent via the website contact form.',
  },
  es: {
    subject: 'Nuevo mensaje de contacto',
    subjectUrgent: '[URGENTE] Nuevo mensaje de contacto',
    heading: 'Nuevo mensaje del formulario de contacto',
    fieldName: 'Nombre',
    fieldEmail: 'Correo',
    fieldPhone: 'Teléfono',
    fieldReason: 'Motivo',
    fieldMessage: 'Mensaje',
    urgentLabel: 'URGENTE',
    footer: 'Este mensaje fue enviado a través del formulario de contacto del sitio.',
  },
  ar: {
    subject: 'رسالة اتصال جديدة',
    subjectUrgent: '[عاجل] رسالة اتصال جديدة',
    heading: 'رسالة جديدة من نموذج الاتصال',
    fieldName: 'الاسم',
    fieldEmail: 'البريد الإلكتروني',
    fieldPhone: 'الهاتف',
    fieldReason: 'السبب',
    fieldMessage: 'الرسالة',
    urgentLabel: 'عاجل',
    footer: 'تم إرسال هذه الرسالة عبر نموذج الاتصال.',
  },
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function contactFormTemplate(opts: ContactFormEmailOptions) {
  const t = translations[opts.locale] ?? translations.fr;
  const dir = isRTL(opts.locale) ? 'rtl' : 'ltr';
  const align = isRTL(opts.locale) ? 'right' : 'left';

  const fullName = esc(`${opts.firstName} ${opts.lastName}`);
  const email = esc(opts.email);
  const phone = esc(opts.phone);
  const reason = esc(opts.reason);
  const message = esc(opts.message).replace(/\n/g, '<br>');

  const urgentBadge = opts.urgent
    ? `<span style="display:inline-block;padding:2px 8px;background-color:#dc2626;color:#fff;font-size:11px;font-weight:700;border-radius:4px;margin-inline-start:8px">${esc(t.urgentLabel)}</span>`
    : '';

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:nowrap;vertical-align:top;text-align:${align}">${esc(label)}</td>
      <td style="padding:8px 12px;font-size:14px;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align}">${value}</td>
    </tr>`;

  const subject = `${opts.urgent ? t.subjectUrgent : t.subject} — Atomic`;

  const html = `<!DOCTYPE html>
<html lang="${opts.locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc">
  <tr><td style="padding:40px 16px" align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="height:4px;background:linear-gradient(90deg,#6d28d9,#a78bfa)" aria-hidden="true"></td></tr>
      <tr><td style="padding:32px 40px">
        <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align};line-height:1.3">
          ${esc(t.heading)}${urgentBadge}
        </h1>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          ${row(t.fieldName, fullName)}
          ${row(t.fieldEmail, `<a href="mailto:${email}" style="color:#6d28d9;text-decoration:none">${email}</a>`)}
          ${row(t.fieldPhone, phone)}
          ${row(t.fieldReason, reason)}
        </table>
        <div style="margin:24px 0;padding:16px;background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align}">${esc(t.fieldMessage)}</p>
          <p style="margin:0;font-size:14px;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align};line-height:1.6;white-space:pre-wrap">${message}</p>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px">
        <p style="margin:0;font-size:11px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;line-height:1.4">${esc(t.footer)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    t.heading,
    opts.urgent ? `[${t.urgentLabel}]` : '',
    '',
    `${t.fieldName}: ${opts.firstName} ${opts.lastName}`,
    `${t.fieldEmail}: ${opts.email}`,
    `${t.fieldPhone}: ${opts.phone}`,
    `${t.fieldReason}: ${opts.reason}`,
    '',
    `${t.fieldMessage}:`,
    opts.message,
    '',
    '---',
    t.footer,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}
