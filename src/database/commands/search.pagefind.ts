/**
 * pnpm search:pagefind [--site <slug>] [--out dist/client/pagefind]
 * Génère un index Pagefind statique (à lancer après `astro build`).
 * Par défaut : site par défaut, sortie dist/client/pagefind (adaptateur Node)
 * ou .vercel/output/static/pagefind si ASTRO_ADAPTER=vercel.
 */
import 'dotenv/config';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { schema } from '@database/drizzle';
import { DEFAULT_SITE_ID } from '@database/schemas/content.schema';
import { appRuntime } from '@/lib/effect/runtime';
import { query } from '@/lib/effect/db';
import { NotFoundError } from '@/lib/effect/errors';
import { contentDocumentsForSite, legacyDocuments } from '@/lib/search/sources';
import { writePagefindIndex } from '@/lib/search/pagefind';

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const out = arg('--out') ?? (process.env.ASTRO_ADAPTER === 'vercel' ? '.vercel/output/static/pagefind' : 'dist/client/pagefind');
const slug = arg('--site');

const program = Effect.gen(function* () {
  let siteId = DEFAULT_SITE_ID;
  if (slug) {
    const [site] = yield* query('sites.bySlug', (db) => db.select({ id: schema.sites.id }).from(schema.sites).where(eq(schema.sites.slug, slug)));
    if (!site) return yield* new NotFoundError({ entity: 'site', id: slug });
    siteId = site.id;
  }
  const docs = [...(yield* contentDocumentsForSite(siteId)), ...(siteId === DEFAULT_SITE_ID ? yield* legacyDocuments : [])];
  const r = yield* writePagefindIndex(docs, out);
  yield* Effect.log(`[search:pagefind] ${r.added} documents → ${r.outputPath}`);
});

appRuntime
  .runPromise(program)
  .then(() => appRuntime.dispose())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('[search:pagefind] échec :', e);
    await appRuntime.dispose();
    process.exit(1);
  });
