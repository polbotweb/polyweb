import type { Locale } from '@i18n/config';
import { getEmailTranslations, interpolate } from './i18n';
import { renderEmailHtml, renderEmailText } from './layout';

interface DeleteAccountOptions {
  locale: Locale;
  userName: string;
  deleteUrl: string;
}

export function deleteAccountTemplate({ locale, userName, deleteUrl }: DeleteAccountOptions) {
  const { layout, deleteAccount: t } = getEmailTranslations(locale);

  const greeting = interpolate(t.greeting, { name: userName });

  const section = {
    heading: t.heading,
    greeting,
    body: t.body,
    buttonText: t.button,
    buttonUrl: deleteUrl,
    extra: t.warning,
    footnote: t.ignore,
  };

  return {
    subject: `${t.subject} — Atomic`,
    html: renderEmailHtml(locale, layout, section),
    text: renderEmailText(section),
  };
}
