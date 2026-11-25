/**
 * Réglages banking par organisation (B18) : tout ce qui varie selon l'entreprise est réglable,
 * avec des défauts sensés (« prêt-à-porter sur mesure »). Stockés en JSON validé ; une clé absente
 * reprend son défaut, si bien qu'un nouveau réglage n'exige aucune migration de données.
 * Les comptes comptables (frais, écarts, change, escompte, attente, virements internes) sont des
 * rôles de core/accounting, réglés sur la page Comptabilité.
 */
import { Effect } from "effect";
import { DEFAULT_MATCH_SETTINGS, type MatchSettings } from "@/core/reconciliation/types";
import {
  AUTOMATION_MODES, BANKING_NOTIFICATION_KINDS, LOCKED_PERIOD_POLICIES, NOTIFY_ROLES, OVERPAYMENT_TREATMENTS, QIF_DATE_ORDERS, STATEMENT_FORMATS,
  type AutomationMode, type BankingNotificationKind, type LockedPeriodPolicy, type NotifyRole, type OverpaymentTreatment, type QifDateOrder, type StatementFormat,
} from "./constants";
import { InvalidBankingSettingsError } from "./errors";

export interface BankingSettings {
  /** Formats d'import autorisés. */
  readonly allowedFormats: readonly StatementFormat[];
  /** Taille maximale d'un fichier (octets) et nombre maximal de lignes. */
  readonly maxFileBytes: number;
  readonly maxLines: number;
  /** Conservation des fichiers bruts (jours ; 3 650 = 10 ans, durée légale française des pièces comptables). */
  readonly retentionDays: number;
  readonly automationMode: AutomationMode;
  /** Seuil du mode `auto_threshold` (score 0–100). */
  readonly autoThreshold: number;
  /** Scoring et recherche (pondérations, fenêtre, tolérance de rapprochement, combinaisons). */
  readonly match: MatchSettings;
  /** Passage automatique en perte ou profit des petits écarts : max(absolu, %) ; 0 = jamais. */
  readonly writeOffAbsoluteMinor: number;
  readonly writeOffPercent: number;
  readonly overpaymentTreatment: OverpaymentTreatment;
  /** Écarts de change réalisés passés automatiquement (sinon : à affecter à la main). */
  readonly fxAutoPost: boolean;
  /** Une rupture de solde (continuité) suspend l'auto-rapprochement du compte. */
  readonly blockAutoOnContinuityBreak: boolean;
  /** Date de verrouillage manuelle (incluse), AAAA-MM-JJ. */
  readonly lockDate: string | null;
  /** Verrouille automatiquement les mois dont le FEC est généré. */
  readonly lockAfterFec: boolean;
  readonly lockedPeriodPolicy: LockedPeriodPolicy;
  /** Heure locale (0–23) du cron banking. */
  readonly cronHour: number;
  /** Ancienneté (jours) au-delà de laquelle une ligne non rapprochée est signalée. */
  readonly agingDays: number;
  /** Fenêtre (jours) d'appariement des virements internes entre comptes. */
  readonly transferWindowDays: number;
  /** Ordre des dates des fichiers QIF. */
  readonly qifDateOrder: QifDateOrder;
  /** Notifications actives et rôles destinataires. */
  readonly notifications: Readonly<Record<BankingNotificationKind, boolean>>;
  readonly notifyRoles: readonly NotifyRole[];
  /** Flux bancaires automatiques (GoCardless) : désactivés par défaut. */
  readonly feedsEnabled: boolean;
  /** Profondeur d'historique demandée à la première synchronisation (jours, ≤ 730). */
  readonly feedHistoryDays: number;
  /** Synchronisation des versements Stripe (payouts) : désactivée par défaut. */
  readonly stripePayoutsEnabled: boolean;
}

export const DEFAULT_BANKING_SETTINGS: BankingSettings = {
  allowedFormats: STATEMENT_FORMATS,
  maxFileBytes: 20 * 1024 * 1024,
  maxLines: 100_000,
  retentionDays: 3650,
  automationMode: "suggest",
  autoThreshold: 95,
  match: DEFAULT_MATCH_SETTINGS,
  writeOffAbsoluteMinor: 100,
  writeOffPercent: 0.5,
  overpaymentTreatment: "suspense",
  fxAutoPost: true,
  blockAutoOnContinuityBreak: true,
  lockDate: null,
  lockAfterFec: true,
  lockedPeriodPolicy: "refuse",
  cronHour: 6,
  agingDays: 7,
  transferWindowDays: 5,
  qifDateOrder: "DMY",
  notifications: { importDone: true, importFailed: true, continuityBreak: true, dailyDigest: true, aging: true, writeOffApproval: true, sepaReturn: true, feedError: true },
  notifyRoles: ["owner", "admin"],
  feedsEnabled: false,
  feedHistoryDays: 90,
  stripePayoutsEnabled: false,
};

/** Bornes techniques (protection des ressources), non des préférences métier. */
export const BANKING_LIMITS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxLines: 500_000,
  maxCombination: 12,
  combinationTimeMs: 2000,
  maxProposals: 20,
  dateWindowDays: 120,
  retentionDays: 36_500,
} as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const intIn = (field: string, value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? Effect.succeed(value)
    : Effect.fail(new InvalidBankingSettingsError({ field, value: String(value) }));

const numIn = (field: string, value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? Effect.succeed(value)
    : Effect.fail(new InvalidBankingSettingsError({ field, value: String(value) }));

const oneOf = <T extends string>(field: string, value: unknown, allowed: readonly T[]) =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? Effect.succeed(value as T)
    : Effect.fail(new InvalidBankingSettingsError({ field, value: String(value) }));

const bool = (field: string, value: unknown) =>
  typeof value === "boolean" ? Effect.succeed(value) : Effect.fail(new InvalidBankingSettingsError({ field, value: String(value) }));

/**
 * Fusionne une saisie partielle (ou un JSON stocké, éventuellement ancien) avec les défauts puis
 * valide chaque champ. Toute valeur hors bornes est refusée : jamais de correction silencieuse.
 */
export const resolveBankingSettings = (input: unknown): Effect.Effect<BankingSettings, InvalidBankingSettingsError> =>
  Effect.gen(function* () {
    const raw = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof BankingSettings, unknown>>;
    const d = DEFAULT_BANKING_SETTINGS;
    const pick = <K extends keyof BankingSettings>(key: K): unknown => (raw[key] === undefined ? d[key] : raw[key]);
    const formatsRaw = pick("allowedFormats");
    if (!Array.isArray(formatsRaw) || formatsRaw.length === 0) return yield* new InvalidBankingSettingsError({ field: "allowedFormats", value: String(formatsRaw) });
    const allowedFormats: StatementFormat[] = [];
    for (const format of formatsRaw) allowedFormats.push(yield* oneOf("allowedFormats", format, STATEMENT_FORMATS));
    const matchRaw = (pick("match") ?? {}) as Partial<MatchSettings> & { weights?: Partial<MatchSettings["weights"]> };
    const weightsRaw = { ...d.match.weights, ...(matchRaw.weights ?? {}) };
    const weights = {
      reference: yield* intIn("weights.reference", weightsRaw.reference, 0, 100),
      amount: yield* intIn("weights.amount", weightsRaw.amount, 0, 100),
      iban: yield* intIn("weights.iban", weightsRaw.iban, 0, 100),
      name: yield* intIn("weights.name", weightsRaw.name, 0, 100),
      date: yield* intIn("weights.date", weightsRaw.date, 0, 100),
    };
    if (weights.reference + weights.amount + weights.iban + weights.name + weights.date === 0) return yield* new InvalidBankingSettingsError({ field: "weights", value: "0" });
    const m = { ...d.match, ...matchRaw };
    const match: MatchSettings = {
      weights,
      dateWindowDays: yield* intIn("dateWindowDays", m.dateWindowDays, 0, BANKING_LIMITS.dateWindowDays),
      toleranceAbsoluteMinor: yield* intIn("toleranceAbsoluteMinor", m.toleranceAbsoluteMinor, 0, 100_000_000),
      tolerancePercent: yield* numIn("tolerancePercent", m.tolerancePercent, 0, 100),
      maxCombination: yield* intIn("maxCombination", m.maxCombination, 1, BANKING_LIMITS.maxCombination),
      combinationTimeMs: yield* intIn("combinationTimeMs", m.combinationTimeMs, 10, BANKING_LIMITS.combinationTimeMs),
      maxProposals: yield* intIn("maxProposals", m.maxProposals, 1, BANKING_LIMITS.maxProposals),
    };
    const lockDateRaw = pick("lockDate");
    const lockDate = lockDateRaw === null || lockDateRaw === "" ? null : typeof lockDateRaw === "string" && isIsoDate(lockDateRaw) ? lockDateRaw : yield* new InvalidBankingSettingsError({ field: "lockDate", value: String(lockDateRaw) });
    const notificationsRaw = { ...d.notifications, ...((pick("notifications") ?? {}) as Record<string, unknown>) };
    const notifications = {} as Record<BankingNotificationKind, boolean>;
    for (const kind of BANKING_NOTIFICATION_KINDS) notifications[kind] = yield* bool(`notifications.${kind}`, notificationsRaw[kind]);
    const rolesRaw = pick("notifyRoles");
    if (!Array.isArray(rolesRaw)) return yield* new InvalidBankingSettingsError({ field: "notifyRoles", value: String(rolesRaw) });
    const notifyRoles: NotifyRole[] = [];
    for (const role of rolesRaw) { const valid = yield* oneOf("notifyRoles", role, NOTIFY_ROLES); if (!notifyRoles.includes(valid)) notifyRoles.push(valid); }
    return {
      allowedFormats: [...new Set(allowedFormats)],
      maxFileBytes: yield* intIn("maxFileBytes", pick("maxFileBytes"), 1024, BANKING_LIMITS.maxFileBytes),
      maxLines: yield* intIn("maxLines", pick("maxLines"), 10, BANKING_LIMITS.maxLines),
      retentionDays: yield* intIn("retentionDays", pick("retentionDays"), 30, BANKING_LIMITS.retentionDays),
      automationMode: yield* oneOf("automationMode", pick("automationMode"), AUTOMATION_MODES),
      autoThreshold: yield* intIn("autoThreshold", pick("autoThreshold"), 50, 100),
      match,
      writeOffAbsoluteMinor: yield* intIn("writeOffAbsoluteMinor", pick("writeOffAbsoluteMinor"), 0, 100_000_000),
      writeOffPercent: yield* numIn("writeOffPercent", pick("writeOffPercent"), 0, 100),
      overpaymentTreatment: yield* oneOf("overpaymentTreatment", pick("overpaymentTreatment"), OVERPAYMENT_TREATMENTS),
      fxAutoPost: yield* bool("fxAutoPost", pick("fxAutoPost")),
      blockAutoOnContinuityBreak: yield* bool("blockAutoOnContinuityBreak", pick("blockAutoOnContinuityBreak")),
      lockDate,
      lockAfterFec: yield* bool("lockAfterFec", pick("lockAfterFec")),
      lockedPeriodPolicy: yield* oneOf("lockedPeriodPolicy", pick("lockedPeriodPolicy"), LOCKED_PERIOD_POLICIES),
      cronHour: yield* intIn("cronHour", pick("cronHour"), 0, 23),
      agingDays: yield* intIn("agingDays", pick("agingDays"), 1, 365),
      transferWindowDays: yield* intIn("transferWindowDays", pick("transferWindowDays"), 0, 30),
      qifDateOrder: yield* oneOf("qifDateOrder", pick("qifDateOrder"), QIF_DATE_ORDERS),
      notifications,
      notifyRoles,
      feedsEnabled: yield* bool("feedsEnabled", pick("feedsEnabled")),
      feedHistoryDays: yield* intIn("feedHistoryDays", pick("feedHistoryDays"), 1, 730),
      stripePayoutsEnabled: yield* bool("stripePayoutsEnabled", pick("stripePayoutsEnabled")),
    };
  });

/** Tolérance de passage automatique en perte / profit pour un montant attendu. */
export const writeOffToleranceFor = (expectedMinor: number, settings: Pick<BankingSettings, "writeOffAbsoluteMinor" | "writeOffPercent">) =>
  Math.max(settings.writeOffAbsoluteMinor, Math.floor((Math.abs(expectedMinor) * settings.writeOffPercent) / 100));

/** Mode effectif d'un compte : surcharge du compte, sinon celui de l'organisation. */
export const effectiveAutomationMode = (settings: Pick<BankingSettings, "automationMode">, accountOverride: AutomationMode | null | undefined): AutomationMode =>
  accountOverride ?? settings.automationMode;

/** Date de verrouillage effective : max(date manuelle, fin du dernier mois dont le FEC est généré). */
export const effectiveLockDate = (settings: Pick<BankingSettings, "lockDate" | "lockAfterFec">, lastFecPeriod: string | null): string | null => {
  const fecEnd = settings.lockAfterFec && lastFecPeriod && /^\d{4}-\d{2}$/.test(lastFecPeriod) ? endOfMonth(lastFecPeriod) : null;
  if (!settings.lockDate) return fecEnd;
  if (!fecEnd) return settings.lockDate;
  return settings.lockDate > fecEnd ? settings.lockDate : fecEnd;
};

/** Dernier jour du mois `AAAA-MM`. */
export const endOfMonth = (period: string): string => {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

/** Lendemain d'une date ISO. */
export const nextDay = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Date comptable d'une opération selon la période verrouillée : inchangée si ouverte ; sinon refus
 * (`null`) ou premier jour ouvert, selon la politique de l'organisation.
 */
export const postingDate = (date: string, lockDate: string | null, policy: LockedPeriodPolicy): string | null => {
  if (!lockDate || date > lockDate) return date;
  return policy === "next_open_day" ? nextDay(lockDate) : null;
};
