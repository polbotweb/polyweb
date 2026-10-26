/**
 * Registre applicatif des listes admin à vues enregistrées : id de ressource → définition
 * de liste (canonicalisation des requêtes) + permission de lecture (contexte global).
 * Un module généré par `pnpm module:new` s'ajoute ici (étape indiquée par le générateur).
 */
import type { AdminResourceListDefinition } from "@/core/admin/filter-contract";
import { serviceAdminResource } from "@/modules/services/admin/resource";
import { blogPostAdminResource } from "@/modules/blog/admin/resource";
import { pagesListDefinition } from "@/lib/pages/admin-list";
import { eventAdminResource } from "@/modules/events/admin/resource";
import { productAdminResource } from "@/modules/shop/admin/resource";
import { taxRateAdminResource } from "@/modules/tax/admin/resource";
import { salesDocumentAdminResource } from "@/modules/sales/admin/resource";
import { opportunityAdminResource } from "@/modules/crm/admin/resource";
import { shipmentAdminResource } from "@/modules/logistics/admin/resource";
import { purchaseOrderAdminResource } from "@/modules/purchasing/admin/resource";
import { courseAdminResource } from "@/modules/courses/admin/resource";
import { formationAdminResource } from "@/modules/formations/admin/resource";

export interface AdminListEntry {
  readonly definition: AdminResourceListDefinition;
  readonly readPermission: Record<string, string[]>;
}

export const ADMIN_LISTS: Readonly<Record<string, AdminListEntry>> = {
  service: { definition: serviceAdminResource.list!, readPermission: { service: ["read"] } },
  "blog-post": { definition: blogPostAdminResource.list!, readPermission: { blog: ["read"] } },
  pages: { definition: pagesListDefinition, readPermission: { page: ["read"] } },
  event: { definition: eventAdminResource.list!, readPermission: { events: ["read"] } },
  product: { definition: productAdminResource.list!, readPermission: { shop: ["read"] } },
  "tax-rate": { definition: taxRateAdminResource.list!, readPermission: { tax: ["read"] } },
  "sales-document": { definition: salesDocumentAdminResource.list!, readPermission: { sales: ["read"] } },
  "crm-opportunity": { definition: opportunityAdminResource.list!, readPermission: { crm: ["read"] } },
  "logistics-shipment": { definition: shipmentAdminResource.list!, readPermission: { logistics: ["read"] } },
  "purchasing-order": { definition: purchaseOrderAdminResource.list!, readPermission: { purchasing: ["read"] } },
  course: { definition: courseAdminResource.list!, readPermission: { courses: ["read"] } },
  formation: { definition: formationAdminResource.list!, readPermission: { formations: ["read"] } },
};

export const ADMIN_LIST_IDS = Object.keys(ADMIN_LISTS) as [string, ...string[]];
