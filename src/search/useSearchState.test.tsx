// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { onlineSearch } from "@shared/online";
import { readSearch, useSearchState, viewSearch } from "./useSearchState";

function Page() {
  const { params } = useSearchState();
  return <output>{params?.page}</output>;
}

describe("useSearchState", () => {
  it("opens a link that names a page at the first, since results grow with Load more", () => {
    render(
      <MemoryRouter initialEntries={["/?Location=Leeds&page=3"]}>
        <Page />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status").textContent).toBe("1");
  });
});

describe("viewSearch", () => {
  it("reads a search near a place as the query string has it", () => {
    expect(viewSearch("/", "?Location=Leeds&Languages=Greek")).toEqual(readSearch("?Location=Leeds&Languages=Greek"));
  });

  it("reads the online view's search as that view asks for it, whatever case or trailing slash its path has", () => {
    const online = onlineSearch(readSearch("?Location=Leeds&Languages=Greek"));
    expect(viewSearch("/online", "?Location=Leeds&Languages=Greek")).toEqual(online);
    expect(viewSearch("/Online/", "?Location=Leeds&Languages=Greek")).toEqual(online);
    expect(online.multi.TypesOfSession).toEqual(["Online Therapy", "Telephone Therapy"]);
  });
});
