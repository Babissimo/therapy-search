import { onlineManager } from "@tanstack/react-query";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ApiError, OFFLINE } from "./api";
import { queryClient } from "./queryClient";

describe("queryClient", () => {
  it("asks even while the browser says it is offline, so the failure is told at once", async () => {
    onlineManager.setOnline(false);
    onTestFinished(() => onlineManager.setOnline(true));
    const ask = vi.fn(async () => Promise.reject(new ApiError(0, OFFLINE)));
    await expect(queryClient.fetchQuery({ queryKey: ["offline"], queryFn: ask })).rejects.toMatchObject({ message: OFFLINE });
    expect(ask).toHaveBeenCalledOnce();
  });
});
