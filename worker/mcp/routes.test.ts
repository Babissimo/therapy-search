import { describe, expect, it } from "vitest";
import { HELP_NOW, INSTRUCTIONS } from "./instructions";
import { setup } from "./mcp.testing";
import { INVALID_REQUEST, LEGACY } from "./protocol";

describe("/mcp", () => {
  it("answers 404 while the switch is off, whatever is sent, asking nothing", async () => {
    const { rpc, post, request, forwarded } = setup({ endpoint: "off" });
    const res = await rpc("tools/list");
    expect([res.status, await res.json()]).toEqual([404, { error: "Not found" }]);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await request("/mcp")).status).toBe(404);
    const large = await post({ jsonrpc: "2.0", id: 1, method: "ping", params: { padding: "a".repeat(70_000) } });
    expect([large.status, await large.json()]).toEqual([404, { error: "Not found" }]);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("introduces itself to a legacy client by the site's name, with its instructions", async () => {
    const res = await setup().post({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: LEGACY[0] } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: unknown }).result).toEqual({
      protocolVersion: LEGACY[0],
      capabilities: { tools: {} },
      serverInfo: { name: "therapy-search", title: "Find a UKCP therapist (unofficial)", version: "1.0.0" },
      instructions: INSTRUCTIONS,
    });
  });

  it("serves modern requests, keeping nothing in a browser's cache", async () => {
    const res = await setup().rpc("tools/list");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "no-store"]);
    expect(((await res.json()) as { result: { resultType: string } }).result.resultType).toBe("complete");
  });

  it("refuses another site's page, a body too large to read, and GET, asking nothing", async () => {
    const { post, request, forwarded } = setup();
    expect((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    const large = await post({ jsonrpc: "2.0", id: 1, method: "ping", params: { padding: "a".repeat(70_000) } });
    expect([large.status, ((await large.json()) as { error: { code: number } }).error.code]).toEqual([413, INVALID_REQUEST]);
    expect(large.headers.get("Cache-Control")).toBe("no-store");
    expect((await request("/mcp")).status).toBe(405);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("tells assistants it is no support service, and where to turn for help now", () => {
    expect(INSTRUCTIONS).toContain("not a support service");
    expect(INSTRUCTIONS).toContain(HELP_NOW);
  });
});
