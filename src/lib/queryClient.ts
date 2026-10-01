import { QueryClient } from "@tanstack/react-query";

/** How long an answer counts as fresh, unless its query says otherwise. */
export const FRESH_FOR = 15 * 60 * 1000;

// Retrying would repeat requests to UKCP that already failed or were rate-limited.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: FRESH_FOR } },
});
