CREATE OR REPLACE FUNCTION enforce_journal_entry_posting()
RETURNS TRIGGER AS $$
DECLARE period_row "fiscal_periods"%ROWTYPE;
DECLARE debit_total DECIMAL(19,4);
DECLARE credit_total DECIMAL(19,4);
BEGIN
  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'Reversed journal entries are immutable';
  END IF;

  IF OLD."status" = 'POSTED' THEN
    IF NEW."status" <> 'REVERSED'
       OR NEW."journalId" <> OLD."journalId"
       OR NEW."fiscalPeriodId" <> OLD."fiscalPeriodId"
       OR NEW."entryNumber" <> OLD."entryNumber"
       OR NEW."entryDate" <> OLD."entryDate"
       OR NEW."sourceType" <> OLD."sourceType"
       OR NEW."sourceId" <> OLD."sourceId"
       OR NEW."currency" <> OLD."currency"
       OR NEW."description" <> OLD."description"
       OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
       OR NEW."postedById" IS DISTINCT FROM OLD."postedById"
       OR NEW."postedAt" IS DISTINCT FROM OLD."postedAt" THEN
      RAISE EXCEPTION 'Posted journal entries are immutable';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "journal_entries" reversal
      WHERE reversal."organizationId" = OLD."organizationId"
        AND reversal."reversalOfId" = OLD."id"
        AND reversal."status" = 'POSTED'
    ) THEN
      RAISE EXCEPTION 'Posted entry requires a posted reversal entry';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'POSTED' THEN
    SELECT * INTO period_row FROM "fiscal_periods"
    WHERE "id" = NEW."fiscalPeriodId" AND "organizationId" = NEW."organizationId"
    FOR UPDATE;
    IF period_row."status" <> 'OPEN'
       OR NEW."entryDate" < period_row."startsAt"
       OR NEW."entryDate" > period_row."endsAt" THEN
      RAISE EXCEPTION 'Fiscal period is closed or entry date is outside period';
    END IF;
    SELECT COALESCE(SUM("debit"),0), COALESCE(SUM("credit"),0)
    INTO debit_total, credit_total
    FROM "journal_entry_lines" WHERE "journalEntryId" = NEW."id";
    IF debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'Journal entry is not balanced';
    END IF;
    NEW."postedAt" := COALESCE(NEW."postedAt", CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
