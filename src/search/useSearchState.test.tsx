// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { useSearchState } from "./useSearchState";

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
