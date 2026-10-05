-- Persistence foundation only. No endpoint or Telegram authorization is enabled by this migration.
CREATE TABLE "telegram_link_challenges" (
    "id" TEXT NOT NULL,
    "token_digest" BYTEA NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_link_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_link_challenges_token_digest_key"
    ON "telegram_link_challenges"("token_digest");
CREATE INDEX "telegram_link_challenges_expires_at_idx"
    ON "telegram_link_challenges"("expires_at");

CREATE TABLE "telegram_account_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "telegram_account_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_account_links_user_id_key"
    ON "telegram_account_links"("user_id");
CREATE UNIQUE INDEX "telegram_account_links_telegram_user_id_key"
    ON "telegram_account_links"("telegram_user_id");
CREATE INDEX "telegram_account_links_active_telegram_chat_id_idx"
    ON "telegram_account_links"("active", "telegram_chat_id");

ALTER TABLE "telegram_account_links"
    ADD CONSTRAINT "telegram_account_links_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
