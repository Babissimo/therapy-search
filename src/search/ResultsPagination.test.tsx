// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultsPagination } from "./ResultsPagination";

function setup() {
  const onPage = vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<ResultsPagination page={1} totalPages={3} hrefFor={(p) => `/?page=${p}`} onPage={onPage} />);
  return { onPage, link: screen.getByRole("link", { name: "2" }) };
}

describe("ResultsPagination", () => {
  it("links to real URLs and pages in place on a plain click", () => {
    const { onPage, link } = setup();
    expect(link.getAttribute("href")).toBe("/?page=2");
    expect(fireEvent.click(link)).toBe(false);
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("leaves modified clicks to the browser, so a page can open in a new tab", () => {
    const { onPage, link } = setup();
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(onPage).not.toHaveBeenCalled();
  });
});
