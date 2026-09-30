import { ExternalLink } from "lucide-react";
import { ukcpSearchUrl, type SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ResultsError({ error, params }: { error: Error; params: SearchParams }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {error.message}{" "}
        <a className="inline-flex items-center gap-1 underline" href={ukcpSearchUrl(params)} target="_blank" rel="noreferrer">
          Search on UKCP
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </AlertDescription>
    </Alert>
  );
}
