ALTER TABLE "accounting_events"
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedBy" TEXT;
DROP INDEX "accounting_events_organizationId_status_createdAt_idx";
CREATE INDEX "accounting_events_organizationId_status_availableAt_lockedAt_idx"
ON "accounting_events"("organizationId", "status", "availableAt", "lockedAt");
