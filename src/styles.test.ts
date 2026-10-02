// @vitest-environment node
import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

/** One of index.css's own utilities, built alone for the given classes. */
async function build(utility: string, classes: string[]): Promise<string> {
  const source = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const block = source.match(new RegExp(`@utility ${utility} \\{\\n[\\s\\S]*?\\n\\}\\n`))?.[0];
  if (!block) throw new Error(`index.css has no ${utility} utility`);
  const compiler = await compile(`@theme { --spacing: 0.25rem; }\n@tailwind utilities;\n${block}`);
  return compiler.build(classes);
}

describe("index.css", () => {
  it("gives a touch target only where the pointer is coarse, at least 44px square and centred on its control", async () => {
    const css = (await build("touch-target", ["touch-target"])).replace(/\s+/g, " ");
    // All of it within the query, so a mouse or trackpad meets the control as drawn.
    expect(css.slice(0, css.indexOf("@media"))).not.toContain("touch-target");
    expect(css.slice(css.indexOf("@media"))).toBe(
      '@media (pointer: coarse) { .touch-target::before { content: ""; position: absolute; top: 50%; left: 50%; ' +
        "width: max(100%, calc(var(--spacing) * 11)); height: max(100%, calc(var(--spacing) * 11)); translate: -50% -50%; } } ",
    );
  });
});
