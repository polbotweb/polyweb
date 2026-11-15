/**
 * Formulaires HTML des pages publiques des forums (POST en frontmatter puis redirection 303,
 * fonctionnent sans JavaScript). Chaque intention appelle EXACTEMENT le même service que l'action
 * Astro correspondante : mêmes contrôles d'accès, sanctions, limites de débit et audits.
 * Le CSRF est couvert par le contrôle d'origine du middleware (`lib/security/origin-check`).
 * Résultat : un code de notice ou d'erreur (jamais de message serveur réinjecté dans l'URL).
 */
import type { ActionAPIContext } from "astro:actions";
import { Effect } from "effect";
import { MODERATION_REPORT_REASONS } from "@database/schemas/moderation.schema";
import { reportModerationTarget } from "@/actions/moderation";
import { runAppResult } from "@/lib/effect/http";
import { FORUM_POLL_RESULTS, FORUM_REACTIONS, type ForumPollResults, type ForumReaction } from "../schema";
import { MAX_TAGS_PER_TOPIC, POLL_OPTIONS_MAX } from "../domain/rules";
import type { ForumViewer } from "../services/access";
import {
  acceptAnswer, createReply, createTopic, FORUM_TOPIC_TOOLS, inviteParticipant, leavePrivateTopic, moderateTopic, setFollow, toggleReaction, vote, votePoll, type ForumTopicTool,
} from "../services/community.service";

export type FormOutcome = { readonly ok: true; readonly notice: string; readonly location?: string } | { readonly ok: false; readonly error: string };

const text = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").slice(0, max);
const oneOf = <T extends string>(values: readonly T[], raw: unknown): T | null => (values.includes(raw as T) ? (raw as T) : null);
const targetType = (raw: unknown) => oneOf(["topic", "post"] as const, raw);

const outcome = async <A>(effect: Effect.Effect<A, unknown, never>, notice: string, location?: (value: A) => string): Promise<FormOutcome> => {
  const result = await runAppResult(effect);
  if (result.ok) return { ok: true, notice, location: location?.(result.value) };
  const code = (result.error as { _tag?: string; code?: string })._tag === "ActionFailure" ? (result.error as { code: string }).code : "default";
  return { ok: false, error: code };
};

const badRequest = (): FormOutcome => ({ ok: false, error: "BAD_REQUEST" });

/** Formulaire « nouveau sujet » de la page d'un forum. */
export const handleNewTopicForm = (form: FormData, input: { forumId: string; viewer: ForumViewer; topicUrl: (id: string) => string }) => {
  const isPrivate = form.get("private") === "on";
  const withPoll = form.get("poll") === "on";
  const options = text(form, "pollOptions", 4000).split("\n").map((o) => o.trim()).filter(Boolean).slice(0, POLL_OPTIONS_MAX + 1);
  const closesRaw = text(form, "pollClosesAt", 40);
  const closesAt = closesRaw ? new Date(closesRaw) : null;
  if (closesAt && Number.isNaN(closesAt.getTime())) return Promise.resolve(badRequest());
  return outcome(
    createTopic({
      forumId: input.forumId,
      categoryId: text(form, "categoryId", 64),
      title: text(form, "title", 400),
      body: text(form, "body", 40_000),
      tagIds: form.getAll("tagIds").map(String).slice(0, MAX_TAGS_PER_TOPIC + 1),
      privateWith: isPrivate ? text(form, "privateWith", 2000).split(/[,\s]+/).filter(Boolean) : null,
      poll: withPoll ? {
        question: text(form, "pollQuestion", 400), options, multiple: form.get("pollMultiple") === "on",
        resultsVisibility: oneOf(FORUM_POLL_RESULTS, form.get("pollResults")) ?? ("always" as ForumPollResults), closesAt,
      } : null,
    }, input.viewer),
    "topicCreated",
    (created) => input.topicUrl(created.id),
  );
};

/** Formulaires de la page d'un sujet (champ `intent`). */
export const handleTopicForm = (form: FormData, input: { topicId: string; viewer: ForumViewer; context: Pick<ActionAPIContext, "locals" | "request" | "clientAddress"> }) => {
  const { topicId, viewer } = input;
  switch (String(form.get("intent") ?? "")) {
    case "reply":
      return outcome(createReply({ topicId, body: text(form, "body", 40_000) }, viewer), "replied");
    case "vote": {
      const type = targetType(form.get("targetType"));
      const value = Number(form.get("value"));
      if (!type || ![-1, 0, 1].includes(value)) return Promise.resolve(badRequest());
      return outcome(vote({ targetType: type, targetId: text(form, "targetId", 64), value: value as -1 | 0 | 1 }, viewer), "voted");
    }
    case "react": {
      const type = targetType(form.get("targetType"));
      const reaction = oneOf(FORUM_REACTIONS, form.get("reaction")) as ForumReaction | null;
      if (!type || !reaction) return Promise.resolve(badRequest());
      return outcome(toggleReaction({ targetType: type, targetId: text(form, "targetId", 64), reaction }, viewer), "reacted");
    }
    case "accept":
      return outcome(acceptAnswer({ topicId, postId: text(form, "postId", 64) || null }, viewer), "accepted");
    case "follow":
      return outcome(setFollow({ topicId, follow: form.get("follow") === "1" }, viewer), "followed");
    case "poll":
      return outcome(votePoll({ pollId: text(form, "pollId", 64), optionIds: form.getAll("optionIds").map(String).slice(0, POLL_OPTIONS_MAX) }, viewer), "pollVoted");
    case "invite":
      return outcome(inviteParticipant({ topicId, username: text(form, "username", 64) }, viewer), "invited");
    case "leave":
      return outcome(leavePrivateTopic({ topicId }, viewer), "left");
    case "moderate": {
      const tool = oneOf(FORUM_TOPIC_TOOLS, form.get("tool")) as ForumTopicTool | null;
      if (!tool) return Promise.resolve(badRequest());
      return outcome(moderateTopic({ topicId, tool, note: text(form, "note", 2000), categoryId: text(form, "categoryId", 64) || null }, viewer), "moderated");
    }
    case "report": {
      const type = targetType(form.get("targetType"));
      const reason = oneOf(MODERATION_REPORT_REASONS, form.get("reason"));
      if (!type || !reason) return Promise.resolve(badRequest());
      // Action générique du socle de modération (débit par empreinte, `canReport` de l'adaptateur).
      return outcome(
        reportModerationTarget({ target: `forums.${type}`, id: text(form, "targetId", 64), reason, description: text(form, "description", 1000) || null }, input.context as ActionAPIContext),
        "reported",
      );
    }
    default:
      return Promise.resolve(badRequest());
  }
};
