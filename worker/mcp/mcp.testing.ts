import { vi } from "vitest";
import { createCache, createGateway, type Env, type PlaceFinder } from "../app";
import type { UkcpClient } from "../ukcp/client";
import { MODERN, VERSION_META, type ToolResult } from "./protocol";

export const SITE = "https://example.test";
export const bytes = (text: string) => new TextEncoder().encode(text);

/** Card `n` on a page of UKCP's results, with the phone number UKCP puts on every card and the issues it tags. */
export function listing(n: number, { tags = ["Anxiety", "Depression"] } = {}) {
  return `<div class="profile-listing margin-b-md"><a href="therapist/Therapist-${n}-ABCDEFGH" class="light-anchor">
  <h2>Therapist ${n}</h2><span class="profile-listing-locations"><strong>Bristol BS${n}</strong> (0.${n} miles from Bristol)</span>
  <span class="profile-listing-contact-session-type"><strong>01234 567890</strong>|&nbsp;Online Therapy</span><p class="pt-2">Summary ${n}.</p>
  <ul class="tag-list">${tags.map((tag) => `<li><span>${tag}</span></li>`).join("")}</ul></a></div>`;
}

/** A page of UKCP's results: `count` cards from the first, of `total`, near `place`. */
export function results(count: number, { total = count, place = "Bristol, City of Bristol, UK" } = {}) {
  const cards = Array.from({ length: count }, (_, i) => listing(i + 1)).join("\n");
  return `<span class="d-block results-no">1-${count} of ${total} results</span>
<span class="results-location">Location searched: <strong>${place}</strong></span>${cards}`;
}

/** The gateway with the endpoint on unless `endpoint` says otherwise, and UKCP answering with `client`'s stubs. */
export function setup({ endpoint = "on", allow = true, allowEarly = true, client = {} as Partial<UkcpClient> } = {}) {
  const limit = vi.fn(async () => ({ success: allow }));
  const earlyLimit = vi.fn(async () => ({ success: allowEarly }));
  const allowed = { limit: vi.fn(async () => ({ success: true })) };
  const env: Env = {
    ASSETS: { fetch: vi.fn() },
    UPSTREAM_LIMIT: { limit },
    PLACE_LIMIT: allowed,
    OFFICE_LIMIT: allowed,
    EARLY_LIMIT: { limit: earlyLimit },
    UKCP_SESSION: { get: async () => null, put: async () => {} },
    SITE_URL: SITE,
    MCP_ENDPOINT: endpoint,
  };
  const stub = {
    search: vi.fn(async () => bytes(results(48, { total: 441 }))),
    profile: vi.fn(async () => null),
    contact: vi.fn(),
    ...client,
  } as unknown as UkcpClient;
  const cache = createCache(
    () => stub,
    () => ({ lookup: vi.fn(), nearest: vi.fn() }) as unknown as PlaceFinder,
  );
  const forwarded = vi.fn(async (req: Request) => cache.fetch(req, env));
  const gateway = createGateway(() => ({ fetch: forwarded }));
  /** What the cached entrypoint was asked for, as path and query. */
  const asked = () => forwarded.mock.calls.map(([req]) => new URL(req.url).pathname + new URL(req.url).search);
  const request = (path: string, init: RequestInit = {}) =>
    gateway.request(path, { ...init, headers: { "cf-connecting-ip": "203.0.113.9", ...init.headers } }, env);
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    request("/mcp", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    });
  /** A modern request, with the headers the spec has a client send. */
  const rpc = (method: string, params: Record<string, unknown> = {}) =>
    post(
      { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: { [VERSION_META]: MODERN } } },
      { "MCP-Protocol-Version": MODERN, "Mcp-Method": method, ...(method === "tools/call" && { "Mcp-Name": String(params.name) }) },
    );
  /** A tool's result for these arguments. */
  const call = async (name: string, args: Record<string, unknown>) =>
    ((await (await rpc("tools/call", { name, arguments: args })).json()) as { result: ToolResult }).result;
  return { request, post, rpc, call, asked, forwarded, stub, limit, earlyLimit };
}
