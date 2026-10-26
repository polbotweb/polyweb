import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans `module.ts`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * `assertModuleCapabilityProviders` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const salesCapabilityProviders = {
  content: "sales_documents (devis, factures, avoirs) + sales_document_lines / sales_payments / sales_reminders",
  publication: "salesWorkflow (quoteWorkflow / invoiceWorkflow / creditNoteWorkflow)",
  revisions: "sales_document_revisions",
  locks: "sales_document_locks",
} as unknown as PolywebModuleCapabilityProviders;
