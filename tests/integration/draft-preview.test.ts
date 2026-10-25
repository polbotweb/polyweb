/** Aperçu sécurisé générique des brouillons (core/preview) — jetons signés + résolveur « page » sur base réelle. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { inArray, eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { pages } from '@database/schemas';
import { AppConfig, appConfigFrom } from '@/lib/effect/config';
import { appRuntime } from '@/lib/effect/runtime';
import { createDraftPreviewToken, loadDraftPreview, signDraftPreviewClaims, verifyDraftPreviewToken } from '@/core/preview';
import { createPreviewToken } from '@/modules/content/domain/preview';
import { DRAFT_PREVIEW_RESOLVERS } from '@/lib/preview/resolvers';

const cfg = appConfigFrom({ POLYWEB_SIGNING_SECRET: 'test-secret' });
const withCfg = <A, E>(e: Effect.Effect<A, E, AppConfig>) => Effect.runPromise(e.pipe(Effect.provideService(AppConfig, cfg)));
const flipCfg = <A, E>(e: Effect.Effect<A, E, AppConfig>) => Effect.runPromise(Effect.flip(e).pipe(Effect.provideService(AppConfig, cfg)));

describe('jetons d’aperçu générique', () => {
  it('aller-retour ; rejette falsification, autre secret, expiration, type inattendu et jetons de contenu', async () => {
    const { token, claims } = await withCfg(createDraftPreviewToken({ kind: 'page', id: 'p1', locale: 'fr', ttlSeconds: 3600 }));
    expect(await withCfg(verifyDraftPreviewToken(token, 'page'))).toEqual(claims);
    const [, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, i: 'p2' })).toString('base64url');
    expect((await flipCfg(verifyDraftPreviewToken(`${forged}.${s}`))).reason).toMatch(/signature/);
    expect((await flipCfg(verifyDraftPreviewToken(signDraftPreviewClaims('other', claims)))).reason).toMatch(/signature/);
    expect((await flipCfg(verifyDraftPreviewToken(signDraftPreviewClaims('test-secret', { ...claims, x: Math.floor(Date.now() / 1000) - 1 })))).reason).toMatch(/expired/);
    expect((await flipCfg(verifyDraftPreviewToken(token, 'event'))).reason).toMatch(/kind mismatch/);
    expect((await flipCfg(verifyDraftPreviewToken('x'.repeat(2000)))).reason).toMatch(/Malformed/);
    const content = await withCfg(createPreviewToken({ entryId: 'p1', locale: 'fr', ttlSeconds: 600 }));
    expect((await flipCfg(verifyDraftPreviewToken(content.token))).reason).toMatch(/signature/);
  });

  it('borne la durée entre 60 s et 30 jours', async () => {
    const now = Math.floor(Date.now() / 1000);
    const long = await withCfg(createDraftPreviewToken({ kind: 'page', id: 'p', locale: 'fr', ttlSeconds: 10 ** 9 }));
    expect(long.claims.x - now).toBeLessThanOrEqual(2_592_000 + 1);
    const short = await withCfg(createDraftPreviewToken({ kind: 'page', id: 'p', locale: 'fr', ttlSeconds: 1 }));
    expect(short.claims.x - now).toBeGreaterThanOrEqual(60);
  });
});

describe('loadDraftPreview — pages', () => {
  const db = getDrizzle();
  const t = `dprev${Date.now().toString(36)}`;
  const ids = [`${t}-draft`, `${t}-deleted`];
  beforeAll(async () => {
    await db.insert(pages).values([
      { id: ids[0]!, locale: 'fr', slug: `${t}-d`, title: `Brouillon ${t}`, template: 'default', isPublished: false },
      { id: ids[1]!, locale: 'fr', slug: `${t}-x`, title: `Supprimée ${t}`, template: 'default', isPublished: false },
    ]);
    await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, ids[1]!));
  });
  afterAll(async () => { await db.delete(pages).where(inArray(pages.id, ids)); });

  const load = (id: string, kind = 'page') => Effect.flatMap(createDraftPreviewToken({ kind, id, locale: 'fr', ttlSeconds: 600 }), ({ token }) => loadDraftPreview(token, DRAFT_PREVIEW_RESOLVERS));

  it('affiche un brouillon non publié', async () => {
    const r = await appRuntime.runPromise(load(ids[0]!));
    expect(r.kind).toBe('page');
    expect(r.data.page.page.title).toBe(`Brouillon ${t}`);
    expect(r.data.page.page.isPublished).toBe(false);
    expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuse une page en corbeille, inexistante ou un type inconnu', async () => {
    expect((await appRuntime.runPromise(Effect.flip(load(ids[1]!))))._tag).toBe('NotFoundError');
    expect((await appRuntime.runPromise(Effect.flip(load(`${t}-none`))))._tag).toBe('NotFoundError');
    expect((await appRuntime.runPromise(Effect.flip(load(ids[0]!, 'unknown'))))._tag).toBe('UnauthorizedError');
  });
});
