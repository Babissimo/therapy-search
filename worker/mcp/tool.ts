import type { ToolDefinition, ToolResult } from "./protocol";

/** The cached entrypoint, asked by canonical path as the app's routes ask it, under the assistants' shared allowance. */
export type Ask = (path: string) => Promise<Response>;
/** What a tool works with: the cache, and the site's own address to link to. */
export type ToolContext = { ask: Ask; site: string };
/** A tool: its definition, built when first asked for, and what it does when called. */
export type Tool = { definition: () => ToolDefinition; run: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult> };

export { errorOf } from "../plain/routes";

/** A tool's answer that what it was asked can't be done, said so that an assistant can act on it. */
export function refusal(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** A tool's answer as structured content, with the same JSON as text for clients that read only text. */
export function structured(value: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}
