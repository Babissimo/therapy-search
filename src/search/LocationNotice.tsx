import { Alert, AlertDescription } from "@/components/ui/alert";

/** UKCP answers a place it doesn't know with results from anywhere, saying only that it searched "United Kingdom". */
export function locationFellBack(typed: string, searched: string | undefined): boolean {
  const place = typed.trim();
  return place !== "" && searched === "United Kingdom" && !/^(uk|united kingdom)$/i.test(place);
}

export function LocationNotice({ typed, searched }: { typed: string; searched?: string }) {
  if (locationFellBack(typed, searched)) {
    return (
      <Alert>
        <AlertDescription>
          UKCP didn't recognise "{typed.trim()}", so these results are from across the UK. Try a town or a postcode.
        </AlertDescription>
      </Alert>
    );
  }
  if (!searched) return null;
  return (
    <p className="text-sm">
      Location searched: <strong translate="no">{searched}</strong>
    </p>
  );
}
