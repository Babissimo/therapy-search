import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEADER_MISMATCH,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  LEGACY,
  LIST_TTL_MS,
  METHOD_NOT_FOUND,
  MODERN,
  PARSE_ERROR,
  SUPPORTED,
  UNSUPPORTED_VERSION,
  VERSION_META,
  mcpApp,
  type McpServer,
  type ToolDefinition,
} from "./protocol";

const ECHO: ToolDefinition = {
  name: "echo",
  title: "Echo",
  description: "Says the text back.",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false },
};
const INFO = { name: "test", title: "Test server", version: "1.0.0" };
// What the spec's examples have a modern client put in every request's _meta.
const META = {
  [VERSION_META]: MODERN,
  "io.modelcontextprotocol/clientInfo": { name: "ExampleClient", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

function setup(call: McpServer["call"] = async (_name, args) => ({ content: [{ type: "text", text: String(args.text) }] })) {
  const run = vi.fn(call);
  const app = mcpApp(() => ({ info: INFO, instructions: "Be kind.", tools: () => [ECHO], call: run }));
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    });
  /** A modern request with the headers the spec has a client send, which `headers` can change. */
  const modern = (method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    post(
      { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } },
      { "MCP-Protocol-Version": MODERN, "Mcp-Method": method, ...(method === "tools/call" && { "Mcp-Name": String(params.name) }), ...headers },
    );
  /** A legacy request, as a client sends one after `initialize`. */
  const legacy = (method: string, params: Record<string, unknown> = {}, version = "2025-11-25") =>
    post({ jsonrpc: "2.0", id: 1, method, params }, { "MCP-Protocol-Version": version });
  return { app, post, modern, legacy, run };
}

afterEach(() => vi.restoreAllMocks());

describe("a modern request", () => {
  it("lists the tools, which a client may keep for an hour, and no browser keeps", async () => {
    const res = await setup().modern("tools/list");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { resultType: "complete", tools: [ECHO], ttlMs: LIST_TTL_MS, cacheScope: "public" },
    });
  });

  it("describes the server: its versions, tools, name and instructions", async () => {
    const { result } = await (await setup().modern("server/discover")).json();
    expect(result).toEqual({
      resultType: "complete",
      supportedVersions: SUPPORTED,
      capabilities: { tools: {} },
      _meta: { "io.modelcontextprotocol/serverInfo": INFO },
      instructions: "Be kind.",
      ttlMs: LIST_TTL_MS,
      cacheScope: "public",
    });
  });

  it("calls a tool with its arguments and gives its result", async () => {
    const { modern, run } = setup();
    const body = await (await modern("tools/call", { name: "echo", arguments: { text: "hello" } })).json();
    expect(run).toHaveBeenCalledWith("echo", { text: "hello" });
    expect(body).toEqual({ jsonrpc: "2.0", id: 1, result: { resultType: "complete", content: [{ type: "text", text: "hello" }] } });
  });

  it("calls a tool with no arguments when they are null", async () => {
    const { modern, run } = setup();
    const body = await (await modern("tools/call", { name: "echo", arguments: null })).json();
    expect(run).toHaveBeenCalledWith("echo", {});
    expect(body.result.resultType).toBe("complete");
  });

  it("reads a tool's name from Mcp-Name in its base64 form", async () => {
    const res = await setup().modern("tools/call", { name: "echo", arguments: { text: "hi" } }, { "Mcp-Name": "=?base64?ZWNobw==?=" });
    expect(res.status).toBe(200);
  });

  it("answers a ping", async () => {
    expect((await (await setup().modern("ping")).json()).result).toEqual({ resultType: "complete" });
  });

  it("refuses headers that don't match the body, calling nothing", async () => {
    const { modern, post, run } = setup();
    const call = { name: "echo", arguments: { text: "hi" } };
    const refused = [
      await modern("tools/list", {}, { "Mcp-Method": "tools/call" }),
      await modern("tools/call", call, { "Mcp-Name": "other" }),
      await modern("tools/call", call, { "Mcp-Name": "=?base64?not base64?=" }),
      await modern("tools/list", {}, { "MCP-Protocol-Version": "2025-11-25" }),
      // The version in _meta without its header, and the header without the version in _meta.
      await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } }, { "Mcp-Method": "tools/list" }),
      await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, { "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/list" }),
    ];
    for (const res of refused) {
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe(HEADER_MISMATCH);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("names the versions it serves when asked for another", async () => {
    const res = await setup().post(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [VERSION_META]: "2099-01-01" } } },
      { "MCP-Protocol-Version": "2099-01-01", "Mcp-Method": "tools/list" },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: UNSUPPORTED_VERSION, message: "Unsupported protocol version", data: { supported: SUPPORTED, requested: "2099-01-01" } },
    });
  });

  it("answers a method it doesn't serve with 404", async () => {
    const res = await setup().modern("resources/list");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe(METHOD_NOT_FOUND);
  });

  it("refuses an unknown tool and arguments that aren't an object, calling nothing", async () => {
    const { modern, run } = setup();
    const unknown = await (await modern("tools/call", { name: "nope", arguments: {} })).json();
    const list = await (await modern("tools/call", { name: "echo", arguments: ["hi"] })).json();
    expect([unknown.error.code, unknown.error.message]).toEqual([INVALID_PARAMS, "Unknown tool: nope"]);
    expect(list.error.code).toBe(INVALID_PARAMS);
    expect(run).not.toHaveBeenCalled();
  });

  it("says something went wrong when a tool throws, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await setup(async () => {
      throw new Error("broken");
    }).modern("tools/call", { name: "echo", arguments: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, error: { code: INTERNAL_ERROR, message: "Something went wrong." } });
    expect(logged).toHaveBeenCalled();
  });
});

describe("a legacy request", () => {
  it("opens with initialize, answered in the version asked for, with no session", async () => {
    const res = await setup().post({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: INFO },
    });
    expect(res.headers.get("Mcp-Session-Id")).toBeNull();
    expect(await res.json()).toEqual({
      jsonrpc: "2.0",
      id: 0,
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: INFO, instructions: "Be kind." },
    });
  });

  it("offers the newest legacy version for one it doesn't serve", async () => {
    const { result } = await (await setup().post({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05" } })).json();
    expect(result.protocolVersion).toBe(LEGACY[0]);
  });

  it("accepts a notification with 202 and no body", async () => {
    const res = await setup().post({ jsonrpc: "2.0", method: "notifications/initialized" }, { "MCP-Protocol-Version": "2025-11-25" });
    expect([res.status, await res.text()]).toEqual([202, ""]);
  });

  it.each(LEGACY)("lists and calls tools in %s, without the modern result type", async (version) => {
    const { legacy } = setup();
    expect(await (await legacy("tools/list", {}, version)).json()).toEqual({ jsonrpc: "2.0", id: 1, result: { tools: [ECHO] } });
    const called = await (await legacy("tools/call", { name: "echo", arguments: { text: "hi" } }, version)).json();
    expect(called).toEqual({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "hi" }] } });
  });

  it("takes a request without a version header as 2025-03-26's", async () => {
    const body = await (await setup().post({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
    expect(body.result).toEqual({ tools: [ECHO] });
  });

  it("answers ping, and a method it doesn't serve with an error", async () => {
    const { legacy } = setup();
    expect((await (await legacy("ping")).json()).result).toEqual({});
    const res = await legacy("prompts/list");
    expect([res.status, (await res.json()).error.code]).toEqual([200, METHOD_NOT_FOUND]);
  });
});

describe("the endpoint", () => {
  it.each([
    ["a body that isn't JSON", "{", PARSE_ERROR],
    ["a batch", [{ jsonrpc: "2.0", id: 1, method: "ping" }], INVALID_REQUEST],
    ["a null id", { jsonrpc: "2.0", id: null, method: "ping" }, INVALID_REQUEST],
    ["a response", { jsonrpc: "2.0", id: 1, result: {} }, INVALID_REQUEST],
    ["another JSON-RPC version", { jsonrpc: "1.0", id: 1, method: "ping" }, INVALID_REQUEST],
  ])("refuses %s with 400", async (_name, body, code) => {
    const res = await setup().post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ jsonrpc: "2.0", id: null, error: { code } });
  });

  it("allows only POST", async () => {
    const { app } = setup();
    for (const method of ["GET", "DELETE"]) {
      const res = await app.request("/", { method });
      expect([res.status, res.headers.get("Allow")]).toEqual([405, "POST"]);
    }
  });

  it("refuses requests from other sites' pages, but not from its own", async () => {
    const { post, run } = setup();
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: {} } };
    expect((await post(call, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await post(call, { "Sec-Fetch-Site": "same-site" })).status).toBe(403);
    expect((await post(call, { Origin: "https://elsewhere.example" })).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
    expect((await post(call, { Origin: "http://localhost", "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
  });
});
