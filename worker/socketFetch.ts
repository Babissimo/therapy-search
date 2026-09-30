import type { Fetch } from "./ukcp/client";

/** The part of `cloudflare:sockets` a fetch over a socket needs. */
export type Connect = (address: { hostname: string; port: number }, options: { secureTransport: "on" }) => Socket;
type Socket = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): Promise<void> };

const HEAD_END = [13, 10, 13, 10];
const LINE_END = [13, 10];

/**
 * An HTTPS GET over a TLS socket of the Worker's own. Cloudflare's request analytics record the URL of every `fetch` the
 * Worker makes, but not what passes over a socket. It asks the server to close the connection after answering, reads
 * until the response is whole, and never follows a redirect. A response it can't read whole rejects, as `fetch` does,
 * so none is cached.
 */
export function socketFetch(connect: Connect): Fetch {
  return async (url, init = {}) => {
    const target = new URL(url);
    if (target.protocol !== "https:" || (init.method ?? "GET").toUpperCase() !== "GET") throw new TypeError("Only an HTTPS GET goes by socket");
    init.signal?.throwIfAborted();
    const socket = connect({ hostname: target.hostname, port: Number(target.port || 443) }, { secureTransport: "on" });
    try {
      return await abortable(exchange(socket, target, new Headers(init.headers)), init.signal);
    } finally {
      // Also ends a read an abort left waiting.
      socket.close().catch(() => {});
    }
  };
}

async function exchange(socket: Socket, target: URL, headers: Headers): Promise<Response> {
  headers.set("Host", target.host);
  headers.set("Connection", "close");
  // Without it the server may compress, which this doesn't undo.
  headers.set("Accept-Encoding", "identity");
  const head = [`GET ${target.pathname}${target.search} HTTP/1.1`, ...[...headers].map(([name, value]) => `${name}: ${value}`)];
  const writer = socket.writable.getWriter();
  await writer.write(new TextEncoder().encode(`${head.join("\r\n")}\r\n\r\n`));
  writer.releaseLock();
  const reader = socket.readable.getReader();
  let bytes = new Uint8Array(0);
  for (;;) {
    const { value, done } = await reader.read();
    if (value) bytes = concat([bytes, value]);
    // A server may keep the connection open after all, so the response ends where its framing says.
    const response = readResponse(bytes, target.host, done);
    if (response) return response;
  }
}

/** The response `bytes` hold, or null while more is to come; once the server has `ended`, anything short rejects. */
function readResponse(bytes: Uint8Array<ArrayBuffer>, host: string, ended: boolean): Response | null {
  const unreadable = (what: string) => new TypeError(`${host} sent ${what}`);
  const cutOff = (what: string) => {
    if (ended) throw unreadable(what);
    return null;
  };
  const headEnd = indexOf(bytes, HEAD_END);
  if (headEnd < 0) return cutOff("no complete response head");
  const rest = bytes.subarray(headEnd + HEAD_END.length);
  // Header bytes are Latin-1 as far as Headers is concerned, so each byte is one character.
  const [statusLine = "", ...fields] = Array.from(bytes.subarray(0, headEnd), (byte) => String.fromCharCode(byte))
    .join("")
    .split("\r\n");
  const status = Number(/^HTTP\/1\.[01] ([1-5]\d\d)/.exec(statusLine)?.[1]);
  if (!status) throw unreadable("no status");
  // An interim response, such as 103 Early Hints, comes before the one that counts.
  if (status < 200) return readResponse(rest, host, ended);
  const headers = new Headers();
  for (const field of fields) {
    const colon = field.indexOf(":");
    if (colon > 0) headers.append(field.slice(0, colon), field.slice(colon + 1).trim());
  }
  // These statuses never have a body, whatever the headers say.
  if ([204, 205, 304].includes(status)) return new Response(null, { status, headers });
  const coding = headers.get("Content-Encoding");
  if (coding && coding !== "identity") throw unreadable(`a body encoded as ${coding}`);
  let body: Uint8Array<ArrayBuffer> = rest;
  if (headers.get("Transfer-Encoding")?.toLowerCase().includes("chunked")) {
    const content = dechunk(rest, host);
    if (content === null) return cutOff("a cut-off body");
    body = content;
    headers.delete("Transfer-Encoding");
  } else if (headers.has("Content-Length")) {
    const length = Number(headers.get("Content-Length"));
    if (!Number.isInteger(length) || length < 0) throw unreadable("a malformed length");
    if (rest.length < length) return cutOff("a cut-off body");
    body = rest.subarray(0, length);
  } else if (!ended) {
    return null;
  }
  return new Response(body, { status, headers });
}

/** A chunked body's content, or null when it stops before its last chunk. Trailers are dropped. */
function dechunk(body: Uint8Array<ArrayBuffer>, host: string): Uint8Array<ArrayBuffer> | null {
  const chunks: Uint8Array[] = [];
  let at = 0;
  for (;;) {
    const lineEnd = indexOf(body, LINE_END, at);
    if (lineEnd < 0) return null;
    // Hex digits, then any extensions after a semicolon.
    const digits = /^[0-9a-f]+/i.exec(new TextDecoder().decode(body.subarray(at, lineEnd)))?.[0];
    if (digits === undefined) throw new TypeError(`${host} sent a malformed chunk`);
    const size = parseInt(digits, 16);
    if (size === 0) return concat(chunks);
    at = lineEnd + LINE_END.length;
    if (at + size + LINE_END.length > body.length) return null;
    chunks.push(body.subarray(at, at + size));
    at += size + LINE_END.length;
  }
}

function indexOf(bytes: Uint8Array, pattern: number[], from = 0): number {
  search: for (let i = from; i <= bytes.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) if (bytes[i + j] !== pattern[j]) continue search;
    return i;
  }
  return -1;
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Settles as `work` does, or rejects with the signal's reason as it aborts. */
function abortable<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
