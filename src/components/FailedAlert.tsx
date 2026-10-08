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
export type Failure = ReturnType<typeof useFailure<HTMLHeadingElement>>;

/**
 * The error of a query that loaded nothing, kept while it is asked again, by `retry` or as the connection returns:
 * asking again puts such a query back to pending, which would swap the error, and the Try again holding focus, for a
 * loading state, or for the last question's answer. Undefined once it answers. `key` names what the query asks, and the
 * error is let go once another is asked, so going back to it loads as usual. Once what loaded takes the error's place, a
 * keyboard left on the page carries on from `landing`, the first of it, such as its heading.
 */
export function useFailure<Landing extends HTMLElement = HTMLHeadingElement>(query: Failing, key: string) {
  // Pending again forgets the error, so the last one is held here, for its question and until that is answered.
  const [last, setLast] = useState<{ error: Error; key: string }>();
  let held = last;
  if (held && (held.key !== key || query.dataUpdatedAt > query.errorUpdatedAt)) held = undefined;
  if (query.isLoadingError && query.error && held?.error !== query.error) held = { error: query.error, key };
  if (held !== last) setLast(held);
  // Asked again, with nothing of its own to show yet.
  const again = held !== undefined && query.isFetching && (query.data === undefined || query.isPlaceholderData);
  const error = (query.isLoadingError ? query.error : again ? held?.error : undefined) ?? undefined;
  const landing = useRef<Landing>(null);
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
    // A query with nothing loaded joins a fetch already on its way, such as the connection's return starts, rather than restarting it.
    if (error) void query.refetch();
  };
  return { error, retrying: query.isFetching, retry, landing };
}

type StatusProps = {
  failure: Pick<Failure, "error" | "retrying">;
  /** The failure in the words its line shows, where those say what failed and the error's own message doesn't. */
  saying?: string;
};

/**
 * What a failure's alert or quiet error line leaves unsaid: its error, "Trying again" while it is asked again, and the
 * error once more if that fails. Drawn before the failure, as a screen reader hears only a live region already there.
 */
export function FailureStatus({ failure: { error, retrying }, saying }: StatusProps) {
  return (
    <p aria-live="polite" className="sr-only">
      {error ? (retrying ? "Trying again" : (saying ?? error.message)) : ""}
    </p>
  );
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
 * A request that failed, with a Try again button that keeps keyboard focus through the retry. It says nothing itself: its
 * page says the failure, and how a retry goes, from a live region there before it, such as `FailureStatus`.
 */
export function FailedAlert({ error, retrying, onRetry, children }: Props) {
  return (
    // Without the role="alert" a destructive alert has by default.
    <Alert variant="destructive" role={undefined}>
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
            onClick={retrying ? undefined : onRetry}
          >
            {retrying && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
            Try again
          </Button>
          {children}
        </div>
      </AlertDescription>
    </Alert>
  );
}
