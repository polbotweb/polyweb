/**
 * Génération du document OpenAPI 3.1 de l'API v1 (brique c).
 * Les schémas des données sont dérivés des définitions de champs de chaque
 * type de contenu (créés depuis l'admin) : le document est donc dynamique.
 */
import type { FieldDefinition } from '@/core/content-types/fields';
import type { ContentType } from '@/modules/content/domain/content-types';
import { API_SCOPES } from '@database/schemas/api.schema';

type JsonSchema = Record<string, unknown>;

export function fieldToJsonSchema(f: FieldDefinition): JsonSchema {
  const description = f.helpText;
  const base = (s: JsonSchema): JsonSchema => (description ? { ...s, description } : s);
  switch (f.type) {
    case 'text':
    case 'textarea':
    case 'markdown':
      return base({
        type: 'string',
        ...(f.min !== undefined ? { minLength: f.min } : {}),
        maxLength: f.max ?? (f.type === 'text' ? 500 : 100_000),
        ...(f.pattern ? { pattern: f.pattern } : {}),
      });
    case 'email':
      return base({ type: 'string', format: 'email' });
    case 'url':
    case 'media':
      return base({ type: 'string', format: 'uri-reference', maxLength: 2000 });
    case 'number':
      return base({ type: 'number', ...(f.min !== undefined ? { minimum: f.min } : {}), ...(f.max !== undefined ? { maximum: f.max } : {}) });
    case 'boolean':
      return base({ type: 'boolean' });
    case 'date':
      return base({ type: 'string', format: 'date' });
    case 'datetime':
      return base({ type: 'string', format: 'date-time' });
    case 'select':
      return base({ type: 'string', enum: (f.options ?? []).map((o) => o.value) });
    case 'multiselect':
      return base({ type: 'array', items: { type: 'string', enum: (f.options ?? []).map((o) => o.value) }, uniqueItems: true });
    case 'relation':
      return base(f.multiple ? { type: 'array', items: { type: 'string', format: 'uuid' } } : { type: 'string', format: 'uuid' });
    case 'json':
      return base({});
  }
}

function dataSchema(fields: readonly FieldDefinition[], scope: 'shared' | 'localized'): JsonSchema {
  const selected = fields.filter((f) => (scope === 'shared' ? !f.localized : f.localized));
  return {
    type: 'object',
    properties: Object.fromEntries(selected.map((f) => [f.name, fieldToJsonSchema(f)])),
    required: selected.filter((f) => f.required).map((f) => f.name),
    additionalProperties: false,
  };
}

const pascal = (slug: string) => slug.replace(/(^|[-_])([a-z0-9])/g, (_m, _s, c: string) => c.toUpperCase());

const problem = { $ref: '#/components/schemas/Problem' };
const errors = (codes: number[]) =>
  Object.fromEntries(codes.map((c) => [String(c), { description: `Error ${c}`, content: { 'application/json': { schema: problem } } }]));

export function buildOpenApiDocument(opts: {
  baseUrl: string;
  siteName: string;
  locales: readonly string[];
  types: readonly ContentType[];
  /** Types visibles : sans jeton, seulement ceux en lecture publique. */
}): Record<string, unknown> {
  const schemas: Record<string, JsonSchema> = {
    Problem: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        message: { type: 'string' },
        issues: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } },
      },
      required: ['error', 'message'],
    },
    Seo: {
      type: 'object',
      properties: {
        metaTitle: { type: 'string', maxLength: 160 },
        metaDescription: { type: 'string', maxLength: 320 },
        ogImage: { type: 'string' },
        noindex: { type: 'boolean' },
      },
    },
    BlocksDocument: {
      type: 'object',
      description: 'Document de blocs Polyweb (version + liste de blocs typés : richText TipTap, heading, image, quote, code, embed, callout, cta, divider…).',
      properties: { version: { const: 1 }, blocks: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string' }, data: {} }, required: ['type'] } } },
    },
    ContentType: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        fields: { type: 'array', items: { type: 'object' } },
        settings: { type: 'object' },
      },
    },
    Pagination: {
      type: 'object',
      properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, pages: { type: 'integer' } },
    },
  };

  const localeParam = { name: 'locale', in: 'query', schema: { type: 'string', enum: [...opts.locales] }, description: 'Aplatit la traduction demandée (repli sur la langue par défaut).' };
  const paths: Record<string, unknown> = {
    '/content-types': {
      get: {
        operationId: 'listContentTypes',
        summary: 'Liste des types de contenu',
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ContentType' } } } } } } }, ...errors([401, 429]) },
      },
    },
  };

  for (const type of opts.types) {
    const name = pascal(type.slug);
    schemas[`${name}Translation`] = {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 300 },
        data: dataSchema(type.fields, 'localized'),
        ...(type.settings.hasBlocks ? { blocks: { $ref: '#/components/schemas/BlocksDocument' } } : {}),
        seo: { $ref: '#/components/schemas/Seo' },
      },
      required: ['title'],
    };
    schemas[name] = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        type: { const: type.slug },
        slug: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published', 'archived'] },
        version: { type: 'integer' },
        publishedAt: { type: ['string', 'null'], format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        data: dataSchema(type.fields, 'shared'),
        translations: { type: 'object', additionalProperties: { $ref: `#/components/schemas/${name}Translation` } },
      },
    };
    schemas[`${name}Input`] = {
      type: 'object',
      properties: {
        slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
        status: { type: 'string', enum: ['draft', 'published'] },
        data: dataSchema(type.fields, 'shared'),
        translations: { type: 'object', additionalProperties: { $ref: `#/components/schemas/${name}Translation` }, propertyNames: { enum: [...opts.locales] } },
        message: { type: 'string', maxLength: 300 },
        expectedVersion: { type: 'integer', description: 'Verrou optimiste (PATCH) : 409 si la version en base diffère.' },
      },
      required: ['translations'],
    };
    const one = { content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: `#/components/schemas/${name}` } } } } } };
    const tag = type.name;
    paths[`/content/${type.slug}`] = {
      get: {
        operationId: `list${name}`,
        tags: [tag],
        summary: `Liste des entrées « ${type.name} »`,
        parameters: [
          localeParam,
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Recherche dans les titres' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['published', 'draft', 'archived', 'any'], default: 'published' }, description: 'Autre que published : scope content:write requis.' },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${name}` } }, meta: { $ref: '#/components/schemas/Pagination' } } } } } },
          ...errors([400, 401, 404, 429]),
        },
      },
      post: {
        operationId: `create${name}`,
        tags: [tag],
        security: [{ bearer: ['content:write'] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Input` } } } },
        responses: { '201': { description: 'Créée', ...one }, ...errors([400, 401, 403, 409, 429]) },
      },
    };
    paths[`/content/${type.slug}/{ref}`] = {
      parameters: [{ name: 'ref', in: 'path', required: true, schema: { type: 'string' }, description: 'Slug ou identifiant UUID' }],
      get: { operationId: `get${name}`, tags: [tag], parameters: [localeParam], responses: { '200': { description: 'OK', ...one }, ...errors([401, 404, 429]) } },
      patch: {
        operationId: `update${name}`,
        tags: [tag],
        security: [{ bearer: ['content:write'] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Input` } } } },
        responses: { '200': { description: 'Mise à jour', ...one }, ...errors([400, 401, 403, 404, 409, 429]) },
      },
      delete: {
        operationId: `delete${name}`,
        tags: [tag],
        security: [{ bearer: ['content:write'] }],
        responses: { '204': { description: 'Supprimée' }, ...errors([401, 403, 404, 429]) },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: `${opts.siteName} — API de contenu`, version: '1.0.0', description: 'API REST Polyweb v1. Authentification : `Authorization: Bearer pw_…` (jetons créés dans l’admin). Lecture anonyme possible pour les types publics.' },
    servers: [{ url: `${opts.baseUrl.replace(/\/$/, '')}/api/v1` }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: `Scopes : ${API_SCOPES.join(', ')}` } },
      schemas,
    },
    security: [{}, { bearer: ['content:read'] }],
    paths,
  };
}
