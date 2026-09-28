import { useState } from "react";
import type { SearchParams } from "@shared/query";
import { withText } from "./state";

export type SearchDrafts = {
  location: string;
  setLocation: (location: string) => void;
  keyword: string;
  setKeyword: (keyword: string) => void;
  /** Searches for `next`, taking whatever is typed in the location and keyword boxes with it. */
  submit: (next: SearchParams) => void;
};

/** What is typed but not yet searched, shared by the search box and the filter panel so any change submits it all. */
export function useSearchDrafts(params: SearchParams, onChange: (next: SearchParams) => void): SearchDrafts {
  const [location, setLocation] = useDraft(params.text.Location);
  const [keyword, setKeyword] = useDraft(params.text.KeywordFilter);
  return {
    location,
    setLocation,
    keyword,
    setKeyword,
    submit: (next) => onChange(withText(withText(next, "Location", location), "KeywordFilter", keyword)),
  };
}

/** A local draft of a value from the URL, reset whenever the URL's value changes. */
function useDraft<T>(value: T): [T, (draft: T) => void] {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  return [draft, setDraft];
}
