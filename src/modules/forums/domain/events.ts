/** Événements de l'outbox émis par les forums (charges utiles SANS contenu ni signaleur). */
export const FORUMS_POST_CREATED_EVENT = "forums.post_created";
export const FORUMS_MENTIONED_EVENT = "forums.mentioned";
export const FORUMS_BADGE_AWARDED_EVENT = "forums.badge_awarded";
export const FORUMS_SANCTION_APPLIED_EVENT = "forums.sanction_applied";
export const FORUMS_SANCTION_REVOKED_EVENT = "forums.sanction_revoked";

export const FORUMS_EVENT_DEFINITIONS = [
  { name: FORUMS_POST_CREATED_EVENT, module: "forums", description: "Nouvelle réponse dans un sujet de forum (identifiants seulement)." },
  { name: FORUMS_MENTIONED_EVENT, module: "forums", description: "Mention d'utilisateurs dans un sujet ou une réponse de forum." },
  { name: FORUMS_BADGE_AWARDED_EVENT, module: "forums", description: "Badge de forum attribué." },
  { name: FORUMS_SANCTION_APPLIED_EVENT, module: "forums", description: "Sanction de forum appliquée (automatique)." },
  { name: FORUMS_SANCTION_REVOKED_EVENT, module: "forums", description: "Sanction de forum levée par un modérateur." },
] as const;
