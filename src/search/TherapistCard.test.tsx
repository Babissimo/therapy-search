// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { TherapistCard } from "./TherapistCard";

describe("TherapistCard", () => {
  it("shows what UKCP's card shows and links to the profile", () => {
    render(
      <MemoryRouter>
        <TherapistCard
          therapist={{
            slug: "Test-Therapist-1-TESTID01",
            name: "Test Therapist 1",
            initials: "TT",
            location: "TESTTOWN AB1",
            distance: "2 miles from Brighton",
            phone: "01234 567890",
            sessionTypes: "In-person & Remote",
            summary: "Summary text.",
            tags: ["Anxiety", "Trauma"],
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Test Therapist 1" }).getAttribute("href")).toBe("/therapist/Test-Therapist-1-TESTID01");
    screen.getByText("TESTTOWN AB1 (2 miles from Brighton)");
    screen.getByText("01234 567890 | In-person & Remote");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Anxiety", "Trauma"]);
  });
});
