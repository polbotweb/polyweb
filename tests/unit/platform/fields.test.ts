import { describe, it, expect } from 'vitest';
import { parseFieldDefinitions, buildDataSchema, fieldErrors, FORM_FIELD_TYPES, labelFor } from '@/core/content-types/fields';

const fields = parseFieldDefinitions([
  { name: 'summary', label: { fr: 'Résumé', en: 'Summary' }, type: 'textarea', required: true },
  { name: 'price', label: 'Prix', type: 'number', min: 0, localized: false },
  { name: 'category', label: 'Catégorie', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], localized: false },
  { name: 'tags', label: 'Tags', type: 'multiselect', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
  { name: 'featured', label: 'Mis en avant', type: 'boolean', localized: false },
  { name: 'website', label: 'Site', type: 'url' },
]);

describe('définitions de champs', () => {
  it('applique les valeurs par défaut', () => {
    expect(fields[0]!.localized).toBe(true);
    expect(fields[1]!.required).toBe(false);
    expect(labelFor(fields[0]!.label, 'en')).toBe('Summary');
    expect(labelFor(fields[0]!.label, 'ar')).toBe('Résumé');
  });
  it('rejette noms réservés, doublons, select sans options, regex invalide', () => {
    expect(() => parseFieldDefinitions([{ name: 'slug', label: 'x', type: 'text' }])).toThrow(/réservé/);
    expect(() => parseFieldDefinitions([{ name: 'a', label: 'x', type: 'text' }, { name: 'a', label: 'y', type: 'text' }])).toThrow(/dupliqué/);
    expect(() => parseFieldDefinitions([{ name: 'c', label: 'x', type: 'select' }])).toThrow(/options/);
    expect(() => parseFieldDefinitions([{ name: 'p', label: 'x', type: 'text', pattern: '(' }])).toThrow(/pattern/);
    expect(() => parseFieldDefinitions([{ name: 'm', label: 'x', type: 'media' }], FORM_FIELD_TYPES)).toThrow(/non autorisé/);
  });
});

describe('validateur de données', () => {
  it('coerce les valeurs de formulaire HTML', () => {
    const r = buildDataSchema(fields).parse({ summary: ' ok ', price: '12.5', category: 'a', tags: 'x', featured: 'on', website: '', extra: 'drop' });
    expect(r).toEqual({ summary: 'ok', price: 12.5, category: 'a', tags: ['x'], featured: true });
  });
  it('signale les erreurs par champ', () => {
    const r = buildDataSchema(fields).safeParse({ summary: '', price: '-1', category: 'z', website: 'javascript:alert(1)' });
    expect(r.success).toBe(false);
    const errs = fieldErrors(r.error!);
    expect(Object.keys(errs).sort()).toEqual(['category', 'price', 'summary', 'website']);
  });
  it('sépare champs traduits / partagés', () => {
    expect(Object.keys(buildDataSchema(fields, 'shared').shape).sort()).toEqual(['category', 'featured', 'price']);
    expect(Object.keys(buildDataSchema(fields, 'localized').shape).sort()).toEqual(['summary', 'tags', 'website']);
  });
});
