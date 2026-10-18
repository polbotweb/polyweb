import { and, eq, isNull } from "drizzle-orm";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { serviceAttributeDefinitions, serviceAttributeValues } from "@database/schemas";
import { assertServiceInTenant, assertServiceLockOwner, assertServicePermission, resolveServiceTenant, serviceOrganizationIdSchema } from "./_helpers";
import { auditService, invalidateServicesCache } from "./_helpers";

const attributeDefinitionInput = z.object({ organizationId: serviceOrganizationIdSchema, key: z.string().trim().regex(/^[a-z][a-z0-9_]*$/), label: z.string().trim().min(1).max(120), type: z.enum(["STRING", "NUMBER", "BOOLEAN", "SELECT"]), options: z.array(z.string().trim().min(1).max(120)).max(100).default([]), required: z.boolean().default(false), sortOrder: z.coerce.number().int().min(0).max(100_000).default(0) }).superRefine((value, ctx) => { if (value.type !== "SELECT" && value.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Options are only valid for SELECT attributes." }); if (value.type === "SELECT" && value.options.length === 0) ctx.addIssue({ code: "custom", path: ["options"], message: "SELECT attributes require at least one option." }); });

async function assertAttributeDefinitionInTenant(definitionId: string, tenant: ReturnType<typeof resolveServiceTenant>) {
  const tenantPredicate = tenant.organizationId === null ? isNull(serviceAttributeDefinitions.organizationId) : eq(serviceAttributeDefinitions.organizationId, tenant.organizationId);
  const [definition] = await getDrizzle().select().from(serviceAttributeDefinitions).where(and(eq(serviceAttributeDefinitions.id, definitionId), tenantPredicate)).limit(1);
  if (!definition) throw new ActionError({ code: "FORBIDDEN", message: "Cet attribut n'appartient pas à ce tenant." });
  return definition;
}

export const createServiceAttributeDefinition = defineAction({
  input: attributeDefinitionInput,
  handler: async (input, context) => {
    const tenant = resolveServiceTenant(input); const user = await assertServicePermission(context, tenant, { service: ["update"] }); const db = getDrizzle();
    const tenantPredicate = tenant.organizationId === null ? isNull(serviceAttributeDefinitions.organizationId) : eq(serviceAttributeDefinitions.organizationId, tenant.organizationId);
    const existing = await db.select({ id: serviceAttributeDefinitions.id }).from(serviceAttributeDefinitions).where(and(eq(serviceAttributeDefinitions.key, input.key), tenantPredicate)).limit(1);
    if (existing.length) throw new ActionError({ code: "CONFLICT", message: "Cette clé d'attribut existe déjà pour ce tenant." });
    const [row] = await db.insert(serviceAttributeDefinitions).values({ organizationId: tenant.organizationId, key: input.key, label: input.label, type: input.type, options: input.options.length ? JSON.stringify(input.options) : null, required: input.required, sortOrder: input.sortOrder }).returning();
    auditService(context, user.id, "SERVICE_UPDATE", { resource: "serviceAttributeDefinitions", resourceId: row.id, metadata: { organizationId: tenant.organizationId, action: "CREATE" } }); invalidateServicesCache(); return row;
  },
});

export const setServiceAttributeValue = defineAction({
  input: z.object({ serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema, definitionId: z.uuid(), stringValue: z.string().max(5000).optional().nullable(), numberValue: z.coerce.number().int().optional().nullable(), booleanValue: z.boolean().optional().nullable(), selectedValue: z.string().max(5000).optional().nullable() }),
  handler: async (input, context) => {
    const tenant = resolveServiceTenant(input); const user = await assertServicePermission(context, tenant, { service: ["update"] }); await assertServiceInTenant(input.serviceId, tenant); await assertServiceLockOwner(input.serviceId, user.id, context.locals.session?.id); const definition = await assertAttributeDefinitionInTenant(input.definitionId, tenant);
    const supplied = [input.stringValue != null, input.numberValue != null, input.booleanValue != null, input.selectedValue != null].filter(Boolean).length;
    if (supplied !== 1) throw new ActionError({ code: "BAD_REQUEST", message: "Une seule valeur non nulle doit être fournie." });
    if (definition.type === "STRING" && input.stringValue == null) throw new ActionError({ code: "BAD_REQUEST", message: "Une valeur texte est requise." });
    if (definition.type === "NUMBER" && input.numberValue == null) throw new ActionError({ code: "BAD_REQUEST", message: "Une valeur numérique est requise." });
    if (definition.type === "BOOLEAN" && input.booleanValue == null) throw new ActionError({ code: "BAD_REQUEST", message: "Une valeur booléenne est requise." });
    if (definition.type === "SELECT") { if (input.selectedValue == null) throw new ActionError({ code: "BAD_REQUEST", message: "Une option est requise." }); let options: string[] = []; try { options = definition.options ? JSON.parse(definition.options) as string[] : []; } catch { throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "La définition de l'attribut est invalide." }); } if (!options.includes(input.selectedValue)) throw new ActionError({ code: "BAD_REQUEST", message: "Option d'attribut invalide." }); }
    if ((definition.type !== "STRING" && input.stringValue != null) || (definition.type !== "NUMBER" && input.numberValue != null) || (definition.type !== "BOOLEAN" && input.booleanValue != null) || (definition.type !== "SELECT" && input.selectedValue != null)) throw new ActionError({ code: "BAD_REQUEST", message: "Le type de valeur ne correspond pas à l'attribut." });
    const db = getDrizzle();
    await db.insert(serviceAttributeValues).values({ serviceId: input.serviceId, definitionId: input.definitionId, stringValue: input.stringValue ?? null, numberValue: input.numberValue ?? null, booleanValue: input.booleanValue ?? null, selectedValue: input.selectedValue ?? null }).onConflictDoUpdate({ target: [serviceAttributeValues.serviceId, serviceAttributeValues.definitionId], set: { stringValue: input.stringValue ?? null, numberValue: input.numberValue ?? null, booleanValue: input.booleanValue ?? null, selectedValue: input.selectedValue ?? null, updatedAt: new Date() } });
    auditService(context, user.id, "SERVICE_UPDATE", { resource: "serviceAttributeValues", resourceId: input.serviceId, metadata: { organizationId: tenant.organizationId, definitionId: input.definitionId } }); invalidateServicesCache(); return { success: true };
  },
});
