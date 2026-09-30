// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { ContactList, socialName } from "./ContactList";

const PROFILE: Profile = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

function renderList(profile: Partial<Profile>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContactList profile={{ ...PROFILE, ...profile }} />
    </QueryClientProvider>,
  );
}

const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

afterEach(() => vi.restoreAllMocks());

describe("ContactList", () => {
  it("asks UKCP for the details it holds back as soon as it shows, and lists them by icon", async () => {
    const contact = vi.spyOn(api, "contact").mockResolvedValue({ phone: "01234 567890", email: "jo@example.com", website: "https://www.example.invalid/practice/" });
    renderList({ contactId: "9239", emailInContact: true });
    expect(contact).toHaveBeenCalledWith("9239");

    expect((await screen.findByRole("link", { name: "Telephone: 01234 567890" })).getAttribute("href")).toBe("tel:01234567890");
    expect(href("Email: jo@example.com")).toBe("mailto:jo@example.com");
    expect(href("Website: example.invalid/practice")).toBe("https://www.example.invalid/practice/");
    expect(href("View on UKCP")).toBe("https://www.psychotherapy.org.uk/therapist/Jo-ABCDEFGH");
  });

  it("shows the profile's own email while the rest loads, and asks nothing when UKCP holds nothing back", () => {
    const contact = vi.spyOn(api, "contact");
    renderList({ email: "jo@example.com" });
    expect(href("Email: jo@example.com")).toBe("mailto:jo@example.com");
    expect(contact).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading contact details")).toBeNull();
  });

  it("leaves out an email UKCP's own page would strip from the contact details", async () => {
    vi.spyOn(api, "contact").mockResolvedValue({ phone: "01234 567890", email: "jo@example.com" });
    renderList({ contactId: "9239" });
    await screen.findByRole("link", { name: "Telephone: 01234 567890" });
    expect(screen.queryByRole("link", { name: /^Email/ })).toBeNull();
  });

  it("names social links by where they go, leaving out one that is the website", async () => {
    vi.spyOn(api, "contact").mockResolvedValue({ website: "https://www.facebook.com/jo" });
    renderList({ contactId: "9239", social: ["https://www.facebook.com/jo", "https://uk.linkedin.com/in/jo"] });
    await screen.findByRole("link", { name: "Website: facebook.com/jo" });
    expect(screen.queryByRole("link", { name: "Facebook" })).toBeNull();
    screen.getByRole("link", { name: "LinkedIn" });
  });

  it("names social links by where they go", () => {
    renderList({ social: ["https://uk.linkedin.com/in/jo", "https://threads.net/@jo", "https://www.psychologytoday.com/jo"] });
    expect(href("LinkedIn")).toBe("https://uk.linkedin.com/in/jo");
    screen.getByRole("link", { name: "Threads" });
    screen.getByRole("link", { name: "psychologytoday.com" });
  });

  it("says why the details couldn't be fetched", async () => {
    vi.spyOn(api, "contact").mockRejectedValue(new ApiError(429, "Too many searches in a short time. Wait a minute and try again."));
    renderList({ contactId: "9239" });
    await screen.findByText(/Too many searches/);
    screen.getByRole("button", { name: "Try again" });
  });
});

describe("socialName", () => {
  it("knows the common networks by any of their hosts, and otherwise gives the host", () => {
    expect(["https://x.com/jo", "https://twitter.com/jo", "https://m.facebook.com/jo", "https://www.instagram.com/jo"].map(socialName)).toEqual([
      "X",
      "X",
      "Facebook",
      "Instagram",
    ]);
    expect(socialName("https://notlinkedin.com/jo")).toBe("notlinkedin.com");
  });
});
