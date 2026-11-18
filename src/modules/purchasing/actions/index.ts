/**
 * Actions Astro du domaine purchasing : prologue Effect (garde de permission tenant, verrou,
 * validations zod) puis service. Ré-exportées depuis `src/actions/index.ts` (`actions.purchasing.*`).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { requirePurchasingPermission, requirePurchasingResourcePermission } from "../permissions";
import { purchasingService } from "../services/purchasing.service";
import { purchasingSettingsService } from "../services/settings.service";
import { purchasingInvoicesService } from "../services/invoices.service";
import { purchasingOpsService } from "../services/ops.service";
import { actorFromUser, decidePurchaseApproval } from "../services/approvals.service";
import { notifyPurchaseOrderSent } from "../documents";
import { REORDER_MODES, MATCHING_MODES, MATCHING_POLICIES } from "../domain/settings";
import { APPROVAL_MODES, APPROVAL_ROLES } from "@/core/approvals";
import { RETURN_REASONS } from "../domain/returns";
import { LANDED_COST_CATEGORIES, LANDED_COST_METHODS } from "../domain/landed-costs";
import { PAYMENT_METHODS } from "../domain/payments";
import { toLocale } from "@i18n/utils";
import { privateStorage, PrivateStorage } from "@/lib/storage/private";

import { PURCHASE_ORDER_STATUSES } from "../domain/workflow";
import { MAX_LINES } from "../domain/order";
import { bulkPurchasingLifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });
const orgInput = { organizationId: z.string().nullable().default(null) };
const optionalText = (max: number) => z.string().max(max).nullable().default(null);
const ownerOf = (userId: string, context: { locals: { session?: { id: string } | null } }) => lockOwnerFrom(userId, context.locals.session?.id);

const supplierFields = {
  code: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(200),
  email: optionalText(254), country: optionalText(2), vatNumber: optionalText(32), address: optionalText(1000),
  paymentTermDays: z.number().int().min(0).max(365).default(30), active: z.boolean().default(true),
  iban: optionalText(34), bic: optionalText(11), sepaName: optionalText(70),
  crmCompanyId: z.string().uuid().nullable().default(null),
  crmContactId: z.string().uuid().nullable().default(null),
  trustedCatalogue: z.boolean().default(false),
  punchoutEnabled: z.boolean().default(false),
  punchoutSetupUrl: optionalText(2000),
  punchoutIdentity: optionalText(200),
  punchoutDomain: optionalText(200),
  punchoutSecret: optionalText(500),
};
const orderFields = {
  title: optionalText(200),
  supplierId: z.uuid(),
  warehouseId: z.uuid(),
  currency: z.string().trim().length(3),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: optionalText(5000),
  lines: z.array(z.object({
    sku: optionalText(64), description: optionalText(500),
    quantity: z.number().int().min(1).max(1_000_000), unitPrice: z.string().trim().min(1).max(24),
    kind: z.enum(["stock", "service"]).default("stock"),
    warehouseId: z.string().uuid().nullable().default(null),
  })).min(1).max(MAX_LINES),
};

export const purchasingActions = {
  bulk: bulkPurchasingLifecycle,

  createSupplier: defineAction({
    input: z.object({ ...orgInput, ...supplierFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requirePurchasingPermission(context, ["create"], input.organizationId);
      return yield* purchasingService.createSupplier(input);
    })),
  }),
  updateSupplier: defineAction({
    input: idInput.extend(supplierFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      yield* requirePurchasingResourcePermission(context, ["update"], id, "supplier");
      return yield* purchasingService.updateSupplier(id, input);
    })),
  }),
  deleteSupplier: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      yield* requirePurchasingResourcePermission(context, ["delete"], id, "supplier");
      return yield* purchasingService.deleteSupplier(id);
    })),
  }),

  create: defineAction({
    input: z.object({ ...orgInput, ...orderFields }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["create"], input.organizationId);
      return yield* purchasingService.createOrder(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend(orderFields),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], id);
      return yield* purchasingService.updateOrder(id, input, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(PURCHASE_ORDER_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const needed = input.to === "SENT" ? (["send"] as const) : (["update"] as const);
      const user = yield* requirePurchasingResourcePermission(context, needed, input.id);
      const row = yield* purchasingService.transition(input.id, input.to, ownerOf(user.id, context), { locale: lockLocaleFrom(context.request.headers) });
      if (row.status === "SENT" && input.to === "SENT") {
        yield* notifyPurchaseOrderSent(row.id, toLocale(lockLocaleFrom(context.request.headers) ?? "fr")).pipe(
          Effect.provideService(PrivateStorage, privateStorage()),
          Effect.catch(() => Effect.void),
        );
      }
      return row;
    })),
  }),
  receive: defineAction({
    input: idInput.extend({
      supplierReference: optionalText(100),
      notes: optionalText(5000),
      lines: z.array(z.object({ lineId: z.uuid(), quantity: z.number().int().min(0).max(1_000_000) })).min(1).max(MAX_LINES),
    }),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], id);
      return yield* purchasingService.receive(id, input, ownerOf(user.id, context), { locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  delete: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["delete"], id);
      return yield* purchasingService.deleteOrder(id, ownerOf(user.id, context), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], input.id);
      return yield* purchasingService.lock(input.id, ownerOf(user.id, context), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], input.id);
      yield* purchasingService.unlock(input.id, ownerOf(user.id, context));
      return { success: true };
    })),
  }),
saveSettings: defineAction({
    input: z.object({
      ...orgInput,
      reorderMode: z.enum(REORDER_MODES),
      reorderHour: z.number().int().min(0).max(23),
      reorderIncludeReservations: z.boolean(),
      reorderAutoSendTrustedOnly: z.boolean(),
      matchingMode: z.enum(MATCHING_MODES),
      matchingPolicy: z.enum(MATCHING_POLICIES),
      toleranceAbsoluteMinor: z.number().int().min(0),
      tolerancePercent: z.number().min(0).max(100),
      approvalMode: z.enum(APPROVAL_MODES),
      approvalThresholdMinor: z.number().int().min(0),
      defaultCurrency: z.string().trim().length(3),
      defaultPaymentTermDays: z.number().int().min(0).max(365),
      defaultTaxCategory: z.string().trim().min(1).max(32),
      allowServiceLines: z.boolean(),
      allowMultiWarehouse: z.boolean(),
      qualityControlRequired: z.boolean(),
      poPrefix: z.string().trim().min(1).max(8),
      receiptPrefix: z.string().trim().min(1).max(8),
      invoicePrefix: z.string().trim().min(1).max(8),
      creditPrefix: z.string().trim().min(1).max(8),
      returnPrefix: z.string().trim().min(1).max(8),
      sepaPrefix: z.string().trim().min(1).max(8),
      debtorName: z.string().trim().max(70).nullable().default(null),
      debtorIban: z.string().trim().max(34).nullable().default(null),
      debtorBic: z.string().trim().max(11).nullable().default(null),
      approvalBands: z.array(z.object({
        level: z.number().int().min(1).max(20),
        minMinor: z.number().int().min(0),
        maxMinor: z.number().int().positive().nullable(),
        requiredRole: z.enum(APPROVAL_ROLES),
        requiredPermission: z.string().trim().max(80).nullable().default(null),
      })).max(20).default([]),
      emailTemplates: z.array(z.object({
        locale: z.enum(["fr", "en", "es", "ar"]),
        purpose: z.enum(["po_send", "po_reminder", "return_notice"]),
        subject: z.string().trim().min(1).max(200),
        bodyHtml: z.string().trim().min(1).max(10_000),
      })).max(24).default([]),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["update"], input.organizationId);
      const { organizationId, approvalMode, approvalThresholdMinor, approvalBands, emailTemplates, ...rest } = input;
      return yield* purchasingSettingsService.save(organizationId, {
        ...rest,
        defaultCurrency: rest.defaultCurrency.toUpperCase(),
        poPrefix: rest.poPrefix.toUpperCase(),
        receiptPrefix: rest.receiptPrefix.toUpperCase(),
        invoicePrefix: rest.invoicePrefix.toUpperCase(),
        creditPrefix: rest.creditPrefix.toUpperCase(),
        returnPrefix: rest.returnPrefix.toUpperCase(),
        sepaPrefix: rest.sepaPrefix.toUpperCase(),
      }, { mode: approvalMode, thresholdMinor: approvalThresholdMinor, currency: rest.defaultCurrency.toUpperCase(), bands: approvalBands }, user.id, emailTemplates);
    })),
  }),
  approve: defineAction({
    input: idInput.extend({ decision: z.enum(["APPROVED", "REJECTED"]), comment: optionalText(1000) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["approve"], input.id);
      const result = yield* decidePurchaseApproval(input.id, actorFromUser(user, ["purchasing:approve"]), input.decision, input.comment, user.id);
      if (result.status === "APPROVED" && result.order.status === "SENT") {
        yield* notifyPurchaseOrderSent(result.order.id, toLocale(lockLocaleFrom(context.request.headers) ?? "fr")).pipe(
          Effect.provideService(PrivateStorage, privateStorage()),
          Effect.catch(() => Effect.void),
        );
      }
      return result.order;
    })),
  }),
  createInvoice: defineAction({
    input: z.object({
      ...orgInput,
      kind: z.enum(["invoice", "credit_note"]).default("invoice"),
      title: optionalText(200),
      supplierId: z.uuid(),
      orderId: z.uuid().nullable().default(null),
      sourceInvoiceId: z.uuid().nullable().default(null),
      supplierInvoiceNumber: optionalText(64),
      currency: z.string().trim().length(3),
      paymentTermDays: z.number().int().min(0).max(365).default(30),
      notes: optionalText(5000),
      lines: z.array(z.object({
        description: z.string().trim().min(1).max(500),
        quantity: z.number().int().min(1).max(1_000_000),
        unitPrice: z.string().trim().min(1).max(24),
        ratePercent: z.string().trim().max(8).optional(),
        kind: z.enum(["stock", "service"]).optional(),
        sku: optionalText(64),
        itemId: z.uuid().nullable().optional(),
        orderLineId: z.uuid().nullable().optional(),
        receiptLineId: z.uuid().nullable().optional(),
        accepted: z.boolean().optional(),
      })).min(1).max(MAX_LINES),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["invoice"], input.organizationId);
      return yield* purchasingInvoicesService.create(input, user.id);
    })),
  }),
  issueInvoice: defineAction({
    input: idInput,
    handler: effectHandler(({ id }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["invoice"], id, "invoice");
      return yield* purchasingInvoicesService.issue(id, user.id);
    })),
  }),
  acceptInvoiceVariances: defineAction({
    input: idInput.extend({ lineIds: z.array(z.uuid()).min(1) }),
    handler: effectHandler(({ id, lineIds }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["invoice"], id, "invoice");
      return yield* purchasingInvoicesService.acceptVariances(id, lineIds, user.id);
    })),
  }),
  recordPayment: defineAction({
    input: idInput.extend({
      amountMinor: z.number().int().positive(),
      method: z.enum(PAYMENT_METHODS),
      paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      reference: optionalText(100),
    }),
    handler: effectHandler(({ id, ...input }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["payment"], id, "invoice");
      return yield* purchasingInvoicesService.recordPayment(id, input, user.id);
    })),
  }),
  createReturn: defineAction({
    input: z.object({
      ...orgInput,
      supplierId: z.uuid(),
      warehouseId: z.uuid(),
      orderId: z.uuid().nullable().default(null),
      invoiceId: z.uuid().nullable().default(null),
      reason: z.enum(RETURN_REASONS),
      title: optionalText(200),
      notes: optionalText(5000),
      lines: z.array(z.object({
        sku: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1),
        itemId: z.uuid().nullable().optional(),
        receiptLineId: z.uuid().nullable().optional(),
        reason: z.enum(RETURN_REASONS).optional(),
      })).min(1).max(MAX_LINES),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["update"], input.organizationId);
      return yield* purchasingOpsService.createReturn(input, user.id);
    })),
  }),
  transitionReturn: defineAction({
    input: idInput.extend({ to: z.enum(["AUTHORIZED", "SHIPPED", "RECEIVED_BY_SUPPLIER", "CREDITED", "CANCELLED"]) }),
    handler: effectHandler(({ id, to }, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingResourcePermission(context, ["update"], id, "return");
      return yield* purchasingOpsService.transitionReturn(id, to, user.id);
    })),
  }),
  recordQualityCheck: defineAction({
    input: z.object({
      ...orgInput,
      receiptId: z.uuid(),
      notes: optionalText(2000),
      lines: z.array(z.object({
        receiptLineId: z.uuid(),
        accepted: z.number().int().min(0),
        rejected: z.number().int().min(0),
        notes: optionalText(500),
      })).min(1),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["update"], input.organizationId);
      return yield* purchasingOpsService.recordQualityCheck(input, user.id);
    })),
  }),
  allocateLandedCost: defineAction({
    input: z.object({
      ...orgInput,
      orderId: z.uuid(),
      invoiceId: z.uuid().nullable().default(null),
      category: z.enum(LANDED_COST_CATEGORIES),
      method: z.enum(LANDED_COST_METHODS),
      amountMinor: z.number().int().positive(),
      currency: z.string().trim().length(3),
      notes: optionalText(2000),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["invoice"], input.organizationId);
      return yield* purchasingOpsService.allocateLandedCost(input, user.id);
    })),
  }),
  exportSepa: defineAction({
    input: z.object({
      ...orgInput,
      invoiceIds: z.array(z.uuid()).min(1),
      requestedExecutionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["payment"], input.organizationId);
      return yield* purchasingOpsService.exportSepa(input, user.id).pipe(Effect.provideService(PrivateStorage, privateStorage()));
    })),
  }),
  importEinvoice: defineAction({
    input: z.object({
      ...orgInput,
      filename: z.string().trim().min(1).max(200),
      contentBase64: z.string().min(1).max(8_000_000),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["invoice"], input.organizationId);
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64"));
      return yield* purchasingOpsService.importEinvoice({ organizationId: input.organizationId, filename: input.filename, bytes }, user.id).pipe(
        Effect.provideService(PrivateStorage, privateStorage()),
      );
    })),
  }),
  saveReorderRule: defineAction({
    input: z.object({
      ...orgInput,
      itemId: z.uuid(),
      warehouseId: z.uuid(),
      minQty: z.number().int().min(0),
      maxQty: z.number().int().min(0),
      packQty: z.number().int().min(1),
      preferredSupplierId: z.uuid().nullable().default(null),
      active: z.boolean().default(true),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      yield* requirePurchasingPermission(context, ["update"], input.organizationId);
      return yield* purchasingOpsService.saveReorderRule(input);
    })),
  }),
  runReorder: defineAction({
    input: z.object({ ...orgInput }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["update"], input.organizationId);
      return yield* purchasingOpsService.runReorder(input.organizationId, user.id);
    })),
  }),

  startPunchOut: defineAction({
    input: z.object({
      ...orgInput,
      supplierId: z.uuid(),
      hookUrl: z.string().url(),
      buyerDomain: z.string().trim().min(1).max(64),
      buyerIdentity: z.string().trim().min(1).max(64),
    }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* requirePurchasingPermission(context, ["create"], input.organizationId);
      return yield* purchasingOpsService.startPunchOut({
        organizationId: input.organizationId,
        supplierId: input.supplierId,
        hookUrl: input.hookUrl,
        buyerIdentity: { domain: input.buyerDomain, identity: input.buyerIdentity, secret: "" },
      }, user.id);
    })),
  }),
};
