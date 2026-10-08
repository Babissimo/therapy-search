// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";
import { ANSWERS_KEY } from "./answers";
import { QuestionsPage } from "./QuestionsPage";

let travel: (delta: number) => void;

function Url() {
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  travel = (delta) => act(() => void navigate(delta));
  return (
    <>
      <output data-testid="url">{pathname + search}</output>
      <output data-testid="state">{JSON.stringify(state)}</output>
    </>
  );
}

function renderAt(url = "/questions") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/questions/:screen?" element={<QuestionsPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Url />
    </MemoryRouter>,
  );
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const url = () => screen.getByTestId("url").textContent;
const state = () => screen.getByTestId("state").textContent;
const filtersYourself = () => screen.getByRole("link", { name: "Choose filters yourself" });
const choose = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const tick = (name: RegExp) => fireEvent.click(screen.getByRole("checkbox", { name }));
/** Presses a button as a visitor does, the keyboard moving to it first, which a bare click in jsdom leaves where it was. */
const press = (name: string) => {
  const button = screen.getByRole("button", { name });
  button.focus();
  fireEvent.click(button);
};
const next = () => press("Next");
const onHeading = () => expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));

describe("QuestionsPage", () => {
  it("asks a question at a time, counting them, and ends on the search the answers make", () => {
    renderAt();
    expect(heading()).toBe("Is it urgent?");
    expect(screen.getByText("Question 1 of 8")).toBeTruthy();
    choose("It can wait a few weeks");
    next();
    expect(heading()).toBe("Who is it for?");
    onHeading();
    choose("Me and my partner");
    next();
    expect(heading()).toBe("What would you both like help with?");
    tick(/Anxiety or worry/);
    next();
    choose("In person");
    next();
    expect(heading()).toBe("Where are you?");
    fireEvent.change(screen.getByRole("textbox", { name: "Postcode or town" }), { target: { value: "Leeds" } });
    next();
    choose("No");
    next();
    expect(heading()).toBe("Do you need step-free access?");
    choose("No");
    next();
    expect(screen.getByText("Question 8 of 8")).toBeTruthy();
    choose("Myself");
    next();
    expect(url()).toBe(
      "/?Location=Leeds&TypesOfSession=Face+to+Face+-+Long+Term&TypesOfSession=Face+to+Face+-+Short+Term&TypesOfSession=Home+Visits" +
        "&HelpWithAdvanced=Anxiety&WorksWith=Couples",
    );
  });

  it("returns from the search to the last question", () => {
    renderAt("/questions/topics");
    tick(/Trauma/);
    next();
    expect(url()).toBe("/questions/meet");
    travel(-1);
    expect(heading()).toBe("What would you like help with?");
    travel(1);
    next();
    next();
    next();
    next();
    next();
    expect(url()).toBe("/?HelpWithAdvanced=Trauma");
    travel(-1);
    expect(heading()).toBe("How will you pay?");
  });

  it("skips the place and step-free access for online or by phone, and ends on the online search", () => {
    renderAt("/questions/topics");
    tick(/Trauma/);
    next();
    choose("Online or by phone");
    next();
    expect(heading()).toBe("Would you like therapy in a language other than English?");
    expect(screen.getByText("Question 5 of 6")).toBeTruthy();
    next();
    next();
    expect(url()).toBe("/online?HelpWithAdvanced=Trauma");
  });

  it("shows where to turn today after an urgent answer, then carries on", () => {
    renderAt();
    choose("I need help today");
    next();
    expect(heading()).toBe("If you need help today");
    onHeading();
    press("Carry on");
    expect(heading()).toBe("Who is it for?");
    onHeading();
  });

  it("shows free and low-cost help after I can't afford it, and searches nothing where nothing narrows", () => {
    renderAt("/questions/pay");
    choose("I can't afford it");
    next();
    expect(heading()).toBe("Free and low-cost help");
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(heading()).toBe("Nothing to search by yet");
    expect(url()).toBe("/questions/end");
    // The end's own link is the only one.
    expect(screen.getAllByRole("link", { name: "Choose filters yourself" })).toHaveLength(1);
  });

  it("offers the filters from a question, outside its group and form, with the place typed and the way they chose to meet", () => {
    renderAt("/questions/meet");
    choose("In person");
    next();
    expect(heading()).toBe("Where are you?");
    fireEvent.change(screen.getByRole("textbox", { name: "Postcode or town" }), { target: { value: "Leeds" } });
    expect(filtersYourself().closest("form")).toBeNull();
    expect(filtersYourself().closest("fieldset")).toBeNull();
    fireEvent.click(filtersYourself());
    expect(url()).toBe("/");
    expect(state()).toBe('{"place":"Leeds"}');
  });

  it("offers the filters on the screens between the questions too, to the online start for online or by phone", () => {
    sessionStorage.setItem(ANSWERS_KEY, JSON.stringify({ topics: [], place: "", urgency: "today", meet: "remote" }));
    renderAt("/questions/help-now");
    expect(heading()).toBe("If you need help today");
    expect(filtersYourself().getAttribute("href")).toBe("/online");
  });

  it("goes back a question with Back, the keyboard on each screen's heading", () => {
    renderAt();
    next();
    expect(heading()).toBe("Who is it for?");
    onHeading();
    press("Back");
    expect(heading()).toBe("Is it urgent?");
    onHeading();
  });

  it("keeps the answers for the tab, over a reload", () => {
    const { unmount } = renderAt();
    choose("It can wait a few weeks");
    unmount();
    expect(JSON.parse(sessionStorage.getItem(ANSWERS_KEY) ?? "{}").urgency).toBe("wait");
    renderAt("/questions/urgency");
    expect((screen.getByRole("radio", { name: "It can wait a few weeks" }) as HTMLInputElement).checked).toBe(true);
  });

  it("shows a no to another language on return", () => {
    const { unmount } = renderAt("/questions/language");
    choose("No");
    unmount();
    renderAt("/questions/language");
    expect((screen.getByRole("radio", { name: "No" }) as HTMLInputElement).checked).toBe(true);
  });

  it("starts the questions again at a screen the answers skip, or one that isn't there", () => {
    sessionStorage.setItem(ANSWERS_KEY, JSON.stringify({ topics: [], place: "", meet: "remote" }));
    const { unmount } = renderAt("/questions/place");
    expect(url()).toBe("/questions/urgency");
    expect(heading()).toBe("Is it urgent?");
    unmount();
    renderAt("/questions/nonsense");
    expect(url()).toBe("/questions/urgency");
  });
});
