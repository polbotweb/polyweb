# smtp:check — Vérification SMTP

Vérifie la configuration SMTP, teste la connexion au provider, et peut envoyer un email de test.

## Commande

```bash
pnpm smtp:check                          # vérifie config + connexion
pnpm smtp:check --email=dest@example.com  # + envoi d'un email de test
pnpm smtp:check --email                   # utilise SMTP_TEST_TO du .env
```

## Ce que fait la commande

1. Lit `SMTP_PROVIDER` et affiche un résumé de la configuration détectée (provider, sender, serveur/clé API)
2. Valide les variables d'environnement requises selon le provider
3. Teste la connectivité :
   - **Nodemailer** : `transporter.verify()` — handshake SMTP
   - **Brevo** : `GET /v3/account` — validation de la clé API
   - **Resend** : `GET /domains` — validation de la clé (accepte les clés send-only)
4. Si `--email` est présent, envoie un email de test HTML via `sendEmail()`

## Variables d'environnement

### Communes (tous providers)

| Variable | Requis | Description |
| -------- | ------ | ----------- |
| `SMTP_PROVIDER` | Non | `NODEMAILER` (défaut), `BREVO`, ou `RESEND` |
| `SMTP_FROM_EMAIL` | Oui | Adresse email de l'expéditeur |
| `SMTP_FROM_NAME` | Non | Nom affiché de l'expéditeur (défaut : `Atomic`) |
| `SMTP_TEST_TO` | Non | Adresse de test par défaut pour `--email` sans valeur |

### Nodemailer (SMTP générique)

| Variable | Requis | Description |
| -------- | ------ | ----------- |
| `SMTP_HOST` | Oui | Hôte du serveur SMTP (ex: `smtp.ionos.fr`) |
| `SMTP_PORT` | Non | Port SMTP (défaut : `587`) |
| `SMTP_SECURE` | Non | `true` = TLS directe (port 465), `false` = STARTTLS (port 587, défaut) |
| `SMTP_USER` | Non | Utilisateur SMTP (optionnel pour relais sans auth) |
| `SMTP_PASS` | Non | Mot de passe SMTP |

### Brevo (API v3)

| Variable | Requis | Description |
| -------- | ------ | ----------- |
| `BREVO_API_KEY` | Oui | Clé API Brevo (commence par `xkeysib-`) |

> **Important** : Le sender (`SMTP_FROM_EMAIL`) doit être vérifié dans le dashboard Brevo :
> <https://app.brevo.com/senders>

### Resend (SDK)

| Variable | Requis | Description |
| -------- | ------ | ----------- |
| `RESEND_API_KEY` | Oui | Clé API Resend (commence par `re_`) |

> **Important** : Le domaine du sender doit être vérifié dans le dashboard Resend :
> <https://resend.com/domains>
>
> Les clés restreintes (send-only) sont supportées.

## Comportement de `SMTP_PROVIDER`

| Cas | Comportement |
| --- | --- |
| `SMTP_PROVIDER` absent du `.env` | ⚠️ Avertissement + fallback sur `NODEMAILER` |
| `SMTP_PROVIDER=` (vide) | ⚠️ Avertissement + fallback sur `NODEMAILER` |
| `SMTP_PROVIDER=MAILGUN` (invalide) | ❌ Erreur lisible + exit — valeurs acceptées affichées |
| Variable provider-spécifique manquante | ❌ Erreur lisible + exit — indique quelle variable ajouter |

## Erreurs de connexion

### Nodemailer

| Erreur | Message | Conseil |
| ------ | ------- | ------- |
| `ECONNREFUSED` | Connexion refusée | Vérifiez que le serveur SMTP est accessible (SMTP_HOST / SMTP_PORT) |
| `ENOTFOUND` | Hôte introuvable | Vérifiez SMTP_HOST |
| `EAUTH` | Authentification échouée | Vérifiez SMTP_USER / SMTP_PASS |
| SSL `wrong version number` | Erreur SSL | Port 587 → `SMTP_SECURE=false` (STARTTLS), Port 465 → `SMTP_SECURE=true` (TLS directe) |

### Brevo / Resend

| Erreur | Conseil |
| ------ | ------- |
| 401 Unauthorized | Clé API invalide — vérifiez dans `.env` |
| Email envoyé mais non reçu | Le sender n'est pas vérifié chez le provider / vérifiez les spams |

## Configuration SMTP_SECURE / SMTP_PORT

| Port | SMTP_SECURE | Protocole | Usage |
| ---- | ----------- | --------- | ----- |
| 587 | `false` | STARTTLS (auto-upgrade) | Standard pour la majorité des providers (IONOS, OVH, Gmail…) |
| 465 | `true` | TLS directe | Connexion chiffrée dès le départ |
| 25 | `false` | Pas de chiffrement | Non recommandé — souvent bloqué par les FAI |

## Fichiers impliqués

- `src/smtp/commands/smtp.check.ts` — script principal
- `src/smtp/env.ts` — résolution du provider et des variables d'environnement
- `src/smtp/send.ts` — point d'entrée unifié `sendEmail()`
- `src/smtp/commands/_utils.ts` — couleurs ANSI, `logSmtpTarget()`
- `src/smtp/providers/nodemailer.ts` — adapter Nodemailer
- `src/smtp/providers/brevo.ts` — adapter Brevo API v3
- `src/smtp/providers/resend.ts` — adapter Resend SDK
