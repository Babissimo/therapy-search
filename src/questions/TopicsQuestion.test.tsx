// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Who } from "./answers";
import { TopicsQuestion } from "./TopicsQuestion";

function Asked({ who, start = [] }: { who?: Who; start?: string[] }) {
  const [topics, setTopics] = useState(start);
  return (
    <MemoryRouter>
      <TopicsQuestion who={who} topics={topics} onChange={setTopics} count="Question 3 of 8" onNext={() => {}} />
      <div data-testid="topics">{topics.join(", ")}</div>
    </MemoryRouter>
  );
}

const chosen = () => screen.getByTestId("topics").textContent;

describe("TopicsQuestion", () => {
  it("asks whoever it is for", () => {
    render(<Asked who="child" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("What would your child like help with?");
  });

  it("chooses any number of themes, as UKCP's topics, with UKCP's word beneath where it differs", () => {
    render(<Asked />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Low mood/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Grief or loss/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Stress/ }));
    expect(chosen()).toBe("Depression, Bereavement, Stress");
    expect(screen.getByRole("checkbox", { name: /Low mood/ }).closest("label")?.textContent).toBe("Low moodDepression");
    expect(screen.getByRole("checkbox", { name: /Stress/ }).closest("label")?.textContent).toBe("Stress");
    fireEvent.click(screen.getByRole("checkbox", { name: /Low mood/ }));
    expect(chosen()).toBe("Bereavement, Stress");
  });

  it("opens UKCP's other topics under Something else, saying how many are chosen there", () => {
    render(<Asked />);
    expect(screen.queryByRole("checkbox", { name: "Phobias" })).toBeNull();
    const more = screen.getByRole("button", { name: "Something else" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("checkbox", { name: "Phobias" }));
    expect(chosen()).toBe("Phobias");
    expect(screen.getByRole("button", { name: "Something else (1 chosen)" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("opens Something else from the start where something there is chosen already", () => {
    render(<Asked start={["Phobias"]} />);
    expect((screen.getByRole("checkbox", { name: "Phobias" }) as HTMLInputElement).checked).toBe(true);
  });

  it("shows where to turn today beside the list once Suicide is chosen", () => {
    render(<Asked />);
    expect(screen.queryByText(/Samaritans/)).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Something else" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Suicide" }));
    expect(within(screen.getByRole("status")).getByText(/Samaritans/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Suicide" }));
    expect(within(screen.getByRole("status")).queryByText(/Samaritans/)).toBeNull();
  });
});
