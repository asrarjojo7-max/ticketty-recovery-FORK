"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccount,
  createJournal,
  createPeriod,
  fetchAccounts,
  fetchEntries,
  fetchEvents,
  fetchJournals,
  fetchPeriods,
  postEntry,
  requeueEvent,
} from "./api";

const root = ["accounting"] as const;
const refresh = (client: ReturnType<typeof useQueryClient>) => () =>
  client.invalidateQueries({ queryKey: root });

export const useAccounts = () =>
  useQuery({ queryKey: [...root, "accounts"], queryFn: fetchAccounts });
export const usePeriods = () =>
  useQuery({ queryKey: [...root, "periods"], queryFn: fetchPeriods });
export const useJournals = () =>
  useQuery({ queryKey: [...root, "journals"], queryFn: fetchJournals });
export const useEntries = () =>
  useQuery({ queryKey: [...root, "entries"], queryFn: fetchEntries });

export function useCreateAccount() {
  const client = useQueryClient();
  return useMutation({ mutationFn: createAccount, onSuccess: refresh(client) });
}
export function useCreatePeriod() {
  const client = useQueryClient();
  return useMutation({ mutationFn: createPeriod, onSuccess: refresh(client) });
}
export function useCreateJournal() {
  const client = useQueryClient();
  return useMutation({ mutationFn: createJournal, onSuccess: refresh(client) });
}
export function usePostEntry() {
  const client = useQueryClient();
  return useMutation({ mutationFn: postEntry, onSuccess: refresh(client) });
}

export const useEvents = () =>
  useQuery({ queryKey: [...root, "events"], queryFn: fetchEvents });

export function useRequeueEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requeueEvent(id),
    onSuccess: refresh(client),
  });
}
