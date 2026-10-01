import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Failing = { error: Error | null; isLoadingError: boolean; isFetching: boolean; refetch: () => unknown };

/**
 * The error of a query that loaded nothing, kept through its retry: retrying puts such a query back to pending, which
 * would swap the error, and the Try again holding focus, for a loading state. Undefined once a retry works. `key` names
 * what the query asks, so a different question asked during the retry loads as usual.
 */
export function useFailure(query: Failing, key: string) {
  // The error being retried, until the retry has started and settled. It may start a render or more after it is asked for.
  const [retryOf, setRetryOf] = useState<{ error: Error; key: string; started: boolean }>();
  let kept = retryOf;
  if (kept && (kept.key !== key || (!query.isFetching && (kept.started || !query.isLoadingError)))) kept = undefined;
  else if (kept && !kept.started && query.isFetching) kept = { ...kept, started: true };
  if (kept !== retryOf) setRetryOf(kept);
  const error = (query.isLoadingError ? query.error : query.isFetching ? kept?.error : undefined) ?? undefined;
  const retry = () => {
    if (!error) return;
    setRetryOf({ error, key, started: false });
    void query.refetch();
  };
  return { error, retrying: query.isFetching, retry };
}

type Props = {
  error: Error;
  /** True while the retry is on its way. */
  retrying: boolean;
  onRetry: () => void;
  /** Beside Try again, such as a way round the failure. */
  children?: ReactNode;
};

/**
 * A request that failed, with a Try again button that keeps keyboard focus through the retry. The alert speaks as it
 * appears; how a retry goes is told beside it, as the alert, still there and unchanged when it fails again, says nothing.
 */
export function FailedAlert({ error, retrying, onRetry, children }: Props) {
  const [retried, setRetried] = useState(false);
  return (
    <>
      <Alert variant="destructive">
        <AlertDescription className="space-y-3">
          <div>{error.message}</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-foreground aria-disabled:opacity-50"
              // Not disabled while retrying, which would drop focus; a second press is ignored.
              aria-disabled={retrying}
              onClick={() => {
                if (retrying) return;
                setRetried(true);
                onRetry();
              }}
            >
              {retrying && <Loader2 className="animate-spin" aria-hidden />}
              Try again
            </Button>
            {children}
          </div>
        </AlertDescription>
      </Alert>
      <p aria-live="polite" className="sr-only">
        {retrying ? "Trying again" : retried ? error.message : ""}
      </p>
    </>
  );
}
