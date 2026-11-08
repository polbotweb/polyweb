/**
 * Registre des types de notifications (N2-A / N4-A). Chaque module déclare ses types dans
 * `src/modules/<module>/notifications/definitions.ts` ; l'agrégat `src/modules/notifications.ts`
 * (rempli par `pnpm module:new`) les enregistre au démarrage.
 */
import type { Effect } from "effect";
import type { PolywebEvent } from "@/core/events";
import type { NotificationCategory } from "./index";
import { hasEmailTemplate, registerEmailTemplates, type EmailTemplate } from "./email-templates";
import { registerReminderSources, type ReminderSource } from "./reminders";

export type NotificationChannel = "in_app" | "email";
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["in_app", "email"];

/** Destinataire résolu pour un événement : identifiant utilisateur + données propres au destinataire. */
export interface NotificationRecipient {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly actorId?: string | null;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly data?: Readonly<Record<string, unknown>>;
  /** Adresse et langue pour le canal e-mail (sinon : in-app seulement). */
  readonly email?: string | null;
  readonly locale?: string | null;
}

export interface NotificationDefinition {
  readonly module: string;
  /** Type stocké (`notifications.type`), unique par module. */
  readonly type: string;
  readonly category: NotificationCategory;
  /** Canaux possibles ; l'utilisateur peut désactiver chacun (préférences catégorie × canal). */
  readonly channels: readonly NotificationChannel[];
  /** Événement du bus déclenchant la notification (sinon : appel direct de `notify`). */
  readonly event?: string;
  /** Résout les destinataires d'un événement (lecture seule, sans PII dans les logs). */
  readonly recipients?: (event: PolywebEvent) => Effect.Effect<readonly NotificationRecipient[], unknown>;
  /** Gabarit e-mail (registre `smtp/templates/registry`) pour le canal `email`. */
  readonly emailTemplate?: string;
  /**
   * Message transactionnel (D3) : lié à l'exécution d'un service (ex. relance de facture au client).
   * E-mail seulement ; jamais soumis aux préférences, sans lien ni en-têtes de désinscription,
   * absent de la page de préférences. Par défaut `false` : notification optionnelle.
   */
  readonly transactional?: boolean;
}

export interface ModuleNotifications {
  readonly module: string;
  readonly definitions: readonly NotificationDefinition[];
  /** Gabarits e-mail du module (`defineEmailTemplate`), enregistrés avec les définitions. */
  readonly emailTemplates?: readonly EmailTemplate[];
  /** Sources de relances planifiées du module (N6-A), exécutées par `/api/cron/reminders`. */
  readonly reminders?: readonly ReminderSource[];
}

const TYPE = /^[A-Z][A-Z0-9_]*$/;
const definitions = new Map<string, NotificationDefinition>();
const key = (module: string, type: string) => `${module}:${type}`;

/** Déclare les notifications d'un module (contrôle de forme, module cohérent). */
export function defineModuleNotifications(
  module: string,
  defs: readonly Omit<NotificationDefinition, "module">[],
  emailTemplates: readonly EmailTemplate[] = [],
  reminders: readonly ReminderSource[] = [],
): ModuleNotifications {
  return { module, definitions: defs.map((d) => ({ ...d, module })), emailTemplates, reminders };
}

export function registerNotificationDefinitions(entry: ModuleNotifications): void {
  registerEmailTemplates(entry.emailTemplates ?? []);
  registerReminderSources(entry.reminders ?? []);
  for (const d of entry.definitions) {
    if (d.module !== entry.module) throw new Error(`Notification ${d.type} declared outside its module ${entry.module}`);
    if (!TYPE.test(d.type)) throw new Error(`Invalid notification type: ${d.type}`);
    if (d.channels.length === 0) throw new Error(`Notification ${d.type} has no channel`);
    if (d.channels.includes("email") && !d.emailTemplate) throw new Error(`Notification ${d.type} needs an emailTemplate for the email channel`);
    if (d.emailTemplate && !hasEmailTemplate(d.emailTemplate)) throw new Error(`Notification ${d.type} uses unknown email template ${d.emailTemplate}`);
    if (d.event && !d.recipients) throw new Error(`Notification ${d.type} listens to ${d.event} without recipients`);
    if (d.transactional && (d.channels.length !== 1 || d.channels[0] !== "email")) throw new Error(`Transactional notification ${d.type} must use the email channel only`);
    if (d.emailTemplate) {
      const clash = [...definitions.values()].find((o) => o.emailTemplate === d.emailTemplate && Boolean(o.transactional) !== Boolean(d.transactional) && key(o.module, o.type) !== key(d.module, d.type));
      if (clash) throw new Error(`Email template ${d.emailTemplate} cannot be both transactional and optional`);
    }
    definitions.set(key(d.module, d.type), d);
  }
}

export const getNotificationDefinition = (module: string, type: string): NotificationDefinition | undefined => definitions.get(key(module, type));
export const listNotificationDefinitions = (): readonly NotificationDefinition[] => [...definitions.values()];
export const definitionsForEvent = (name: string): readonly NotificationDefinition[] => listNotificationDefinitions().filter((d) => d.event === name);

/** Vrai si le gabarit e-mail est déclaré par une notification transactionnelle (D3). */
export const isTransactionalEmailTemplate = (template: string): boolean =>
  [...definitions.values()].some((d) => d.transactional === true && d.emailTemplate === template);

/** Catégories exposées dans la page de préférences (notifications optionnelles seulement), avec leurs canaux. */
export function listNotificationCategories(): readonly { category: NotificationCategory; channels: readonly NotificationChannel[] }[] {
  const byCategory = new Map<string, Set<NotificationChannel>>();
  for (const d of definitions.values()) {
    if (d.transactional) continue;
    const set = byCategory.get(d.category) ?? new Set<NotificationChannel>();
    for (const c of d.channels) set.add(c);
    byCategory.set(d.category, set);
  }
  return [...byCategory.entries()].map(([category, set]) => ({ category, channels: NOTIFICATION_CHANNELS.filter((c) => set.has(c)) }));
}

export function clearNotificationDefinitionsForTests(): void {
  definitions.clear();
}
