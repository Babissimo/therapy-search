import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env, Forward } from "../app";
import { mcpApp, rpcTooLarge } from "./protocol";
import { therapistServer } from "./server";

/** MCP for AI assistants, which answers 404 Not found, reading nothing sent, until the MCP_ENDPOINT var is "on". */
export function mcpEndpoint(forward: Forward, maxSize: number) {
  const endpoint = new Hono<{ Bindings: Env }>();
  // no-store, so no cache keeps the 404 past the deploy that turns the switch on.
  endpoint.use("*", async (c, next) => (c.env.MCP_ENDPOINT === "on" ? next() : c.json({ error: "Not found" }, 404, { "Cache-Control": "no-store" })));
  endpoint.use("*", bodyLimit({ maxSize, onError: rpcTooLarge }));
  endpoint.route("/", mcpApp((c) => therapistServer(c, forward)));
  return endpoint;
}
