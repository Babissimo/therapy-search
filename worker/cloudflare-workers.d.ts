/** The part of the Workers runtime's own module that the Worker uses. */
declare module "cloudflare:workers" {
  import type { ExecutionContext } from "hono";

  export abstract class WorkerEntrypoint<Env = unknown> {
    protected readonly ctx: ExecutionContext;
    protected readonly env: Env;
    constructor(ctx: ExecutionContext, env: Env);
    fetch?(request: Request): Response | Promise<Response>;
  }
}
