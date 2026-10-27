/** Lecture du profil vendeur d'un tenant (`null` = plateforme). */
import { Effect } from "effect";
import { eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { salesSellerProfiles } from "../schema";
import type { SellerProfile } from "../domain/seller-profile";

export type SellerProfileRow = typeof salesSellerProfiles.$inferSelect;

export const toSellerProfile = (row: SellerProfileRow): SellerProfile => ({
  legalName: row.legalName, vatNumber: row.vatNumber, legalId: row.legalId, legalIdScheme: row.legalIdScheme,
  addressLine1: row.addressLine1, addressLine2: row.addressLine2, postcode: row.postcode, city: row.city,
  country: row.country, email: row.email, iban: row.iban, bic: row.bic,
});

export const sellerProfileOf = (organizationId: string | null) =>
  dbTry("sales.sellerProfile", () => getDrizzle().select().from(salesSellerProfiles)
    .where(organizationId === null ? isNull(salesSellerProfiles.organizationId) : eq(salesSellerProfiles.organizationId, organizationId)).limit(1))
    .pipe(Effect.map(([row]) => row ?? null));

/** Adaptateur Promise (pages Astro). */
export const loadSellerProfile = (organizationId: string | null): Promise<SellerProfileRow | null> => runOrThrow(sellerProfileOf(organizationId));
