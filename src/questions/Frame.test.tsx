// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SITE_NAME } from "@/lib/useTitle";
import { Choices, QuestionFrame } from "./Frame";

describe("QuestionFrame", () => {
  it("names its group by the heading, which takes the keyboard and names the page, with the count before it", () => {
    render(
      <QuestionFrame heading="Who is it for?" count="Question 2 of 8" onNext={() => {}}>
        <p>Answers</p>
      </QuestionFrame>,
      { wrapper: MemoryRouter },
    );
    const group = screen.getByRole("group", { name: /Who is it for\?/ });
    expect(group.querySelector("legend")?.textContent).toBe("Question 2 of 8Who is it for?");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Who is it for?" }));
    expect(document.title).toBe(`Who is it for? - ${SITE_NAME}`);
  });

  it("describes its group by the hint, where there is one", () => {
    const { unmount } = render(
      <QuestionFrame heading="Where are you?" count="Question 5 of 8" hint="A town or city works too." onNext={() => {}}>
        <input aria-label="Postcode or town" />
      </QuestionFrame>,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole("group", { name: /Where are you\?/, description: "A town or city works too." })).toBeTruthy();
    unmount();
    render(
      <QuestionFrame heading="Who is it for?" count="Question 2 of 8" onNext={() => {}}>
        <p>Answers</p>
      </QuestionFrame>,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole("group").hasAttribute("aria-describedby")).toBe(false);
  });

  it("moves on with Next, or Enter in a box", () => {
    const onNext = vi.fn();
    render(
      <QuestionFrame heading="Where are you?" count="Question 5 of 8" onNext={onNext}>
        <input aria-label="Postcode or town" />
      </QuestionFrame>,
      { wrapper: MemoryRouter },
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it("goes back as the browser's Back does, or to a new search where the visit began here", () => {
    render(
      <QuestionFrame heading="Is it urgent?" count="Question 1 of 8" onNext={() => {}}>
        <p>Answers</p>
      </QuestionFrame>,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole("link", { name: "Search for a therapist" }).getAttribute("href")).toBe("/");
  });

  it("goes back without moving on", () => {
    const onNext = vi.fn();
    render(
      <MemoryRouter initialEntries={["/before", "/questions/who"]} initialIndex={1}>
        <QuestionFrame heading="Who is it for?" count="Question 1 of 8" onNext={onNext}>
          <p>Answers</p>
        </QuestionFrame>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("Choices", () => {
  const choices = [
    { value: "me", label: "Me" },
    { value: "unsure", label: "Not sure" },
  ] as const;

  it("starts with nothing chosen", () => {
    render(<Choices name="who" choices={choices} value={undefined} onChange={() => {}} />);
    expect(screen.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
  });

  it("chooses one answer and shows it chosen", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Choices name="who" choices={choices} value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Not sure" }));
    expect(onChange).toHaveBeenCalledWith("unsure");
    rerender(<Choices name="who" choices={choices} value="unsure" onChange={onChange} />);
    expect((screen.getByRole("radio", { name: "Not sure" }) as HTMLInputElement).checked).toBe(true);
  });
});
