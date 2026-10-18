/** Opérations affichées par la barre d'actions groupées (AdminBulkBar), dérivées de la ressource admin. */
import type { AdminResourceBulkActionDefinition } from "@/core/admin/filter-contract";

export interface AdminBulkBarOperation {
  readonly id: string;
  readonly label: string;
  readonly requiresConfirmation: boolean;
  readonly destructive?: boolean;
}

/**
 * `list.bulkActions` d'une ressource → opérations de la barre : filtrées par les permissions
 * calculées par la page (l'action serveur revérifie), libellés traduits, confirmation obligatoire
 * pour toute opération destructive ou dotée d'une clé de confirmation.
 */
export function bulkBarOperations(
  definitions: readonly AdminResourceBulkActionDefinition[] | undefined,
  labels: Readonly<Record<string, string>>,
  allowed: Readonly<Record<string, boolean>>,
): AdminBulkBarOperation[] {
  return (definitions ?? [])
    .filter((op) => allowed[op.id] === true)
    .map((op) => ({ id: op.id, label: labels[op.id] ?? op.id, destructive: op.destructive === true, requiresConfirmation: op.destructive === true || Boolean(op.confirmationKey) }));
}
