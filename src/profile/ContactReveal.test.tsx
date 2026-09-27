// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { ContactReveal } from "./ContactReveal";

describe("ContactReveal", () => {
  it("asks UKCP only when clicked, then shows what came back", async () => {
    const contact = vi.spyOn(api, "contact").mockResolvedValue({ phone: "01234 567890", website: "https://example.invalid/" });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContactReveal id="9239" />
      </QueryClientProvider>,
    );
    expect(contact).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Show contact details" }));

    expect((await screen.findByRole("link", { name: "01234 567890" })).getAttribute("href")).toBe("tel:01234567890");
    expect(contact).toHaveBeenCalledWith("9239");
    expect(screen.queryByText("Email")).toBeNull();
  });
});
