# Therapy search

An unofficial, simpler page for searching the [UKCP therapist directory](https://www.psychotherapy.org.uk/find-a-therapist/), live at
https://therapy-search.babissimo.workers.dev. It offers the same searches and profiles as UKCP's own page, fetched from UKCP when a
visitor asks for them. It is not run by or affiliated with UKCP.

One Cloudflare Worker, on the free plan, serves both the React front end and the `/api` routes that call UKCP. The design, including how
UKCP's interface works and how the site keeps its load on UKCP low, is in
[the spec](docs/superpowers/specs/2026-09-27-ukcp-search-parity-design.md).

## Working on it

```bash
npm ci
npm run dev        # the site and Worker together, on localhost:5173
npm test
npm run typecheck
```

Searches in development go to UKCP's live site, so keep them few.

## Deploying

Each push to `main` deploys once CI passes, using the repository secrets `CLOUDFLARE_API_TOKEN` (made from
Cloudflare's "Edit Cloudflare Workers" token template) and `CLOUDFLARE_ACCOUNT_ID`. GitHub occasionally starts no run
for a push; `gh workflow run CI --ref main` (or Run workflow on the Actions tab) checks and deploys `main` instead. To
deploy from your own machine:

```bash
npx wrangler login
npm run deploy
```

On a slow connection Wrangler can give up before its first request to Cloudflare completes. Longer network timeouts help:

```bash
NODE_OPTIONS="--network-family-autoselection-attempt-timeout=5000 --dns-result-order=ipv4first" npm run deploy
```

## Keeping up with UKCP

The filter panel's options come from `shared/options.json`, taken from UKCP's search form (spec §3.2). A daily workflow checks UKCP's pages
still parse and, when UKCP's options have changed, opens a pull request with the new list. Merging it deploys the change.

The headings inside "I Want Help With" and "Type of Therapy" are ours, kept in `shared/sections.ts`. An option UKCP adds shows under
"Other" until it is placed there, and the daily run's log names any such option and any placed one UKCP has withdrawn.

Two scripts talk to UKCP directly:

- `npm run options` refreshes `shared/options.json` (one request).
- `npm run fixtures` recaptures the pages the parser tests read, with personal details replaced (nine requests).
