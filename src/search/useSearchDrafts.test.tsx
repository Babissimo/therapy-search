// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import type { FilterField } from "@shared/types";
import { withFlag, withMulti, withText } from "./state";
import { useDraftFilters, useSearchDrafts, type DraftEntry } from "./useSearchDrafts";

const FRENCH: FilterField = { name: "Languages", value: "French", label: "French" };
const GERMAN: FilterField = { name: "Languages", value: "German", label: "German" };
const OUTSIDE_UK: FilterField = { name: "LocationSearchOutsideUK", value: "true", label: "Search locations outside the UK" };

const inBath = withText(emptyParams(), "Location", "Bath");
const inLeeds = withText(emptyParams(), "Location", "Leeds");

/** The drafts of a view at `at`, which `show` brings to another search, at its entry or another. */
function draftsFor(initial: SearchParams, onChange = vi.fn(), at: DraftEntry = { entry: "default", kept: true }) {
  const hook = renderHook(
    ({ params, at }) => {
      const drafts = useSearchDrafts(params, at, onChange);
      return { drafts, filters: useDraftFilters(drafts) };
    },
    { initialProps: { params: initial, at } },
  );
  const show = (params: SearchParams, entry = at.entry) => hook.rerender({ params, at: { ...at, entry } });
  return { ...hook, onChange, show, drafts: () => hook.result.current.drafts };
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
    const { result, show, drafts } = draftsFor(inBath);
    act(() => drafts().toggle(FRENCH, true));
    show(withMulti(inLeeds, "Languages", "German", true));
    expect(result.current.filters.multi.Languages).toEqual(["German"]);
    expect(drafts().pending()).toBe(false);
  });

  it("keeps the draft for its entry, bringing it all back as the view mounts there again", () => {
    const left = draftsFor(inBath);
    act(() => {
      left.drafts().toggle(FRENCH, true);
      left.drafts().set("location", "Bristol");
      left.drafts().set("keyword", "grief");
    });
    left.unmount();
    const { result, drafts } = draftsFor(inBath);
    expect(result.current.filters.multi.Languages).toEqual(["French"]);
    expect([drafts().get("location"), drafts().get("keyword")]).toEqual(["Bristol", "grief"]);
    expect(drafts().pending()).toBe(true);
  });

  it("starts from the search on show where its entry kept a draft over another search, as an address pasted in can", () => {
    const left = draftsFor(inBath);
    act(() => left.drafts().toggle(FRENCH, true));
    left.unmount();
    const { result, drafts } = draftsFor(inLeeds);
    expect(result.current.filters.multi.Languages).toEqual([]);
    expect(drafts().get("location")).toBe("Leeds");
  });

  it("takes the draft kept for each entry the view is brought to while mounted, or else the search on show there", () => {
    const { result, show, drafts } = draftsFor(inBath, vi.fn(), { entry: "bath", kept: true });
    act(() => drafts().toggle(FRENCH, true));
    show(inLeeds, "leeds");
    expect(result.current.filters.multi.Languages).toEqual([]);
    expect(drafts().get("location")).toBe("Leeds");
    act(() => drafts().toggle(GERMAN, true));
    show(inBath, "bath");
    expect(result.current.filters.multi.Languages).toEqual(["French"]);
    expect(drafts().get("location")).toBe("Bath");
    show(inLeeds, "leeds");
    expect(result.current.filters.multi.Languages).toEqual(["German"]);
  });

  it("keeps nothing for an entry where the view keeps no draft", () => {
    const left = draftsFor(inBath, vi.fn(), { entry: "default", kept: false });
    act(() => left.drafts().toggle(FRENCH, true));
    left.unmount();
    const { result } = draftsFor(inBath);
    expect(result.current.filters.multi.Languages).toEqual([]);
  });

  it("types a place its entry was sent with in the box, unless the entry kept a draft of its own or the search on show has a place", () => {
    const sent = { entry: "sent", kept: true, place: "Leeds" };
    const left = draftsFor(emptyParams(), vi.fn(), sent);
    expect(left.drafts().get("location")).toBe("Leeds");
    expect(left.drafts().pending()).toBe(false);
    act(() => left.drafts().set("location", "York"));
    left.unmount();
    const { drafts } = draftsFor(emptyParams(), vi.fn(), sent);
    expect(drafts().get("location")).toBe("York");
    expect(draftsFor(inBath, vi.fn(), { ...sent, entry: "placed" }).drafts().get("location")).toBe("Bath");
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
