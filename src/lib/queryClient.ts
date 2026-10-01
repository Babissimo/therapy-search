import { QueryClient } from "@tanstack/react-query";

// Retrying would repeat requests to UKCP that already failed or were rate-limited.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15 * 60 * 1000 } },
});
