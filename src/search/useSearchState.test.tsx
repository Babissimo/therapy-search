// @vitest-environment jsdom
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { onlineSearch } from "@shared/online";
import { readSearch, useSearchState, useShownSearch, viewSearch } from "./useSearchState";

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

describe("useShownSearch", () => {
  const shownAt = (entry: string | { pathname: string; state?: unknown }) =>
    renderHook(() => useShownSearch(), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>,
    }).result.current;

  it("is the search page's own search, as one query", () => {
    expect(shownAt("/?HelpWithAdvanced=Anxiety&Location=Leeds")).toBe("Location=Leeds&HelpWithAdvanced=Anxiety");
  });

  it("is the online view's search there, which has no place and keeps to the sessions had remotely", () => {
    expect(shownAt("/online?HelpWithAdvanced=Anxiety&Location=Leeds")).toBe(
      "TypesOfSession=Online+Therapy&TypesOfSession=Telephone+Therapy&HelpWithAdvanced=Anxiety",
    );
  });

  it("names no page, since results grow with Load more", () => {
    expect(shownAt("/?Location=Leeds&page=2")).toBe("Location=Leeds");
  });

  it("is the search beneath a drawer opened over the search page", () => {
    const background = { pathname: "/", search: "?Location=Leeds", hash: "", state: null, key: "beneath" };
    expect(shownAt({ pathname: "/therapist/Jo-ABCDEFGH", state: { background } })).toBe("Location=Leeds");
  });

  it("is nothing on any other page, on a search page with nothing searched, or for a search UKCP couldn't send", () => {
    expect(shownAt("/therapist/Jo-ABCDEFGH")).toBeUndefined();
    expect(shownAt("/")).toBeUndefined();
    expect(shownAt("/?Languages=Klingon")).toBeUndefined();
  });
});
