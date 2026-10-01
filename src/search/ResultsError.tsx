import { ExternalLink } from "lucide-react";
import { ukcpSearchUrl, type SearchParams } from "@shared/query";
import { FailedAlert } from "@/components/FailedAlert";

type Props = { error: Error; params: SearchParams; retrying: boolean; onRetry: () => void };

/** A search that failed, to try again or to take to UKCP's own search. */
export function ResultsError({ error, params, retrying, onRetry }: Props) {
  return (
    <FailedAlert error={error} retrying={retrying} onRetry={onRetry}>
      <a className="inline-flex items-center gap-1 underline" href={ukcpSearchUrl(params)} target="_blank" rel="noreferrer">
        Search on UKCP
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </FailedAlert>
  );
}
