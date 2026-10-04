// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { TherapistCard as Therapist } from "@shared/types";
import type { Status } from "@/shortlist/store";
import { TherapistCard } from "./TherapistCard";

const therapist = (extra: Partial<Therapist> = {}): Therapist => ({
  slug: "Test-Therapist-1-TESTID01",
  name: "Test Therapist 1",
  initials: "TT",
  location: "London E8",
  distance: "0.2 miles from E8 3DQ",
  sessionTypes: "In-person & Remote",
  summary: "Summary text.",
  tags: ["Anxiety", "Trauma", "EMDR"],
  ...extra,
});

type Options = { grouped?: boolean; action?: ReactNode; online?: boolean; fee?: string; status?: Status; track?: ReactNode; note?: string };

function renderCard(t: Therapist, sought: string[] = [], { grouped, action, online, fee, status, track, note }: Options = {}) {
  render(
    <MemoryRouter>
      <TherapistCard
        therapist={t}
        sought={new Set(sought)}
        grouped={grouped}
        action={action}
        online={online}
        fee={fee}
        status={status}
        track={track}
        note={note}
      />
    </MemoryRouter>,
  );
}

/** The line holding `where`, which a browser translating the page leaves as it is, and the distance after it. */
function placeLine(where: string) {
  const place = screen.getByText(where);
  expect(place.getAttribute("translate")).toBe("no");
  // One element beside the pin's icon, so place and distance wrap as one line.
  const line = place.parentElement!;
  expect(line.previousElementSibling?.classList.contains("lucide-map-pin")).toBe(true);
  return line.textContent;
}

describe("TherapistCard", () => {
  it("links to the profile and says where the therapist is from the searched place", () => {
    renderCard(therapist());
    const name = screen.getByRole("link", { name: "Test Therapist 1" });
    expect(name.getAttribute("href")).toBe("/therapist/Test-Therapist-1-TESTID01");
    expect(name.getAttribute("translate")).toBe("no");
    expect(placeLine("E8")).toBe("E8 (0.2 miles away)");
    screen.getByText("In-person");
    screen.getByText("Remote");
    screen.getByText("Summary text.");
  });

  it("gives UKCP's page for the therapist under their name on paper alone, as paper can't follow the link", () => {
    renderCard(therapist());
    const printed = screen.getByText("psychotherapy.org.uk/therapist/Test-Therapist-1-TESTID01");
    expect([...printed.classList].filter((name) => /^(print:)?(hidden|block)$/.test(name))).toEqual(["hidden", "print:block"]);
    expect(printed.getAttribute("translate")).toBe("no");
    expect(printed.previousElementSibling?.textContent).toBe("Test Therapist 1");
  });

  it("gives the fee of the office it names on a line of its own, and none it hasn't", () => {
    renderCard(therapist(), [], { fee: "From £60" });
    expect(screen.getByText("From £60").closest("p")?.textContent).toBe("Fees: From £60");
    expect(screen.getByText("Remote").closest("p")?.textContent).toBe("In-person, Remote");
    cleanup();
    renderCard(therapist());
    expect(screen.queryByText(/Fees/)).toBeNull();
  });

  it("gives the fee on its own among therapists met online", () => {
    renderCard(therapist({ sessionTypes: "Remote" }), [], { online: true, fee: "£70" });
    expect(screen.getByText("£70").closest("p")?.textContent).toBe("Fees: £70");
  });

  it("says where the visitor stands with a shortlisted therapist on a line after the fee, and nothing for To contact", () => {
    renderCard(therapist(), [], { fee: "From £60", status: "consultation" });
    const line = screen.getByText("Consultation").closest("p");
    expect(line?.textContent).toBe("Status: Consultation");
    expect(line?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("From £60").closest("p")?.nextElementSibling).toBe(line);
    cleanup();
    renderCard(therapist(), [], { status: "toContact" });
    expect(screen.queryByText(/Status/)).toBeNull();
  });

  it("fades the portrait of a therapist set aside, and none of the text", () => {
    const portrait = () => screen.getByText("TT").closest("[data-slot=avatar]")?.parentElement;
    renderCard(therapist(), [], { status: "setAside" });
    expect(portrait()?.className).toMatch(/\bopacity-60\b/);
    expect(screen.getByRole("link", { name: "Test Therapist 1" }).closest("[class*=opacity]")).toBeNull();
    expect(screen.getByText("Set aside").closest("[class*=opacity]")).toBeNull();
    cleanup();
    renderCard(therapist(), [], { status: "contacted" });
    expect(portrait()?.className).not.toMatch(/\bopacity-60\b/);
  });

  it("gives the first line written of the visitor's note under the track, cut to the card's width on screen alone", () => {
    renderCard(therapist(), [], { track: <div>Track</div>, note: "\n  Rang on Tuesday\nCall back Friday" });
    const text = screen.getByText("Rang on Tuesday");
    expect(text.className).toMatch(/\btruncate\b/);
    expect(text.className).toMatch(/\bprint:whitespace-normal\b/);
    const line = text.closest("p")!;
    expect(line.textContent).toBe("Your notes: Rang on Tuesday");
    expect(line.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Track").parentElement?.nextElementSibling).toBe(line);
    expect(screen.queryByText(/Call back Friday/)).toBeNull();
    // Not raised over the card's link, so a click on it opens the profile, where the note is written.
    expect(line.closest("[class*=z-10]")).toBeNull();
    cleanup();
    renderCard(therapist(), [], { note: " \n \n" });
    expect(screen.queryByText(/Your notes/)).toBeNull();
  });

  it("keeps a full postcode without its town", () => {
    renderCard(therapist({ location: "Hackney E8 3DQ", distance: "1 mile from E8 3DQ" }));
    expect(placeLine("E8 3DQ")).toBe("E8 3DQ (1 mile away)");
  });

  it("keeps a location with no postcode in it", () => {
    renderCard(therapist({ location: "St Albans", distance: "18 miles from E8 3DQ" }));
    expect(placeLine("St Albans")).toBe("St Albans (18 miles away)");
  });

  it("keeps a distance whose wording it does not know", () => {
    renderCard(therapist({ distance: "under a mile from E8 3DQ" }));
    expect(placeLine("E8")).toBe("E8 (under a mile away)");
  });

  it("leaves the place to the heading of its pin's box, keeping the distance", () => {
    renderCard(therapist(), [], { grouped: true });
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Test Therapist 1");
    screen.getByText("0.2 miles away");
    expect(screen.queryByText(/E8 \(/)).toBeNull();
  });

  it("keeps the town when there is no searched place to measure from", () => {
    renderCard(therapist({ distance: undefined }));
    screen.getByText("London E8");
  });

  it("says neither where the therapist is nor whether they also meet in person online", () => {
    renderCard(therapist(), [], { online: true });
    screen.getByText("Summary text.");
    expect(screen.queryByText(/E8|away/)).toBeNull();
    expect(screen.queryByText(/In-person|Remote/)).toBeNull();
  });

  it("says online that a therapist meets only in person", () => {
    renderCard(therapist({ sessionTypes: "In-person" }), [], { online: true });
    screen.getByText("In-person");
  });

  it("marks each way of meeting with its icon", () => {
    renderCard(therapist());
    const icons = screen.getByText("Remote").closest("p")!.querySelectorAll("svg");
    expect([...icons].map((svg) => ["armchair", "video"].find((name) => svg.classList.contains(`lucide-${name}`)))).toEqual(["armchair", "video"]);
  });

  it("parts the ways of meeting for a screen reader, keeping one it has no icon for", () => {
    renderCard(therapist({ sessionTypes: "In-person & Home visits &" }));
    const line = screen.getByText("Home visits").closest("p")!;
    expect(line.textContent).toBe("In-person, Home visits");
    expect(line.querySelectorAll("svg")).toHaveLength(1);
  });

  it("shows only the tags the search asked for", () => {
    renderCard(therapist(), ["trauma", "emdr", "french"]);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Trauma", "EMDR"]);
  });

  it("lets a town or tag longer than the card's column wrap, breaking a long word, rather than run out of the card", () => {
    const town = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch";
    renderCard(therapist({ location: town, distance: undefined, tags: ["Psychotherapeuticcounselling"] }), ["psychotherapeuticcounselling"]);
    // Beside the pin's icon, a flex item shrinks below its longest word only once its minimum width is lifted.
    expect(screen.getByText(town).parentElement?.classList.contains("min-w-0")).toBe(true);
    expect(screen.getByText("Psychotherapeuticcounselling").className).toContain("whitespace-normal wrap-anywhere");
  });

  it("shows no tags for a search that asks for none", () => {
    renderCard(therapist());
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("puts an action beside the name, outside the link to the profile", () => {
    renderCard(therapist(), [], { action: <button type="button">Shortlist</button> });
    const link = screen.getByRole("link", { name: "Test Therapist 1" });
    expect(within(link).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Shortlist" }).parentElement?.className).toMatch(/\bz-10\b/);
  });
});
