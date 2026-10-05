ALTER TABLE "telegram_link_challenges"
  ADD COLUMN "user_id" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "telegram_link_challenges") THEN
    RAISE EXCEPTION 'telegram_link_challenges must be empty before user binding is enabled';
  END IF;
END
$$;

ALTER TABLE "telegram_link_challenges"
  ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "telegram_link_challenges"
  ADD CONSTRAINT "telegram_link_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "telegram_link_challenges_user_id_idx"
  ON "telegram_link_challenges"("user_id");
