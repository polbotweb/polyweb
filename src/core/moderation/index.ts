import type { EngagementSubject } from "@/core/engagement";

export type ModerationDecision = "approve" | "reject" | "delete" | "restore" | "edit" | "resolve";

export interface ModerationItem {
  readonly subject: EngagementSubject;
  readonly decision?: ModerationDecision;
  readonly moderatorId?: string;
}

export function assertModerationItem(item: ModerationItem): void {
  if (!item.subject.id.trim()) throw new Error("Moderation subject id cannot be empty");
  if (item.moderatorId !== undefined && !item.moderatorId.trim()) {
    throw new Error("Moderation moderatorId cannot be empty");
  }
}
