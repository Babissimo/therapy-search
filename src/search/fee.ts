const POUNDS = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
// An amount after a pound sign, and the far end of a range written after it: "£60 -70", "£60–£100", "£60 to £70". A
// number followed by a length, as in "£60 - 90 minutes", ends no range.
const AMOUNT = new RegExp(String.raw`£\s*${POUNDS}(?:\s*(?:-|–|—|to)\s*£?\s*${POUNDS}(?!\d)(?!\s*(?:min|hour|hr)))?`, "gi");

/** The fee a card shows for an office, from the text under its "Cost:" heading: its one amount, or where its several start. */
export function feeText(cost: string | undefined): string | undefined {
  const amounts = [...(cost ?? "").matchAll(AMOUNT)].flatMap(([, low = "", high]) => {
    const from = pounds(low);
    const to = high === undefined ? undefined : pounds(high);
    // A smaller number after a dash is something else, such as the length in "£70 - 50 minutes".
    return to !== undefined && to > from ? [from, to] : [from];
  });
  if (amounts.length === 0) return undefined;
  const lowest = Math.min(...amounts);
  const starts = new Set(amounts).size > 1 || /\bfrom\s*£/i.test(cost ?? "");
  const shown = lowest.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(lowest) ? 0 : 2, maximumFractionDigits: 2 });
  return `${starts ? "From " : ""}£${shown}`;
}

function pounds(text: string): number {
  return Number(text.replaceAll(",", ""));
}
