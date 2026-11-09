CREATE TABLE IF NOT EXISTS "messaging_preferences" (
  "user_id" text PRIMARY KEY NOT NULL,
  "who_can_message" varchar(16) DEFAULT 'shared_org' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messaging_preferences_who_check" CHECK ("who_can_message" IN ('everyone', 'shared_org', 'nobody'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messaging_blocks" (
  "id" text PRIMARY KEY NOT NULL, "blocker_id" text NOT NULL, "blocked_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messaging_blocks_distinct" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messaging_conversations" (
  "id" text PRIMARY KEY NOT NULL, "user_lo" text NOT NULL, "user_hi" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "last_message_at" timestamp with time zone,
  CONSTRAINT "messaging_conversations_ordered" CHECK ("user_lo" < "user_hi")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messaging_conversation_states" (
  "conversation_id" text NOT NULL, "user_id" text NOT NULL,
  "last_read_at" timestamp with time zone, "deleted_at" timestamp with time zone,
  CONSTRAINT "messaging_conversation_states_pkey" PRIMARY KEY ("conversation_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messaging_messages" (
  "id" text PRIMARY KEY NOT NULL, "conversation_id" text NOT NULL, "sender_id" text NOT NULL,
  "body" text NOT NULL, "status" varchar(12) DEFAULT 'visible' NOT NULL, "organization_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messaging_messages_status_check" CHECK ("status" IN ('visible', 'hidden'))
);
--> statement-breakpoint
ALTER TABLE "messaging_preferences" ADD CONSTRAINT "messaging_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_blocks" ADD CONSTRAINT "messaging_blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_blocks" ADD CONSTRAINT "messaging_blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_user_lo_user_id_fk" FOREIGN KEY ("user_lo") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_user_hi_user_id_fk" FOREIGN KEY ("user_hi") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_conversation_states" ADD CONSTRAINT "messaging_conversation_states_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_conversation_states" ADD CONSTRAINT "messaging_conversation_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messaging_blocks_pair_uidx" ON "messaging_blocks" USING btree ("blocker_id","blocked_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_blocks_blocked_idx" ON "messaging_blocks" USING btree ("blocked_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messaging_conversations_pair_uidx" ON "messaging_conversations" USING btree ("user_lo","user_hi");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_conversations_last_idx" ON "messaging_conversations" USING btree ("last_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_conversation_states_user_idx" ON "messaging_conversation_states" USING btree ("user_id","deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_messages_conversation_idx" ON "messaging_messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_messages_org_idx" ON "messaging_messages" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION messaging_cascade_message() RETURNS trigger AS $$
BEGIN
  DELETE FROM moderation_reports WHERE module = 'messaging' AND target_type = 'message' AND target_id = OLD.id;
  DELETE FROM moderation_actions WHERE module = 'messaging' AND target_type = 'message' AND target_id = OLD.id;
  RETURN OLD;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS messaging_messages_moderation_cascade ON messaging_messages;
--> statement-breakpoint
CREATE TRIGGER messaging_messages_moderation_cascade AFTER DELETE ON messaging_messages FOR EACH ROW EXECUTE FUNCTION messaging_cascade_message();
