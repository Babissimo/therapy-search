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

/**
 * The track as drawn: a dot per step (● done, ‖ paused, ○ still to come), each followed by the line to the next (━ filled,
 * ─ not), reading a dot as done by `fill`, its class, and a line as filled where its fill, carrying `fill`, spans it.
 */
const drawn = (fill = "bg-primary") => {
  const filled = (part: Element | null | undefined) => part?.classList.contains(fill);
  return within(screen.getByRole("list", { name: "Steps with Jo Bloggs" }))
    .getAllByRole("listitem")
    .map((step) => {
      // The dot comes before the line, and the last step has no line.
      const dot = step.querySelector("svg.lucide-pause") ? "‖" : filled(step.querySelector("span[aria-hidden]")) ? "●" : "○";
      const line = step.querySelector("span.flex-1");
      const spans = line?.firstElementChild?.classList.contains("scale-x-100") && filled(line.firstElementChild);
      return dot + (line ? (spans ? "━" : "─") : "");
    })
    .join("");
};

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

  it("draws the same track under forced colours, which paint every fill as the page", () => {
    renderTrack("waiting");
    expect(drawn("forced-colors:bg-[CanvasText]")).toBe("●━‖─○─○");
    const list = screen.getByRole("list", { name: "Steps with Jo Bloggs" });
    // Each line is the disabled text's colour, the text's filling it as far as the path has come.
    const lines = [...list.querySelectorAll("span.flex-1")];
    expect(lines.filter((line) => line.classList.contains("forced-colors:bg-[GrayText]"))).toHaveLength(3);
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

  it("eases each dot and line to where the path now reaches, rather than jumping", () => {
    renderTrack("contacted");
    const list = screen.getByRole("list", { name: "Steps with Jo Bloggs" });
    for (const dot of list.querySelectorAll("li > span[aria-hidden]:not(.flex-1)")) expect(dot.className).toMatch(/motion-safe:transition-colors/);
    for (const line of list.querySelectorAll("span.flex-1")) {
      expect(line.firstElementChild?.className).toMatch(/\borigin-left\b/);
      expect(line.firstElementChild?.className).toMatch(/motion-safe:transition-\[scale\]/);
    }
  });

  it("fades in the words for a new status, though not as the track first draws", () => {
    renderTrack("toContact");
    // On the side bar's curve, which `animate-in` takes from `ease-in-out`.
    const fades = (element: Element | null | undefined) => /motion-safe:animate-in.*motion-safe:ease-in-out/.test(element?.className ?? "");
    expect(fades(screen.getByText("To contact", { selector: "p" }))).toBe(false);
    expect(fades(screen.getByText("Mark contacted"))).toBe(false);
    const button = screen.getByRole("button", { name: "Mark contacted, Jo Bloggs" });
    fireEvent.click(button);
    expect(fades(screen.getByText("Contacted", { selector: "p" }))).toBe(true);
    expect(fades(screen.getByText("Consultation booked"))).toBe(true);
    // The button stays the one pressed, keeping focus, as only its words are drawn anew.
    expect(screen.getByRole("button", { name: "Consultation booked, Jo Bloggs" })).toBe(button);
  });

  it("returns a therapist set aside to the start of the path", () => {
    const store = renderTrack("setAside");
    fireEvent.click(screen.getByRole("button", { name: "Consider again, Jo Bloggs" }));
    expect(statusOf(store.get()[0]!)).toBe("toContact");
    expect(currentStep()).toBe("To contact");
  });

  it("keeps the therapist's name in the next step's button from machine translation", () => {
    renderTrack("toContact");
    const button = screen.getByRole("button", { name: "Mark contacted, Jo Bloggs" });
    expect(within(button).getByText("Jo Bloggs").getAttribute("translate")).toBe("no");
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

  it("lets its buttons wrap under the status where they need the room, their targets kept apart on a touch screen", () => {
    renderTrack("waiting");
    const buttons = screen.getByRole("button", { name: "Status of Jo Bloggs: waiting list" }).parentElement!;
    expect(buttons.contains(screen.getByRole("button", { name: "Consultation booked, Jo Bloggs" }))).toBe(true);
    // On any pointer, as zoomed in with a mouse the row is as narrow as on a phone; close under the status, which takes no taps.
    expect(["flex-wrap", "gap-2"].map((c) => buttons.parentElement!.classList.contains(c))).toEqual([true, true]);
    // Under each other with room for both targets on a touch screen.
    expect(["flex-wrap", "pointer-coarse:gap-y-4"].map((c) => buttons.classList.contains(c))).toEqual([true, true]);
    // To the right, line by line, where they stand on a card wide enough for them.
    expect(["ml-auto", "justify-end"].map((c) => buttons.classList.contains(c))).toEqual([true, true]);
  });

  it("leaves the menu its icon on a touch screen where the track lacks the room for its word beside the next step", () => {
    renderTrack("contacted");
    const menu = screen.getByRole("button", { name: "Status of Jo Bloggs: contacted" });
    expect(menu.closest("[class~='@container/status-track']")).not.toBeNull();
    expect(menu.classList.contains("@max-[15.5rem]/status-track:*:data-touch-label:sr-only")).toBe(true);
    expect(within(menu).getByText("Status").hasAttribute("data-touch-label")).toBe(true);
  });

  it("shows where a therapist taken off the shortlist stood, saying they were removed, with nothing to change it", () => {
    renderTrack("contacted", { listed: false });
    expect(currentStep()).toBe("Contacted");
    screen.getByText("Contacted", { selector: "p" });
    screen.getByText("Removed from your shortlist", { selector: "p" });
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
