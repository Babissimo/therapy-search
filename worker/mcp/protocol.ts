import { Hono, type Context } from "hono";
import type { Env } from "../app";

type Ctx = Context<{ Bindings: Env }>;

/** The revision that names its version on every request, with no handshake and no sessions. */
export const MODERN = "2026-07-28";
/** The revisions a client opens with `initialize`, newest first. None needs a session, so none is issued. */
export const LEGACY: readonly string[] = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SUPPORTED: readonly string[] = [MODERN, ...LEGACY];
export const VERSION_META = "io.modelcontextprotocol/protocolVersion";
const SERVER_INFO_META = "io.modelcontextprotocol/serverInfo";
// Clients of revisions before 2025-06-18 send no version header.
const UNNAMED = "2025-03-26";
/** How long a client may keep the tool list and the server's description, which change only with UKCP's options. */
export const LIST_TTL_MS = 60 * 60 * 1000;

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export const HEADER_MISMATCH = -32020;
export const UNSUPPORTED_VERSION = -32022;

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
};
export type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
/** What the endpoint serves: who it is, how an assistant should use it, and its tools. */
export type McpServer = {
  info: { name: string; title: string; version: string };
  instructions: string;
  tools(): ToolDefinition[];
  /** Runs a tool `tools()` lists, with arguments that are a JSON object. */
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
};

type Id = string | number;
type Message = { id?: Id; method: string; params: Record<string, unknown> };
/** A message that wants an answer. */
type Rpc = Required<Message>;
type Reply = { status: 200 | 400 | 404 | 500; body: Record<string, unknown> };
type Header = (name: string) => string | undefined;
type Called = { result: ToolResult } | { code: number; message: string };

/** MCP over Streamable HTTP, statelessly, each reply one JSON object. */
export function mcpApp(serverFor: (c: Ctx) => McpServer) {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("Cache-Control", "no-store");
  });

  app.post("/", async (c) => {
    // MCP's guard against DNS rebinding, and the contact route's against other sites' pages.
    if (fromOtherSite(c)) return c.json(failure(null, INVALID_REQUEST, "Requests from other sites' pages are refused."), 403);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await c.req.text());
    } catch {
      return c.json(failure(null, PARSE_ERROR, "The body isn't JSON."), 400);
    }
    const message = messageOf(parsed);
    if (!message) return c.json(failure(null, INVALID_REQUEST, "The body isn't one JSON-RPC 2.0 request or notification."), 400);
    if (message.id === undefined) return c.body(null, 202);
    const { status, body } = await answer(serverFor(c), { ...message, id: message.id }, (name) => c.req.header(name));
    return c.json(body, status);
  });

  app.on(["GET", "DELETE"], "/", (c) => c.body(null, 405, { Allow: "POST" }));

  return app;
}

/** The answer to a body too large to read, for the gateway's body limit to give. */
export function rpcTooLarge(c: Context) {
  return c.json(failure(null, INVALID_REQUEST, "That request is too large."), 413, { "Cache-Control": "no-store" });
}

/** A request's reply: legacy when it opens with `initialize` or names a legacy version, modern when it names the modern one. */
async function answer(server: McpServer, rpc: Rpc, header: Header): Promise<Reply> {
  const { id, method, params } = rpc;
  if (method === "initialize") return ok(id, initialize(server, params));
  const declared = metaOf(params)[VERSION_META];
  const named = header("mcp-protocol-version");
  if (named === MODERN || declared === MODERN) {
    const mismatch = headerMismatch(rpc, header);
    return mismatch ? { status: 400, body: failure(id, HEADER_MISMATCH, mismatch) } : modern(server, rpc);
  }
  const version = named ?? (typeof declared === "string" ? declared : UNNAMED);
  if (LEGACY.includes(version)) return legacy(server, rpc);
  return { status: 400, body: failure(id, UNSUPPORTED_VERSION, "Unsupported protocol version", { supported: SUPPORTED, requested: version }) };
}

async function modern(server: McpServer, { id, method, params }: Rpc): Promise<Reply> {
  const complete = (result: Record<string, unknown>) => ok(id, { resultType: "complete", ...result });
  switch (method) {
    case "server/discover":
      return complete({
        supportedVersions: SUPPORTED,
        capabilities: { tools: {} },
        _meta: { [SERVER_INFO_META]: server.info },
        instructions: server.instructions,
        ttlMs: LIST_TTL_MS,
        cacheScope: "public",
      });
    case "tools/list":
      return complete({ tools: server.tools(), ttlMs: LIST_TTL_MS, cacheScope: "public" });
    case "tools/call":
      return called(id, await callTool(server, params), complete);
    case "ping":
      return complete({});
    default:
      return { status: 404, body: failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
}

async function legacy(server: McpServer, { id, method, params }: Rpc): Promise<Reply> {
  switch (method) {
    case "tools/list":
      return ok(id, { tools: server.tools() });
    case "tools/call":
      return called(id, await callTool(server, params), (result) => ok(id, result));
    case "ping":
      return ok(id, {});
    default:
      return { status: 200, body: failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
}

/** The legacy handshake's answer, in the version asked for if it is served here, and the newest legacy one if not. */
function initialize(server: McpServer, params: Record<string, unknown>): Record<string, unknown> {
  const asked = params.protocolVersion;
  const protocolVersion = typeof asked === "string" && LEGACY.includes(asked) ? asked : LEGACY[0]!;
  return { protocolVersion, capabilities: { tools: {} }, serverInfo: server.info, instructions: server.instructions };
}

/** Why a modern request's headers don't match its body, which the spec requires of them; undefined when they match. */
function headerMismatch({ method, params }: Rpc, header: Header): string | undefined {
  if (header("mcp-protocol-version") !== metaOf(params)[VERSION_META]) return "The MCP-Protocol-Version header doesn't match the version in _meta.";
  if (header("mcp-method") !== method) return "The Mcp-Method header doesn't match the method.";
  if (method === "tools/call" && decoded(header("mcp-name")) !== params.name) return "The Mcp-Name header doesn't match the tool's name.";
  return undefined;
}

async function callTool(server: McpServer, params: Record<string, unknown>): Promise<Called> {
  const { name } = params;
  // A client with no arguments to give may send null for them, as it may omit them.
  const args = params.arguments ?? {};
  if (typeof name !== "string" || !server.tools().some((tool) => tool.name === name)) {
    return { code: INVALID_PARAMS, message: `Unknown tool: ${String(name)}` };
  }
  if (!isObject(args)) return { code: INVALID_PARAMS, message: "A tool's arguments must be an object." };
  try {
    return { result: await server.call(name, args) };
  } catch (error) {
    console.error(error);
    return { code: INTERNAL_ERROR, message: "Something went wrong." };
  }
}

function called(id: Id, outcome: Called, done: (result: Record<string, unknown>) => Reply): Reply {
  if ("result" in outcome) return done({ ...outcome.result });
  return { status: outcome.code === INTERNAL_ERROR ? 500 : 200, body: failure(id, outcome.code, outcome.message) };
}

function ok(id: Id, result: Record<string, unknown>): Reply {
  return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

function failure(id: Id | null, code: number, message: string, data?: Record<string, unknown>): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data && { data }) } };
}

/** A JSON-RPC 2.0 request or notification, or undefined for anything else, a batch or a response included. MCP forbids a null id. */
function messageOf(value: unknown): Message | undefined {
  if (!isObject(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string") return undefined;
  const { id, params = {} } = value;
  if (id !== undefined && typeof id !== "string" && !Number.isSafeInteger(id)) return undefined;
  if (!isObject(params)) return undefined;
  return { id: id as Id | undefined, method: value.method, params };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metaOf(params: Record<string, unknown>): Record<string, unknown> {
  return isObject(params._meta) ? params._meta : {};
}

/** A header's value, decoded when it carries MCP's `=?base64?…?=` form; undefined when that form is broken. */
function decoded(value: string | undefined): string | undefined {
  if (value === undefined || !value.startsWith("=?base64?")) return value;
  const encoded = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/.exec(value)?.[1];
  if (encoded === undefined) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

/** Whether a browser sent the request from another site's page. Assistants' servers send no Origin. */
function fromOtherSite(c: Ctx): boolean {
  const site = c.req.header("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return true;
  const origin = c.req.header("origin");
  return origin !== undefined && origin !== new URL(c.req.url).origin;
}
