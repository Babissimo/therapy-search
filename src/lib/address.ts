/**
 * The address a page should show, with its path and search after the `#`, or null when it already does. A browser never
 * sends what follows the `#`, so the search stays out of the requests Cloudflare records beside the visitor's IP; a link
 * with it before the `#` still opens, and loses it from the address bar before it can be sent again.
 */
export function fragmentAddress(url: URL): string | null {
  if (url.pathname === "/" && url.search === "") return null;
  return url.hash.startsWith("#/") ? `/${url.hash}` : `/#${url.pathname}${url.search}`;
}
