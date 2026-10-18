import type { Locale } from '@i18n/config';
import { getEmailTranslations, interpolate } from './i18n';
import { renderEmailHtml, renderEmailText } from './layout';

interface ResetPasswordOptions {
  locale: Locale;
  userName: string;
  resetUrl: string;
}

export function resetPasswordTemplate({ locale, userName, resetUrl }: ResetPasswordOptions) {
  const { layout, resetPassword: t } = getEmailTranslations(locale);

  const greeting = interpolate(t.greeting, { name: userName });

  const section = {
    heading: t.heading,
    greeting,
    body: t.body,
    buttonText: t.button,
    buttonUrl: resetUrl,
    extra: t.expiry,
    footnote: t.ignore,
  };

  return {
    subject: `${t.subject} — Atomic`,
    html: renderEmailHtml(locale, layout, section),
    text: renderEmailText(section),
  };
}
