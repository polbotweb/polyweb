/** E-mail de confirmation d'une demande de réservation publique (gabarit commun, 4 locales, RTL). */
import type { Locale } from "@i18n/config";
import { getEmailTranslations } from "@smtp/templates/i18n";
import { renderEmailHtml, renderEmailText } from "@smtp/templates/layout";
import { fill, getBookingsPublicTranslations } from "../i18n/public";

export interface GuestConfirmationOptions {
  readonly locale: Locale;
  readonly customerName: string;
  readonly resourceName: string;
  /** Créneau déjà formaté dans le fuseau de la ressource. */
  readonly when: string;
  readonly partySize: number;
  readonly manageUrl: string;
}

export function guestConfirmationEmail(options: GuestConfirmationOptions) {
  const { layout } = getEmailTranslations(options.locale);
  const t = getBookingsPublicTranslations(options.locale).mail;
  // Sujet sur une ligne (en-tête SMTP) : le nom de ressource est saisi en back-office.
  const resource = options.resourceName.replace(/[\r\n]+/g, " ");
  const section = {
    heading: t.heading,
    greeting: fill(t.greeting, { name: options.customerName }),
    body: fill(t.body, { resource, when: options.when, party: options.partySize }),
    buttonText: t.button,
    buttonUrl: options.manageUrl,
    footnote: t.footnote,
  };
  return { subject: `${fill(t.subject, { resource })} — Polyweb`, html: renderEmailHtml(options.locale, layout, section), text: renderEmailText(section) };
}
