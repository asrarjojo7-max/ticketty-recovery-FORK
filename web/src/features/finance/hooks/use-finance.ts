"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adjustExpense,
  approveExpense,
  createExpense,
  fetchExpenses,
  fetchFinancial,
  fetchSettlements,
  generateSettlement,
  settle,
} from "../api";
import type { ExpenseInput } from "../types";

const keys = {
  all: ["finance"] as const,
  expenses: ["finance", "expenses"] as const,
  settlements: ["finance", "settlements"] as const,
};

function toastError(error: unknown) {
  toast.error("تعذّر إتمام العملية", {
    description: error instanceof Error ? error.message : undefined,
  });
}

export const useFinancialSummary = (from?: string, to?: string) =>
  useQuery({
    queryKey: [...keys.all, "summary", from, to],
    queryFn: () => fetchFinancial(from, to),
  });

export const useExpenses = () =>
  useQuery({ queryKey: keys.expenses, queryFn: fetchExpenses });

export const useSettlements = () =>
  useQuery({ queryKey: keys.settlements, queryFn: fetchSettlements });

export function useCreateExpense() {
  const q = useQueryClient();
  return useMutation<unknown, Error, ExpenseInput>({
    mutationFn: (i) => createExpense(i),
    onSuccess: () => {
      toast.success("تم تسجيل المصروف (مسودة بانتظار الاعتماد)");
      q.invalidateQueries({ queryKey: keys.all });
    },
    onError: toastError,
  });
}

export function useApproveExpense() {
  const q = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => approveExpense(id),
    onSuccess: () => {
      toast.success("تم اعتماد المصروف وترحيله محاسبياً");
      q.invalidateQueries({ queryKey: keys.all });
    },
    onError: toastError,
  });
}

export function useAdjustExpense() {
  const q = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { id: string; type: "INCREASE" | "DECREASE"; amount: number; reason: string }
  >({
    mutationFn: ({ id, ...input }) => adjustExpense(id, input),
    onSuccess: () => {
      toast.success("تم تعديل المصروف");
      q.invalidateQueries({ queryKey: keys.all });
    },
    onError: toastError,
  });
}

export function useGenerateSettlement() {
  const q = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { agentId: string; from: string; to: string }
  >({
    mutationFn: (input) => generateSettlement(input),
    onSuccess: () => {
      toast.success("تم توليد كشف التسوية");
      q.invalidateQueries({ queryKey: keys.all });
    },
    onError: toastError,
  });
}

export function useSettle() {
  const q = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => settle(id),
    onSuccess: () => {
      toast.success("تمت تسوية العمولات بنجاح");
      q.invalidateQueries({ queryKey: keys.all });
    },
    onError: toastError,
  });
}
