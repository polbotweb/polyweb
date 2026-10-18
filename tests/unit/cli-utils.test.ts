import { describe, it, expect } from 'vitest';
import { formatPgError, c } from '@database/commands/_utils';

describe('formatPgError', () => {
  it('formats 28P01 as auth failure', () => {
    const msg = formatPgError({ code: '28P01' });
    expect(msg).toBe('Utilisateur ou mot de passe incorrect');
  });

  it('formats 3D000 as database not found', () => {
    const msg = formatPgError({ code: '3D000' });
    expect(msg).toContain("n'existe pas");
  });

  it('formats 28000 as auth refused', () => {
    const msg = formatPgError({ code: '28000' });
    expect(msg).toContain('Authentification refusée');
  });

  it('formats ECONNREFUSED as connection refused', () => {
    const msg = formatPgError({ code: 'ECONNREFUSED' });
    expect(msg).toContain('Connexion refusée');
  });

  it('formats ENOTFOUND as host not found', () => {
    const msg = formatPgError({ code: 'ENOTFOUND' });
    expect(msg).toContain('Hôte introuvable');
  });

  it('formats ETIMEDOUT as timeout', () => {
    const msg = formatPgError({ code: 'ETIMEDOUT' });
    expect(msg).toContain('Timeout');
  });

  it('formats ECONNRESET as connection reset', () => {
    const msg = formatPgError({ code: 'ECONNRESET' });
    expect(msg).toContain('réinitialisée');
  });

  it('formats 57P03 as server starting', () => {
    const msg = formatPgError({ code: '57P03' });
    expect(msg).toContain('démarre encore');
  });

  it('falls back to message property', () => {
    const msg = formatPgError({ message: 'some error' });
    expect(msg).toBe('some error');
  });

  it('falls back to String coercion for unknown errors', () => {
    const msg = formatPgError('raw string error');
    expect(msg).toBe('raw string error');
  });
});

describe('ANSI color helpers', () => {
  it('wraps text in green ANSI codes', () => {
    expect(c.green('ok')).toBe('\x1b[32mok\x1b[0m');
  });

  it('wraps text in red ANSI codes', () => {
    expect(c.red('err')).toBe('\x1b[31merr\x1b[0m');
  });
});
