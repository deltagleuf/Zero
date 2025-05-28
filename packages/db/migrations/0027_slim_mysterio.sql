CREATE TABLE "mail0_imap_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp NOT NULL,
	"imap_server" text NOT NULL,
	"smtp_server" text NOT NULL,
	"imap_port" text NOT NULL,
	"smtp_port" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "mail0_imap_connection_user_id_email_unique" UNIQUE("user_id","email")
);
--> statement-breakpoint
ALTER TABLE "mail0_imap_connection" ADD CONSTRAINT "mail0_imap_connection_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;