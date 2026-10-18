import type { Locale } from '@i18n/config';
import { getEmailTranslations, interpolate } from './i18n';
import { renderEmailHtml, renderEmailText } from './layout';

interface VerifyEmailOptions {
  locale: Locale;
  userName: string;
  verificationUrl: string;
}

export function verifyEmailTemplate({ locale, userName, verificationUrl }: VerifyEmailOptions) {
  const { layout, verifyEmail: t } = getEmailTranslations(locale);

  const greeting = interpolate(t.greeting, { name: userName });

  const section = {
    heading: t.heading,
    greeting,
    body: t.body,
    buttonText: t.button,
    buttonUrl: verificationUrl,
    footnote: t.ignore,
  };

  return {
    subject: `${t.subject} — Atomic`,
    html: renderEmailHtml(locale, layout, section),
    text: renderEmailText(section),
  };
}
