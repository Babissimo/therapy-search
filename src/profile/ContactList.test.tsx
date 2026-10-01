// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { ContactList, socialName } from "./ContactList";

const PROFILE: Profile = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

function renderList(profile: Partial<Profile>, onReach?: (link: HTMLAnchorElement) => void) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContactList profile={{ ...PROFILE, ...profile }} onReach={onReach} />
    </QueryClientProvider>,
  );
}

const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

/** Follows a link as a click does, short of the navigation jsdom can't do. */
function follow(name: string) {
  const link = screen.getByRole("link", { name });
  link.addEventListener("click", (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
}

afterEach(() => vi.restoreAllMocks());

describe("ContactList", () => {
  it("asks UKCP for the details it holds back as soon as it shows, and lists them by icon", async () => {
    const contact = vi.spyOn(api, "contact").mockResolvedValue({ phone: "01234 567890", email: "jo@example.com", website: "https://www.example.invalid/practice/" });
    renderList({ contactId: "9239", emailInContact: true });
    expect(contact).toHaveBeenCalledWith("9239");

    expect((await screen.findByRole("link", { name: "Telephone: 01234 567890" })).getAttribute("href")).toBe("tel:01234567890");
    expect(href("Email: jo@example.com")).toBe("mailto:jo@example.com");
    expect(href("Website: example.invalid/practice (opens in a new tab)")).toBe("https://www.example.invalid/practice/");
    expect(href("View on UKCP (opens in a new tab)")).toBe("https://www.psychotherapy.org.uk/therapist/Jo-ABCDEFGH");
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
    await screen.findByRole("link", { name: "Website: facebook.com/jo (opens in a new tab)" });
    expect(screen.queryByRole("link", { name: /^Facebook/ })).toBeNull();
    screen.getByRole("link", { name: "LinkedIn (opens in a new tab)" });
  });

  it("names social links by where they go", () => {
    renderList({ social: ["https://uk.linkedin.com/in/jo", "https://threads.net/@jo", "https://www.psychologytoday.com/jo"] });
    expect(href("LinkedIn (opens in a new tab)")).toBe("https://uk.linkedin.com/in/jo");
    screen.getByRole("link", { name: "Threads (opens in a new tab)" });
    screen.getByRole("link", { name: "psychologytoday.com (opens in a new tab)" });
  });

  it("says why the details couldn't be fetched", async () => {
    vi.spyOn(api, "contact").mockRejectedValue(new ApiError(429, "Too many searches in a short time. Wait a minute and try again."));
    renderList({ contactId: "9239" });
    await screen.findByText(/Too many searches/);
    screen.getByRole("button", { name: "Try again" });
  });

  it("tells its caller when the phone or email link is followed, and not the others", async () => {
    vi.spyOn(api, "contact").mockResolvedValue({ phone: "01234 567890", email: "jo@example.com", website: "https://www.example.invalid/" });
    const onReach = vi.fn();
    renderList({ contactId: "9239", emailInContact: true, social: ["https://www.linkedin.com/in/jo"] }, onReach);
    await screen.findByRole("link", { name: "Telephone: 01234 567890" });
    follow("Website: example.invalid (opens in a new tab)");
    follow("LinkedIn (opens in a new tab)");
    follow("View on UKCP (opens in a new tab)");
    expect(onReach).not.toHaveBeenCalled();
    follow("Telephone: 01234 567890");
    follow("Email: jo@example.com");
    expect(onReach.mock.calls.map(([link]) => link.getAttribute("href"))).toEqual(["tel:01234567890", "mailto:jo@example.com"]);
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
