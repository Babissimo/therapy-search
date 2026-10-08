// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LanguageQuestion } from "./LanguageQuestion";

function Asked(start: { other?: boolean; language?: string }) {
  const [other, setOther] = useState(start.other);
  const [language, setLanguage] = useState(start.language);
  return (
    <MemoryRouter>
      <LanguageQuestion other={other} onOther={setOther} language={language} onChange={setLanguage} count="Question 6 of 8" onNext={() => {}} />
      <output data-testid="language">{language ?? "none"}</output>
    </MemoryRouter>
  );
}

const checked = (name: string) => (screen.getByRole("radio", { name }) as HTMLInputElement).checked;

describe("LanguageQuestion", () => {
  it("offers the languages but English once they say yes, and forgets the one chosen once they say no", () => {
    render(<Asked />);
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    const list = screen.getByRole("combobox", { name: "Which language?" });
    expect([...list.querySelectorAll("option")].some((option) => option.textContent === "English")).toBe(false);
    fireEvent.change(list, { target: { value: "Welsh" } });
    expect(screen.getByTestId("language").textContent).toBe("Welsh");
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(screen.getByTestId("language").textContent).toBe("none");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows yes and the language where one is chosen already", () => {
    render(<Asked other language="Welsh" />);
    expect(checked("Yes")).toBe(true);
    expect((screen.getByRole("combobox", { name: "Which language?" }) as HTMLSelectElement).value).toBe("Welsh");
  });

  it("shows the yes or no given already, with no language chosen", () => {
    const { unmount } = render(<Asked other={false} />);
    expect(checked("No")).toBe(true);
    expect(screen.queryByRole("combobox")).toBeNull();
    unmount();
    render(<Asked other />);
    expect(checked("Yes")).toBe(true);
    expect((screen.getByRole("combobox", { name: "Which language?" }) as HTMLSelectElement).value).toBe("");
  });
});
