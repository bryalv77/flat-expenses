ALTER TABLE "bills" DROP CONSTRAINT "bills_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "houses" DROP CONSTRAINT "houses_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bills" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "houses" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "houses" ADD CONSTRAINT "houses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;