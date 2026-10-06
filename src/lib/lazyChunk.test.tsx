// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Suspense, type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { lazyChunk } from "./lazyChunk";

function Greeting({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

function draw(Component: ComponentType<{ name: string }>) {
  return render(
    <Suspense>
      <Component name="Jo" />
    </Suspense>,
  );
}

describe("lazyChunk", () => {
  it("draws nothing until its chunk is here, then the component", async () => {
    const { Component } = lazyChunk(async () => Greeting);
    const { container } = draw(Component);
    expect(container.textContent).toBe("");
    expect(await screen.findByText("Hello Jo")).toBeTruthy();
  });

  it("draws the component in its first render once its chunk has been fetched", async () => {
    const { Component, load } = lazyChunk(async () => Greeting);
    await load();
    draw(Component);
    expect(screen.getByText("Hello Jo")).toBeTruthy();
  });

  it("asks for its chunk again as it is first drawn where an earlier fetch failed", async () => {
    const fetch = vi.fn<() => Promise<typeof Greeting>>().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(Greeting);
    const { Component, load } = lazyChunk(fetch);
    await expect(load()).rejects.toThrow("Failed to fetch");
    draw(Component);
    expect(await screen.findByText("Hello Jo")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
