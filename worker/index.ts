import { createApp } from "./app";
import { UkcpClient } from "./ukcp/client";

let client: UkcpClient | undefined;

export default createApp(
  (env) => (client ??= new UkcpClient((url, init) => fetch(url, init), `therapy-search/1.0 (unofficial UKCP front end; +${env.SITE_URL}/about)`)),
);
