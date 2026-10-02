// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Profile } from "@shared/types";
import ProfileMap from "./ProfileMap";

const PROFILE: Profile = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

describe("ProfileMap", () => {
  it("keeps its pin through a redraw of the same profile, and draws a changed one's", () => {
    const point = { lat: 50.83, lng: -0.17 };
    const { rerender } = render(<ProfileMap profile={PROFILE} point={point} zoom={15} />);
    const pin = screen.getByRole("img", { name: "Test Therapist" });
    rerender(<ProfileMap profile={PROFILE} point={{ ...point }} zoom={15} />);
    expect(screen.getByRole("img", { name: "Test Therapist" })).toBe(pin);
    rerender(<ProfileMap profile={{ ...PROFILE, name: "Test Renamed" }} point={point} zoom={15} />);
    expect(screen.getByRole("img", { name: "Test Renamed" })).not.toBe(pin);
  });

  it("credits each office's map, with the credits' links in the Tab order once among them", async () => {
    const { container } = render(
      <>
        <ProfileMap profile={PROFILE} point={{ lat: 50.83, lng: -0.17 }} zoom={15} />
        <ProfileMap profile={PROFILE} point={{ lat: 51.5, lng: -0.1 }} zoom={15} />
      </>,
    );
    const links = () => screen.getAllByRole("link", { name: "OpenStreetMap" });
    await waitFor(() => expect(links().map((link) => link.getAttribute("tabindex"))).toEqual([null, "-1"]));
    expect(container.querySelectorAll(".leaflet-control-attribution")).toHaveLength(2);
  });
});
