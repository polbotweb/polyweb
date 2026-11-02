import { describe, it, expect } from 'vitest';
import { auditRetentionDays, DEFAULT_AUDIT_RETENTION_DAYS } from '@/core/audit/retention';

describe('auditRetentionDays', () => {
  it('1 an par défaut, configurable, borne basse 30 jours', () => {
    expect(DEFAULT_AUDIT_RETENTION_DAYS).toBe(365);
    expect(auditRetentionDays({})).toBe(365);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: 'abc' })).toBe(365);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: '-3' })).toBe(365);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: '730' })).toBe(730);
    expect(auditRetentionDays({ AUDIT_RETENTION_DAYS: '7' })).toBe(30);
  });
});
