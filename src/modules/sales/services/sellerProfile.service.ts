/**
 * Écriture du profil vendeur d'un tenant : normalisation/validation pure puis upsert
 * transactionnel (ligne verrouillée `FOR UPDATE` ; course à la création → index unique).
 */
import { Effect } from "effect";
import { eq, isNull } from "drizzle-orm";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { salesSellerProfiles } from "../schema";
import { normalizeSellerProfile, type SellerProfileInput } from "../domain/seller-profile";

export const sellerProfileService = {
  save: (input: SellerProfileInput, organizationId: string | null, authorId: string) =>
    Effect.gen(function* () {
      const profile = yield* normalizeSellerProfile(input).pipe(Effect.catchTag("InvalidSellerProfileError", (error) => fail("BAD_REQUEST", error.message)));
      return yield* dbTransaction("sales.sellerProfile.save", (tx) =>
        Effect.gen(function* () {
          const tenant = organizationId === null ? isNull(salesSellerProfiles.organizationId) : eq(salesSellerProfiles.organizationId, organizationId);
          const [existing] = yield* dbTry("sales.sellerProfile.lock", () => tx.select({ id: salesSellerProfiles.id }).from(salesSellerProfiles).where(tenant).limit(1).for("update"));
          const [row] = existing
            ? yield* dbTry("sales.sellerProfile.update", () => tx.update(salesSellerProfiles).set({ ...profile, updatedBy: authorId }).where(eq(salesSellerProfiles.id, existing.id)).returning())
            : yield* dbTry("sales.sellerProfile.insert", () => tx.insert(salesSellerProfiles).values({ ...profile, organizationId, updatedBy: authorId }).returning());
          return row!;
        }),
      );
    }),
};
