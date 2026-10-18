# Testing — Tests d'Intégration

> Retour à l'[index](index.md) · Voir aussi [setup](setup.md)

---

## Vue d'ensemble

| Fichier | Cible | Tests | Status |
| :-- | :-- | --: | :-- |
| `tests/integration/auth.test.ts` | better-auth API — session, admin, org, impersonation, RGPD | 13 | ✅ |
| `tests/integration/auth-flow.test.ts` | Sign-up → Sign-in → Sign-out flow | 5 | ✅ |
| `tests/integration/audit.test.ts` | `logAuditEvent()` + hooks integration | 6 | ✅ |
| `tests/integration/export.test.ts` | `/api/export-data` endpoint | 3 | ✅ |
| `tests/integration/auth-advanced.test.ts` | Password reset/change, email verification, updateUser | 10 | ✅ |
| `tests/integration/auth-org.test.ts` | Organization CRUD, invitations, membres | 5 | ✅ |
| `tests/integration/middleware.test.ts` | `getSession()` avec différents headers | 4 | ✅ |
| `tests/integration/db-health.test.ts` | `checkConnection()`, singleton Drizzle, raw query | 3 | ✅ |
| `tests/integration/cms-admin.test.ts` | Actions CMS admin : CRUD site, social, nav, theme, hours, pages | 14 | ✅ |
| **Total** | | **63** | **✅** |

### Prérequis

Tous les tests d'intégration nécessitent une **base PostgreSQL opérationnelle** avec les migrations appliquées. Les variables d'environnement requises :

```bash
DATABASE_URL_LOCAL=postgresql://test:test@localhost:5432/atomic_test
DB_ENV=LOCAL
NODE_ENV=test
BETTER_AUTH_SECRET=ci-test-secret-key-minimum-32-chars!!
BETTER_AUTH_URL=http://localhost:4321
```

---

## `auth.test.ts` — Session, Admin, Organisation, Impersonation, RGPD

**Cible** : `src/lib/auth.ts` → `auth.api.*`

### Session & User (3 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `creates a valid session via login()` | `signInEmail()` retourne un `token` non-nul |
| 2 | `getSession returns user from auth headers` | Headers avec token valide → session avec `user.email` |
| 3 | `getSession returns null for empty headers` | Headers vides → `null` |

### Admin API (4 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 4 | `admin can list users` | `listUsers()` retourne un tableau contenant les users seeds |
| 5 | `admin can ban and unban a user` | `banUser()` → `banned: true` → `unbanUser()` → `banned: false` |
| 6 | `admin can change user role` | `setRole()` modifie le rôle dans la DB |
| 7 | `non-admin cannot list users` | Un user normal reçoit une erreur/null |

### Organization (2 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 8 | `user can create an organization` | `createOrganization()` → org avec `name` et `slug` |
| 9 | `user can list their organizations` | `getFullOrganization()` retourne l'org créée |

### Impersonation (2 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 10 | `admin can impersonate a user and stop` | `impersonateUser()` → session changée → `stopImpersonating()` → session originale |
| 11 | `non-admin cannot impersonate` | Un user normal reçoit une erreur |

### User Deletion — RGPD (2 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 12 | `admin can remove a user` | `removeUser()` → user supprimé de la DB |
| 13 | `session is invalid after user deletion` | L'ancien token retourne `null` après suppression |

### Stratégie — auth.test.ts

- **Setup** : crée 2 users (admin + normal) dans `beforeAll`, les supprime dans `afterAll`
- **Admin** : user principal promu admin via SQL direct (`role: 'admin'`)
- **Isolation** : chaque test utilise des email uniques (`Date.now()` suffix)

---

## `auth-flow.test.ts` — Sign-up → Sign-in → Sign-out

**Cible** : `auth.api.signUpEmail()`, `signInEmail()`, `signOut()`

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `signUpEmail creates a new user (no session when emailVerification required)` | Inscription ok, pas de session si email non vérifié |
| 2 | `signInEmail returns a session for valid credentials` | Connexion après vérification manuelle → `token` valide |
| 3 | `signInEmail rejects invalid password` | Password incorrect → erreur |
| 4 | `signInEmail rejects non-existent email` | Email inconnu → erreur |
| 5 | `signOut invalidates the session` | Déconnexion → session invalidée |

### Stratégie — auth-flow.test.ts

- **Flow complet** : sign-up → force `emailVerified` en DB → sign-in → sign-out
- **Nettoyage** : supprime le user dans `afterAll`

---

## `audit.test.ts` — Audit Log

**Cible** : `src/lib/audit.ts` → `logAuditEvent()` + hooks better-auth

### Direct logging (2 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `inserts an audit event into the database` | `logAuditEvent()` insère une ligne avec action, resource, userId, metadata |
| 2 | `handles null metadata gracefully` | Metadata `null` ne provoque pas d'erreur |

### Hooks integration (4 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 3 | `logs SIGN_UP when a user signs up` | Un `signUpEmail()` génère un log `SIGN_UP` en base |
| 4 | `logs USER_BAN when admin bans a user` | `banUser()` génère un log `USER_BAN` |
| 5 | `logs USER_ROLE_CHANGE when admin changes role` | `setRole()` génère un log `USER_ROLE_CHANGE` |
| 6 | `does not log passwords in metadata` | Aucun champ `password`/`hashedPassword` dans metadata |

### Stratégie — audit.test.ts

- **Vérification directe** : lit les logs dans `auditLog` table après chaque action
- **Sécurité** : vérifie que les passwords ne fuient jamais dans les metadata
- **Nettoyage** : supprime les logs et users dans `afterAll`

---

## `export.test.ts` — API Export Data

**Cible** : `src/pages/api/export-data.ts` (endpoint RGPD)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `returns null session for unauthenticated request` | Sans headers → pas de session |
| 2 | `returns user data for authenticated request via auth.api` | Avec headers → données user dans la réponse |
| 3 | `export query returns accounts for the user` | La query inclut les comptes liés |

### Stratégie — export.test.ts

- **API directe** : appelle `auth.api.getSession()` avec des headers fabriqués
- **RGPD** : teste le droit à la portabilité des données

---

## `auth-advanced.test.ts` — Password, Email, Profile

**Cible** : password reset/change, email verification, update profile

### Forget & Reset Password (2 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `requestPasswordReset succeeds without error` | `requestPasswordReset()` ne throw pas (email envoyé en mode non-test ignoré) |
| 2 | `requestPasswordReset for unknown email does not throw` | Email inconnu → pas d'erreur (sécurité : pas de leak) |

### Change Password (2 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 3 | `changePassword updates credentials` | `changePassword()` → peut re-login avec le nouveau password |
| 4 | `changePassword rejects wrong current password` | Mauvais ancien password → erreur |

### Email Verification (3 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 5 | `user starts as unverified after signUp` | `emailVerified: false` après inscription |
| 6 | `cannot sign in before email is verified` | Login échoue tant que `emailVerified: false` |
| 7 | `can sign in after email is verified in DB` | Après `emailVerified: true` en DB → login réussit |

### Update User (3 tests)

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 8 | `updateUser changes the user name` | `updateUser({ name })` → nom mis à jour |
| 9 | `updateUser changes the username` | `updateUser({ username })` → username mis à jour |
| 10 | `getSession reflects updated user data` | `getSession()` retourne les données mises à jour |

### Stratégie — auth-advanced.test.ts

- **Vérification manuelle en DB** : force `emailVerified` via SQL pour tester les flows
- **Zero SMTP** : `NODE_ENV=test` → aucun email envoyé (dynamic import skip)
- **Nettoyage** : supprime les users dans `afterAll`

---

## `auth-org.test.ts` — Organisation CRUD avancé

**Cible** : invitations, membres, mise à jour, suppression

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `owner can update organization name` | `updateOrganization()` → nom modifié |
| 2 | `owner can invite a member` | `createInvitation()` → invitation créée |
| 3 | `invited user can accept invitation` | `acceptInvitation()` → membre ajouté |
| 4 | `owner can remove a member` | `removeMember()` → membre supprimé |
| 5 | `deleted organization disappears from list` | `deleteOrganization()` → plus dans la liste |

### Stratégie — auth-org.test.ts

- **Setup** : crée 2 users (owner + invité) + 1 org dans `beforeAll`
- **Flow séquentiel** : invite → accept → remove → delete (les tests dépendent de l'état)
- **Nettoyage** : supprime org + users dans `afterAll`

---

## `middleware.test.ts` — Logique Middleware

**Cible** : `auth.api.getSession()` avec différents headers HTTP

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `returns user and session for authenticated headers` | Headers valides → `user` + `session` non null |
| 2 | `returns null for empty headers (unauthenticated)` | Headers vides → `null` |
| 3 | `returns null for invalid auth token` | Token invalide → `null` |
| 4 | `returns null for expired/revoked session` | Token d'un user supprimé → `null` |

### Stratégie — middleware.test.ts

- **Test des guards** : simule les 4 cas d'authentification du middleware Astro
- **Headers natifs** : utilise `new Headers()` Web API

---

## `db-health.test.ts` — Santé Base de Données

**Cible** : `checkConnection()`, `getDrizzle()`, raw query

| # | Test | Ce qu'il vérifie |
| :-- | :-- | :-- |
| 1 | `checkConnection returns ok with valid latency` | `status: 'ok'`, `latency` est un nombre positif |
| 2 | `getDrizzle returns the same instance (singleton)` | 2 appels → même référence (`===`) |
| 3 | `can execute a raw query via drizzle` | `SELECT 1` retourne le résultat attendu |

### Stratégie — db-health.test.ts

- **Smoke test** : vérifie que la connexion DB est fonctionnelle
- **Singleton** : garantit qu'on ne crée pas de connexions multiples

---

## Résumé couverture intégration

```text
Auth flows testés :          13 (session, admin, org, impersonation, RGPD)
Auth advanced :              10 (password, email, profile)
Auth org :                   5 (CRUD, invitations, membres)
Audit :                      6 (logging + hooks)
Export RGPD :                3
Middleware :                  4
DB health :                   3
Auth sign-up/in/out :        5
Total tests intégration :    49
Fichiers :                   8
Temps d'exécution :          ~5–8 s (dépend de la DB)
```
