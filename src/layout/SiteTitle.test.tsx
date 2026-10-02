// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteTitle } from "./SiteTitle";

afterEach(() => {
  vi.useRealTimers();
});

const title = () => screen.getByRole("button", { name: "Find a UKCP therapist" });
const about = () => screen.queryByRole("dialog", { name: "About this site" });
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

describe("SiteTitle", () => {
  it("heads the page without linking anywhere", () => {
    render(<SiteTitle />, { wrapper: MemoryRouter });
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows what the site is while the mouse rests on the title or the card", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<SiteTitle />, { wrapper: MemoryRouter });
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
      { wrapper: MemoryRouter },
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
    render(<SiteTitle />, { wrapper: MemoryRouter });
    fireEvent.pointerEnter(title(), { pointerType: "touch" });
    wait(300);
    expect(about()).toBeNull();
    fireEvent.click(title());
    expect(about()).toBeTruthy();
  });

  it("keeps a hovered card open once clicked", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<SiteTitle />, { wrapper: MemoryRouter });
    fireEvent.pointerEnter(title(), { pointerType: "mouse" });
    wait(300);
    fireEvent.click(title());
    fireEvent.pointerLeave(title(), { pointerType: "mouse" });
    wait(500);
    expect(about()).toBeTruthy();
    fireEvent.click(title());
    expect(about()).toBeNull();
  });

  it("says in the card where to turn for help today, from any page the title heads", () => {
    render(<SiteTitle />, { wrapper: MemoryRouter });
    fireEvent.click(title());
    expect(within(about()!).getByText(/^Need help now\?/).querySelector("a[href='tel:116123']")).toBeTruthy();
  });

  it("links the card to the accessibility statement, and puts it away as the page changes", () => {
    render(
      <>
        <SiteTitle />
        <Path />
      </>,
      { wrapper: MemoryRouter },
    );
    fireEvent.click(title());
    fireEvent.click(within(about()!).getByRole("link", { name: "Accessibility statement" }));
    expect(screen.getByTestId("path").textContent).toBe("/accessibility");
    expect(about()).toBeNull();
  });

  it("marks the card's link as the page shown over the statement, and leaves the card open", () => {
    render(<SiteTitle />, { wrapper: ({ children }) => <MemoryRouter initialEntries={["/accessibility"]}>{children}</MemoryRouter> });
    fireEvent.click(title());
    const statement = within(about()!).getByRole("link", { name: "Accessibility statement" });
    expect(statement.getAttribute("aria-current")).toBe("page");
    expect(fireEvent.click(statement)).toBe(false);
    expect(about()).toBeTruthy();
  });

  it("keeps the card open as the search changes in place", () => {
    function Search() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate("/?Location=Leeds", { replace: true })}>
          Search
        </button>
      );
    }
    render(
      <>
        <SiteTitle />
        <Search />
      </>,
      { wrapper: MemoryRouter },
    );
    fireEvent.click(title());
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(about()).toBeTruthy();
  });

  it("keeps the card between the title and what follows it, so Tab leaves the card for the next control", () => {
    render(
      <>
        <SiteTitle />
        <button type="button">Next</button>
      </>,
      { wrapper: MemoryRouter },
    );
    fireEvent.click(title());
    const card = about()!;
    expect(title().compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(screen.getByRole("button", { name: "Next" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("takes the keyboard into a pinned card and back to the title on Escape", async () => {
    render(<SiteTitle />, { wrapper: MemoryRouter });
    title().focus();
    fireEvent.click(title());
    await waitFor(() => expect(document.activeElement).toBe(about()));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(about()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(title()));
  });
});
