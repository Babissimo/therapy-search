// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteTitle } from "./SiteTitle";

afterEach(() => {
  vi.useRealTimers();
});

const title = () => screen.getByRole("button", { name: "Find a UKCP therapist" });
const about = () => screen.queryByRole("dialog", { name: "About this site" });
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("SiteTitle", () => {
  it("heads the page without linking anywhere", () => {
    render(<SiteTitle />);
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows what the site is while the mouse rests on the title or the card", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<SiteTitle />);
    fireEvent.pointerEnter(title(), { pointerType: "mouse" });
    expect(about()).toBeNull();
    wait(300);
    expect(about()?.textContent).toContain("not run by, affiliated with or endorsed by UKCP");
    // Crossing from the title to the card keeps it open.
    fireEvent.pointerLeave(title(), { pointerType: "mouse" });
    fireEvent.pointerEnter(about()!, { pointerType: "mouse" });
    wait(500);
    expect(about()).toBeTruthy();
    fireEvent.pointerLeave(about()!, { pointerType: "mouse" });
    wait(200);
    expect(about()).toBeNull();
  });

  it("leaves focus alone when a hovered card opens", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(
      <>
        <input aria-label="Elsewhere" />
        <SiteTitle />
      </>,
    );
    const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" });
    elsewhere.focus();
    fireEvent.pointerEnter(title(), { pointerType: "mouse" });
    wait(300);
    expect(about()).toBeTruthy();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("opens on a tap rather than on a touch's pointer events", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<SiteTitle />);
    fireEvent.pointerEnter(title(), { pointerType: "touch" });
    wait(300);
    expect(about()).toBeNull();
    fireEvent.click(title());
    expect(about()).toBeTruthy();
  });

  it("keeps a hovered card open once clicked", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<SiteTitle />);
    fireEvent.pointerEnter(title(), { pointerType: "mouse" });
    wait(300);
    fireEvent.click(title());
    fireEvent.pointerLeave(title(), { pointerType: "mouse" });
    wait(500);
    expect(about()).toBeTruthy();
    fireEvent.click(title());
    expect(about()).toBeNull();
  });

  it("keeps the card between the title and what follows it, so Tab leaves the card for the next control", () => {
    render(
      <>
        <SiteTitle />
        <button type="button">Next</button>
      </>,
    );
    fireEvent.click(title());
    const card = about()!;
    expect(title().compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(screen.getByRole("button", { name: "Next" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("takes the keyboard into a pinned card and back to the title on Escape", async () => {
    render(<SiteTitle />);
    title().focus();
    fireEvent.click(title());
    await waitFor(() => expect(document.activeElement).toBe(about()));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(about()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(title()));
  });
});
