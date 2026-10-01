// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusMenu } from "./StatusMenu";
import { createShortlistStore, statusOf, type ShortlistCard, type ShortlistStore } from "./store";
import { ShortlistContext } from "./useShortlist";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] };

type Props = Omit<ComponentProps<typeof StatusMenu>, "therapist">;

function renderMenu(seed?: (store: ShortlistStore) => void, props: Props = {}) {
  let t = 5000;
  const store = createShortlistStore(null, () => t++);
  seed?.(store);
  render(
    <ShortlistContext.Provider value={store}>
      <TooltipProvider>
        <StatusMenu therapist={JO} {...props} />
      </TooltipProvider>
    </ShortlistContext.Provider>,
  );
  return store;
}

const shortlisted = (store: ShortlistStore) => store.add(JO);

/** Opens the menu as a keyboard does, since jsdom's pointer events lack the button Radix checks for. */
function open(name: string) {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });
  return screen.getByRole("menu");
}

describe("StatusMenu", () => {
  it("says where the visitor stands with the therapist, and changes it", () => {
    const onChosen = vi.fn();
    const store = renderMenu(shortlisted, { onChosen });
    open("Status of Jo Bloggs: to contact");
    expect(screen.getByRole("menuitemradio", { name: "To contact" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Contacted" }));
    expect(statusOf(store.get()[0]!)).toBe("contacted");
    expect(onChosen).toHaveBeenCalledWith("contacted");
    screen.getByRole("button", { name: "Status of Jo Bloggs: contacted" });
  });

  it("offers every status in order, then taking the therapist off the shortlist", () => {
    const onRemoved = vi.fn();
    const store = renderMenu(shortlisted, { onRemoved });
    const menu = open("Status of Jo Bloggs: to contact");
    expect(within(menu).getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "To contact",
      "Contacted",
      "Waiting list",
      "Consultation",
      "Seeing them",
      "Set aside",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Remove from shortlist" }));
    expect(store.has(JO.slug)).toBe(false);
    expect(onRemoved).toHaveBeenCalledOnce();
  });

  it("reports nothing when the status chosen is the one already set", () => {
    const onChosen = vi.fn();
    renderMenu(
      (store) => {
        store.add(JO);
        store.setStatus(JO.slug, "waiting");
      },
      { onChosen },
    );
    open("Status of Jo Bloggs: waiting list");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Waiting list" }));
    expect(onChosen).not.toHaveBeenCalled();
  });

  it("shows nothing for a therapist who isn't shortlisted", () => {
    renderMenu();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
