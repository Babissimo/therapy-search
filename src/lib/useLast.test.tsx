// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLast } from "./useLast";

describe("useLast", () => {
  it("gives the value, or while it is undefined, what it last was", () => {
    const { result, rerender } = renderHook<number | undefined, { value?: number }>(({ value }) => useLast(value), {
      initialProps: { value: undefined },
    });
    expect(result.current).toBeUndefined();
    rerender({ value: 1 });
    expect(result.current).toBe(1);
    rerender({ value: undefined });
    expect(result.current).toBe(1);
    rerender({ value: 2 });
    expect(result.current).toBe(2);
    rerender({ value: undefined });
    expect(result.current).toBe(2);
  });
});
