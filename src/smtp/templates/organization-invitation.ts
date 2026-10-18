import type { Locale } from '@i18n/config';
import { getEmailTranslations, interpolate } from './i18n';
import { renderEmailHtml, renderEmailText } from './layout';

interface OrganizationInvitationOptions {
  locale: Locale;
  inviterName: string;
  orgName: string;
  role: string;
  inviteUrl: string;
}

export function organizationInvitationTemplate({
  locale,
  inviterName,
  orgName,
  role,
  inviteUrl,
}: OrganizationInvitationOptions) {
  const { layout, organizationInvitation: t } = getEmailTranslations(locale);

  const subject = interpolate(t.subject, { orgName });
  const body = interpolate(t.body, { inviterName, orgName, role });

  const section = {
    heading: t.heading,
    greeting: t.greeting,
    body,
    buttonText: t.button,
    buttonUrl: inviteUrl,
    footnote: t.ignore,
  };

  return {
    subject: `${subject} — Atomic`,
    html: renderEmailHtml(locale, layout, section),
    text: renderEmailText(section),
  };
}
