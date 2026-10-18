# Audit — Journalisation des événements

> **Fichier** : `src/lib/audit.ts`  
> **Table** : `audit_log` (PostgreSQL)  
> **Tests** : `tests/integration/audit.test.ts` (6 tests), `tests/unit/extract-ip.test.ts` (8 tests), `tests/unit/cms-audit.test.ts` (1 test), `tests/unit/audit-fallback.test.ts` (1 test)

---

## Objectif

Enregistrer toutes les actions significatives du système pour la sécurité, la conformité RGPD et le débogage. Chaque événement est persisté en base avec l'utilisateur, l'action, la ressource et les métadonnées.

---

## API

### `logAuditEvent(input: AuditEventInput): Promise<void>`

Insère un événement dans la table `audit_log`. **Non-bloquant** — les erreurs d'écriture déclenchent un **fallback JSONL** (`audit-fallback.jsonl` à la racine du projet), puis sont loggées dans `console.error` sans interrompre le flux applicatif.

```typescript
await logAuditEvent({
  userId: user.id,
  action: 'FILE_UPLOAD',
  resource: 'file',
  resourceId: '/uploads/images/avatars/abc123.webp',
  metadata: { type: 'avatar', originalName: 'photo.jpg', size: 102400 },
  ipAddress: extractIp(request.headers),
  userAgent: request.headers.get('user-agent'),
});
```

### `extractIp(headers: Headers): string | null`

Extrait l'adresse IP du client depuis les en-têtes HTTP :

1. `x-forwarded-for` — premier IP de la liste (proxy)
2. `x-real-ip` — fallback (reverse proxy)
3. Validation IPv4 et IPv6 via `net.isIP()` (Node.js natif, implémentation C++)

---

## Interface `AuditEventInput`

| Champ | Type | Requis | Description |
| :-- | :-- | :-- | :-- |
| `userId` | `string \| null` | Non | ID de l'utilisateur (null pour les événements anonymes) |
| `action` | `AuditAction` | **Oui** | Type d'événement (voir liste ci-dessous) |
| `resource` | `string \| null` | Non | Type de ressource (`user`, `session`, `file`, etc.) |
| `resourceId` | `string \| null` | Non | ID de la ressource affectée |
| `metadata` | `Record<string, unknown> \| null` | Non | Données complémentaires (valeurs: `typeof string`, max 255 chars) |
| `ipAddress` | `string \| null` | Non | IP du client |
| `userAgent` | `string \| null` | Non | User-Agent du navigateur |

---

## Types d'événements (`AuditAction`)

### Authentification (10 actions)

| Action | Déclencheur |
| :-- | :-- |
| `SIGN_IN` | Connexion réussie |
| `SIGN_IN_FAILED` | Tentative de connexion échouée |
| `SIGN_UP` | Inscription réussie |
| `SIGN_UP_FAILED` | Tentative d'inscription échouée |
| `SIGN_OUT` | Déconnexion |
| `PASSWORD_CHANGE` | Changement de mot de passe |
| `PASSWORD_CHANGE_FAILED` | Tentative de changement échouée |
| `PASSWORD_RESET_REQUEST` | Demande de reset mot de passe |
| `PASSWORD_RESET_COMPLETE` | Reset mot de passe effectué |
| `PASSWORD_RESET_COMPLETE_FAILED` | Tentative de reset échouée |

### Gestion utilisateurs (5 actions)

| Action | Déclencheur |
| :-- | :-- |
| `USER_UPDATE` | Mise à jour profil |
| `USER_DELETE` | Suppression de compte (RGPD) |
| `USER_BAN` / `USER_UNBAN` | Ban/unban par admin |
| `USER_ROLE_CHANGE` | Changement de rôle |

### Impersonation (2 actions)

| Action | Déclencheur |
| :-- | :-- |
| `IMPERSONATION_START` | Admin commence l'impersonation |
| `IMPERSONATION_STOP` | Fin d'impersonation |

### Organisations (7 actions)

| Action | Déclencheur |
| :-- | :-- |
| `ORG_CREATE` / `ORG_UPDATE` / `ORG_DELETE` | CRUD organisation |
| `ORG_MEMBER_ADD` / `ORG_MEMBER_REMOVE` | Gestion membres |
| `ORG_MEMBER_ROLE_CHANGE` | Changement de rôle membre |
| `ORG_INVITATION_SEND` / `ORG_INVITATION_ACCEPT` / `ORG_INVITATION_REJECT` / `ORG_INVITATION_CANCEL` | Flow invitations |

### Fichiers (2 actions)

| Action | Déclencheur |
| :-- | :-- |
| `FILE_UPLOAD` | Upload de fichier |
| `FILE_DELETE` | Suppression de fichier |

### CMS Admin (22 actions)

| Action | Déclencheur |
| :-- | :-- |
| `SITE_SETTINGS_UPDATE` | Modification paramètres site |
| `SOCIAL_LINK_CREATE` / `UPDATE` / `DELETE` | CRUD liens sociaux |
| `SOCIAL_LINK_REORDER` | Réordonnancement liens sociaux |
| `CONTACT_INFO_UPDATE` | Modification coordonnées |
| `OPENING_HOURS_UPDATE` | Modification horaires |
| `NAVIGATION_MENU_CREATE` / `UPDATE` / `DELETE` | CRUD menus de navigation |
| `NAVIGATION_ITEM_CREATE` / `UPDATE` / `DELETE` | CRUD items navigation |
| `PAGE_CREATE` / `UPDATE` / `DELETE` / `PUBLISH` | CRUD pages CMS |
| `PAGE_SECTION_CREATE` / `UPDATE` / `DELETE` | CRUD sections de page |
| `THEME_CREATE` / `UPDATE` / `DELETE` | CRUD thèmes |

### Divers (3 actions)

| Action | Déclencheur |
| :-- | :-- |
| `USER_DATA_EXPORT` | Export données RGPD |
| `CONTACT_FORM_SUBMIT` | Soumission formulaire de contact |
| `EMAIL_SEND_FAILED` | Échec d'envoi email |

---

## Hooks automatiques (better-auth)

Les événements d'authentification sont loggés automatiquement via le hook `after` de better-auth dans `src/lib/auth.ts` :

```typescript
hooks: {
  after: [
    {
      matcher: (ctx) => !!pathActionMap[ctx.path],
      handler: async (ctx) => {
        // Log succès et échecs automatiquement
      },
    },
  ],
},
```

### Pattern d'audit dans les actions admin

Chaque action admin utilise le helper `auditAdmin()` de `_helpers.ts` :

```typescript
auditAdmin(context, user.id, 'NAVIGATION_ITEM_CREATE', {
  resource: 'navigation_item',
  resourceId: created.id,
  metadata: { label: input.label, locale: input.locale },
});
```

---

## Fallback JSONL

Lorsque l'insertion en base échoue (perte de connexion PostgreSQL, pool épuisé, etc.), `logAuditEvent()` écrit l'événement dans un fichier **JSONL** (`audit-fallback.jsonl`) à la racine du projet, puis log l'erreur dans `console.error`.

Chaque ligne du fichier est un objet JSON indépendant :

```jsonl
{"userId":"user-1","action":"SIGN_IN","resource":"auth","ipAddress":"1.2.3.4","timestamp":"2025-01-15T10:30:00.000Z"}
```

### Pourquoi JSONL ?

- **Append-only** : `appendFile()` est atomique pour les écritures < PIPE_BUF (4 KB sous Linux)
- **Pas de corruption** : chaque ligne est un JSON valide indépendant (pas de tableau global à fermer)
- **Récupérable** : un script de replay peut relire le fichier et réinsérer les événements en base

### Test

Le fichier `tests/unit/audit-fallback.test.ts` vérifie que quand `getDrizzle()` throw, l'événement est écrit en JSONL avec les champs attendus (`action`, `userId`, `timestamp`).

---

## Ajouter une nouvelle action d'audit

1. **Ajouter le type** dans `src/lib/audit.ts` → union `AuditAction`
2. **Appeler `logAuditEvent()`** ou `auditAdmin()` dans le code métier
3. **Tester** dans `tests/unit/cms-audit.test.ts` (vérifier que l'action existe dans le type)

---

## Cleanup

La commande `pnpm db:cleanup-audit` supprime les entrées plus anciennes que N jours :

```bash
AUDIT_RETENTION_DAYS=90 pnpm db:cleanup-audit
```

Défaut : 90 jours. Voir [database/cleanup-audit.md](database/cleanup-audit.md).
