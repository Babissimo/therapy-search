import { createApp, type Env } from "./app";
import { Geocoder } from "./places/geocoder";
import { UkcpClient, type Fetch } from "./ukcp/client";

let client: UkcpClient | undefined;
let geocoder: Geocoder | undefined;

const upstream: Fetch = (url, init) => fetch(url, init);
const userAgent = (env: Env) => `therapy-search/1.0 (unofficial UKCP front end; +${env.SITE_URL}/about)`;

export default createApp(
  (env) => (client ??= new UkcpClient(upstream, userAgent(env))),
  (env) => (geocoder ??= new Geocoder(upstream, userAgent(env))),
);
