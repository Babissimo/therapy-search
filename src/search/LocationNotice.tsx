import { locationFellBack } from "@shared/location";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LocationNotice({ typed, searched }: { typed: string; searched?: string }) {
  if (!locationFellBack(typed, searched)) return null;
  return (
    <Alert>
      <AlertDescription>UKCP didn't recognise "{typed.trim()}", so these results are from across the UK. Try a town or a postcode.</AlertDescription>
    </Alert>
  );
}
