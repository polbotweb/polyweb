/**
 * Workflows du domaine sales (core/workflow), un par type de document :
 *
 * - devis : DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED, ACCEPTED → CONVERTED (facture créée) ;
 *   un devis brouillon ou envoyé peut être annulé (CANCELLED).
 * - facture : DRAFT → ISSUED (numérotée, figée) → PARTIALLY_PAID → PAID ; une facture émise ne
 *   s'annule pas : elle est soldée par avoir(s) (CREDITED). Seul un brouillon peut être annulé.
 * - avoir : DRAFT → ISSUED (numéroté) ; brouillon annulable.
 *
 * Le service refuse toute transition absente de la table du type concerné. `salesWorkflow`
 * (union) reste exposé pour les briques génériques (actions groupées, capacités).
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const SALES_DOCUMENT_KINDS = ["quote", "invoice", "credit_note"] as const;
export type SalesDocumentKind = (typeof SALES_DOCUMENT_KINDS)[number];

export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"] as const;
export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CREDITED", "CANCELLED"] as const;
export const CREDIT_NOTE_STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;

export const SALES_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED", "ISSUED", "PARTIALLY_PAID", "PAID", "CREDITED", "CANCELLED"] as const;
export type SalesStatus = (typeof SALES_STATUSES)[number];

export const quoteWorkflow: WorkflowDefinition<SalesStatus> = {
  states: QUOTE_STATUSES,
  transitions: [
    { from: "DRAFT", to: "SENT" },
    { from: "SENT", to: "DRAFT" },
    { from: "SENT", to: "ACCEPTED" },
    { from: "SENT", to: "REJECTED" },
    { from: "SENT", to: "EXPIRED" },
    { from: "ACCEPTED", to: "CONVERTED" },
    { from: "DRAFT", to: "CANCELLED" },
    { from: "SENT", to: "CANCELLED" },
  ],
};

export const invoiceWorkflow: WorkflowDefinition<SalesStatus> = {
  states: INVOICE_STATUSES,
  transitions: [
    { from: "DRAFT", to: "ISSUED" },
    { from: "DRAFT", to: "CANCELLED" },
    { from: "ISSUED", to: "PARTIALLY_PAID" },
    { from: "ISSUED", to: "PAID" },
    { from: "PARTIALLY_PAID", to: "PAID" },
    { from: "PARTIALLY_PAID", to: "ISSUED" },
    { from: "PAID", to: "PARTIALLY_PAID" },
    { from: "PAID", to: "ISSUED" },
    { from: "ISSUED", to: "CREDITED" },
    { from: "PARTIALLY_PAID", to: "CREDITED" },
  ],
};

export const creditNoteWorkflow: WorkflowDefinition<SalesStatus> = {
  states: CREDIT_NOTE_STATUSES,
  transitions: [
    { from: "DRAFT", to: "ISSUED" },
    { from: "DRAFT", to: "CANCELLED" },
  ],
};

export const SALES_WORKFLOWS: Record<SalesDocumentKind, WorkflowDefinition<SalesStatus>> = {
  quote: quoteWorkflow,
  invoice: invoiceWorkflow,
  credit_note: creditNoteWorkflow,
};

export const workflowFor = (kind: SalesDocumentKind) => SALES_WORKFLOWS[kind];

/** Union des transitions (briques génériques) ; la validation réelle passe par `workflowFor(kind)`. */
export const salesWorkflow: WorkflowDefinition<SalesStatus> = {
  states: SALES_STATUSES,
  transitions: [...quoteWorkflow.transitions, ...invoiceWorkflow.transitions, ...creditNoteWorkflow.transitions],
};

/** Un document émis (numéroté légalement) est figé : ni édition des lignes ni suppression. */
export const isLocked = (_kind: SalesDocumentKind, status: SalesStatus) => status !== "DRAFT";

/** Statuts où une facture reste à encaisser. */
export const OPEN_INVOICE_STATUSES: readonly SalesStatus[] = ["ISSUED", "PARTIALLY_PAID"];
