/**
 * Règles pures du portail client : quels documents un client voit, quelles références de paiement
 * lui appartiennent, quand un rattachement par e-mail est permis.
 *
 * Rattachement : uniquement vers un compte dont l'e-mail est VÉRIFIÉ, comparaison insensible à la
 * casse (après `trim`). Un e-mail non vérifié ne donne jamais accès à rien.
 */
import { BOOKING_PAYMENT_PURPOSE } from "@/modules/bookings/payments";
import { SALES_PAYMENT_PURPOSE } from "@/modules/sales/payments";
import { SHOP_ORDER_PAYMENT_PURPOSE } from "@/modules/shop/services/order.service";

/** Factures et avoirs émis (jamais de brouillon ni de devis interne). */
export const PORTAL_SALES_KINDS = ["invoice", "credit_note"] as const;
export const PORTAL_SALES_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID", "CREDITED", "CANCELLED"] as const;

/** E-mail normalisé pour la comparaison (null si vide). */
export const normalizeEmail = (email: string | null | undefined): string | null => {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
};

export interface AccountIdentity {
  readonly email: string;
  readonly emailVerified: boolean;
}

/** Un enregistrement portant `recordEmail` peut-il être rattaché à ce compte ? */
export const canAttachByEmail = (account: AccountIdentity, recordEmail: string | null | undefined): boolean => {
  if (!account.emailVerified) return false;
  const mine = normalizeEmail(account.email);
  return mine !== null && mine === normalizeEmail(recordEmail);
};

export interface OwnedIds {
  readonly invoiceIds: readonly string[];
  readonly orderIds: readonly string[];
  readonly bookingIds: readonly string[];
}

/** Références `<purpose>:<id>` des paiements du client (filtre des remboursements). */
export const ownedPaymentReferences = ({ invoiceIds, orderIds, bookingIds }: OwnedIds): string[] => [
  ...invoiceIds.map((id) => `${SALES_PAYMENT_PURPOSE}:${id}`),
  ...orderIds.map((id) => `${SHOP_ORDER_PAYMENT_PURPOSE}:${id}`),
  ...bookingIds.map((id) => `${BOOKING_PAYMENT_PURPOSE}:${id}`),
];
