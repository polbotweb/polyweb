/**
 * Point d'entrée navigateur du domaine shop.
 *
 * Un module client par feature, importé ici. Les composants n'importent QUE ce
 * fichier — jamais `astro:actions` directement — pour que sélecteurs et
 * actions restent regroupés et testables hors rendu.
 */

/**
 * Branche les comportements d'une page. Idempotent : appelé au premier rendu
 * puis à chaque `astro:after-swap`.
 */
export function initShop(): void {
  // TODO: appeler les modules client du domaine, par exemple
  //   initShopEngagementBar();
}
