CREATE TYPE "AccountingEventType" AS ENUM ('PAYMENT_RECEIVED', 'REFUND_COMPLETED', 'EXPENSE_APPROVED', 'AGENT_SETTLEMENT');
CREATE TABLE "accounting_policies" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "eventType" "AccountingEventType" NOT NULL,
  "journalId" TEXT NOT NULL,
  "debitAccountId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_policy_distinct_accounts_check" CHECK ("debitAccountId" <> "creditAccountId")
);
CREATE UNIQUE INDEX "accounting_policies_organizationId_eventType_key" ON "accounting_policies"("organizationId", "eventType");
CREATE UNIQUE INDEX "accounting_policies_organizationId_id_key" ON "accounting_policies"("organizationId", "id");
ALTER TABLE "accounting_policies" ADD CONSTRAINT "accounting_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_policies" ADD CONSTRAINT "accounting_policies_journal_fkey" FOREIGN KEY ("organizationId", "journalId") REFERENCES "journals"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_policies" ADD CONSTRAINT "accounting_policies_debit_account_fkey" FOREIGN KEY ("organizationId", "debitAccountId") REFERENCES "accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_policies" ADD CONSTRAINT "accounting_policies_credit_account_fkey" FOREIGN KEY ("organizationId", "creditAccountId") REFERENCES "accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_policies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounting_policies_tenant_isolation" ON "accounting_policies"
USING ("organizationId" = ticketty_security.current_organization_id())
WITH CHECK ("organizationId" = ticketty_security.current_organization_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "accounting_policies" TO ticketty_app;
