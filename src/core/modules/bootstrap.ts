import { registerModule } from "./module-registry";
import { blogModule } from "@/modules/blog/module";
import { servicesModule } from "@/modules/services/module";
import { paymentsModule } from "@/modules/payments/module";
import { contentModule } from "@/modules/content/module";
import { eventsModule } from "@/modules/events/module";
import { registerInternalLinkResolver } from "@/lib/content/internal-link-resolver";
import { blogInternalLinkResolver } from "@/lib/blog/blog-internal-link";
import { serviceInternalLinkResolver } from "@/lib/services/services-internal-link";
import { registerSearchResource } from "@/core/search/registry";
import { registerWebhookDispatcher } from "@/modules/webhooks/subscribe";
import { registerSearchIndexer } from "@/lib/search/indexer";

let bootstrapped = false;

export function bootstrapModules(): void {
  if (bootstrapped) return;
  registerModule(blogModule);
  registerModule(servicesModule);
  registerModule(contentModule);
  registerModule(eventsModule);
  // Modules optionnels, activés par variable d'environnement
  if (process.env.PAYMENTS_ENABLED === "true") registerModule(paymentsModule);
  if (blogModule.searchDefinition) registerSearchResource(blogModule.searchDefinition);
  if (servicesModule.searchDefinition) registerSearchResource(servicesModule.searchDefinition);
  registerInternalLinkResolver(blogInternalLinkResolver);
  registerInternalLinkResolver(serviceInternalLinkResolver);
  registerWebhookDispatcher();
  registerSearchIndexer();
  bootstrapped = true;
}