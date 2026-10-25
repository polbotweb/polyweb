import { describe, expect, it } from 'vitest';
import { DEFAULT_NODE_REQUIREMENT, formatNodeRequirement } from '../../../readme-builder/helpers';

describe('formatNodeRequirement', () => {
  it('formate une contrainte minimale engines.node', () => {
    expect(formatNodeRequirement('>=22.23.4')).toBe('>= 22.23.4');
    expect(formatNodeRequirement(' >= 24 ')).toBe('>= 24');
  });
  it('reprend telle quelle une plage plus complexe', () => {
    expect(formatNodeRequirement('^22.23.4 || >=24')).toBe('^22.23.4 || >=24');
  });
  it('se replie sur la valeur historique si absente', () => {
    expect(formatNodeRequirement(undefined)).toBe(DEFAULT_NODE_REQUIREMENT);
    expect(formatNodeRequirement('')).toBe(DEFAULT_NODE_REQUIREMENT);
  });
});
