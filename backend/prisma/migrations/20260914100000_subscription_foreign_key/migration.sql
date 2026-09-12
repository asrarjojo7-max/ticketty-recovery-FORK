-- Align the platform subscription history with the organization lifecycle.
-- Multiple historical subscriptions remain valid; the existing partial unique
-- index continues to enforce at most one active/current subscription.
-- Legacy test/maintenance code could leave subscriptions after deleting an
-- organization because no FK existed. Record and remove only those impossible
-- orphan rows before validating the new constraint.
INSERT INTO "system_events" (
  "id", "level", "category", "message", "context", "createdAt"
)
SELECT
  ticketty_security.platform_cuid(),
  'WARN',
  'SYSTEM',
  'Removed orphan subscriptions while adding organization integrity',
  jsonb_build_object(
    'count', count(*),
    'subscriptionIds', jsonb_agg(s."id" ORDER BY s."id")
  ),
  clock_timestamp()
FROM "subscriptions" s
WHERE NOT EXISTS (
  SELECT 1 FROM "organizations" o WHERE o."id" = s."organizationId"
)
HAVING count(*) > 0;

DELETE FROM "subscriptions" s
WHERE NOT EXISTS (
  SELECT 1 FROM "organizations" o WHERE o."id" = s."organizationId"
);

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "subscriptions"
  VALIDATE CONSTRAINT "subscriptions_organizationId_fkey";
