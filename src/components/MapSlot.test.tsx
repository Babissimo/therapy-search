// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { lazy } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapSlot } from "./MapSlot";

afterEach(() => vi.restoreAllMocks());

describe("MapSlot", () => {
  it("holds a muted box in the map's place until its code is here, then draws the map", async () => {
    const Map = lazy(async () => ({ default: () => <p>The map</p> }));
    const { container } = render(
      <MapSlot>
        <Map />
      </MapSlot>,
    );
    expect(container.querySelector(".bg-muted")).not.toBeNull();
    expect(container.textContent).toBe("");
    expect(await screen.findByText("The map")).toBeTruthy();
  });

  it("leaves a quiet note with a reload in the map's place when its code can't be fetched, and the page around it", async () => {
    // React reports the error it caught to the console.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Map = lazy(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    render(
      <>
        <p>The results</p>
        <MapSlot>
          <Map />
        </MapSlot>
      </>,
    );
    const note = await screen.findByRole("note");
    expect(within(note).getByText("The map couldn't load.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(note).getByRole("button", { name: "Reload the page" })).toBeTruthy();
    expect(screen.getByText("The results")).toBeTruthy();
  });
});
