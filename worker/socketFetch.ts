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
  return readResponse(new Incoming(socket.readable), target.host);
}

type Unreadable = (what: string) => TypeError;

/** The response a server sends, which rejects if the server closes before it's whole. */
async function readResponse(incoming: Incoming, host: string): Promise<Response> {
  const unreadable: Unreadable = (what) => new TypeError(`${host} sent ${what}`);
  let head = await readHead(incoming, unreadable);
  // An interim response, such as 103 Early Hints, comes before the one that counts.
  while (head.status < 200) head = await readHead(incoming, unreadable);
  const { status, fields } = head;
  const headers = new Headers();
  for (const field of fields) {
    const colon = field.indexOf(":");
    if (colon > 0) headers.append(field.slice(0, colon), field.slice(colon + 1).trim());
  }
  // These statuses never have a body, whatever the headers say.
  if ([204, 205, 304].includes(status)) return new Response(null, { status, headers });
  const coding = headers.get("Content-Encoding");
  if (coding && coding !== "identity") throw unreadable(`a body encoded as ${coding}`);
  // A server may keep the connection open after all, so the body ends where its framing says.
  let body: Uint8Array<ArrayBuffer>;
  if (headers.get("Transfer-Encoding")?.toLowerCase().includes("chunked")) {
    body = await readChunked(incoming, unreadable);
    headers.delete("Transfer-Encoding");
  } else if (headers.has("Content-Length")) {
    const length = Number(headers.get("Content-Length"));
    if (!Number.isInteger(length) || length < 0) throw unreadable("a malformed length");
    const content = await incoming.take(length);
    if (!content) throw unreadable("a cut-off body");
    body = concat(content);
  } else {
    body = concat(await incoming.rest());
  }
  return new Response(body, { status, headers });
}

/** The status and header lines of the next response head. */
async function readHead(incoming: Incoming, unreadable: Unreadable): Promise<{ status: number; fields: string[] }> {
  const head = await incoming.through(HEAD_END);
  if (!head) throw unreadable("no complete response head");
  // Header bytes are Latin-1 as far as Headers is concerned, so each byte is one character.
  const [statusLine = "", ...fields] = latin1(head.subarray(0, -HEAD_END.length)).split("\r\n");
  const status = Number(/^HTTP\/1\.[01] ([1-5]\d\d)/.exec(statusLine)?.[1]);
  if (!status) throw unreadable("no status");
  return { status, fields };
}

/** A chunked body's content, read up to its last chunk. Trailers are dropped. */
async function readChunked(incoming: Incoming, unreadable: Unreadable): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[][] = [];
  for (;;) {
    const line = await incoming.through(LINE_END);
    if (!line) throw unreadable("a cut-off body");
    // Hex digits, then any extensions after a semicolon.
    const digits = /^[0-9a-f]+/i.exec(latin1(line))?.[0];
    if (digits === undefined) throw unreadable("a malformed chunk");
    const size = parseInt(digits, 16);
    if (size === 0) return concat(chunks.flat());
    const chunk = await incoming.take(size);
    // The line end after a chunk's data goes unchecked.
    if (!chunk || !(await incoming.take(LINE_END.length))) throw unreadable("a cut-off body");
    chunks.push(chunk);
  }
}

/**
 * A socket's incoming bytes, taken in order as each part of a response is read. A part that ends partway through a
 * read leaves the rest for the next, and a body comes in the pieces it arrived in, to be joined once, so reading a
 * response takes time in proportion to its size.
 */
class Incoming {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  #left: Uint8Array = new Uint8Array(0);

  constructor(readable: ReadableStream<Uint8Array>) {
    this.#reader = readable.getReader();
  }

  /** The bytes up to and including the next `delimiter`, or null if the server closes first. */
  async through(delimiter: number[]): Promise<Uint8Array<ArrayBuffer> | null> {
    const pieces: Uint8Array[] = [];
    // How much of the delimiter the bytes so far end with, so one split across reads is still found.
    let matched = 0;
    while (matched < delimiter.length) {
      const bytes = await this.#next();
      if (!bytes) return null;
      let at = 0;
      while (at < bytes.length && matched < delimiter.length) {
        const byte = bytes[at++];
        // For CRLF and CRLFCRLF, a match can only restart at the byte that broke the last one.
        matched = byte === delimiter[matched] ? matched + 1 : byte === delimiter[0] ? 1 : 0;
      }
      pieces.push(bytes.subarray(0, at));
      this.#left = bytes.subarray(at);
    }
    return concat(pieces);
  }

  /** The next `length` bytes, in the pieces they came in, or null if the server closes first. */
  async take(length: number): Promise<Uint8Array[] | null> {
    const pieces: Uint8Array[] = [];
    for (let wanted = length; wanted > 0; ) {
      const bytes = await this.#next();
      if (!bytes) return null;
      const piece = bytes.subarray(0, wanted);
      pieces.push(piece);
      this.#left = bytes.subarray(piece.length);
      wanted -= piece.length;
    }
    return pieces;
  }

  /** Everything up to the close, in the pieces it came in. */
  async rest(): Promise<Uint8Array[]> {
    const pieces: Uint8Array[] = [];
    for (;;) {
      const bytes = await this.#next();
      if (!bytes) return pieces;
      pieces.push(bytes);
    }
  }

  /** What the last read left over, or else the next read, or null once the server has closed. */
  async #next(): Promise<Uint8Array | null> {
    const left = this.#left;
    if (left.length) {
      this.#left = new Uint8Array(0);
      return left;
    }
    const { value, done } = await this.#reader.read();
    return done ? null : value;
  }
}

function latin1(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
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
