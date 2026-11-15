/** Badges des forums (registre typé core/badges) : règles pures sur les statistiques par site. */
import { defineBadges } from "@/core/badges";

export interface ForumMemberStats {
  readonly topics: number;
  readonly posts: number;
  readonly acceptedAnswers: number;
  readonly upvotesReceived: number;
  readonly reputation: number;
}

export const forumBadges = defineBadges<ForumMemberStats>("forums", [
  { id: "first_topic", tier: "bronze", rule: (s) => s.topics >= 1 },
  { id: "first_reply", tier: "bronze", rule: (s) => s.posts >= 1 },
  { id: "helpful", tier: "bronze", rule: (s) => s.acceptedAnswers >= 1 },
  { id: "appreciated", tier: "silver", rule: (s) => s.upvotesReceived >= 10 },
  { id: "contributor", tier: "silver", rule: (s) => s.posts + s.topics >= 50 },
  { id: "solver", tier: "gold", rule: (s) => s.acceptedAnswers >= 10 },
  { id: "respected", tier: "gold", rule: (s) => s.reputation >= 500 },
]);

export type ForumBadgeId = (typeof forumBadges.badges)[number]["id"];
