import {apiClient} from "@/lib/api-client";import type{ManifestData,ManifestRecord}from"./types";
export const fetchManifest=(tripId:string)=>apiClient<ManifestData>(`/manifests/trip/${tripId}`);
export const generateManifest=(tripId:string)=>apiClient<ManifestData>("/manifests/generate",{method:"POST",body:{tripId}});
export const lockManifest=(id:string)=>apiClient<ManifestRecord>(`/manifests/${id}/lock`,{method:"POST"});
export const departTrip=(tripId:string)=>apiClient<ManifestData>(`/manifests/trip/${tripId}/depart`,{method:"POST"});
