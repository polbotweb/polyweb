/** Ton visuel des statuts (pastilles) ; le libellé reste toujours affiché en texte. */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const statusTone = (status: string): Tone =>
  status === "reconciled" || status === "applied" || status === "linked" || status === "ok" || status === "PROCESSED" || status === "processed" ? "success"
    : status === "suggested" || status === "partial" ? "info"
      : status === "pending_approval" || status === "pending" || status === "expired" || status === "gap" ? "warning"
        : status === "rejected" || status === "error" || status === "FAILED" || status === "failed" || status === "mismatch" ? "danger"
          : "neutral";
