/**
 * Puts `text` on the clipboard, and says whether it went. Where the Clipboard API is missing or refused, as on a page that
 * isn't secure, the text is selected in a field and copied as a keyboard shortcut would. The field goes inside `near`, so
 * a dialog that holds focus within itself lets the field have it.
 */
export async function copyText(text: string, near: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyBySelection(text, near);
  }
}

function copyBySelection(text: string, near: HTMLElement): boolean {
  const focused = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  // Read-only, so a phone shows no keyboard for it; fixed and transparent, so selecting it neither scrolls nor shows.
  field.readOnly = true;
  field.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0";
  near.append(field);
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  if (focused instanceof HTMLElement) focused.focus();
  return copied;
}
