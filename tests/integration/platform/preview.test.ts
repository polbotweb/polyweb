import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { appRuntime } from '@/lib/effect/runtime';
import { AppConfig, appConfigFrom } from '@/lib/effect/config';
import { createPreviewToken, loadPreview, signClaims, verifyPreviewToken } from '@/modules/content/domain/preview';
import { createEntry, updateEntry } from '@/modules/content/domain/entries';
import { createTestSite, removeTestSite, createArticleType } from '../../helpers/platform';
import type { Site } from '@/modules/sites/domain/sites';

const cfg = appConfigFrom({ POLYWEB_SIGNING_SECRET: 'test-secret' });
const withCfg = <A, E>(e: Effect.Effect<A, E, AppConfig>) => Effect.runPromise(e.pipe(Effect.provideService(AppConfig, cfg)));
const flipCfg = <A, E>(e: Effect.Effect<A, E, AppConfig>) => Effect.runPromise(Effect.flip(e).pipe(Effect.provideService(AppConfig, cfg)));

describe('preview tokens', () => {
  it('round-trips claims and rejects tampering, other secrets, expiry and junk', async () => {
    const { token, claims } = await withCfg(createPreviewToken({ entryId: 'e1', locale: 'fr', ttlSeconds: 3600, version: 3 }));
    expect(await withCfg(verifyPreviewToken(token))).toEqual(claims);
    const [p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, e: 'e2' })).toString('base64url');
    expect((await flipCfg(verifyPreviewToken(`${forged}.${s}`))).reason).toMatch(/signature/);
    expect((await flipCfg(verifyPreviewToken(signClaims('other', claims)))).reason).toMatch(/signature/);
    expect((await flipCfg(verifyPreviewToken(signClaims('test-secret', { ...claims, x: Math.floor(Date.now() / 1000) - 1 })))).reason).toMatch(/expired/);
    expect((await flipCfg(verifyPreviewToken('nope'))).reason).toMatch(/Malformed/);
    expect((await flipCfg(verifyPreviewToken(`${p}.${s}.x`))).reason).toMatch(/Malformed/);
  });

  it('caps the TTL to 30 days', async () => {
    const { claims } = await withCfg(createPreviewToken({ entryId: 'e', locale: 'fr', ttlSeconds: 10 ** 9 }));
    expect(claims.x - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(2_592_000);
  });
});

describe('loadPreview', () => {
  let site: Site;
  beforeAll(async () => { site = await createTestSite('preview'); });
  afterAll(async () => { await removeTestSite(site.id); });

  it('shows the current draft, or a pinned revision snapshot', async () => {
    const type = await createArticleType(site.id);
    const e = await createEntry(type, { slug: 'p', translations: { fr: { title: 'Titre v1', data: { summary: 'a' } }, en: { title: 'Title v1', data: { summary: 'a' } } } }, { authorId: null, allowedLocales: ['fr', 'en'] });
    await updateEntry(type, e.id, { translations: { fr: { title: 'Titre v2', data: { summary: 'b' } } } }, { authorId: null, allowedLocales: ['fr', 'en'] });

    const current = await appRuntime.runPromise(Effect.flatMap(createPreviewToken({ entryId: e.id, locale: 'fr', ttlSeconds: 600 }), ({ token }) => loadPreview(token)));
    expect(current.translation.title).toBe('Titre v2');
    expect(current.entry.status).toBe('draft');
    expect(current.pinned).toBe(false);

    const pinned = await appRuntime.runPromise(Effect.flatMap(createPreviewToken({ entryId: e.id, locale: 'fr', ttlSeconds: 600, version: 1 }), ({ token }) => loadPreview(token)));
    expect(pinned.translation.title).toBe('Titre v1');
    expect(pinned.version).toBe(1);

    const en = await appRuntime.runPromise(Effect.flatMap(createPreviewToken({ entryId: e.id, locale: 'en', ttlSeconds: 600 }), ({ token }) => loadPreview(token)));
    expect(en.translation.title).toBe('Title v1');

    const missing = await appRuntime.runPromise(Effect.flip(Effect.flatMap(createPreviewToken({ entryId: e.id, locale: 'fr', ttlSeconds: 600, version: 99 }), ({ token }) => loadPreview(token))));
    expect(missing._tag).toBe('NotFoundError');
  });
});
