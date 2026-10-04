import { ExternalLink } from "lucide-react";
import { ukcpSearchUrl, type SearchParams } from "@shared/query";
import { FailedAlert } from "@/components/FailedAlert";
import { NEW_TAB } from "@/lib/newTab";

type Props = { error: Error; params: SearchParams; retrying: boolean; retried: boolean; onRetry: () => void };

/** A search that failed, to try again or to take to UKCP's own search. Its ResultsStatus says so, as the list may be out of sight. */
export function ResultsError({ error, params, retrying, retried, onRetry }: Props) {
  return (
    <FailedAlert error={error} retrying={retrying} retried={retried} onRetry={onRetry} quiet>
      <a className="inline-flex items-center gap-1 underline" href={ukcpSearchUrl(params)} target="_blank" rel="noreferrer">
        Search on UKCP
        <ExternalLink aria-hidden className="size-3.5" />{" "}
        <span className="sr-only">{NEW_TAB}</span>
      </a>
    </FailedAlert>
  );
}
