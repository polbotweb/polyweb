import type { Locale } from '@i18n/config';
import { isRTL } from '@i18n/utils';
import type { EmailLayoutStrings } from './i18n';

/** Escape HTML special characters for safe embedding in email templates */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Shared Email Layout ─────────────────────────────────────────────
// Produces a clean, responsive HTML email compatible with all major
// email clients (Gmail, Outlook, Apple Mail, Yahoo, etc.).
//
// Design tokens — kept in sync with the Atomic brand:
//   bg           #f8fafc  (slate-50)
//   card         #ffffff
//   text-primary #0f172a  (slate-900)
//   text-muted   #64748b  (slate-500)
//   accent       #6d28d9  (violet-700)
//   accent-fg    #ffffff
//   border       #e2e8f0  (slate-200)
//   link         #6d28d9

export interface EmailSection {
  heading: string;
  greeting: string;
  body: string;
  buttonText: string;
  buttonUrl: string;
  extra?: string;     // e.g. expiry notice
  footnote: string;   // e.g. "ignore this email if…"
}

export function renderEmailHtml(
  locale: Locale,
  layout: EmailLayoutStrings,
  section: EmailSection,
): string {
  const dir = isRTL(locale) ? 'rtl' : 'ltr';
  const lang = locale;
  const align = isRTL(locale) ? 'right' : 'left';

  // Escape dynamic content for safe HTML embedding
  const h = esc(section.heading);
  const g = esc(section.greeting);
  const b = esc(section.body);
  const btn = esc(section.buttonText);
  const url = esc(section.buttonUrl);
  const fn = esc(section.footnote);
  const ex = section.extra ? esc(section.extra) : '';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${h}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc">
    <tr><td style="padding:40px 16px" align="center">

      <!-- Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">

        <!-- Accent bar -->
        <tr><td style="height:4px;background:linear-gradient(90deg,#6d28d9,#a78bfa)" aria-hidden="true"></td></tr>

        <!-- Logo / Brand -->
        <tr><td style="padding:32px 40px 0;text-align:center">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto">
            <tr>
              <td style="width:36px;height:36px;background-color:#6d28d9;border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;font-weight:700;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
                A
              </td>
              <td style="padding-${isRTL(locale) ? 'right' : 'left'}:12px;font-size:20px;font-weight:700;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.025em">
                Atomic
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:32px 40px">

          <!-- Heading -->
          <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align};line-height:1.3">
            ${h}
          </h1>

          <!-- Greeting + Body -->
          <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align};line-height:1.6">
            ${g}
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align};line-height:1.6">
            ${b}
          </p>

          <!-- CTA Button -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px">
            <tr><td align="center">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:280px" arcsize="17%" fill="t" stroke="f">
                <v:fill type="gradient" color="#6d28d9" color2="#7c3aed"/>
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600">${btn}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${url}" style="display:inline-block;padding:14px 36px;background-color:#6d28d9;color:#ffffff;font-size:15px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-decoration:none;border-radius:8px;line-height:1;text-align:center;mso-padding-alt:0">
                ${btn}
              </a>
              <!--<![endif]-->
            </td></tr>
          </table>

          ${ex ? `
          <!-- Extra info (e.g. expiry) -->
          <p style="margin:0 0 20px;font-size:13px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;line-height:1.5">
            ${ex}
          </p>
          ` : ''}

          <!-- Fallback link -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border-radius:8px;margin:0 0 20px">
            <tr><td style="padding:16px">
              <p style="margin:0 0 6px;font-size:12px;color:#64748b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align};line-height:1.4">
                ${layout.fallbackLink}
              </p>
              <p style="margin:0;font-size:12px;color:#6d28d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;word-break:break-all;text-align:${align};line-height:1.4">
                ${url}
              </p>
            </td></tr>
          </table>

          <!-- Divider -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px">

          <!-- Footnote -->
          <p style="margin:0;font-size:13px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:${align};line-height:1.5">
            ${fn}
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:0 40px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border-radius:8px">
            <tr><td style="padding:16px;text-align:center">
              <p style="margin:0;font-size:11px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.4">
                ${layout.footer}
              </p>
            </td></tr>
          </table>
        </td></tr>

      </table>
      <!-- /Card -->

    </td></tr>
  </table>
  <!-- /Outer wrapper -->

</body>
</html>`;
}

/** Plain-text fallback version */
export function renderEmailText(
  section: EmailSection,
): string {
  const lines = [
    section.greeting,
    '',
    section.body,
    '',
    `→ ${section.buttonUrl}`,
  ];
  if (section.extra) {
    lines.push('', section.extra);
  }
  lines.push('', '---', section.footnote);
  return lines.join('\n');
}
