"use client";
import{useMutation,useQuery,useQueryClient}from"@tanstack/react-query";import{departTrip,fetchManifest,generateManifest,lockManifest}from"../api";
const key=(tripId:string)=>["manifests",tripId]as const;
export const useManifest=(tripId:string|null)=>useQuery({queryKey:key(tripId??"none"),queryFn:()=>fetchManifest(tripId as string),enabled:Boolean(tripId),retry:false});
export function useGenerateManifest(){const q=useQueryClient();return useMutation({mutationFn:(tripId:string)=>generateManifest(tripId),onSuccess:(data)=>q.setQueryData(key(data.trip.id),data)});}
export function useLockManifest(){const q=useQueryClient();return useMutation({mutationFn:({id}:{id:string;tripId:string})=>lockManifest(id),onSuccess:(_,v)=>{q.invalidateQueries({queryKey:key(v.tripId)});q.invalidateQueries({queryKey:["trips"]});}});}

export function useDepartTrip(){const q=useQueryClient();return useMutation({mutationFn:(tripId:string)=>departTrip(tripId),onSuccess:(_,tripId)=>{q.invalidateQueries({queryKey:key(tripId)});q.invalidateQueries({queryKey:["trips"]});},});}
