ALTER TABLE "telegram_link_challenges"
  ADD COLUMN "user_id" TEXT;

UPDATE "telegram_link_challenges"
SET "user_id" = (
  SELECT "user_id"
  FROM "telegram_account_links"
  WHERE "telegram_account_links"."telegram_user_id" = "telegram_link_challenges"."telegram_user_id"
  LIMIT 1
);

-- The branch has not been deployed; any pre-existing rows are CI-only and must
-- not silently survive without an owner.
DELETE FROM "telegram_link_challenges" WHERE "user_id" IS NULL;

ALTER TABLE "telegram_link_challenges"
  ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "telegram_link_challenges"
  ADD CONSTRAINT "telegram_link_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "telegram_link_challenges_user_id_idx"
  ON "telegram_link_challenges"("user_id");
