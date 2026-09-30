import { describe, expect, it } from "vitest";
import { limitConcurrency } from "./limit";

/** A task that has started once `started` holds its name, and ends when told to. */
function tasks() {
  const started: string[] = [];
  const endings = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const task = (name: string) => () =>
    new Promise<string>((resolve, reject) => {
      started.push(name);
      endings.set(name, { resolve: () => resolve(name), reject });
    });
  return { started, task, end: (name: string) => endings.get(name)?.resolve(), fail: (name: string) => endings.get(name)?.reject(new Error(name)) };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("limitConcurrency", () => {
  it("runs no more than its limit at once, starting the rest in turn as others end", async () => {
    const run = limitConcurrency(2);
    const { started, task, end } = tasks();
    const results = ["a", "b", "c", "d"].map((name) => run(task(name)));
    await settle();
    expect(started).toEqual(["a", "b"]);
    end("b");
    await settle();
    expect(started).toEqual(["a", "b", "c"]);
    end("a");
    end("c");
    await settle();
    end("d");
    expect(await Promise.all(results)).toEqual(["a", "b", "c", "d"]);
  });

  it("starts those waiting in the order given, ahead of any given later", async () => {
    const run = limitConcurrency(1);
    const { started, task, end } = tasks();
    void run(task("a"));
    void run(task("b"));
    await settle();
    end("a");
    void run(task("c"));
    await settle();
    expect(started).toEqual(["a", "b"]);
  });

  it("drops a task whose signal aborts while it waits, and refuses one aborted already", async () => {
    const run = limitConcurrency(1);
    const { started, task, end } = tasks();
    void run(task("a"));
    const leaving = new AbortController();
    const dropped = run(task("b"), leaving.signal);
    void run(task("c"));
    leaving.abort(new Error("gone"));
    await expect(dropped).rejects.toThrow("gone");
    await expect(run(task("d"), leaving.signal)).rejects.toThrow("gone");
    end("a");
    await settle();
    expect(started).toEqual(["a", "c"]);
  });

  it("frees a failed task's place", async () => {
    const run = limitConcurrency(1);
    const { started, task, fail } = tasks();
    const failed = run(task("a"));
    void run(task("b"));
    await settle();
    fail("a");
    await expect(failed).rejects.toThrow("a");
    await settle();
    expect(started).toEqual(["a", "b"]);
  });
});
