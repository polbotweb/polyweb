/**
 * Service Effect du portail client : rattachement des enregistrements à un compte (e-mail VÉRIFIÉ,
 * insensible à la casse), listes du client et accès unitaire STRICTEMENT limité à ses propres
 * enregistrements (IDOR : un identifiant d'autrui donne exactement le même résultat qu'un
 * identifiant inexistant — `null`).
 *
 * Propriété : `sales_documents.customer_user_id`, `bookings.customer_user_id`, `orders.user_id`.
 * Remboursements : ceux des paiements dont la référence `<purpose>:<id>` vise un de ces enregistrements.
 */
import { Effect } from "effect";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { user } from "@database/schemas/auth.schema";
import { refunds } from "@database/schemas/refunds.schema";
import { dbTry } from "@/lib/effect/run";
import { sales } from "@/modules/sales/schema";
import { bookings, bookingsResources } from "@/modules/bookings/schema";
import { orders } from "@/modules/shop/schema/orders";
import { canAttachByEmail, normalizeEmail, ownedPaymentReferences, PORTAL_SALES_KINDS, PORTAL_SALES_STATUSES } from "../domain/ownership";

export interface AttachResult {
  readonly invoices: number;
  readonly bookings: number;
  readonly orders: number;
}

const NONE: AttachResult = { invoices: 0, bookings: 0, orders: 0 };
const lowerEq = (column: typeof sales.customerEmail | typeof bookings.customerEmail | typeof orders.email, email: string) =>
  sql`lower(trim(${column})) = ${email}`;

/** Compte vérifié correspondant à `email` (insensible à la casse), sinon null. */
export const verifiedAccountIdFor = (email: string | null | undefined) =>
  Effect.gen(function* () {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const rows = yield* dbTry("portal.account.byEmail", () =>
      getDrizzle().select({ id: user.id }).from(user).where(and(eq(user.emailVerified, true), sql`lower(trim(${user.email})) = ${normalized}`)).limit(2));
    // Ambiguïté (deux comptes vérifiés ne différant que par la casse) : aucun rattachement.
    return rows.length === 1 ? rows[0]!.id : null;
  });

/**
 * Rattache au compte les enregistrements orphelins (sans propriétaire) portant son e-mail.
 * Sans effet si l'e-mail du compte n'est pas vérifié. Idempotent.
 */
export const attachVerifiedRecords = (userId: string) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const [account] = yield* dbTry("portal.attach.account", () =>
      db.select({ id: user.id, email: user.email, emailVerified: user.emailVerified }).from(user).where(eq(user.id, userId)).limit(1));
    if (!account || !canAttachByEmail(account, account.email)) return NONE;
    if ((yield* verifiedAccountIdFor(account.email)) !== account.id) return NONE;
    const email = normalizeEmail(account.email)!;
    const invoices = yield* dbTry("portal.attach.sales", () =>
      db.update(sales).set({ customerUserId: account.id }).where(and(isNull(sales.customerUserId), lowerEq(sales.customerEmail, email))).returning({ id: sales.id }));
    const booked = yield* dbTry("portal.attach.bookings", () =>
      db.update(bookings).set({ customerUserId: account.id }).where(and(isNull(bookings.customerUserId), lowerEq(bookings.customerEmail, email))).returning({ id: bookings.id }));
    const ordered = yield* dbTry("portal.attach.orders", () =>
      db.update(orders).set({ userId: account.id }).where(and(isNull(orders.userId), lowerEq(orders.email, email))).returning({ id: orders.id }));
    return { invoices: invoices.length, bookings: booked.length, orders: ordered.length } satisfies AttachResult;
  });

/**
 * Rattachement rétroactif de tous les comptes vérifiés (`pnpm db:backfill-customer-links`).
 * Un e-mail partagé (insensible à la casse) par plusieurs comptes vérifiés est ignoré.
 */
export const backfillCustomerLinks = () =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const match = (column: string) => sql.raw(`(select u.id from "user" u where u.email_verified and lower(trim(u.email)) = lower(trim(${column}))
      and (select count(*) from "user" v where v.email_verified and lower(trim(v.email)) = lower(trim(u.email))) = 1)`);
    const invoices = yield* dbTry("portal.backfill.sales", () =>
      db.update(sales).set({ customerUserId: match("sales_documents.customer_email") }).where(and(isNull(sales.customerUserId), sql`${match("sales_documents.customer_email")} is not null`)).returning({ id: sales.id }));
    const booked = yield* dbTry("portal.backfill.bookings", () =>
      db.update(bookings).set({ customerUserId: match("bookings.customer_email") }).where(and(isNull(bookings.customerUserId), sql`${match("bookings.customer_email")} is not null`)).returning({ id: bookings.id }));
    const ordered = yield* dbTry("portal.backfill.orders", () =>
      db.update(orders).set({ userId: match("orders.email") }).where(and(isNull(orders.userId), sql`${match("orders.email")} is not null`)).returning({ id: orders.id }));
    return { invoices: invoices.length, bookings: booked.length, orders: ordered.length } satisfies AttachResult;
  });

const ownedInvoiceWhere = (userId: string) =>
  and(eq(sales.customerUserId, userId), inArray(sales.kind, [...PORTAL_SALES_KINDS]), inArray(sales.status, [...PORTAL_SALES_STATUSES]));

/** Tout l'espace client d'un compte (listes triées du plus récent au plus ancien). */
export const portalOverview = (userId: string) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const invoices = yield* dbTry("portal.invoices", () => db.select({
      id: sales.id, organizationId: sales.organizationId, kind: sales.kind, number: sales.number, title: sales.title, status: sales.status,
      currency: sales.currency, issueDate: sales.issueDate, dueDate: sales.dueDate, grossMinor: sales.grossMinor, paidMinor: sales.paidMinor, creditedMinor: sales.creditedMinor,
    }).from(sales).where(ownedInvoiceWhere(userId)).orderBy(desc(sales.issueDate), desc(sales.createdAt)).limit(100));
    const myOrders = yield* dbTry("portal.orders", () => db.select({
      id: orders.id, organizationId: orders.organizationId, number: orders.number, status: orders.status, currency: orders.currency, grossMinor: orders.grossMinor, createdAt: orders.createdAt,
    }).from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(100));
    const myBookings = yield* dbTry("portal.bookings", () => db.select({
      id: bookings.id, organizationId: bookings.organizationId, number: bookings.number, slug: bookings.slug, status: bookings.status,
      startsAt: bookings.startsAt, endsAt: bookings.endsAt, resourceName: bookingsResources.name, timezone: bookingsResources.timezone,
    }).from(bookings).innerJoin(bookingsResources, eq(bookingsResources.id, bookings.resourceId)).where(eq(bookings.customerUserId, userId)).orderBy(desc(bookings.startsAt)).limit(100));
    const references = ownedPaymentReferences({ invoiceIds: invoices.map((i) => i.id), orderIds: myOrders.map((o) => o.id), bookingIds: myBookings.map((b) => b.id) });
    const myRefunds = references.length === 0 ? [] : yield* dbTry("portal.refunds", () => db.select({
      id: refunds.id, reference: refunds.reference, status: refunds.status, amount: refunds.amount, currency: refunds.currency, reason: refunds.reason, createdAt: refunds.createdAt, succeededAt: refunds.succeededAt,
    }).from(refunds).where(inArray(refunds.reference, references)).orderBy(desc(refunds.createdAt)).limit(100));
    return { invoices, orders: myOrders, bookings: myBookings, refunds: myRefunds };
  });

export type PortalOverview = Effect.Success<ReturnType<typeof portalOverview>>;

/** Facture/avoir émis du compte, sinon null (inexistant ou d'autrui : indiscernables). */
export const ownedInvoice = (userId: string, id: string) =>
  dbTry("portal.invoice", () => getDrizzle().select({ id: sales.id, organizationId: sales.organizationId }).from(sales).where(and(eq(sales.id, id), ownedInvoiceWhere(userId))).limit(1))
    .pipe(Effect.map((rows) => rows[0] ?? null));

/** Réservation du compte, sinon null. */
export const ownedBooking = (userId: string, id: string) =>
  dbTry("portal.booking", () => getDrizzle().select({ id: bookings.id, organizationId: bookings.organizationId }).from(bookings).where(and(eq(bookings.id, id), eq(bookings.customerUserId, userId))).limit(1))
    .pipe(Effect.map((rows) => rows[0] ?? null));

/** Commande du compte, sinon null. */
export const ownedOrder = (userId: string, id: string) =>
  dbTry("portal.order", () => getDrizzle().select({ id: orders.id, organizationId: orders.organizationId }).from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId))).limit(1))
    .pipe(Effect.map((rows) => rows[0] ?? null));
