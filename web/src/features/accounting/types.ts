export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type JournalEntryStatus = "DRAFT" | "POSTED" | "REVERSED";

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  active: boolean;
}

export interface FiscalPeriod {
  id: string;
  fiscalYear: number;
  periodNumber: number;
  startsAt: string;
  endsAt: string;
  status: "OPEN" | "CLOSED";
}

export interface Journal {
  id: string;
  code: string;
  name: string;
}

export interface JournalEntryLine {
  id: string;
  lineNumber: number;
  debit: string;
  credit: string;
  account: Account;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  sourceType: string;
  sourceId: string;
  currency: string;
  status: JournalEntryStatus;
  description: string;
  postedAt: string | null;
  journal: Journal;
  fiscalPeriod: FiscalPeriod;
  lines: JournalEntryLine[];
}

export type AccountingEventStatus = "PENDING" | "FAILED" | "POSTED";
export type AccountingEventType =
  | "PAYMENT_RECEIVED"
  | "REFUND_COMPLETED"
  | "EXPENSE_APPROVED"
  | "AGENT_SETTLEMENT";

export interface AccountingEvent {
  id: string;
  eventType: AccountingEventType;
  sourceId: string;
  status: AccountingEventStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
  journalEntry: { id: string; entryNumber: string } | null;
}
