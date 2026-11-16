/** Événements outbox des petites annonces (charges utiles sans corps ni message). */
export const CLASSIFIEDS_AD_PUBLISHED_EVENT = "classifieds.ad_published";
export const CLASSIFIEDS_AD_APPROVED_EVENT = "classifieds.ad_approved";
export const CLASSIFIEDS_AD_REJECTED_EVENT = "classifieds.ad_rejected";
export const CLASSIFIEDS_AD_EXPIRING_EVENT = "classifieds.ad_expiring";
export const CLASSIFIEDS_AD_EXPIRED_EVENT = "classifieds.ad_expired";
export const CLASSIFIEDS_SAVED_SEARCH_MATCH_EVENT = "classifieds.saved_search_match";

export const CLASSIFIEDS_EVENT_DEFINITIONS = [
  { name: CLASSIFIEDS_AD_PUBLISHED_EVENT, module: "classifieds", description: "Annonce publiée (identifiants seulement)." },
  { name: CLASSIFIEDS_AD_APPROVED_EVENT, module: "classifieds", description: "Annonce acceptée par la modération." },
  { name: CLASSIFIEDS_AD_REJECTED_EVENT, module: "classifieds", description: "Annonce renvoyée ou refusée par la modération." },
  { name: CLASSIFIEDS_AD_EXPIRING_EVENT, module: "classifieds", description: "Annonce proche de l'expiration." },
  { name: CLASSIFIEDS_AD_EXPIRED_EVENT, module: "classifieds", description: "Annonce expirée." },
  { name: CLASSIFIEDS_SAVED_SEARCH_MATCH_EVENT, module: "classifieds", description: "Annonce correspondant à une recherche enregistrée." },
] as const;
