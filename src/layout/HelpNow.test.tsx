// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpNow } from "./HelpNow";

describe("HelpNow", () => {
  it("names where to turn today in each of the UK's nations, every number dialled at a tap", () => {
    render(<HelpNow />);
    expect(screen.getByRole("paragraph").textContent).toBe(
      "Need help now? In the UK, call 111 and choose the mental health option (in Northern Ireland, Lifeline on 0808 808 8000), or " +
        "Samaritans on 116 123. In an emergency, call 999.",
    );
    expect(screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["111", "tel:111"],
      ["0808 808 8000", "tel:08088088000"],
      ["116 123", "tel:116123"],
      ["999", "tel:999"],
    ]);
  });
});
