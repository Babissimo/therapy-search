import { WorkerEntrypoint } from "cloudflare:workers";
import { createCache, createGateway, type Env } from "./app";
import { Geocoder } from "./places/geocoder";
import { UkcpClient, type Fetch } from "./ukcp/client";

let client: UkcpClient | undefined;
let geocoder: Geocoder | undefined;

const upstream: Fetch = (url, init) => fetch(url, init);
const userAgent = (env: Env) => `therapy-search/1.0 (unofficial UKCP front end; +${env.SITE_URL})`;

const cache = createCache(
  (env) => (client ??= new UkcpClient(upstream, userAgent(env), { store: env.UKCP_SESSION })),
  (env) => (geocoder ??= new Geocoder(upstream, userAgent(env))),
);

/** Reached only through `ctx.exports`, by canonical URL, and behind Workers Caching, so it runs only when the cache misses. */
export class CachedApi extends WorkerEntrypoint<Env> {
  override fetch(request: Request) {
    return cache.fetch(request, this.env, this.ctx);
  }
}

export default createGateway((c) => c.executionCtx.exports.CachedApi);
