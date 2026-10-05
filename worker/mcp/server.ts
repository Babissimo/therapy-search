import type { Context } from "hono";
import type { Env, Forward } from "../app";
import { SITE_NAME } from "../plain/pages";
import { INSTRUCTIONS } from "./instructions";
import type { McpServer } from "./protocol";
import { searchDefinition, searchTherapists } from "./search";
import { getTherapist, therapistDefinition } from "./therapist";
import type { Tool, ToolContext } from "./tool";

/** Every assistant's calls share one allowance, as nothing tells the people behind them apart. */
export const MCP_RATE_KEY = "mcp";

const TOOLS: Tool[] = [
  { definition: searchDefinition, run: searchTherapists },
  { definition: therapistDefinition, run: getTherapist },
];

/** The server an assistant reaches at /mcp, asking the cache under the shared allowance. */
export function therapistServer(c: Context<{ Bindings: Env }>, forward: Forward): McpServer {
  const context: ToolContext = { ask: (path) => forward(c, path, MCP_RATE_KEY), site: c.env.SITE_URL };
  return {
    info: { name: "therapy-search", title: SITE_NAME, version: "1.0.0" },
    instructions: INSTRUCTIONS,
    tools: () => TOOLS.map((tool) => tool.definition()),
    call: (name, args) => TOOLS.find((tool) => tool.definition().name === name)!.run(args, context),
  };
}
