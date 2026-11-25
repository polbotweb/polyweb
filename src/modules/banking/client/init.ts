/**
 * Point d'entrée navigateur du domaine banking (back-office) : les pages appellent `initBanking()`
 * au premier rendu puis à chaque `astro:after-swap`. Les comportements sont regroupés dans
 * `./admin.ts` (import de relevé, écran de rapprochement, règles, réglages).
 */
import { initBankingAdmin } from "./admin";

export function initBanking(): void {
  initBankingAdmin();
}
