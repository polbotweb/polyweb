/**
 * Plugins installés (brique i). Ajouter un plugin = créer `src/plugins/<id>/index.ts`
 * (export default definePlugin(...)) puis l'ajouter à cette liste. L'activation
 * et les réglages se font dans l'admin (Plateforme → Plugins).
 */
import { setInstalledPlugins } from '@/core/plugins/host';
import faqBlock from './faq-block';
import formAutoreply from './form-autoreply';

export const INSTALLED_PLUGINS = [faqBlock, formAutoreply] as const;

setInstalledPlugins(INSTALLED_PLUGINS);
