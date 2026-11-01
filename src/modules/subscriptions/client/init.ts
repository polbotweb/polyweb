/**
 * Point d'entrée navigateur du domaine subscriptions. Les composants n'importent QUE ce fichier —
 * jamais `astro:actions` directement. Idempotent : premier rendu puis `astro:after-swap`.
 */
import { initSubscriptionsForms } from "./forms";

export function initSubscriptions(): void {
  initSubscriptionsForms();
}
