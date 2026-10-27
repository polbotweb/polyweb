/**
 * Actions Astro du domaine sales : prologue Effect (garde de permission tenant,
 * verrou, validations zod) puis service. Ré-exportées depuis `src/actions/index.ts`.
 * Émission (numéro légal) : permission `issue` ; encaissements et relances : `payment`.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { isCurrencyCode } from "@/core/money";
import { CUSTOMER_TYPES, SUPPLY_TYPES, TAX_CATEGORIES } from "@/modules/tax/domain/rules";
import { requireSalesPermission, requireSalesResourcePermission, type SalesPermission } from "../permissions";
import { salesService } from "../services/salesDocument.service";
import { SALES_DOCUMENT_KINDS, SALES_STATUSES, type SalesStatus } from "../domain/workflow";
import { PAYMENT_METHODS } from "../domain/payments";
import { bulkSalesLifecycle } from "./bulk";
import { sellerProfileService } from "../services/sellerProfile.service";

const idInput = z.object({ id: z.uuid() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const country = z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase());
const decimal = z.string().trim().regex(/^\d{1,9}([.,]\d{1,4})?$/).transform((value) => value.replace(",", "."));

const lineInput = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: decimal.refine((value) => Number(value) > 0, "Quantité > 0"),
  unitPriceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  discountPercent: decimal.refine((value) => Number(value) <= 100, "Remise ≤ 100 %").default("0"),
  taxCategory: z.enum(TAX_CATEGORIES),
});

const partyFields = {
  title: z.string().trim().min(1).max(200),
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.email().nullable().default(null),
  customerAddress: z.string().max(1000).nullable().default(null),
  customerCountry: country,
  customerType: z.enum(CUSTOMER_TYPES),
  customerVatNumber: z.string().max(32).nullable().default(null),
  sellerCountry: country,
  supplyType: z.enum(SUPPLY_TYPES),
  ossRegistered: z.boolean().default(false),
  currency: z.string().transform((value) => value.toUpperCase()).refine(isCurrencyCode, "Devise inconnue"),
  validUntil: isoDate.nullable().default(null),
  paymentTermDays: z.number().int().min(0).max(365).default(30),
  notes: z.string().max(4000).nullable().default(null),
};

/** Permission requise pour atteindre un statut (émission légale → `issue`). */
const permissionFor = (to: SalesStatus): SalesPermission => (to === "ISSUED" ? "issue" : "update");

export const salesActions = {
  // Actions groupées (core/bulk) — voir ./bulk.ts.
  bulk: bulkSalesLifecycle,
  create: defineAction({
    input: z.object({ kind: z.enum(SALES_DOCUMENT_KINDS).refine((kind) => kind !== "credit_note", "Un avoir se crée depuis une facture."), organizationId: z.string().nullable().default(null), ...partyFields, lines: z.array(lineInput).min(1).max(200) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSalesPermission(context, ["create"], input.organizationId);
      return yield* salesService.create(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend({
      title: partyFields.title.optional(), customerName: partyFields.customerName.optional(), customerEmail: z.email().nullable().optional(),
      customerAddress: z.string().max(1000).nullable().optional(), customerCountry: country.optional(), customerType: partyFields.customerType.optional(),
      customerVatNumber: z.string().max(32).nullable().optional(), sellerCountry: country.optional(), supplyType: partyFields.supplyType.optional(),
      ossRegistered: z.boolean().optional(), currency: partyFields.currency.optional(), validUntil: isoDate.nullable().optional(),
      paymentTermDays: z.number().int().min(0).max(365).optional(), notes: z.string().max(4000).nullable().optional(),
      lines: z.array(lineInput).min(1).max(200).optional(),
    }),
    handler: effectHandler(({ id, ...patch }, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, ["update"], id);
      return yield* salesService.update(id, patch, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(SALES_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, [permissionFor(input.to)], input.id);
      return yield* salesService.transition(input.id, input.to, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  convertQuote: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, ["create"], input.id);
      return yield* salesService.convertQuote(input.id, user.id);
    })),
  }),
  createCreditNote: defineAction({
    input: idInput.extend({ title: z.string().trim().min(1).max(200).optional(), lines: z.array(lineInput).min(1).max(200).optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, ["create"], input.id);
      return yield* salesService.createCreditNote(input.id, user.id, { title: input.title, lines: input.lines });
    })),
  }),
  recordPayment: defineAction({
    input: idInput.extend({ amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), method: z.enum(PAYMENT_METHODS), paidAt: isoDate, reference: z.string().max(200).nullable().default(null) }),
    handler: effectHandler(({ id, ...payment }, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, ["payment"], id);
      return yield* salesService.recordPayment(id, payment, user.id);
    })),
  }),
  recordReminder: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, ["payment"], input.id);
      return yield* salesService.recordReminder(input.id, user.id);
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, ["update"], input.id);
      // Même utilisateur dans une autre session → LockHeldError { sameUser } : confirmer côté UI puis renvoyer takeOver.
      return yield* salesService.lock(input.id, lockOwnerFrom(user.id, context.locals.session?.id), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requireSalesResourcePermission(context, ["update"], input.id);
      yield* salesService.unlock(input.id, lockOwnerFrom(user.id, context.locals.session?.id));
      return { success: true };
    })),
  }),
  /** Profil vendeur du tenant (identité légale des factures et du XML Factur-X). */
  saveSellerProfile: defineAction({
    input: z.object({
      organizationId: z.string().nullable().default(null),
      legalName: z.string().trim().min(1).max(200),
      vatNumber: z.string().max(32).nullable().default(null),
      legalId: z.string().max(50).nullable().default(null),
      legalIdScheme: z.string().max(4).nullable().default(null),
      addressLine1: z.string().max(200).nullable().default(null),
      addressLine2: z.string().max(200).nullable().default(null),
      postcode: z.string().max(20).nullable().default(null),
      city: z.string().max(200).nullable().default(null),
      country,
      email: z.email().max(254).nullable().default(null),
      iban: z.string().max(42).nullable().default(null),
      bic: z.string().max(14).nullable().default(null),
    }),
    handler: effectHandler(({ organizationId, ...input }, context) => Effect.gen(function* () {
      const user = yield* requireSalesPermission(context, ["update"], organizationId);
      const row = yield* sellerProfileService.save(input, organizationId, user.id);
      return { id: row.id };
    })),
  }),
};
