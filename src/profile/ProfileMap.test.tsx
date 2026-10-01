// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
});
