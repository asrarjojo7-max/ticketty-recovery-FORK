BEGIN;

INSERT INTO "organizations" ("id", "name", "slug", "updatedAt")
VALUES ('test-accounting-org', 'Accounting Test', 'test-accounting-org', CURRENT_TIMESTAMP);
INSERT INTO "accounts" ("id", "organizationId", "code", "name", "type", "updatedAt") VALUES
  ('test-account-cash', 'test-accounting-org', '1000', 'Cash', 'ASSET', CURRENT_TIMESTAMP),
  ('test-account-revenue', 'test-accounting-org', '4000', 'Revenue', 'REVENUE', CURRENT_TIMESTAMP);
INSERT INTO "fiscal_periods" ("id", "organizationId", "fiscalYear", "periodNumber", "startsAt", "endsAt")
VALUES ('test-period-open', 'test-accounting-org', 2026, 1, '2026-01-01', '2026-12-31');
INSERT INTO "fiscal_periods" ("id", "organizationId", "fiscalYear", "periodNumber", "startsAt", "endsAt", "status", "closedAt")
VALUES ('test-period-closed', 'test-accounting-org', 2025, 1, '2025-01-01', '2025-12-31', 'CLOSED', CURRENT_TIMESTAMP);
INSERT INTO "journals" ("id", "organizationId", "code", "name")
VALUES ('test-journal', 'test-accounting-org', 'SALES', 'Sales');
INSERT INTO "journal_entries" ("id", "organizationId", "journalId", "fiscalPeriodId", "entryNumber", "entryDate", "sourceType", "sourceId", "currency", "description", "updatedAt")
VALUES ('test-entry-balanced', 'test-accounting-org', 'test-journal', 'test-period-open', 'JE-1', '2026-08-01', 'TEST', 'source-1', 'SDG', 'Balanced', CURRENT_TIMESTAMP);
INSERT INTO "journal_entry_lines" ("id", "organizationId", "journalEntryId", "lineNumber", "accountId", "debit", "credit", "currency") VALUES
  ('test-line-debit', 'test-accounting-org', 'test-entry-balanced', 1, 'test-account-cash', 100, 0, 'SDG'),
  ('test-line-credit', 'test-accounting-org', 'test-entry-balanced', 2, 'test-account-revenue', 0, 100, 'SDG');
UPDATE "journal_entries" SET "status" = 'POSTED', "postedById" = 'test-user' WHERE "id" = 'test-entry-balanced';

DO $$ BEGIN
  BEGIN
    UPDATE "journal_entry_lines" SET "debit" = 90 WHERE "id" = 'test-line-debit';
    RAISE EXCEPTION 'TEST_FAILURE: posted line mutation accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF; END;
END $$;

INSERT INTO "journal_entries" ("id", "organizationId", "journalId", "fiscalPeriodId", "entryNumber", "entryDate", "sourceType", "sourceId", "currency", "description", "updatedAt")
VALUES ('test-entry-unbalanced', 'test-accounting-org', 'test-journal', 'test-period-open', 'JE-2', '2026-08-01', 'TEST', 'source-2', 'SDG', 'Unbalanced', CURRENT_TIMESTAMP);
INSERT INTO "journal_entry_lines" ("id", "organizationId", "journalEntryId", "lineNumber", "accountId", "debit", "credit", "currency") VALUES
  ('test-line-unbalanced-debit', 'test-accounting-org', 'test-entry-unbalanced', 1, 'test-account-cash', 100, 0, 'SDG'),
  ('test-line-unbalanced-credit', 'test-accounting-org', 'test-entry-unbalanced', 2, 'test-account-revenue', 0, 90, 'SDG');
DO $$ BEGIN
  BEGIN
    UPDATE "journal_entries" SET "status" = 'POSTED' WHERE "id" = 'test-entry-unbalanced';
    RAISE EXCEPTION 'TEST_FAILURE: unbalanced entry posted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF; END;
END $$;

INSERT INTO "journal_entries" ("id", "organizationId", "journalId", "fiscalPeriodId", "entryNumber", "entryDate", "sourceType", "sourceId", "currency", "description", "updatedAt")
VALUES ('test-entry-closed', 'test-accounting-org', 'test-journal', 'test-period-closed', 'JE-3', '2025-08-01', 'TEST', 'source-3', 'SDG', 'Closed period', CURRENT_TIMESTAMP);
INSERT INTO "journal_entry_lines" ("id", "organizationId", "journalEntryId", "lineNumber", "accountId", "debit", "credit", "currency") VALUES
  ('test-line-closed-debit', 'test-accounting-org', 'test-entry-closed', 1, 'test-account-cash', 50, 0, 'SDG'),
  ('test-line-closed-credit', 'test-accounting-org', 'test-entry-closed', 2, 'test-account-revenue', 0, 50, 'SDG');
DO $$ BEGIN
  BEGIN
    UPDATE "journal_entries" SET "status" = 'POSTED' WHERE "id" = 'test-entry-closed';
    RAISE EXCEPTION 'TEST_FAILURE: closed-period entry posted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF; END;
END $$;

INSERT INTO "journal_entries" ("id", "organizationId", "journalId", "fiscalPeriodId", "entryNumber", "entryDate", "sourceType", "sourceId", "currency", "description", "reversalOfId", "updatedAt")
VALUES ('test-entry-reversal', 'test-accounting-org', 'test-journal', 'test-period-open', 'JE-4', '2026-08-02', 'REVERSAL', 'test-entry-balanced', 'SDG', 'Reversal', 'test-entry-balanced', CURRENT_TIMESTAMP);
INSERT INTO "journal_entry_lines" ("id", "organizationId", "journalEntryId", "lineNumber", "accountId", "debit", "credit", "currency") VALUES
  ('test-line-reversal-debit', 'test-accounting-org', 'test-entry-reversal', 1, 'test-account-revenue', 100, 0, 'SDG'),
  ('test-line-reversal-credit', 'test-accounting-org', 'test-entry-reversal', 2, 'test-account-cash', 0, 100, 'SDG');
UPDATE "journal_entries" SET "status" = 'POSTED' WHERE "id" = 'test-entry-reversal';
UPDATE "journal_entries" SET "status" = 'REVERSED' WHERE "id" = 'test-entry-balanced';

ROLLBACK;
