import { describe, expect, it, vi } from "vitest";
import { socketFetch, type Connect } from "./socketFetch";

const bytes = (text: string) => new TextEncoder().encode(text);

/** A server that answers any request with `reply`, in the pieces given, then closes; `open` leaves it hanging instead. */
function server(reply: (string | Uint8Array)[], { open = false } = {}) {
  const sent: string[] = [];
  const close = vi.fn(async () => {});
  const connect = vi.fn<Connect>(() => ({
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of reply) controller.enqueue(typeof piece === "string" ? bytes(piece) : piece);
        if (!open) controller.close();
      },
    }),
    writable: new WritableStream<Uint8Array>({ write: (chunk) => void sent.push(new TextDecoder().decode(chunk)) }),
    close,
  }));
  return { fetch: socketFetch(connect), connect, sent, close };
}

describe("socketFetch", () => {
  it("asks for the path and query over TLS on port 443, with the caller's headers, for the connection to close", async () => {
    const { fetch, connect, sent } = server(["HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n[]"]);
    await fetch("https://nominatim.openstreetmap.org/search?q=HOVE%20BN3&format=jsonv2", { headers: { "User-Agent": "test-agent" } });
    expect(connect).toHaveBeenCalledWith({ hostname: "nominatim.openstreetmap.org", port: 443 }, { secureTransport: "on" });
    const [requestLine, ...fields] = sent.join("").split("\r\n");
    expect(requestLine).toBe("GET /search?q=HOVE%20BN3&format=jsonv2 HTTP/1.1");
    expect(fields).toEqual(expect.arrayContaining(["host: nominatim.openstreetmap.org", "connection: close", "accept-encoding: identity", "user-agent: test-agent"]));
    expect(sent.join("")).toMatch(/\r\n\r\n$/);
  });

  it("returns the status, headers and body, however the reads split them", async () => {
    const { fetch, close } = server(["HTTP/1.1 200 OK\r\nContent-Type: appli", "cation/json\r\nContent-Length: 9\r\n", "\r\n[{\"a\":", "1}]"]);
    const res = await fetch("https://nominatim.openstreetmap.org/search?q=X");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual([{ a: 1 }]);
    expect(close).toHaveBeenCalled();
  });

  it("joins a chunked body, dropping its trailers", async () => {
    const { fetch } = server(["HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n6\r\n<h1>N", "a\r\n", "7\r\nme</h1>\r\n0\r\nX-Trailer: t\r\n\r\n"]);
    const res = await fetch("https://www.psychotherapy.org.uk/therapist/Jo-Bloggs-ABCDEFGH");
    await expect(res.text()).resolves.toBe("<h1>Name</h1>");
    expect(res.headers.has("Transfer-Encoding")).toBe(false);
  });

  it("keeps bytes as sent, a character split across chunks included", async () => {
    const e = bytes("é");
    const { fetch } = server([bytes("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\n"), e.subarray(0, 1), bytes("\r\n1\r\n"), e.subarray(1), bytes("\r\n0\r\n\r\n")]);
    await expect((await fetch("https://www.psychotherapy.org.uk/therapist/Zoe-ABCDEFGH")).text()).resolves.toBe("é");
  });

  it("passes on a redirect without following it", async () => {
    const { fetch, connect } = server(["HTTP/1.1 302 Found\r\nLocation: https://www.psychotherapy.org.uk/\r\nContent-Length: 0\r\n\r\n"]);
    const res = await fetch("https://www.psychotherapy.org.uk/therapist/Nobody-ZZZZZZZZ", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://www.psychotherapy.org.uk/");
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["its length", ["HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n[]"]],
    ["its last chunk", ["HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n[]\r\n0\r\n\r\n"]],
  ])("stops at %s, though the server keeps the connection open", async (_, reply) => {
    const { fetch, close } = server(reply, { open: true });
    await expect((await fetch("https://nominatim.openstreetmap.org/search?q=X")).json()).resolves.toEqual([]);
    expect(close).toHaveBeenCalled();
  });

  it("returns a response without a body as soon as its head is in", async () => {
    const { fetch } = server(["HTTP/1.1 304 Not Modified\r\nETag: \"a\"\r\n\r\n"], { open: true });
    expect((await fetch("https://nominatim.openstreetmap.org/search?q=X")).status).toBe(304);
  });

  it("skips an interim response to the one that counts", async () => {
    const { fetch } = server(["HTTP/1.1 103 Early Hints\r\nLink: </a.css>; rel=preload\r\n\r\n", "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n[]"]);
    const res = await fetch("https://nominatim.openstreetmap.org/search?q=X");
    expect(res.status).toBe(200);
    expect(res.headers.has("Link")).toBe(false);
  });

  it("reads each header byte as one character", async () => {
    const head = bytes("HTTP/1.1 200 OK\r\nX-Name: Caf_\r\nContent-Length: 0\r\n\r\n");
    head[head.indexOf("_".charCodeAt(0))] = 0xe9;
    const { fetch } = server([head]);
    expect((await fetch("https://www.psychotherapy.org.uk/therapist/X-ABCDEFGH")).headers.get("X-Name")).toBe("Café");
  });

  it("reads to the close when no length is given", async () => {
    const { fetch } = server(["HTTP/1.0 404 Not Found\r\n\r\n", "gone"]);
    const res = await fetch("https://nominatim.openstreetmap.org/search?q=X");
    expect(res.status).toBe(404);
    await expect(res.text()).resolves.toBe("gone");
  });

  it.each([
    ["a body shorter than its length", ["HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nshort"]],
    ["a chunked body without its last chunk", ["HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n"]],
    ["a chunk cut short", ["HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n9\r\nhello"]],
    ["a compressed body", ["HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: 1\r\n\r\nx"]],
    ["no complete head", ["HTTP/1.1 200 OK\r\nContent-Le"]],
    ["an interim response and nothing after", ["HTTP/1.1 100 Continue\r\n\r\n"]],
    ["a malformed length", ["HTTP/1.1 200 OK\r\nContent-Length: 2, 2\r\n\r\n[]"]],
    ["a negative chunk size", ["HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n-6\r\nhello\r\n0\r\n\r\n"]],
    ["a chunk size that isn't hex", ["HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\nhello\r\n0\r\n\r\n"]],
  ])("rejects %s, naming only the host", async (_, reply) => {
    const { fetch } = server(reply);
    const failure = fetch("https://nominatim.openstreetmap.org/search?q=HOVE");
    await expect(failure).rejects.toThrow(TypeError);
    await expect(failure).rejects.toThrow(/^nominatim\.openstreetmap\.org sent [^?]*$/);
  });

  it("rejects with the signal's reason when it aborts, and closes the socket", async () => {
    const { fetch, close } = server(["HTTP/1.1 200 OK\r\n"], { open: true });
    const controller = new AbortController();
    const failure = fetch("https://nominatim.openstreetmap.org/search?q=X", { signal: controller.signal });
    controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(failure).rejects.toMatchObject({ name: "TimeoutError" });
    expect(close).toHaveBeenCalled();
  });

  it("ignores a signal that aborts after the response", async () => {
    const { fetch } = server(["HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n[]"]);
    const controller = new AbortController();
    await fetch("https://nominatim.openstreetmap.org/search?q=X", { signal: controller.signal });
    controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    await new Promise((settle) => setTimeout(settle, 0));
  });

  it("connects to nothing for a signal already aborted", async () => {
    const { fetch, connect } = server([]);
    await expect(fetch("https://nominatim.openstreetmap.org/search?q=X", { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ["a POST", "https://www.psychotherapy.org.uk/umbraco/surface/searchsurface/Search", { method: "POST" }],
    ["plain HTTP", "http://nominatim.openstreetmap.org/search?q=X", {}],
  ])("refuses %s", async (_, url, init) => {
    const { fetch, connect } = server([]);
    await expect(fetch(url, init)).rejects.toThrow(TypeError);
    expect(connect).not.toHaveBeenCalled();
  });
});
