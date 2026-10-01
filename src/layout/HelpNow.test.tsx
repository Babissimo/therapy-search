// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpNow } from "./HelpNow";

describe("HelpNow", () => {
  it("names where to turn today in each of the UK's nations, every number dialled or texted at a tap and kept from translation, as are the names", () => {
    render(<HelpNow />);
    expect(screen.getByRole("paragraph").textContent).toBe(
      "Need help now? In the UK, call 111 and choose the mental health option (in Northern Ireland, Lifeline on 0808 808 8000), " +
        "Samaritans on 116 123, or text SHOUT to 85258. In an emergency, call 999.",
    );
    expect(screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["111", "tel:111"],
      ["0808 808 8000", "tel:08088088000"],
      ["116 123", "tel:116123"],
      ["SHOUT to 85258", "sms:85258?&body=SHOUT"],
      ["999", "tel:999"],
    ]);
    const untranslated = [...document.querySelectorAll('[translate="no"]')].map((element) => element.textContent);
    expect(untranslated).toEqual(["111", "Lifeline", "0808 808 8000", "Samaritans", "116 123", "SHOUT to 85258", "999"]);
  });
});
