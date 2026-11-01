/**
 * API publique du module CRM : contacts et sociétés (lecture `crm:read`,
 * création / mise à jour `crm:write`) + événements `contact.*`.
 * PATCH = fusion avec la fiche existante, lue D'ABORD dans le tenant de la clé
 * (aucune écriture possible sur une fiche d'une autre organisation : 404).
 */
import { desc, eq, ilike, or } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { ApiObjectSchema, ApiResourceDefinition, ApiTenant, ModuleApiDeclaration } from "@/core/api/contract";
import { iso, tableReader } from "@/core/api/table";
import { NotFoundError } from "@/lib/effect/errors";
import { decode } from "@/lib/effect/schema";
import { crmCompanies, crmContacts } from "../schema";
import { crmService } from "../services/crm.service";

type ContactRow = typeof crmContacts.$inferSelect;
type CompanyRow = typeof crmCompanies.$inferSelect;

const Text = (max: number) => Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(max))));

export const serializeContact = (r: ContactRow) => ({
  id: r.id,
  firstName: r.firstName,
  lastName: r.lastName,
  email: r.email,
  phone: r.phone,
  jobTitle: r.jobTitle,
  companyId: r.companyId,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

export const serializeCompany = (r: CompanyRow) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  website: r.website,
  country: r.country,
  vatNumber: r.vatNumber,
  address: r.address,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
  updatedAt: iso(r.updatedAt),
});

const s = (description?: string) => ({ type: "string" as const, nullable: true, ...(description ? { description } : {}) });
const stamps = { createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time", nullable: true } } as const;

const contactFields = { firstName: s(), lastName: { type: "string" as const }, email: s(), phone: s(), jobTitle: s(), companyId: s("Société (même organisation)."), notes: s() };
const companyFields = { name: { type: "string" as const }, email: s(), phone: s(), website: s(), country: s("ISO 3166-1 alpha-2."), vatNumber: s(), address: s(), notes: s() };

const ContactCreate = Schema.Struct({
  firstName: Text(120), lastName: Schema.String.check(Schema.isMaxLength(120)), email: Text(254), phone: Text(40), jobTitle: Text(120), companyId: Text(64), notes: Text(5000),
});
const ContactPatch = Schema.Struct({
  firstName: Text(120), lastName: Schema.optional(Schema.String.check(Schema.isMaxLength(120))), email: Text(254), phone: Text(40), jobTitle: Text(120), companyId: Text(64), notes: Text(5000),
});
const CompanyCreate = Schema.Struct({
  name: Schema.String.check(Schema.isMaxLength(200)), email: Text(254), phone: Text(40), website: Text(500), country: Text(2), vatNumber: Text(40), address: Text(1000), notes: Text(5000),
});
const CompanyPatch = Schema.Struct({
  name: Schema.optional(Schema.String.check(Schema.isMaxLength(200))), email: Text(254), phone: Text(40), website: Text(500), country: Text(2), vatNumber: Text(40), address: Text(1000), notes: Text(5000),
});

const search = (columns: ReadonlyArray<Parameters<typeof ilike>[0]>) => (value: string) =>
  or(...columns.map((c) => ilike(c, `%${value.replace(/[%_\\]/g, (m) => `\\${m}`)}%`)));

const contacts = tableReader<ContactRow, ReturnType<typeof serializeContact>>(
  {
    name: "contacts",
    columns: { id: crmContacts.id, createdAt: crmContacts.createdAt, organizationId: crmContacts.organizationId },
    select: (where, limit) => getDrizzle().select().from(crmContacts).where(where).orderBy(desc(crmContacts.createdAt), desc(crmContacts.id)).limit(limit),
    filters: [
      { name: "q", description: "Recherche (nom, prénom, e-mail).", where: search([crmContacts.lastName, crmContacts.firstName, crmContacts.email]) },
      { name: "email", description: "E-mail exact (normalisé en minuscules).", where: (v) => eq(crmContacts.email, v.trim().toLowerCase()) },
      { name: "companyId", description: "Société.", where: (v) => eq(crmContacts.companyId, v) },
    ],
  },
  serializeContact,
);

const companies = tableReader<CompanyRow, ReturnType<typeof serializeCompany>>(
  {
    name: "companies",
    columns: { id: crmCompanies.id, createdAt: crmCompanies.createdAt, organizationId: crmCompanies.organizationId },
    select: (where, limit) => getDrizzle().select().from(crmCompanies).where(where).orderBy(desc(crmCompanies.createdAt), desc(crmCompanies.id)).limit(limit),
    filters: [
      { name: "q", description: "Recherche (nom, e-mail).", where: search([crmCompanies.name, crmCompanies.email]) },
      { name: "country", description: "Pays (ISO alpha-2).", where: (v) => eq(crmCompanies.country, v.trim().toUpperCase()) },
    ],
  },
  serializeCompany,
);

const mustExist = <R>(entity: string, id: string) => (row: R | undefined) =>
  row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity, id }));

/** Retire les clés `undefined` (PATCH : seules les clés présentes écrasent). */
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const contactSchema: ApiObjectSchema = { properties: { id: { type: "string" }, ...contactFields, ...stamps }, required: ["id", "lastName", "createdAt"] };
const companySchema: ApiObjectSchema = { properties: { id: { type: "string" }, ...companyFields, ...stamps }, required: ["id", "name", "createdAt"] };

export const contactsResource: ApiResourceDefinition<ReturnType<typeof serializeContact>> = {
  name: "contacts",
  module: "crm",
  description: "Contacts CRM de l'organisation du site.",
  scope: "crm:read",
  writeScope: "crm:write",
  filters: contacts.filters,
  schema: contactSchema,
  inputSchema: { properties: contactFields, required: ["lastName"] },
  list: contacts.list,
  get: contacts.get,
  create: (tenant: ApiTenant, body: unknown) =>
    decode(ContactCreate)(body).pipe(
      Effect.flatMap((input) => crmService.createContact({ ...input, organizationId: tenant.organizationId }, tenant.actorUserId)),
      Effect.map(serializeContact),
    ),
  update: (tenant: ApiTenant, id: string, body: unknown) =>
    Effect.gen(function* () {
      const patch = yield* decode(ContactPatch)(body);
      const current = yield* contacts.find(tenant, id).pipe(Effect.flatMap(mustExist<ContactRow>("Contact", id)));
      const row = yield* crmService.updateContact(id, { ...current, ...defined(patch) });
      return serializeContact(row);
    }),
};

export const companiesResource: ApiResourceDefinition<ReturnType<typeof serializeCompany>> = {
  name: "companies",
  module: "crm",
  description: "Sociétés CRM de l'organisation du site.",
  scope: "crm:read",
  writeScope: "crm:write",
  filters: companies.filters,
  schema: companySchema,
  inputSchema: { properties: companyFields, required: ["name"] },
  list: companies.list,
  get: companies.get,
  create: (tenant: ApiTenant, body: unknown) =>
    decode(CompanyCreate)(body).pipe(
      Effect.flatMap((input) => crmService.createCompany({ ...input, organizationId: tenant.organizationId }, tenant.actorUserId)),
      Effect.map(serializeCompany),
    ),
  update: (tenant: ApiTenant, id: string, body: unknown) =>
    Effect.gen(function* () {
      const patch = yield* decode(CompanyPatch)(body);
      const current = yield* companies.find(tenant, id).pipe(Effect.flatMap(mustExist<CompanyRow>("Company", id)));
      const row = yield* crmService.updateCompany(id, { ...current, ...defined(patch) });
      return serializeCompany(row);
    }),
};

export const crmApi: ModuleApiDeclaration = {
  module: "crm",
  resources: [contactsResource as ApiResourceDefinition<unknown>, companiesResource as ApiResourceDefinition<unknown>],
  events: [
    { name: "contact.created", description: "Contact CRM créé (admin, formulaire ou API)." },
    { name: "contact.updated", description: "Contact CRM modifié." },
  ],
};
