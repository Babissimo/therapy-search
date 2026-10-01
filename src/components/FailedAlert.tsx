import { Loader2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Failing = {
  data: unknown;
  error: Error | null;
  isLoadingError: boolean;
  isPlaceholderData: boolean;
  isFetching: boolean;
  errorUpdatedAt: number;
  dataUpdatedAt: number;
  refetch: () => unknown;
};

/** A query's failure as the page shows it, with what Try again calls on. */
export type Failure = ReturnType<typeof useFailure>;

/**
 * The error of a query that loaded nothing, kept while it is asked again, by Try again or as the connection returns:
 * asking again puts such a query back to pending, which would swap the error, and the Try again holding focus, for a
 * loading state, or for the last question's answer. Undefined once it answers. `key` names what the query asks, and the
 * error is let go once another is asked, so going back to it loads as usual. Once what loaded takes the error's place, a
 * keyboard left on the page carries on from `landing`, the heading of it.
 */
export function useFailure(query: Failing, key: string) {
  // Pending again forgets the error, so the last one is held here, for its question and until that is answered.
  const [last, setLast] = useState<{ error: Error; key: string }>();
  let held = last;
  if (held && (held.key !== key || query.dataUpdatedAt > query.errorUpdatedAt)) held = undefined;
  if (query.isLoadingError && query.error && held?.error !== query.error) held = { error: query.error, key };
  if (held !== last) setLast(held);
  // Asked again, with nothing of its own to show yet.
  const again = held !== undefined && query.isFetching && (query.data === undefined || query.isPlaceholderData);
  const error = (query.isLoadingError ? query.error : again ? held?.error : undefined) ?? undefined;
  const landing = useRef<HTMLHeadingElement>(null);
  // The question whose error was in view, until `landing` is drawn in its place, which may be after a loading state. The
  // keyboard goes there only for the same question's answer, not another's.
  const shownFor = useRef<string>(undefined);
  useLayoutEffect(() => {
    if (error) shownFor.current = key;
    else if (shownFor.current !== undefined && landing.current) {
      const answered = shownFor.current === key;
      shownFor.current = undefined;
      if (answered && document.activeElement === document.body) landing.current.focus();
    }
  });
  const retry = () => {
    if (error) void query.refetch();
  };
  return { error, retrying: query.isFetching, retry, landing };
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
