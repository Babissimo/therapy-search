import { ukcpSearchUrl, type SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ResultsError({ error, params }: { error: Error; params: SearchParams }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {error.message}{" "}
        <a className="underline" href={ukcpSearchUrl(params)}>
          Search on UKCP
        </a>
      </AlertDescription>
    </Alert>
  );
}
