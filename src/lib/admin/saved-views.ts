/** Lecture SSR des vues enregistrées de l'utilisateur courant (propriété : filtrées par userId). */
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { adminSavedViews } from "@database/schemas";

export const loadSavedViews = (userId: string, resource: string, organizationId: string | null) =>
  getDrizzle().select({ id: adminSavedViews.id, name: adminSavedViews.name, query: adminSavedViews.query }).from(adminSavedViews)
    .where(and(eq(adminSavedViews.userId, userId), eq(adminSavedViews.resource, resource), organizationId === null ? isNull(adminSavedViews.organizationId) : eq(adminSavedViews.organizationId, organizationId)))
    .orderBy(asc(adminSavedViews.name));
