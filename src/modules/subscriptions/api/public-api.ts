/**
 * API publique du module Abonnements (lecture seule, `subscriptions:read`).
 * Les identifiants du prestataire de paiement ne sont jamais exposés.
 */
import { desc, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import type { ApiObjectSchema, ApiResourceDefinition, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { SUBSCRIPTION_STATUSES } from "../domain/lifecycle";
import { subscriptions } from "../schema";

type SubscriptionRow = typeof subscriptions.$inferSelect;

export const serializeSubscription = (r: SubscriptionRow) => ({
  id: r.id,
  status: r.status,
  planId: r.planId,
  priceId: r.priceId,
  customer: { email: r.customerEmail, name: r.customerName, country: r.customerCountry, type: r.customerType },
  cancelAtPeriodEnd: r.cancelAtPeriodEnd,
  currentPeriodEnd: iso(r.currentPeriodEnd),
  cancelledAt: iso(r.cancelledAt),
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const reader = tableReader<SubscriptionRow, ReturnType<typeof serializeSubscription>>(
  {
    name: "subscriptions",
    columns: { id: subscriptions.id, createdAt: subscriptions.createdAt, organizationId: subscriptions.organizationId },
    select: (where, limit) => getDrizzle().select().from(subscriptions).where(where).orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(limit),
    filters: [
      { name: "status", description: "Statut.", values: SUBSCRIPTION_STATUSES, where: (v) => eq(subscriptions.status, v as SubscriptionRow["status"]) },
      { name: "planId", description: "Formule.", where: (v) => eq(subscriptions.planId, v) },
      { name: "customerEmail", description: "E-mail client exact.", where: (v) => eq(subscriptions.customerEmail, v.trim().toLowerCase()) },
    ],
  },
  serializeSubscription,
);

const schema: ApiObjectSchema = {
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: SUBSCRIPTION_STATUSES },
    planId: { type: "string" },
    priceId: { type: "string" },
    customer: { type: "object", description: "email, name, country, type." },
    cancelAtPeriodEnd: { type: "boolean" },
    currentPeriodEnd: { type: "string", format: "date-time", nullable: true },
    cancelledAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time", nullable: true },
  },
  required: ["id", "status", "planId", "priceId", "customer", "cancelAtPeriodEnd", "createdAt"],
};

export const subscriptionsResource: ApiResourceDefinition<unknown> = {
  name: "subscriptions",
  module: "subscriptions",
  description: "Abonnements clients.",
  scope: "subscriptions:read",
  filters: reader.filters,
  schema,
  list: reader.list,
  get: reader.get,
};

export const subscriptionsApi: ModuleApiDeclaration = {
  module: "subscriptions",
  resources: [subscriptionsResource],
  events: [
    { name: "subscription.created", description: "Abonnement créé." },
    { name: "subscription.updated", description: "Abonnement modifié (statut, période, résiliation programmée)." },
    { name: "subscription.canceled", description: "Abonnement résilié." },
  ],
};
