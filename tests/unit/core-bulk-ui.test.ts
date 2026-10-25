/** Barre d'actions groupées : traductions complètes (fr/en/es/ar) et dérivation des opérations. */
import { describe, expect, it } from 'vitest';
import { formatBulk, getBulkUiTranslations } from '@/core/bulk/i18n';
import { bulkBarOperations } from '@/core/bulk/ui';
import { serviceAdminResource } from '@/modules/services/admin/resource';

describe('core/bulk i18n', () => {
  const locales = ['fr', 'en', 'es', 'ar'] as const;
  it('chaque langue définit toutes les clés, avec les mêmes paramètres', () => {
    const ref = getBulkUiTranslations('fr');
    for (const locale of locales) {
      const t = getBulkUiTranslations(locale);
      expect(Object.keys(t).sort()).toEqual(Object.keys(ref).sort());
      for (const key of Object.keys(ref) as (keyof typeof ref)[]) {
        expect(t[key].trim().length).toBeGreaterThan(0);
        expect(t[key].match(/\{\w+\}/g) ?? []).toEqual(ref[key].match(/\{\w+\}/g) ?? []);
      }
    }
  });
  it('formatBulk remplace les paramètres connus et garde les autres', () => {
    expect(formatBulk('{count} / {x}', { count: 3 })).toBe('3 / {x}');
  });
});

describe('bulkBarOperations', () => {
  const labels = { publish: 'Publier', unpublish: 'Dépublier', archive: 'Archiver', restore: 'Restaurer', delete: 'Supprimer' };
  it('filtre par permission et exige une confirmation pour archive/delete (ressource services)', () => {
    const ops = bulkBarOperations(serviceAdminResource.list?.bulkActions, labels, { publish: true, unpublish: true, archive: true, restore: false, delete: true });
    expect(ops.map((o) => o.id)).toEqual(['publish', 'unpublish', 'archive', 'delete']);
    expect(ops.filter((o) => o.requiresConfirmation).map((o) => o.id)).toEqual(['archive', 'delete']);
    expect(ops.find((o) => o.id === 'delete')?.destructive).toBe(true);
  });
  it('aucune permission → aucune opération (barre masquée)', () => {
    expect(bulkBarOperations(serviceAdminResource.list?.bulkActions, labels, {})).toEqual([]);
  });
});
