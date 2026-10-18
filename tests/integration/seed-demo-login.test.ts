import { describe, it, expect } from 'vitest';
import { signInCookie } from '../helpers/auth-users';

// Régression : les comptes démo du seed doivent pouvoir se connecter avec Better Auth 1.7
// (accountId === userId, issuer "local:credential", hash généré par le hasher configuré).
describe('seed demo accounts', () => {
  it('annecy-author-demo peut se connecter avec DemoBlog1234!', async () => {
    expect(await signInCookie('annecy-author-demo@polyweb.local', 'DemoBlog1234!')).toContain('session_token');
  });
});
