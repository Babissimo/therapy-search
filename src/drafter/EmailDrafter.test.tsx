// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi, type MockInstance } from "vitest";
import type { ContactDetails, Profile } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { createShortlistStore, type ShortlistCard, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { EmailDrafter } from "./EmailDrafter";
import { MAILTO_SAFE } from "./mailto";

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

/** What a request answers with: its data, its failure, or a promise to answer later. */
type Answer<T> = T | ApiError | Promise<T>;
type Setup = { search?: string; profile?: Answer<Profile>; contact?: Answer<ContactDetails>; store?: ShortlistStore; at?: string };

function answer<T>(asked: MockInstance<(...args: never[]) => Promise<T>>, given: Answer<T>) {
  if (given instanceof ApiError) asked.mockRejectedValue(given);
  else if (given instanceof Promise) asked.mockReturnValue(given);
  else asked.mockResolvedValue(given);
}

function renderDrafter({
  search = ANXIOUS,
  profile = PROFILE,
  contact = {},
  store = createShortlistStore(null),
  at = "/therapist/Jo-ABCDEFGH",
}: Setup = {}) {
  if (!store.has(JO.slug)) store.add(JO, { search });
  answer(vi.spyOn(api, "profile"), profile);
  answer(vi.spyOn(api, "contact"), contact);
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

describe("EmailDrafter sending", () => {
  // jsdom can't follow a mailto: or tel: link.
  const noNavigation = (event: Event) => event.preventDefault();
  const writeText = vi.fn<(text: string) => Promise<void>>();
  const NO_EMAIL: Profile = { ...PROFILE, email: undefined, contactId: "7" };
  const copyButton = () => screen.getByRole("button", { name: "Copy message" });
  const offer = () => screen.queryByRole("group", { name: "Mark as contacted?" });
  /** Presses a control the way a visitor does: focused first, then clicked, with the clipboard's answer let in. */
  const press = (control: HTMLElement) =>
    act(async () => {
      control.focus();
      fireEvent.click(control);
    });
  beforeEach(() => {
    document.addEventListener("click", noNavigation);
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });
  afterEach(() => {
    document.removeEventListener("click", noNavigation);
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("opens the draft in the visitor's email app, addressed to the therapist", async () => {
    renderDrafter();
    const link = await screen.findByRole("link", { name: "Open in email app" });
    expect(link.getAttribute("href")).toMatch(/^mailto:jo@example\.com\?subject=Enquiry%20about%20therapy&body=Hello%20Jo%2C%0D%0A%0D%0AI%20found/);
  });

  it("asks UKCP for contact details only where the profile has no email", async () => {
    renderDrafter({ profile: { ...PROFILE, contactId: "7" } });
    await screen.findByRole("link", { name: "Open in email app" });
    expect(api.contact).not.toHaveBeenCalled();
  });

  it("offers only to copy it where the profile can't be read", async () => {
    renderDrafter({ profile: new ApiError(502, "UKCP's pages have changed.") });
    await shownLine(/Jo's profile couldn't be read/);
    expect(copyButton()).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open in email app" })).toBeNull();
    expect(screen.queryByText(/UKCP shows no way/)).toBeNull();
  });

  it("sends the visitor's edit, not the site's draft", async () => {
    renderDrafter();
    fireEvent.change(await message(), { target: { value: "My own words." } });
    expect(screen.getByRole("link", { name: "Open in email app" }).getAttribute("href")).toMatch(/&body=My%20own%20words\.$/);
  });

  it("addresses the email to the one UKCP's contact details give where the profile has none", async () => {
    renderDrafter({ profile: { ...NO_EMAIL, emailInContact: true }, contact: { email: "jo@practice.example" } });
    const link = await screen.findByRole("link", { name: "Open in email app" });
    expect(link.getAttribute("href")).toMatch(/^mailto:jo@practice\.example\?/);
  });

  it("offers nothing to send until the profile has been read or has failed", async () => {
    renderDrafter({ profile: new Promise<Profile>(() => {}) });
    await screen.findByText("Writing your draft");
    expect(screen.queryByRole("button", { name: "Copy message" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open in email app" })).toBeNull();
  });

  it("copies the subject and message, saying so from a live region that was there before, and leaves the keyboard on the button", async () => {
    renderDrafter();
    await message();
    const regions = new Set(document.querySelectorAll("[aria-live=polite]"));
    await press(copyButton());
    expect(writeText.mock.calls[0]?.[0]).toMatch(/^Subject: Enquiry about therapy\n\nHello Jo,/);
    expect(regions.has(screen.getByText("Copied."))).toBe(true);
    expect(document.activeElement).toBe(copyButton());
  });

  it("is heard again when copied again, its region emptied while the clipboard answers and then saying Copied. once more", async () => {
    renderDrafter();
    await message();
    await press(copyButton());
    const region = screen.getByText("Copied.");
    let answer: () => void = () => {};
    writeText.mockReturnValue(new Promise<void>((resolve) => (answer = resolve)));
    await press(copyButton());
    expect(region.textContent).toBe("");
    await act(async () => answer());
    expect(region.textContent).toBe("Copied.");
  });

  it("lets go of what it said about the draft once the draft changes, so Copied. never stands beside words not copied", async () => {
    renderDrafter();
    await message();
    await press(copyButton());
    const region = screen.getByText("Copied.");
    fireEvent.change(await message(), { target: { value: "My own words." } });
    expect(region.textContent).toBe("");
  });

  it("selects the message, keyboard in it, and says how to copy it where the clipboard is refused", async () => {
    writeText.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    renderDrafter();
    const box = await message();
    await press(copyButton());
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length]);
    // Ctrl+C copies from the focused control.
    expect(document.activeElement).toBe(box);
    screen.getByText("Couldn't copy it for you. It's selected: press Ctrl+C (⌘C on a Mac) to copy it.");
    expect(screen.queryByText("Copied.")).toBeNull();
  });

  it("also copies a message too long for every email app to take whole", async () => {
    renderDrafter();
    fireEvent.change(await message(), { target: { value: "x".repeat(2500) } });
    await press(screen.getByRole("link", { name: "Open in email app" }));
    expect(writeText).toHaveBeenCalledWith("x".repeat(2500));
    screen.getByText("Also copied, in case your email app cuts it short.");
  });

  it("measures the link rather than the message, copying one short enough whose link, encoded, is too long", async () => {
    renderDrafter();
    const words = "a b ".repeat(400);
    fireEvent.change(await message(), { target: { value: words } });
    const link = screen.getByRole("link", { name: "Open in email app" });
    expect([words.length < MAILTO_SAFE, link.getAttribute("href")!.length > MAILTO_SAFE]).toEqual([true, true]);
    await press(link);
    expect(writeText).toHaveBeenCalledWith(words);
  });

  it("copies nothing more of a message short enough to go whole", async () => {
    renderDrafter();
    await message();
    await press(screen.getByRole("link", { name: "Open in email app" }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("offers to mark them contacted once the email app opens, leaving the drafter open and the keyboard on the link for Not now", async () => {
    const { onMarked } = renderDrafter();
    const link = await screen.findByRole("link", { name: "Open in email app" });
    expect(offer()).toBeNull();
    await press(link);
    await press(within(offer()!).getByRole("button", { name: "Not now" }));
    expect(offer()).toBeNull();
    screen.getByRole("dialog");
    expect(onMarked).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(link);
  });

  it("offers it after copying too, and tells the page that they did on Yes", async () => {
    const { onMarked } = renderDrafter();
    await message();
    await press(copyButton());
    fireEvent.click(within(offer()!).getByRole("button", { name: "Yes" }));
    expect(onMarked).toHaveBeenCalledOnce();
    expect(offer()).toBeNull();
  });

  it("gives a phone number where there is no email, as a link that also brings the offer", async () => {
    renderDrafter({ profile: NO_EMAIL, contact: { phone: "0113 496 0000" } });
    await screen.findByText(/Jo gives a phone number rather than an email address/);
    expect(screen.queryByRole("link", { name: "Open in email app" })).toBeNull();
    expect(copyButton()).toBeTruthy();
    screen.getByText(/The message works as notes for the call\./);
    const phone = screen.getByRole("link", { name: "0113 496 0000" });
    expect(phone.getAttribute("href")).toBe("tel:01134960000");
    await press(phone);
    await press(within(offer()!).getByRole("button", { name: "Not now" }));
    expect(document.activeElement).toBe(phone);
  });

  it("gives a website where there is neither email nor phone", async () => {
    renderDrafter({ profile: NO_EMAIL, contact: { website: "https://www.jo.example/contact/" } });
    await screen.findByText(/Jo gives a website rather than an email address/);
    screen.getByRole("link", { name: "jo.example/contact (opens in a new tab)" });
    screen.getByRole("link", { name: "View on UKCP (opens in a new tab)" });
  });

  it("says when UKCP shows no way to reach the therapist, linking to their UKCP page", async () => {
    renderDrafter({ profile: NO_EMAIL, contact: {} });
    await screen.findByText(/UKCP shows no way to reach Jo\./);
    expect(screen.getByRole("link", { name: "View on UKCP (opens in a new tab)" }).getAttribute("href")).toContain(JO.slug);
    expect(copyButton()).toBeTruthy();
  });

  it("says nothing of what UKCP has while the contact details are on their way", async () => {
    renderDrafter({ profile: NO_EMAIL, contact: new Promise<ContactDetails>(() => {}) });
    await message();
    expect(copyButton()).toBeTruthy();
    expect(screen.queryByText(/UKCP shows no way/)).toBeNull();
    expect(screen.queryByRole("link", { name: /View on UKCP/ })).toBeNull();
  });

  it("does not say UKCP has no way to reach them where the contact details couldn't be read, but offers to try again", async () => {
    renderDrafter({ profile: NO_EMAIL, contact: new ApiError(502, "UKCP's pages have changed.") });
    await shownLine(/Jo's contact details couldn't be read/);
    expect(screen.queryByText(/UKCP shows no way/)).toBeNull();
    const retry = screen.getByRole("button", { name: "Try again" });
    vi.mocked(api.contact).mockResolvedValue({ phone: "0113 496 0000" });
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "0113 496 0000" })));
  });

  it("says that the contact details couldn't be read, in the words of the line it shows", async () => {
    renderDrafter({ profile: NO_EMAIL, contact: new ApiError(502, "UKCP's pages have changed.") });
    const line = await shownLine(/Jo's contact details couldn't be read/);
    expect(said()).toEqual(["Jo's contact details couldn't be read."]);
    expect(line.textContent).toContain(said()[0]);
  });

  it("gives the keyboard to the email link once retried contact details bring the address", async () => {
    renderDrafter({ profile: { ...NO_EMAIL, emailInContact: true }, contact: new ApiError(502, "UKCP's pages have changed.") });
    const retry = await screen.findByRole("button", { name: "Try again" });
    vi.mocked(api.contact).mockResolvedValue({ email: "jo@practice.example" });
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Open in email app" })));
  });
});
