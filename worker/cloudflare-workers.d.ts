/** The parts of the Workers runtime's own modules that the Worker uses. */
declare module "cloudflare:workers" {
  import type { ExecutionContext } from "hono";

  export abstract class WorkerEntrypoint<Env = unknown> {
    protected readonly ctx: ExecutionContext;
    protected readonly env: Env;
    constructor(ctx: ExecutionContext, env: Env);
    fetch?(request: Request): Response | Promise<Response>;
  }
}

declare module "cloudflare:sockets" {
  export interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    close(): Promise<void>;
  }
  export function connect(address: { hostname: string; port: number }, options?: { secureTransport?: "off" | "on" | "starttls" }): Socket;
}
