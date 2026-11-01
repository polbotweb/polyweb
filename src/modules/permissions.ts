/**
 * Agrégat des permissions déclarées par les modules (registre core `permissions/registry`).
 * `pnpm module:new` ajoute automatiquement le module généré entre les marqueurs.
 */
import { blogPermissions } from "@/modules/blog/permissions/statements";
import { servicesPermissions } from "@/modules/services/permissions/statements";
import { eventsPermissions } from "@/modules/events/permissions/statements";
import { formationsPermissions } from "@/modules/formations/permissions/statements";
import { coursesPermissions } from "@/modules/courses/permissions/statements";
import { shopPermissions } from "@/modules/shop/permissions/statements";
import { taxPermissions } from "@/modules/tax/permissions/statements";
import { salesPermissions } from "@/modules/sales/permissions/statements";
import { crmPermissions } from "@/modules/crm/permissions/statements";
import { logisticsPermissions } from "@/modules/logistics/permissions/statements";
import { purchasingPermissions } from "@/modules/purchasing/permissions/statements";
import { subscriptionsPermissions } from "@/modules/subscriptions/permissions/statements";
import { bookingsPermissions } from "@/modules/bookings/permissions/statements";
// @module-permissions:imports

export const MODULE_PERMISSIONS = [
  blogPermissions,
  servicesPermissions,
  eventsPermissions,
  formationsPermissions,
  coursesPermissions,
  shopPermissions,
  taxPermissions,
  salesPermissions,
  crmPermissions,
  logisticsPermissions,
  purchasingPermissions,
  subscriptionsPermissions,
  bookingsPermissions,
  // @module-permissions:list
] as const;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
/** Type exact (littéral) de l'union des statements des modules. */
export type ModuleStatements = UnionToIntersection<(typeof MODULE_PERMISSIONS)[number]["statements"]>;
