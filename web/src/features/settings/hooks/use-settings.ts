"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBranch,
  createUser,
  deleteTicketBrandAsset,
  fetchBranches,
  fetchOrganization,
  fetchRoles,
  fetchUsers,
  updateOrganization,
  updateTicketBranding,
  updateUser,
  uploadTicketBrandAsset,
} from "../api";
import type {
  OrganizationInput,
  TicketBrandAssetKind,
  TicketBrandingInput,
  UserInput,
} from "../types";

const root = ["settings"] as const;
const invalidateSettings = (queryClient: ReturnType<typeof useQueryClient>) => () =>
  queryClient.invalidateQueries({ queryKey: root });
const invalidateBranding = (queryClient: ReturnType<typeof useQueryClient>) => () => {
  void queryClient.invalidateQueries({ queryKey: root });
  void queryClient.invalidateQueries({ queryKey: ["organization", "ticket"] });
};

export const useOrganization = () =>
  useQuery({ queryKey: [...root, "organization"], queryFn: fetchOrganization });
export const useBranches = () =>
  useQuery({ queryKey: [...root, "branches"], queryFn: fetchBranches });
export const useRoles = () =>
  useQuery({ queryKey: [...root, "roles"], queryFn: fetchRoles });
export const useUsers = () =>
  useQuery({ queryKey: [...root, "users"], queryFn: fetchUsers });

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationInput) => updateOrganization(input),
    onSuccess: invalidateSettings(queryClient),
  });
}

export function useUpdateTicketBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TicketBrandingInput) => updateTicketBranding(input),
    onSuccess: () => {
      invalidateBranding(queryClient)();
      toast.success("تم حفظ هوية التذكرة");
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useUploadTicketBrandAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file }: { kind: TicketBrandAssetKind; file: File }) =>
      uploadTicketBrandAsset(kind, file),
    onSuccess: () => {
      invalidateBranding(queryClient)();
      toast.success("تم رفع الصورة وحفظها في قاعدة البيانات");
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useDeleteTicketBrandAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: TicketBrandAssetKind) => deleteTicketBrandAsset(kind),
    onSuccess: () => {
      invalidateBranding(queryClient)();
      toast.success("تم حذف الصورة");
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createBranch, onSuccess: invalidateSettings(queryClient) });
}
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserInput) => createUser(input),
    onSuccess: invalidateSettings(queryClient),
  });
}
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Omit<UserInput, "password">> & { active?: boolean };
    }) => updateUser(id, input),
    onSuccess: invalidateSettings(queryClient),
  });
}
