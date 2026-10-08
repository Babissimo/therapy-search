// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { Profile } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { createShortlistStore, type ShortlistCard, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { EmailDrafter } from "./EmailDrafter";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Anne Bloggs", initials: "JB", tags: [] };
const PROFILE: Profile = {
  slug: JO.slug,
  name: JO.name,
  initials: "JB",
  email: "jo@example.com",
  languages: [],
  emailInContact: false,
  social: [],
  about: [],
  practical: [],
  offices: [],
};
const ANXIOUS = "HelpWithAdvanced=Anxiety&HelpWithAdvanced=Depression&WorksWith=Individuals";

type Setup = { search?: string; profile?: Profile | ApiError; store?: ShortlistStore; at?: string };

function renderDrafter({ search = ANXIOUS, profile = PROFILE, store = createShortlistStore(null), at = "/therapist/Jo-ABCDEFGH" }: Setup = {}) {
  if (!store.has(JO.slug)) store.add(JO, { search });
  const asked = vi.spyOn(api, "profile");
  if (profile instanceof ApiError) asked.mockRejectedValue(profile);
  else asked.mockResolvedValue(profile);
  vi.spyOn(api, "contact").mockResolvedValue({});
  const onClose = vi.fn();
  const onMarked = vi.fn();
  const { unmount } = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShortlistContext.Provider value={store}>
        <MemoryRouter initialEntries={[at]}>
          <EmailDrafter therapist={JO} onClose={onClose} onMarked={onMarked} />
        </MemoryRouter>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
  return { store, onClose, onMarked, unmount };
}

const message = () => screen.findByRole<HTMLTextAreaElement>("textbox", { name: "Message" });
const chips = () => within(screen.getByRole("group", { name: "Mention" })).getAllByRole("checkbox");
/** A line as shown, rather than as a live region says it. */
const shownLine = (text: RegExp) => screen.findByText(text, { ignore: "[aria-live]" });
/** What the live regions say, as their texts in order, leaving out the empty ones. */
const said = () => [...document.querySelectorAll("[aria-live=polite]")].map((region) => region.textContent).filter(Boolean);

/** Lets the focus Radix hands on once a dialog has gone, a task later, land. */
const afterClosing = () => act(() => new Promise((resolve) => setTimeout(resolve)));

/** The drafter opened on a draft the visitor edited, with Start again pressed and its question asked. */
async function askToStartAgain() {
  const store = createShortlistStore(null);
  store.add(JO, { search: ANXIOUS });
  store.setDraft(JO.slug, { subject: "Hello", message: "As I left it" });
  renderDrafter({ store });
  const startAgain = await screen.findByRole("button", { name: "Start again from your search" });
  fireEvent.click(startAgain);
  return { store, startAgain, question: within(screen.getByRole("alertdialog", { name: "Start again?" })) };
}

/** Has the chips refuse focus while `refusing()` says so, as a browser's do until the fold's first frame shows them. */
function chipsRefuseFocus(refusing: () => boolean) {
  const focus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
    if (this.getAttribute("role") === "checkbox" && refusing()) return;
    focus.call(this, options);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EmailDrafter", () => {
  it("greets the therapist by first name and writes from the search they were shortlisted from, every mention ticked", async () => {
    renderDrafter();
    screen.getByRole("dialog", { name: "Draft an email to Jo" });
    expect((await message()).value).toContain("I'm looking for a therapist for myself. I'd like some help with anxiety and depression.");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Subject" }).value).toBe("Enquiry about therapy");
    expect(chips()).toHaveLength(3);
    expect(["Individuals", "Anxiety", "Depression"].map((name) => screen.getByRole("checkbox", { name }).getAttribute("aria-checked"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    expect(document.activeElement).toBe(chips()[0]);
  });

  it("takes a mention out as its chip is unticked, and puts it back as it is ticked", async () => {
    renderDrafter();
    await message();
    fireEvent.click(screen.getByRole("checkbox", { name: "Depression" }));
    expect((await message()).value).toContain("I'd like some help with anxiety.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Depression" }));
    expect((await message()).value).toContain("anxiety and depression");
  });

  it("signs with the visitor's name and says when they're free, keeping both for the next draft", async () => {
    const { store } = renderDrafter();
    fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "Sam" } });
    fireEvent.change(screen.getByRole("textbox", { name: "When are you usually free?" }), { target: { value: "weekday evenings" } });
    const text = (await message()).value;
    expect(text).toContain("I'm usually free weekday evenings.");
    expect(text.endsWith("Many thanks,\nSam")).toBe(true);
    await waitFor(() => expect(store.sender()).toEqual({ name: "Sam", free: "weekday evenings" }));
    // The draft is still the site's, written afresh each time it opens.
    expect(store.get()[0]?.draft).toBeUndefined();
  });

  it("starts a later draft with the name and free times given for an earlier one", async () => {
    const store = createShortlistStore(null);
    store.setSender({ name: "Sam", free: "weekday evenings" });
    renderDrafter({ store });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Your name" }).value).toBe("Sam");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "When are you usually free?" }).value).toBe("weekday evenings");
    const text = (await message()).value;
    expect(text).toContain("I'm usually free weekday evenings.");
    expect(text.endsWith("Many thanks,\nSam")).toBe(true);
  });

  it("leaves spelling unchecked in every field", async () => {
    renderDrafter();
    await message();
    // Enhanced spellcheck in Chrome and Edge sends what is typed to Google or Microsoft.
    const fields = ["When are you usually free?", "Your name", "Subject", "Message"].map((name) => screen.getByRole("textbox", { name }));
    expect(fields.map((field) => field.getAttribute("spellcheck"))).toEqual(["false", "false", "false", "false"]);
  });

  it("writes from the search on screen for someone shortlisted before searches were kept", async () => {
    const store = createShortlistStore(null);
    store.add(JO);
    renderDrafter({ store, at: "/?HelpWithAdvanced=Stress" });
    expect((await message()).value).toContain("I'd like some help with stress.");
  });

  it("writes only the fixed parts, with no chips, where there is no search at all", async () => {
    const store = createShortlistStore(null);
    store.add(JO);
    renderDrafter({ store });
    expect((await message()).value).toContain("I'm looking for a therapist.\n\nCould you let me know");
    expect(screen.queryByRole("group", { name: "Mention" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "When are you usually free?" }));
  });

  it("hands the text to the visitor once they edit it: the chips and fields fold away and their edit is kept", async () => {
    const { store } = renderDrafter();
    fireEvent.change(await message(), { target: { value: "Hello Jo, my own words." } });
    expect(screen.queryByRole("group", { name: "Mention" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Your name" })).toBeNull();
    screen.getByRole("button", { name: "Start again from your search" });
    await waitFor(() => expect(store.get()[0]?.draft).toEqual({ subject: "Enquiry about therapy", message: "Hello Jo, my own words." }));
  });

  it("opens on a saved draft as it was left, with focus in the message", async () => {
    const store = createShortlistStore(null);
    store.add(JO, { search: ANXIOUS });
    store.setDraft(JO.slug, { subject: "Hello", message: "As I left it" });
    renderDrafter({ store });
    const box = await message();
    expect(box.value).toBe("As I left it");
    expect(document.activeElement).toBe(box);
  });

  it("starts again from the search once the visitor confirms, forgetting their edit, with focus on the first chip once it shows", async () => {
    const { store, question } = await askToStartAgain();
    let refusals = 2;
    chipsRefuseFocus(() => refusals-- > 0);
    fireEvent.click(question.getByRole("button", { name: "Start again" }));
    expect((await message()).value).toContain("I'd like some help with anxiety and depression.");
    expect(store.get()[0]?.draft).toBeUndefined();
    expect(chips()).toHaveLength(3);
    await waitFor(() => expect(document.activeElement).toBe(chips()[0]));
    expect(refusals).toBe(-1);
  });

  it("leaves the keyboard where the visitor moved it while the first chip was still to show", async () => {
    const { question } = await askToStartAgain();
    let refusing = true;
    chipsRefuseFocus(() => refusing);
    fireEvent.click(question.getByRole("button", { name: "Start again" }));
    const subject = screen.getByRole("textbox", { name: "Subject" });
    subject.focus();
    refusing = false;
    // Several frames, well within the number the first chip is waited for.
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(document.activeElement).toBe(subject);
  });

  it("waits for the first chip by frames rather than time, as a busy browser draws few while the fold opens", async () => {
    const { question } = await askToStartAgain();
    let refusals = 3;
    chipsRefuseFocus(() => refusals-- > 0);
    // Each reading of the clock a fifth of a second on, as between a busy browser's frames.
    let clock = performance.now();
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 200));
    fireEvent.click(question.getByRole("button", { name: "Start again" }));
    await waitFor(() => expect(document.activeElement).toBe(chips()[0]));
    expect(refusals).toBe(-1);
  });

  it("starts again with every mention ticked, those unticked before the edit too", async () => {
    renderDrafter();
    await message();
    fireEvent.click(screen.getByRole("checkbox", { name: "Depression" }));
    fireEvent.change(await message(), { target: { value: "My own words." } });
    fireEvent.click(screen.getByRole("button", { name: "Start again from your search" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Start again?" })).getByRole("button", { name: "Start again" }));
    expect(chips().map((chip) => chip.getAttribute("aria-checked"))).toEqual(["true", "true", "true"]);
    expect((await message()).value).toContain("anxiety and depression");
  });

  it("keeps the visitor's edit when they cancel starting again, giving the keyboard back to Start again", async () => {
    const { store, startAgain, question } = await askToStartAgain();
    fireEvent.click(question.getByRole("button", { name: "Keep my changes" }));
    await afterClosing();
    expect((await message()).value).toBe("As I left it");
    expect(store.get()[0]?.draft).toEqual({ subject: "Hello", message: "As I left it" });
    expect(document.activeElement).toBe(startAgain);
  });

  it("writes from the card and search alone where the profile can't be read, asking the fee, and offers to try again", async () => {
    renderDrafter({ profile: new ApiError(502, "UKCP's pages have changed.") });
    await shownLine(/Jo's profile couldn't be read/);
    expect((await message()).value).toContain("what your fees are");
    screen.getByRole("button", { name: "Try again" });
  });

  it("says that the profile couldn't be read, in words that stay as the visitor edits, and that it is trying again", async () => {
    renderDrafter({ profile: new ApiError(502, "UKCP's pages have changed.") });
    const line = await shownLine(/Jo's profile couldn't be read/);
    expect(said()).toEqual(["Jo's profile couldn't be read."]);
    expect(line.textContent).toContain("Jo's profile couldn't be read, so this is written from your search alone.");
    // The shown line loses its clause on the search; the region keeps its words, as a change to them would be said again.
    fireEvent.change(await message(), { target: { value: "My own words." } });
    expect(line.textContent).not.toContain("your search alone");
    expect(said()).toEqual(["Jo's profile couldn't be read."]);
    vi.mocked(api.profile).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(said()).toEqual(["Trying again"]));
  });

  it("gives the keyboard to the message once a retried profile arrives in place of Try again", async () => {
    renderDrafter({ profile: new ApiError(502, "UKCP's pages have changed.") });
    const retry = await screen.findByRole("button", { name: "Try again" });
    vi.mocked(api.profile).mockResolvedValue(PROFILE);
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull());
    expect(document.activeElement).toBe(await message());
  });

  it("shows where to get help now while the message mentions suicidal thoughts", async () => {
    renderDrafter({ search: "HelpWithAdvanced=Suicide" });
    await message();
    screen.getByText(/Need help now\?/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Suicidal thoughts" }));
    expect(screen.queryByText(/Need help now\?/)).toBeNull();
  });

  it("closes from its close button", async () => {
    const { onClose } = renderDrafter();
    await message();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("gives the keyboard back to what opened it as it goes", async () => {
    const opener = document.body.appendChild(document.createElement("button"));
    onTestFinished(() => opener.remove());
    opener.focus();
    const { unmount } = renderDrafter();
    await message();
    expect(document.activeElement).not.toBe(opener);
    unmount();
    await afterClosing();
    expect(document.activeElement).toBe(opener);
  });
});
