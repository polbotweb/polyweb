CREATE TABLE "api_idempotency_keys" (
	"token_id" text NOT NULL,
	"key" varchar(255) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" integer,
	"body" jsonb,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_idempotency_keys_token_id_key_pk" PRIMARY KEY("token_id","key")
);
--> statement-breakpoint
CREATE TABLE "api_rate_windows" (
	"token_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_rate_windows_token_id_window_start_pk" PRIMARY KEY("token_id","window_start")
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_rate_windows" ADD CONSTRAINT "api_rate_windows_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_idempotency_created_idx" ON "api_idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_rate_windows_start_idx" ON "api_rate_windows" USING btree ("window_start");--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_rate_limit_ck" CHECK ("api_tokens"."rate_limit_per_minute" is null or "api_tokens"."rate_limit_per_minute" between 1 and 100000);