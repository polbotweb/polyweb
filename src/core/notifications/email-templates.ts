/**
 * Registre typé des gabarits e-mail de notifications (N4-A) : TypeScript + i18n (4 langues),
 * rendu texte + HTML via la mise en page commune `smtp/templates/layout`. Aucune dépendance.
 * Les modules déclarent leurs gabarits avec `defineEmailTemplate` et les enregistrent au démarrage.
 */
import { Data, Effect } from "effect";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@i18n/config";
import { getEmailTranslations } from "@/smtp/templates/i18n";
import { renderEmailHtml, renderEmailText, type EmailSection } from "@/smtp/templates/layout";

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EmailRenderContext {
  readonly locale: Locale;
  readonly siteUrl: string;
  readonly unsubscribeUrl?: string;
}

/** Contenu d'un gabarit : la section commune (titre, corps, bouton…) + l'objet. */
export type EmailContent = Omit<EmailSection, "unsubscribe"> & { readonly subject: string };

export interface EmailTemplate<D extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  /** Valide/normalise les données stockées dans `email_outbox.data` (jsonb). `null` = invalide. */
  readonly parse: (data: Record<string, unknown>) => D | null;
  readonly render: (data: D, ctx: EmailRenderContext) => EmailContent;
}

export class UnknownEmailTemplate extends Data.TaggedError("UnknownEmailTemplate")<{ readonly template: string }> {}
export class InvalidEmailTemplateData extends Data.TaggedError("InvalidEmailTemplateData")<{ readonly template: string }> {}

const UNSUBSCRIBE_LABEL: Record<Locale, string> = {
  fr: "Ne plus recevoir ces e-mails",
  en: "Stop receiving these emails",
  es: "Dejar de recibir estos correos",
  ar: "إيقاف تلقي رسائل البريد هذه",
};

const ID = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/;
const templates = new Map<string, EmailTemplate>();

/** Déclare un gabarit typé ; le résultat est effacé pour le registre (données validées par `parse`). */
export const defineEmailTemplate = <D extends Record<string, unknown>>(template: EmailTemplate<D>): EmailTemplate => ({
  id: template.id,
  parse: template.parse,
  render: (data, ctx) => template.render(data as D, ctx),
});

export function registerEmailTemplates(list: readonly EmailTemplate[]): void {
  for (const t of list) {
    if (!ID.test(t.id)) throw new Error(`Invalid email template id: ${t.id}`);
    templates.set(t.id, t);
  }
}

export const hasEmailTemplate = (id: string) => templates.has(id);
export const clearEmailTemplatesForTests = () => templates.clear();

export const asLocale = (value: string | null | undefined): Locale =>
  (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : DEFAULT_LOCALE;

export const renderNotificationEmail = (
  id: string,
  data: Record<string, unknown>,
  ctx: EmailRenderContext,
): Effect.Effect<RenderedEmail, UnknownEmailTemplate | InvalidEmailTemplateData> =>
  Effect.gen(function* () {
    const template = templates.get(id);
    if (!template) return yield* Effect.fail(new UnknownEmailTemplate({ template: id }));
    const parsed = template.parse(data);
    if (parsed === null) return yield* Effect.fail(new InvalidEmailTemplateData({ template: id }));
    const { subject, ...section } = template.render(parsed, ctx);
    const full: EmailSection = ctx.unsubscribeUrl ? { ...section, unsubscribe: { label: UNSUBSCRIBE_LABEL[ctx.locale], url: ctx.unsubscribeUrl } } : section;
    return {
      subject: subject.replace(/[\r\n]+/g, " "),
      html: renderEmailHtml(ctx.locale, getEmailTranslations(ctx.locale).layout, full),
      text: renderEmailText(full),
    };
  });
