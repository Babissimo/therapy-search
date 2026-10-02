// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { copyText } from "./clipboard";

/** A box on the page, with a button in it that has focus, as a copy button would. */
function setUp() {
  const near = document.body.appendChild(document.createElement("div"));
  const button = near.appendChild(document.createElement("button"));
  button.focus();
  onTestFinished(() => near.remove());
  return { near, button };
}

/** jsdom has no execCommand; this one copies whatever is selected in the focused field, or refuses. */
function stubExecCommand(works: boolean) {
  const copied: string[] = [];
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: (command: string) => {
      const field = document.activeElement;
      if (!works || command !== "copy" || !(field instanceof HTMLTextAreaElement)) return false;
      copied.push(field.value.slice(field.selectionStart, field.selectionEnd));
      return true;
    },
  });
  onTestFinished(() => void delete (document as { execCommand?: unknown }).execCommand);
  return copied;
}

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("copies by the Clipboard API where the browser has it", async () => {
    const { near } = setUp();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("Ann Ash", near)).toBe(true);
    expect(writeText).toHaveBeenCalledWith("Ann Ash");
  });

  it("copies a selected field in the box it is given where the Clipboard API is refused, then gives focus back", async () => {
    const { near, button } = setUp();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")) } });
    const copied = stubExecCommand(true);
    expect(await copyText("Ann Ash\nBo Birch", near)).toBe(true);
    expect(copied).toEqual(["Ann Ash\nBo Birch"]);
    expect(near.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("copies a selected field where the browser has no Clipboard API", async () => {
    const { near } = setUp();
    vi.stubGlobal("navigator", {});
    const copied = stubExecCommand(true);
    expect(await copyText("Ann Ash", near)).toBe(true);
    expect(copied).toEqual(["Ann Ash"]);
  });

  it("says the text didn't go when neither way copies it", async () => {
    const { near, button } = setUp();
    vi.stubGlobal("navigator", {});
    stubExecCommand(false);
    expect(await copyText("Ann Ash", near)).toBe(false);
    expect(near.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
