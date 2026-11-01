/**
 * Point unique d'écriture de l'état d'un abonnement (actions client et événements fournisseur).
 * Enregistre dans l'outbox de la même transaction :
 * - `subscription.created` quand l'abonnement quitte `incomplete` (souscription confirmée) ;
 * - `subscription.canceled` quand il devient `cancelled` ;
 * - `subscription.updated` pour tout autre changement visible (statut, formule, tarif,
 *   résiliation en fin de période, échéance) — rien si l'écriture ne change rien.
 */
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { serializeSubscription } from "../api/public-api";
import { subscriptions } from "../schema";

type Row = typeof subscriptions.$inferSelect;

const time = (d: Date | null) => d?.getTime() ?? null;

/** Événement publié pour la transition `before` → `after` (null = rien de visible). */
export const subscriptionEventFor = (before: Row, after: Row): "subscription.created" | "subscription.updated" | "subscription.canceled" | null => {
  if (after.status === "cancelled") return before.status === "cancelled" ? null : "subscription.canceled";
  if (before.status === "incomplete" && after.status !== "incomplete") return "subscription.created";
  if (after.status === "incomplete") return null;
  const changed = before.status !== after.status || before.planId !== after.planId || before.priceId !== after.priceId
    || before.cancelAtPeriodEnd !== after.cancelAtPeriodEnd || time(before.currentPeriodEnd) !== time(after.currentPeriodEnd);
  return changed ? "subscription.updated" : null;
};

export const writeSubscriptionState = (tx: DbTransaction, before: Row, patch: Partial<Row>, operation: string) =>
  Effect.gen(function* () {
    const [row] = yield* dbTry(operation, () => tx.update(subscriptions).set(patch).where(eq(subscriptions.id, before.id)).returning());
    const name = row ? subscriptionEventFor(before, row) : null;
    if (row && name) yield* recordEvent(tx, name, serializeSubscription(row), { organizationId: row.organizationId ?? null });
    return row;
  });
