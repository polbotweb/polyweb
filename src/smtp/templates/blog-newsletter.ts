import type { Locale } from '@i18n/config';
import { getEmailTranslations, interpolate } from './i18n';
import { renderEmailHtml, renderEmailText } from './layout';

interface BlogNewsletterOptions {
  locale: Locale;
  userName?: string;
  confirmUrl: string;
  unsubscribeUrl: string;
}

export function blogNewsletterConfirmTemplate({ locale, userName, confirmUrl, unsubscribeUrl }: BlogNewsletterOptions) {
  const { layout, blogNewsletter: t } = getEmailTranslations(locale);

  const greeting = userName ? interpolate(t.greeting, { name: userName }) : t.greetingGeneric;

  const section = {
    heading: t.heading,
    greeting,
    body: t.body,
    buttonText: t.button,
    buttonUrl: confirmUrl,
    extra: t.extra,
    footnote: interpolate(t.ignore, { unsubscribeUrl }),
  };

  return {
    subject: `${t.subject} — Atomic`,
    html: renderEmailHtml(locale, layout, section),
    text: renderEmailText(section),
  };
}

interface BlogNewsletterUnsubscribeOptions {
  locale: Locale;
  userName?: string;
}

export function blogNewsletterUnsubscribeTemplate({ locale, userName }: BlogNewsletterUnsubscribeOptions) {
  const { layout, blogNewsletter: t } = getEmailTranslations(locale);

  const greeting = userName ? interpolate(t.greeting, { name: userName }) : t.greetingGeneric;

  const section = {
    heading: t.unsubscribedHeading,
    greeting,
    body: t.unsubscribedBody,
    buttonText: t.button,
    buttonUrl: '',
    footnote: '',
  };

  return {
    subject: `${t.unsubscribedSubject} — Atomic`,
    html: renderEmailHtml(locale, layout, section),
    text: renderEmailText(section),
  };
}
