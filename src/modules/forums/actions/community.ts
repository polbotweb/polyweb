/**
 * Actions Astro de PARTICIPATION aux forums : sujets, réponses, votes, réactions, solution,
 * suivi, sondages, fils privés, outils de modération d'un sujet. Le lecteur est l'utilisateur de
 * la session (ou anonyme) ; toutes les règles (visibilité indiscernable, sanctions, limites de
 * débit, verrouillage, audit) sont appliquées par `services/community.service.ts`.
 * Signalements : action générique `moderation.report` (cibles `forums.topic` / `forums.post`).
 */
import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { effectHandler } from "@/lib/effect/action";
import { FORUM_POLL_RESULTS, FORUM_REACTIONS } from "../schema";
import { BODY_MAX, NOTE_MAX, POLL_OPTIONS_MAX, TOPIC_TITLE_MAX } from "../domain/rules";
import type { ForumViewer } from "../services/access";
import {
  acceptAnswer, createReply, createTopic, FORUM_TOPIC_TOOLS, inviteParticipant, leavePrivateTopic, moderateTopic, setFollow, toggleReaction, vote, votePoll,
} from "../services/community.service";

const id = z.string().min(1).max(64);
const target = z.enum(["topic", "post"]);

export const viewerOf = (context: Pick<ActionAPIContext, "locals">): ForumViewer => context.locals.user ?? null;

export const forumsCommunityActions = {
  topicCreate: defineAction({
    input: z.object({
      forumId: id, categoryId: id, title: z.string().max(TOPIC_TITLE_MAX * 2), body: z.string().max(BODY_MAX * 2),
      tagIds: z.array(id).max(20).default([]),
      privateWith: z.array(z.string().max(64)).max(40).nullable().default(null),
      poll: z.object({
        question: z.string().max(400), options: z.array(z.string().max(240)).max(POLL_OPTIONS_MAX * 2), multiple: z.boolean().default(false),
        resultsVisibility: z.enum(FORUM_POLL_RESULTS).default("always"), closesAt: z.coerce.date().nullable().default(null),
      }).nullable().default(null),
    }),
    handler: effectHandler((input, context) => createTopic(input, viewerOf(context))),
  }),
  reply: defineAction({
    input: z.object({ topicId: id, body: z.string().max(BODY_MAX * 2) }),
    handler: effectHandler((input, context) => createReply(input, viewerOf(context))),
  }),
  vote: defineAction({
    input: z.object({ targetType: target, targetId: id, value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }),
    handler: effectHandler((input, context) => vote(input, viewerOf(context))),
  }),
  react: defineAction({
    input: z.object({ targetType: target, targetId: id, reaction: z.enum(FORUM_REACTIONS) }),
    handler: effectHandler((input, context) => toggleReaction(input, viewerOf(context))),
  }),
  accept: defineAction({
    input: z.object({ topicId: id, postId: id.nullable() }),
    handler: effectHandler((input, context) => acceptAnswer(input, viewerOf(context))),
  }),
  follow: defineAction({
    input: z.object({ topicId: id, follow: z.boolean() }),
    handler: effectHandler((input, context) => setFollow(input, viewerOf(context))),
  }),
  pollVote: defineAction({
    input: z.object({ pollId: id, optionIds: z.array(id).min(1).max(POLL_OPTIONS_MAX) }),
    handler: effectHandler((input, context) => votePoll(input, viewerOf(context))),
  }),
  invite: defineAction({
    input: z.object({ topicId: id, username: z.string().min(1).max(64) }),
    handler: effectHandler((input, context) => inviteParticipant(input, viewerOf(context))),
  }),
  leave: defineAction({
    input: z.object({ topicId: id }),
    handler: effectHandler((input, context) => leavePrivateTopic(input, viewerOf(context))),
  }),
  moderateTopic: defineAction({
    input: z.object({ topicId: id, tool: z.enum(FORUM_TOPIC_TOOLS), note: z.string().max(NOTE_MAX * 2), categoryId: id.nullable().optional() }),
    handler: effectHandler((input, context) => moderateTopic(input, viewerOf(context))),
  }),
};
