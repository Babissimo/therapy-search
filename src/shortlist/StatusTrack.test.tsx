// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusTrack } from "./StatusTrack";
import { createShortlistStore, statusOf, type ShortlistCard, type Status } from "./store";
import { ShortlistContext, useShortlistEntry } from "./useShortlist";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] };

type Props = Omit<ComponentProps<typeof StatusTrack>, "therapist" | "status">;

/** The track as a list draws it, with Jo's status as the store holds it. */
function Tracked(props: Props) {
  const entry = useShortlistEntry(JO.slug);
  return entry ? <StatusTrack therapist={JO} status={statusOf(entry)} {...props} /> : null;
}

function renderTrack(status: Status, props: Props = {}) {
  let t = 5000;
  const store = createShortlistStore(null, () => t++);
  store.add(JO, { status: status === "toContact" ? undefined : status });
  render(
    <ShortlistContext.Provider value={store}>
      <TooltipProvider>
        <Tracked {...props} />
      </TooltipProvider>
    </ShortlistContext.Provider>,
  );
  return store;
}

/** The step the track stands at, by its name, or nothing. */
const currentStep = () =>
  within(screen.getByRole("list", { name: "Steps with Jo Bloggs" }))
    .getAllByRole("listitem")
    .find((step) => step.getAttribute("aria-current") === "step")?.textContent;

const filled = (part: Element | null) => part?.classList.contains("bg-primary");

/** The track as drawn: a dot per step (● done, ‖ paused, ○ still to come), each followed by the line to the next (━ filled, ─ not). */
const drawn = () =>
  within(screen.getByRole("list", { name: "Steps with Jo Bloggs" }))
    .getAllByRole("listitem")
    .map((step) => {
      // The dot comes before the line, and the last step has no line.
      const dot = step.querySelector("svg.lucide-pause") ? "‖" : filled(step.querySelector("span[aria-hidden]")) ? "●" : "○";
      const line = step.querySelector("span.flex-1");
      return dot + (line ? (filled(line) ? "━" : "─") : "");
    })
    .join("");

const nextStep = () => screen.queryByRole("button", { name: /, Jo Bloggs$/ })?.textContent;

describe("StatusTrack", () => {
  it.each<[Status, string | undefined, string, string | undefined, string]>([
    ["toContact", "To contact", "To contact", "Mark contacted, Jo Bloggs", "●─○─○─○"],
    ["contacted", "Contacted", "Contacted", "Consultation booked, Jo Bloggs", "●━●─○─○"],
    ["waiting", "Contacted", "Waiting list", "Consultation booked, Jo Bloggs", "●━‖─○─○"],
    ["consultation", "Consultation", "Consultation", "Seeing them, Jo Bloggs", "●━●━●─○"],
    ["seeing", "Seeing them", "Seeing them", undefined, "●━●━●━●"],
    ["setAside", undefined, "Set aside", "Consider again, Jo Bloggs", "○─○─○─○"],
  ])("draws %s at its step, with its label and next step", (status, step, label, next, track) => {
    renderTrack(status);
    expect(within(screen.getByRole("list", { name: "Steps with Jo Bloggs" })).getAllByRole("listitem").map((s) => s.textContent)).toEqual([
      "To contact",
      "Contacted",
      "Consultation",
      "Seeing them",
    ]);
    expect(currentStep()).toBe(step);
    expect(drawn()).toBe(track);
    screen.getByText(label, { selector: "p" });
    expect(nextStep()).toBe(next);
    screen.getByRole("button", { name: `Status of Jo Bloggs: ${label.toLowerCase()}` });
  });

  it("moves the therapist on a step at a time, saying so each time", () => {
    const onChosen = vi.fn();
    const store = renderTrack("toContact", { onChosen });
    fireEvent.click(screen.getByRole("button", { name: "Mark contacted, Jo Bloggs" }));
    expect(statusOf(store.get()[0]!)).toBe("contacted");
    expect(onChosen).toHaveBeenLastCalledWith("contacted");
    fireEvent.click(screen.getByRole("button", { name: "Consultation booked, Jo Bloggs" }));
    expect(statusOf(store.get()[0]!)).toBe("consultation");
    expect(currentStep()).toBe("Consultation");
    expect(onChosen).toHaveBeenLastCalledWith("consultation");
  });

  it("returns a therapist set aside to the start of the path", () => {
    const store = renderTrack("setAside");
    fireEvent.click(screen.getByRole("button", { name: "Consider again, Jo Bloggs" }));
    expect(statusOf(store.get()[0]!)).toBe("toContact");
    expect(currentStep()).toBe("To contact");
  });

  it("gives focus to the menu once the path's last step takes the button with it", () => {
    renderTrack("consultation");
    const button = screen.getByRole("button", { name: "Seeing them, Jo Bloggs" });
    act(() => button.focus());
    fireEvent.click(button);
    expect(nextStep()).toBeUndefined();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Status of Jo Bloggs: seeing them" }));
  });

  it("passes on what the menu chooses", () => {
    const onChosen = vi.fn();
    renderTrack("contacted", { onChosen });
    fireEvent.keyDown(screen.getByRole("button", { name: "Status of Jo Bloggs: contacted" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Waiting list" }));
    expect(onChosen).toHaveBeenCalledWith("waiting");
    expect(currentStep()).toBe("Contacted");
    screen.getByText("Waiting list", { selector: "p" });
  });

  it("shows where a therapist taken off the shortlist stood, with nothing to change it", () => {
    renderTrack("contacted", { listed: false });
    expect(currentStep()).toBe("Contacted");
    screen.getByText("Contacted", { selector: "p" });
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
