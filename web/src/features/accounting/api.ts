import { apiClient } from "@/lib/api-client";
import type {
  Account,
  AccountType,
  FiscalPeriod,
  Journal,
  JournalEntry,
} from "./types";

export const fetchAccounts = () => apiClient<Account[]>("/accounting/accounts");
export const createAccount = (input: { code: string; name: string; type: AccountType }) =>
  apiClient<Account>("/accounting/accounts", { method: "POST", body: input });
export const fetchPeriods = () => apiClient<FiscalPeriod[]>("/accounting/periods");
export const createPeriod = (input: { fiscalYear: number; periodNumber: number; startsAt: string; endsAt: string }) =>
  apiClient<FiscalPeriod>("/accounting/periods", { method: "POST", body: input });
export const closePeriod = (id: string) =>
  apiClient<FiscalPeriod>(`/accounting/periods/${id}/close`, { method: "POST" });
export const fetchJournals = () => apiClient<Journal[]>("/accounting/journals");
export const createJournal = (input: { code: string; name: string }) =>
  apiClient<Journal>("/accounting/journals", { method: "POST", body: input });
export const fetchEntries = () => apiClient<JournalEntry[]>("/accounting/entries");
export const postEntry = (id: string) =>
  apiClient<JournalEntry>(`/accounting/entries/${id}/post`, { method: "POST" });
