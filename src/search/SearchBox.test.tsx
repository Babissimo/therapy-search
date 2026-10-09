// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, api } from "@/lib/api";
import { NO_PLACE, SearchBox } from "./SearchBox";
import { NO_POSTCODE, REFUSED } from "./useLocate";
import { useDraft, useSearchDrafts } from "./useSearchDrafts";

type HarnessProps = { params: SearchParams; onChange: (next: SearchParams) => void; onPlaceSearch?: () => void; onFocus?: () => void };

function Harness({ params, onChange, onPlaceSearch, onFocus }: HarnessProps) {
  const drafts = useSearchDrafts(params, { entry: "default", kept: false }, onChange);
  const keyword = useDraft(drafts, "keyword");
  return (
    <>
      <SearchBox params={params} drafts={drafts} onPlaceSearch={onPlaceSearch} onFocus={onFocus} />
      <input aria-label="Keyword" value={keyword} onChange={(e) => drafts.set("keyword", e.target.value)} />
    </>
  );
}

const renderBox = (onChange = vi.fn(), onPlaceSearch?: () => void) =>
  render(
    <TooltipProvider>
      <Harness params={emptyParams()} onChange={onChange} onPlaceSearch={onPlaceSearch} />
    </TooltipProvider>,
  );

/** Gives the page a geolocation that answers each request with `answer`. */
function geolocation(answer: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => answer(ok, fail!));
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
}
const at = (latitude: number, longitude: number) => (ok: PositionCallback) => ok({ coords: { latitude, longitude } } as GeolocationPosition);
const failing = (code: number) => (_: PositionCallback, fail: PositionErrorCallback) => fail({ code } as GeolocationPositionError);

const locate = () => fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
const location = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Location" });

afterEach(() => {
  Reflect.deleteProperty(navigator, "geolocation");
  vi.restoreAllMocks();
});

describe("SearchBox", () => {
  it("searches the postcode nearest the visitor, with the typed keyword", async () => {
    geolocation(at(50.82614, -0.15987));
    const nearest = vi.spyOn(api, "nearest").mockResolvedValue({ found: true, postcode: "BN3 1FG" });
    const onChange = vi.fn();
    renderBox(onChange);
    fireEvent.change(location(), { target: { value: "Leeds" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Keyword" }), { target: { value: "grief" } });
    locate();
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(nearest).toHaveBeenCalledWith(50.82614, -0.15987);
    expect(onChange.mock.calls[0]?.[0].text).toMatchObject({ Location: "BN3 1FG", KeywordFilter: "grief" });
    expect(location().value).toBe("BN3 1FG");
  });

  it("asks for a place rather than searching with the box blank, until the box is typed in or located", () => {
    geolocation(() => {});
    const onPlaceSearch = vi.fn();
    const onChange = vi.fn();
    renderBox(onChange, onPlaceSearch);
    const search = () => fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(location(), { target: { value: "  " } });
    search();
    expect(onChange).not.toHaveBeenCalled();
    expect(onPlaceSearch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(NO_PLACE);
    expect(document.activeElement).toBe(location());
    expect(location().getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(location(), { target: { value: "Y" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(location().getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(location(), { target: { value: "" } });
    search();
    expect(screen.getByRole("alert").textContent).toBe(NO_PLACE);
    locate();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells its owner when it searches a place, typed or located, but not when no postcode is found", async () => {
    geolocation(at(48.85, 2.35));
    const nearest = vi.spyOn(api, "nearest").mockResolvedValue({ found: false });
    const onPlaceSearch = vi.fn();
    renderBox(vi.fn(), onPlaceSearch);
    locate();
    await screen.findByRole("alert");
    expect(onPlaceSearch).not.toHaveBeenCalled();
    nearest.mockResolvedValue({ found: true, postcode: "BN3 1FG" });
    locate();
    await waitFor(() => expect(onPlaceSearch).toHaveBeenCalledOnce());
    fireEvent.change(location(), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onPlaceSearch).toHaveBeenCalledTimes(2);
  });

  it("says so when the browser won't share the position, until the box is typed in", async () => {
    geolocation(failing(1));
    renderBox();
    locate();
    expect((await screen.findByRole("alert")).textContent).toBe(REFUSED);
    fireEvent.change(location(), { target: { value: "L" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when no UK postcode is near", async () => {
    geolocation(at(48.85, 2.35));
    vi.spyOn(api, "nearest").mockResolvedValue({ found: false });
    const onChange = vi.fn();
    renderBox(onChange);
    locate();
    expect((await screen.findByRole("alert")).textContent).toBe(NO_POSTCODE);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("passes on the Worker's reason when the lookup fails", async () => {
    geolocation(at(50.826, -0.16));
    vi.spyOn(api, "nearest").mockRejectedValue(new ApiError(502, "Couldn't find the nearest postcode just now."));
    renderBox();
    locate();
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't find the nearest postcode just now.");
  });

  it("ignores a second press while the first is locating", () => {
    const getCurrentPosition = geolocation(() => {});
    renderBox();
    locate();
    locate();
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("names Use my location on screen beneath the box on touch screens, keeping it in the box's end elsewhere", () => {
    geolocation(() => {});
    renderBox();
    const button = screen.getByRole("button", { name: "Use my location" });
    // In the flow beneath the box, and still positioned, so nothing placed against it lands on the box.
    expect(button.className).toContain("pointer-coarse:relative pointer-coarse:inset-auto");
    expect(button.firstElementChild?.className).toContain("stacked:not-sr-only");
    expect(location().className).toContain("pointer-coarse:pr-2.5");
  });

  it("sets Use my location far enough beneath the box on touch screens that its target, 8px past it, stops at the box", () => {
    geolocation(() => {});
    renderBox();
    expect(screen.getByRole("button", { name: "Use my location" }).className).toContain("pointer-coarse:mt-2");
  });

  it("offers no button where the browser can't locate", () => {
    renderBox();
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();
  });

  it("hears focus coming to the box", () => {
    const onFocus = vi.fn();
    render(
      <TooltipProvider>
        <Harness params={emptyParams()} onChange={vi.fn()} onFocus={onFocus} />
      </TooltipProvider>,
    );
    fireEvent.focus(location());
    expect(onFocus).toHaveBeenCalledOnce();
  });
});
