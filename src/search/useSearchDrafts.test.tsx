// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import type { FilterField } from "@shared/types";
import { withFlag, withMulti, withText } from "./state";
import { useDraftFilters, useSearchDrafts } from "./useSearchDrafts";

const FRENCH: FilterField = { name: "Languages", value: "French", label: "French" };
const GERMAN: FilterField = { name: "Languages", value: "German", label: "German" };
const OUTSIDE_UK: FilterField = { name: "LocationSearchOutsideUK", value: "true", label: "Search locations outside the UK" };

const inBath = withText(emptyParams(), "Location", "Bath");

function draftsFor(initial: SearchParams, onChange = vi.fn()) {
  const hook = renderHook(
    ({ params }) => {
      const drafts = useSearchDrafts(params, onChange);
      return { drafts, filters: useDraftFilters(drafts) };
    },
    { initialProps: { params: initial } },
  );
  return { ...hook, onChange, drafts: () => hook.result.current.drafts };
}

describe("useSearchDrafts", () => {
  it("ticks a box in the draft alone, searching nothing", () => {
    const { result, onChange, drafts } = draftsFor(inBath);
    act(() => drafts().toggle(FRENCH, true));
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.filters.multi.Languages).toEqual(["French"]);
  });

  it("is pending while the draft's filters differ from the search on show, and not once ticked back", () => {
    const { drafts } = draftsFor(inBath);
    expect(drafts().pending()).toBe(false);
    act(() => drafts().toggle(FRENCH, true));
    expect(drafts().pending()).toBe(true);
    act(() => drafts().toggle(FRENCH, false));
    expect(drafts().pending()).toBe(false);
  });

  it("counts a typed keyword as pending, but not a typed place", () => {
    const { drafts } = draftsFor(inBath);
    act(() => drafts().set("location", "Bristol"));
    expect(drafts().pending()).toBe(false);
    act(() => drafts().set("keyword", "grief"));
    expect(drafts().pending()).toBe(true);
  });

  it("searches the whole draft, with the typed place and keyword", () => {
    const { onChange, drafts } = draftsFor(inBath);
    act(() => {
      drafts().toggle(FRENCH, true);
      drafts().set("location", "Bristol");
      drafts().set("keyword", "grief");
    });
    act(() => drafts().apply());
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ text: { Location: "Bristol", KeywordFilter: "grief" }, multi: { Languages: ["French"] } });
  });

  it("searches the whole draft at a place given, putting it in the box", () => {
    const { onChange, drafts } = draftsFor(inBath);
    act(() => drafts().toggle(FRENCH, true));
    act(() => drafts().applyAt("BN3 1FG"));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ text: { Location: "BN3 1FG" }, multi: { Languages: ["French"] } });
    expect(drafts().get("location")).toBe("BN3 1FG");
  });

  it("searches the draft less a filter its chip names, taking the rest of the draft with it", () => {
    const { onChange, drafts } = draftsFor(withMulti(inBath, "Languages", "French", true));
    act(() => drafts().toggle(GERMAN, true));
    act(() => drafts().applyWithout("Languages=French"));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ text: { Location: "Bath" }, multi: { Languages: ["German"] } });
  });

  it("searches the draft as it is when the draft has already dropped the chip's filter", () => {
    const { onChange, drafts } = draftsFor(withMulti(inBath, "Languages", "French", true));
    act(() => drafts().toggle(FRENCH, false));
    act(() => drafts().applyWithout("Languages=French"));
    expect(onChange.mock.calls[0]?.[0].multi.Languages).toEqual([]);
  });

  it("takes the filters of each new search on show, dropping ticks not searched", () => {
    const { result, rerender, drafts } = draftsFor(inBath);
    act(() => drafts().toggle(FRENCH, true));
    rerender({ params: withMulti(withText(emptyParams(), "Location", "Leeds"), "Languages", "German", true) });
    expect(result.current.filters.multi.Languages).toEqual(["German"]);
    expect(drafts().pending()).toBe(false);
  });

  it("clears the draft's filters and keyword without searching, keeping the place and the outside-UK tick", () => {
    const shown = withMulti(withFlag(inBath, "LocationSearchOutsideUK", true), "Languages", "French", true);
    const { result, onChange, drafts } = draftsFor(withText(shown, "KeywordFilter", "grief"));
    act(() => drafts().clear());
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.filters.multi.Languages).toEqual([]);
    expect(result.current.filters.flags.LocationSearchOutsideUK).toBe(true);
    expect(drafts().get("keyword")).toBe("");
    expect(drafts().get("location")).toBe("Bath");
  });

  it("ticks the outside-UK box in the draft like any other", () => {
    const { result, onChange, drafts } = draftsFor(inBath);
    act(() => drafts().toggle(OUTSIDE_UK, true));
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.filters.flags.LocationSearchOutsideUK).toBe(true);
    expect(drafts().pending()).toBe(true);
  });
});
