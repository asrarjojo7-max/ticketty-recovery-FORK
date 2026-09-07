CREATE TYPE "AccountingEventStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED');
CREATE TABLE "accounting_events" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "eventType" "AccountingEventType" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" "AccountingEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "journalEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "accounting_events_organizationId_eventType_sourceId_key" ON "accounting_events"("organizationId", "eventType", "sourceId");
CREATE UNIQUE INDEX "accounting_events_journalEntryId_key" ON "accounting_events"("journalEntryId");
CREATE INDEX "accounting_events_organizationId_status_createdAt_idx" ON "accounting_events"("organizationId", "status", "createdAt");
ALTER TABLE "accounting_events" ADD CONSTRAINT "accounting_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_events" ADD CONSTRAINT "accounting_events_journalEntry_fkey" FOREIGN KEY ("organizationId", "journalEntryId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounting_events_tenant_isolation" ON "accounting_events"
USING ("organizationId" = ticketty_security.current_organization_id())
WITH CHECK ("organizationId" = ticketty_security.current_organization_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "accounting_events" TO ticketty_app;
