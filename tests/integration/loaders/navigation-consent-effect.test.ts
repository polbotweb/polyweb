/**
 * navigation.loader / consent.loader — lectures Effect-natives contre un vrai Postgres :
 * arbre de menu (actifs seulement, enfants imbriqués), menu masqué → vide, méta, consentement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { navigationItems, navigationMenus } from '@database/schemas';
import * as nav from '@database/loaders/navigation.loader';
import * as consent from '@database/loaders/consent.loader';

const t = `naveff-${crypto.randomUUID().slice(0, 8)}`;
const menuId = crypto.randomUUID();
const hiddenId = crypto.randomUUID();
const parent = crypto.randomUUID();

beforeAll(async () => {
  const db = getDrizzle();
  await db.insert(navigationMenus).values([
    { id: menuId, name: `${t}-menu`, isVisible: true },
    { id: hiddenId, name: `${t}-hidden`, isVisible: false },
  ] as never);
  await db.insert(navigationItems).values([
    { id: parent, menuId, locale: 'fr', label: 'Parent', url: '/p', sortOrder: 0, isActive: true },
    { menuId, parentId: parent, locale: 'fr', label: 'Enfant', url: '/p/e', sortOrder: 1, isActive: true },
    { menuId, locale: 'fr', label: 'Inactif', url: '/x', sortOrder: 2, isActive: false },
    { menuId: hiddenId, locale: 'fr', label: 'Caché', url: '/h', sortOrder: 0, isActive: true },
  ] as never);
});

afterAll(async () => {
  const db = getDrizzle();
  await db.delete(navigationItems).where(eq(navigationItems.menuId, menuId));
  await db.delete(navigationItems).where(eq(navigationItems.menuId, hiddenId));
  await db.delete(navigationMenus).where(eq(navigationMenus.id, menuId));
  await db.delete(navigationMenus).where(eq(navigationMenus.id, hiddenId));
});

describe('navigation / consent Effect-natifs', () => {
  it('arbre du menu : actifs seulement, enfant imbriqué ; Promise = Effect', async () => {
    const fx = nav.navigationLoaderEffects;
    const tree = await Effect.runPromise(fx.getMenu(`${t}-menu`, 'fr'));
    expect(tree.map((n) => n.label)).toEqual(['Parent']);
    expect(tree[0].children.map((n) => n.label)).toEqual(['Enfant']);
    expect(await nav.getMenu(`${t}-menu`, 'fr')).toEqual(tree);
    expect(await Effect.runPromise(fx.getMenu(`${t}-hidden`, 'fr'))).toEqual([]);
    expect(await Effect.runPromise(fx.getMenu(`${t}-absent`, 'fr'))).toEqual([]);
    expect(await Effect.runPromise(fx.getMenu(`${t}-menu`, 'xx'))).toEqual([]);
  });

  it('méta et liste des menus', async () => {
    const fx = nav.navigationLoaderEffects;
    expect(await Effect.runPromise(fx.getMenuMeta(`${t}-hidden`))).toMatchObject({ id: hiddenId, isVisible: false });
    expect(await Effect.runPromise(fx.getMenuMeta(`${t}-absent`))).toBeNull();
    const names = (await Effect.runPromise(fx.getMenusList())).map((m) => m.name);
    expect(names).toContain(`${t}-menu`);
  });

  it('consentement : locale invalide → null ; Promise = Effect', async () => {
    const fx = consent.consentLoaderEffects;
    expect(await Effect.runPromise(fx.getConsentSettings('xx'))).toBeNull();
    expect(await consent.getConsentSettings('fr')).toEqual(await Effect.runPromise(fx.getConsentSettings('fr')));
  });
});
