// @vitest-environment jsdom
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShortlistCard } from "@/shortlist/store";
import type { EmailDrafter } from "./EmailDrafter";
import type { LazyEmailDrafter } from "./LazyEmailDrafter";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] };

type Module = { EmailDrafter: typeof EmailDrafter };

/** The drafter's chunk, standing in for the real one. */
const STAND_IN: Module = { EmailDrafter: () => <div role="dialog" aria-label="Drafter" /> };

/** The lazy drafter's module read afresh, so it meets whatever `vi.doMock` has put in place of what it imports. */
async function fresh() {
  vi.resetModules();
  return import("./LazyEmailDrafter");
}

const draw = (Drafter: typeof LazyEmailDrafter) => render(<Drafter therapist={JO} onClose={() => {}} onMarked={() => {}} />);

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("./EmailDrafter");
  vi.doUnmock("@/lib/lazyChunk");
  vi.resetModules();
});

describe("LazyEmailDrafter", () => {
  it("says it is opening while its chunk is on the way, then draws the drafter in place of that", async () => {
    let arrive: (module: Module) => void = () => {};
    const arrived = new Promise<Module>((resolve) => (arrive = resolve));
    vi.doMock("./EmailDrafter", () => arrived);
    const { LazyEmailDrafter: Drafter } = await fresh();
    const watching = new MutationObserver(() => {});
    watching.observe(document.body, { childList: true, subtree: true });
    draw(Drafter);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Opening the drafter");
    // Its words were added to the region once it was there, which a screen reader hears, rather than drawn with it.
    const added = watching.takeRecords().filter((record) => record.target === status);
    watching.disconnect();
    expect(added.flatMap((record) => [...record.addedNodes].map((node) => node.textContent))).toEqual(["Opening the drafter"]);
    await act(async () => arrive(STAND_IN));
    await screen.findByRole("dialog", { name: "Drafter" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces that the drafter couldn't open when its chunk can't be fetched, as it answers the visitor's press", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("./EmailDrafter", () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    const { LazyEmailDrafter: Failing } = await fresh();
    draw(Failing);
    expect((await screen.findByRole("alert")).textContent).toBe("The email drafter couldn't open just now. Reload the page to try again.");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("usePreloadDrafter", () => {
  it("fetches the drafter's chunk once a track wants it", async () => {
    const asked = vi.fn();
    vi.doMock("./EmailDrafter", () => {
      asked();
      return STAND_IN;
    });
    const { usePreloadDrafter } = await fresh();
    renderHook(() => usePreloadDrafter(true));
    await vi.waitFor(() => expect(asked).toHaveBeenCalledOnce());
  });

  it("fetches nothing while no track wants it", async () => {
    // The loader itself, as a fetch never asked for leaves nothing to wait on.
    const load = vi.fn(() => Promise.resolve());
    vi.doMock("@/lib/lazyChunk", () => ({ lazyChunk: () => ({ Component: () => null, load }) }));
    const { usePreloadDrafter } = await fresh();
    const { rerender } = renderHook(({ wanted }) => usePreloadDrafter(wanted), { initialProps: { wanted: false } });
    expect(load).not.toHaveBeenCalled();
    rerender({ wanted: true });
    expect(load).toHaveBeenCalledOnce();
  });
});
