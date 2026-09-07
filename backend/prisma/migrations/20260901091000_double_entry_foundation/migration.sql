CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

CREATE TABLE "accounts" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AccountType" NOT NULL,
  "parentId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "fiscal_periods" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNumber" INTEGER NOT NULL,
  "startsAt" DATE NOT NULL,
  "endsAt" DATE NOT NULL,
  "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "journals" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "journal_entries" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "journalId" TEXT NOT NULL,
  "fiscalPeriodId" TEXT NOT NULL,
  "entryNumber" TEXT NOT NULL,
  "entryDate" DATE NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "description" TEXT NOT NULL,
  "reversalOfId" TEXT,
  "postedById" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "journal_entry_lines" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "accountId" TEXT NOT NULL,
  "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "accounts_organizationId_code_key" ON "accounts"("organizationId", "code");
CREATE UNIQUE INDEX "accounts_organizationId_id_key" ON "accounts"("organizationId", "id");
CREATE INDEX "accounts_organizationId_type_active_idx" ON "accounts"("organizationId", "type", "active");
CREATE UNIQUE INDEX "fiscal_periods_organizationId_fiscalYear_periodNumber_key" ON "fiscal_periods"("organizationId", "fiscalYear", "periodNumber");
CREATE UNIQUE INDEX "fiscal_periods_organizationId_id_key" ON "fiscal_periods"("organizationId", "id");
CREATE INDEX "fiscal_periods_organizationId_status_startsAt_endsAt_idx" ON "fiscal_periods"("organizationId", "status", "startsAt", "endsAt");
CREATE UNIQUE INDEX "journals_organizationId_code_key" ON "journals"("organizationId", "code");
CREATE UNIQUE INDEX "journals_organizationId_id_key" ON "journals"("organizationId", "id");
CREATE UNIQUE INDEX "journal_entries_organizationId_entryNumber_key" ON "journal_entries"("organizationId", "entryNumber");
CREATE UNIQUE INDEX "journal_entries_organizationId_sourceType_sourceId_key" ON "journal_entries"("organizationId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "journal_entries_organizationId_reversalOfId_key" ON "journal_entries"("organizationId", "reversalOfId");
CREATE UNIQUE INDEX "journal_entries_organizationId_id_key" ON "journal_entries"("organizationId", "id");
CREATE INDEX "journal_entries_organizationId_fiscalPeriodId_entryDate_idx" ON "journal_entries"("organizationId", "fiscalPeriodId", "entryDate");
CREATE INDEX "journal_entries_organizationId_status_idx" ON "journal_entries"("organizationId", "status");
CREATE UNIQUE INDEX "journal_entry_lines_journalEntryId_lineNumber_key" ON "journal_entry_lines"("journalEntryId", "lineNumber");
CREATE INDEX "journal_entry_lines_organizationId_accountId_journalEntryId_idx" ON "journal_entry_lines"("organizationId", "accountId", "journalEntryId");

ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_period_date_order_check" CHECK ("startsAt" <= "endsAt"), ADD CONSTRAINT "fiscal_period_number_check" CHECK ("periodNumber" BETWEEN 1 AND 13);
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_line_one_sided_check" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0));

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_fkey" FOREIGN KEY ("organizationId", "parentId") REFERENCES "accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journals" ADD CONSTRAINT "journals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journal_fkey" FOREIGN KEY ("organizationId", "journalId") REFERENCES "journals"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_period_fkey" FOREIGN KEY ("organizationId", "fiscalPeriodId") REFERENCES "fiscal_periods"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_fkey" FOREIGN KEY ("organizationId", "reversalOfId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_fkey" FOREIGN KEY ("organizationId", "journalEntryId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_fkey" FOREIGN KEY ("organizationId", "accountId") REFERENCES "accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_journal_entry_posting()
RETURNS TRIGGER AS $$
DECLARE period_row "fiscal_periods"%ROWTYPE;
DECLARE debit_total DECIMAL(19,4);
DECLARE credit_total DECIMAL(19,4);
BEGIN
  IF OLD."status" IN ('POSTED', 'REVERSED') THEN RAISE EXCEPTION 'Posted journal entries are immutable'; END IF;
  IF NEW."status" = 'POSTED' THEN
    SELECT * INTO period_row FROM "fiscal_periods" WHERE "id" = NEW."fiscalPeriodId" AND "organizationId" = NEW."organizationId" FOR UPDATE;
    IF period_row."status" <> 'OPEN' OR NEW."entryDate" < period_row."startsAt" OR NEW."entryDate" > period_row."endsAt" THEN RAISE EXCEPTION 'Fiscal period is closed or entry date is outside period'; END IF;
    SELECT COALESCE(SUM("debit"),0), COALESCE(SUM("credit"),0) INTO debit_total, credit_total FROM "journal_entry_lines" WHERE "journalEntryId" = NEW."id";
    IF debit_total <= 0 OR debit_total <> credit_total THEN RAISE EXCEPTION 'Journal entry is not balanced'; END IF;
    NEW."postedAt" := COALESCE(NEW."postedAt", CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "journal_entries_posting_guard" BEFORE UPDATE ON "journal_entries" FOR EACH ROW EXECUTE FUNCTION enforce_journal_entry_posting();

CREATE OR REPLACE FUNCTION prevent_posted_line_mutation()
RETURNS TRIGGER AS $$
DECLARE entry_status "JournalEntryStatus";
BEGIN
  SELECT "status" INTO entry_status FROM "journal_entries" WHERE "id" = COALESCE(NEW."journalEntryId", OLD."journalEntryId");
  IF entry_status IN ('POSTED', 'REVERSED') THEN RAISE EXCEPTION 'Posted journal lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "journal_entry_lines_immutability_guard" BEFORE INSERT OR UPDATE OR DELETE ON "journal_entry_lines" FOR EACH ROW EXECUTE FUNCTION prevent_posted_line_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['accounts','fiscal_periods','journals','journal_entries','journal_entry_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING ("organizationId" = ticketty_security.current_organization_id()) WITH CHECK ("organizationId" = ticketty_security.current_organization_id())', table_name || '_tenant_isolation', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO ticketty_app', table_name);
  END LOOP;
END $$;
