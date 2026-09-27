import { UkcpClient } from "../worker/ukcp/client";

/** A client for scripts run by hand or in CI, identifying itself the same way the site does. */
export function scriptClient(purpose: string): UkcpClient {
  return new UkcpClient((url, init) => fetch(url, init), `therapy-search/1.0 (${purpose}; unofficial UKCP front end)`);
}

/** Leaves a second between requests, well under what a person clicking around would send. */
export function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}
