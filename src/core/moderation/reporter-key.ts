/**
 * Empreinte de dédoublonnage des signalements : HMAC-SHA256 (clé dérivée du secret de signature)
 * de `u:<userId>` ou `a:<ip>`. Ni l'IP ni l'identifiant ne sont stockés ou journalisés en clair ;
 * la clé n'est jamais nulle, donc l'unicité partielle « un signalement ouvert par signaleur et
 * par cible » vaut aussi pour les anonymes (`NULL` ne serait jamais en conflit).
 */
import { createHash, createHmac } from "node:crypto";

export type ReporterIdentity = { readonly userId: string } | { readonly ip: string | null };

const keyFrom = (secret: string) => createHash("sha256").update(`polyweb:moderation-reporter:${secret}`).digest();

export function reporterKey(identity: ReporterIdentity, secret: string): string {
  const subject = "userId" in identity ? `u:${identity.userId}` : `a:${identity.ip ?? "unknown"}`;
  return `h:${createHmac("sha256", keyFrom(secret)).update(subject).digest("base64url")}`;
}
