import { useState, type FormEvent } from "react";
import { TEXT_MAX_LENGTH, type SearchParams } from "@shared/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpWithPicker } from "./HelpWithPicker";
import { helpWithTerms, withHelpWithTerms, withText } from "./state";

type Props = { params: SearchParams; onChange: (next: SearchParams) => void };

/** The top bar. Like UKCP's, it applies on Search, not as you type. The parent re-keys it when the URL changes. */
export function SearchBar({ params, onChange }: Props) {
  const [terms, setTerms] = useState(() => helpWithTerms(params));
  const [location, setLocation] = useState(params.text.Location);

  function submit(event: FormEvent) {
    event.preventDefault();
    onChange(withText(withHelpWithTerms(params, terms), "Location", location));
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="space-y-1.5">
        <label htmlFor="help-with" className="text-sm font-medium">
          I want help with
        </label>
        <HelpWithPicker id="help-with" terms={terms} onChange={setTerms} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="location" className="text-sm font-medium">
          Location
        </label>
        <Input id="location" maxLength={TEXT_MAX_LENGTH} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Town or postcode" />
      </div>
      <Button type="submit">Search</Button>
    </form>
  );
}
