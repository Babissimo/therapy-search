import { connect } from "cloudflare:sockets";
import { WorkerEntrypoint } from "cloudflare:workers";
import { createCache, createGateway, type Env } from "./app";
import { Geocoder } from "./places/geocoder";
import { socketFetch } from "./socketFetch";
import { UkcpClient, type Fetch } from "./ukcp/client";

let client: UkcpClient | undefined;
let geocoder: Geocoder | undefined;

const upstream: Fetch = (url, init) => fetch(url, init);
// Cloudflare's request analytics record every fetch's URL, so a URL that carries what a visitor asked goes by socket.
// postcodes.io's can't: it sits behind Cloudflare, which sockets can't reach.
const unrecorded = socketFetch(connect);
const userAgent = (env: Env) => `therapy-search/1.0 (unofficial UKCP front end; +${env.SITE_URL})`;

const cache = createCache(
  (env) => (client ??= new UkcpClient(upstream, userAgent(env), { store: env.UKCP_SESSION, profileFetch: unrecorded })),
  (env) => (geocoder ??= new Geocoder(upstream, userAgent(env), unrecorded)),
);

/** Reached only through `ctx.exports`, by canonical URL, and behind Workers Caching, so it runs only when the cache misses. */
export class CachedApi extends WorkerEntrypoint<Env> {
  override fetch(request: Request) {
    return cache.fetch(request, this.env, this.ctx);
  }
}

export default createGateway((c) => c.executionCtx.exports.CachedApi);
