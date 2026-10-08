// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { NO_ANSWERS } from "./answers";
import { HelpNowScreen, LowCostScreen, NothingScreen } from "./Interludes";

function Arrived() {
  const { pathname, state } = useLocation();
  return <output data-testid="arrived">{`${pathname} ${JSON.stringify(state)}`}</output>;
}

describe("HelpNowScreen", () => {
  it("says where to turn today, then carries on", () => {
    const onNext = vi.fn();
    render(<HelpNowScreen onNext={onNext} />, { wrapper: MemoryRouter });
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "If you need help today" }));
    expect(screen.getByRole("link", { name: "116 123" }).getAttribute("href")).toBe("tel:116123");
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("LowCostScreen", () => {
  it("points to each nation's free talking therapies, then carries on", () => {
    const onNext = vi.fn();
    render(<LowCostScreen onNext={onNext} />, { wrapper: MemoryRouter });
    expect(screen.getByText(/A GP can refer you anywhere in the UK/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "find a service near you" }).getAttribute("href")).toBe("https://www.nhs.uk/talk");
    expect(screen.getByRole("link", { name: "about Living Life" }).getAttribute("href")).toBe(
      "https://www.nhs24.scot/mental-health-services-at-nhs-24/",
    );
    expect(screen.getByRole("link", { name: "about SilverCloud" }).getAttribute("href")).toBe(
      "https://hduhb.nhs.wales/healthcare/services-and-teams/silvercloud-online-mental-health-support/",
    );
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("NothingScreen", () => {
  it("offers the questions again, or the online start screen for online or by phone", () => {
    render(<NothingScreen answers={{ ...NO_ANSWERS, meet: "remote" }} />, { wrapper: MemoryRouter });
    expect(screen.getByText(/every UKCP therapist working online or by phone/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the questions" }).getAttribute("href")).toBe("/questions/urgency");
    expect(screen.getByRole("link", { name: "Choose filters yourself" }).getAttribute("href")).toBe("/online");
  });

  it("sends the place they typed to the Near me start screen", () => {
    render(
      <MemoryRouter initialEntries={["/questions/end"]}>
        <Routes>
          <Route path="/questions/end" element={<NothingScreen answers={{ ...NO_ANSWERS, place: "Leeds" }} />} />
          <Route path="/" element={<Arrived />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Choose filters yourself" }));
    expect(screen.getByTestId("arrived").textContent).toBe('/ {"place":"Leeds"}');
  });
});
