/** File de modération compétente pour un site : plateforme (`/admin/moderation`) ou organisation. */
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { organization } from "@database/schemas/auth.schema";
import { dbTry } from "@/lib/effect/run";

export const moderationQueueUrl = (locale: string, organizationId: string | null) =>
  organizationId === null
    ? Effect.succeed(`/${locale}/admin/moderation`)
    : dbTry("forums.moderationLink", () => getDrizzle().select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId)).limit(1)).pipe(
        Effect.map(([org]) => (org?.slug ? `/${locale}/organizations/${org.slug}/moderation` : `/${locale}/admin/moderation`)),
      );
