/**
 * Surcharges de gabarits e-mail d'achats par organisation et locale.
 * Si aucune ligne n'existe, l'appelant retombe sur le gabarit par défaut du module.
 */
import { Effect } from "effect";
import { and, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { LOCALES, type Locale } from "@i18n/config";
import { EMAIL_TEMPLATE_PURPOSES, type EmailTemplatePurpose } from "../domain/settings";
import { purchasingEmailTemplates } from "../schema/extended";

export interface PurchasingEmailTemplateInput {
  readonly locale: Locale;
  readonly purpose: EmailTemplatePurpose;
  readonly subject: string;
  readonly bodyHtml: string;
}

const sameTenant = (organizationId: string | null) =>
  organizationId === null ? isNull(purchasingEmailTemplates.organizationId) : eq(purchasingEmailTemplates.organizationId, organizationId);

const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);
const isPurpose = (value: string): value is EmailTemplatePurpose => (EMAIL_TEMPLATE_PURPOSES as readonly string[]).includes(value);

export const listPurchasingEmailTemplates = (organizationId: string | null) =>
  dbTry("purchasing.emailTemplates.list", () =>
    getDrizzle().select().from(purchasingEmailTemplates).where(sameTenant(organizationId)),
  ).pipe(Effect.map((rows) => rows.map((row) => ({
    locale: (isLocale(row.locale) ? row.locale : "fr") as Locale,
    purpose: row.purpose,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
  }))));

/** Recherche une surcharge exacte (org + locale + usage). `null` = utiliser le défaut. */
export const resolvePurchasingEmailOverride = (
  organizationId: string | null,
  locale: Locale,
  purpose: EmailTemplatePurpose,
) =>
  dbTry("purchasing.emailTemplates.resolve", () =>
    getDrizzle().select().from(purchasingEmailTemplates)
      .where(and(sameTenant(organizationId), eq(purchasingEmailTemplates.locale, locale), eq(purchasingEmailTemplates.purpose, purpose)))
      .limit(1),
  ).pipe(Effect.map((rows) => {
    const row = rows[0];
    return row ? { subject: row.subject, bodyHtml: row.bodyHtml } : null;
  }));

export const validatePurchasingEmailTemplates = (input: readonly PurchasingEmailTemplateInput[]) => {
  const seen = new Set<string>();
  const templates: PurchasingEmailTemplateInput[] = [];
  for (const row of input) {
    if (!isLocale(row.locale) || !isPurpose(row.purpose)) continue;
    const subject = row.subject.trim();
    const bodyHtml = row.bodyHtml.trim();
    if (!subject || subject.length > 200 || !bodyHtml || bodyHtml.length > 10_000) continue;
    const key = `${row.locale}:${row.purpose}`;
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push({ locale: row.locale, purpose: row.purpose, subject, bodyHtml });
  }
  return templates;
};
