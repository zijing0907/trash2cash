import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import type { User } from "./types";

/** The logged-in user, or null for a guest. */
export function useMe() {
  return useQuery<User | null>({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.setQueryData(["me"], null);
      qc.removeQueries({ queryKey: ["scans"] });
    },
  });
}

/** Classes, bins and metrics of the served model. Changes only when ml-service is redeployed. */
export function useModelInfo() {
  return useQuery({ queryKey: ["model"], queryFn: api.model, staleTime: Infinity, retry: 1 });
}
