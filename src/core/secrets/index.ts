/**
 * core/secrets — chiffrement au repos des secrets d'intégration (identifiants d'API tiers, jetons).
 *
 * AES-256-GCM, IV aléatoire de 96 bits, étiquette d'authentification vérifiée au déchiffrement.
 * La clé est dérivée du secret de signature de l'application (`POLYWEB_SIGNING_SECRET`, repli
 * `BETTER_AUTH_SECRET`) ET d'un **usage** (`purpose`) : un secret chiffré pour un usage ne se
 * déchiffre pas pour un autre. L'usage est aussi lié en données authentifiées (AAD).
 * Format stocké : `s1:<iv>:<tag>:<chiffré>` (base64url). Jamais journalisé en clair : `maskSecret`.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Data, Effect } from "effect";
import { appConfigFrom } from "@/lib/effect/config";

export class SecretError extends Data.TaggedError("SecretError")<{ readonly reason: "format" | "decrypt" | "purpose"; readonly purpose: string }> {
  override get message() {
    return `Secret illisible (${this.reason}) pour l'usage ${this.purpose}`;
  }
}

const PURPOSE = /^[a-z][a-z0-9.:-]{2,63}$/;

const keyOf = (signingSecret: string, purpose: string) => createHash("sha256").update(`polyweb:secret:v1:${purpose}:${signingSecret}`).digest();

const signingSecret = () => appConfigFrom(process.env).signingSecret;

/** Chiffre `plain` pour l'usage `purpose` (clé dérivée du secret de signature fourni ou de l'environnement). */
export const sealSecret = (purpose: string, plain: string, secret: string = signingSecret()): Effect.Effect<string, SecretError> =>
  Effect.suspend(() => {
    if (!PURPOSE.test(purpose)) return Effect.fail(new SecretError({ reason: "purpose", purpose }));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyOf(secret, purpose), iv);
    cipher.setAAD(Buffer.from(purpose, "utf8"));
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return Effect.succeed(["s1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":"));
  });

/** Déchiffre un secret scellé pour `purpose` ; toute altération, mauvais usage ou mauvaise clé échoue. */
export const openSecret = (purpose: string, sealed: string, secret: string = signingSecret()): Effect.Effect<string, SecretError> =>
  Effect.suspend(() => {
    if (!PURPOSE.test(purpose)) return Effect.fail(new SecretError({ reason: "purpose", purpose }));
    const [version, iv, tag, ct] = sealed.split(":");
    if (version !== "s1" || !iv || !tag || ct === undefined) return Effect.fail(new SecretError({ reason: "format", purpose }));
    return Effect.try({
      try: () => {
        const decipher = createDecipheriv("aes-256-gcm", keyOf(secret, purpose), Buffer.from(iv, "base64url"));
        decipher.setAAD(Buffer.from(purpose, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
      },
      catch: () => new SecretError({ reason: "decrypt", purpose }),
    });
  });

/** Affichage sûr : 4 derniers caractères au plus, le reste masqué (`••••abcd`), rien si trop court. */
export const maskSecret = (value: string | null | undefined): string => {
  if (!value) return "";
  return value.length <= 8 ? "••••" : `••••${value.slice(-4)}`;
};

/** IBAN masqué pour l'affichage et les journaux (`FR76 •••• •••• 1234`). */
export const maskIban = (iban: string | null | undefined): string => {
  const compact = (iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (compact.length < 8) return compact ? "••••" : "";
  return `${compact.slice(0, 4)} •••• •••• ${compact.slice(-4)}`;
};
