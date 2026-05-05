import { QueryClient, useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const LS_PREFIX = "crt:q2:";
const LS_MAX_AGE = 10 * 60 * 1000;

function lsRead(path) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + path);
    if (!raw) return {};
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > LS_MAX_AGE) return {};
    return { data, ts };
  } catch {
    return {};
  }
}

function lsWrite(path, data) {
  try {
    localStorage.setItem(LS_PREFIX + path, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function useApiQuery(path, options = {}) {
  const { data: initialData, ts: initialDataUpdatedAt } = lsRead(path);

  const result = useQuery({
    queryKey: [path],
    queryFn: () => api.get(path),
    initialData,
    initialDataUpdatedAt,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    ...options,
  });

  const { data } = result;
  if (data !== undefined && data !== initialData) {
    lsWrite(path, data);
  }

  return result;
}

export function prefetchApiQuery(path) {
  const { data: initialData } = lsRead(path);
  return queryClient.prefetchQuery({
    queryKey: [path],
    queryFn: () => api.get(path),
    initialData,
    staleTime: 5 * 60 * 1000,
  });
}
