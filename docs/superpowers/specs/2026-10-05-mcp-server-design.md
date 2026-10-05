# Therapy search: an MCP server for AI assistants

Date: 2026-10-05

## 1. Goal and scope

People increasingly ask an AI assistant first. An MCP server lets an assistant search UKCP's register through this site, with
UKCP's own vocabulary, and hand the person a link that opens the same search here, so they finish with registered
professionals rather than whatever the assistant recalls.

In scope:

- An MCP endpoint at `/mcp`, off until a switch is flipped (§2, §3)
- Two tools: `search_therapists` (§4) and `get_therapist` (§5)
- Instructions that say what the server is and where to turn for help now (§6)

Out of scope:

- Contact details in any form (§5.2).
- Keyword search, photos only, UKCP colleges and places outside the UK. The first is free text, which the fixed lists are
  there to avoid; the rest mean little to an assistant.
- Accounts or authorisation, and anything kept between calls.
- Resources, prompts, streaming responses and subscriptions.

## 2. Constraints

- **UKCP agrees first.** The site is about to be pitched to UKCP. The endpoint ships behind a switch, the `MCP_ENDPOINT`
  var in `wrangler.jsonc`, which stays `"off"` until UKCP says yes. While it is off, `/mcp` answers 404 Not found, as the
  Worker does for a path it doesn't serve, and reads nothing sent to it. Turning it on is its own PR (§9).
- **Nothing searched reaches a URL.** Calls arrive as POST bodies at `/mcp`, and the endpoint asks the cached entrypoint by
  the canonical URLs the app uses, so it shares the app's cache entries and #93's guarantee. For a hosted assistant, the IP
  address Cloudflare logs is the provider's, not the person's.
- **One way to UKCP.** No new upstream requests: a search near a place reads the nearest-48 answer (`/api/search/early`),
  an online search the whole filtered set (`/api/search`), and a profile `/api/therapist/:slug`, each as the app asks for it.
- **Free plan CPU.** The Worker reads only the cards it returns, by pattern, with `worker/ukcp/results.ts` and
  `worker/ukcp/profile.ts` as the plain search does. Tool definitions are built on first use, not at startup.
- **No sessions to count by.** MCP 2026-07-28 removed protocol sessions, and without accounts nothing identifies a person,
  so every assistant shares one allowance (§7).

## 3. The endpoint

### 3.1 Transport

Streamable HTTP, stateless, with every reply a single JSON object (`Content-Type: application/json`,
`Cache-Control: no-store`); no SSE.

- `POST /mcp`: one JSON-RPC request or notification. A notification is answered `202` with no body.
- A batch, which 2025-03-26 allowed, is refused with `-32600`; no client in use sends one.
- `GET` and `DELETE /mcp`: `405`.
- The body limit is the gateway's 64 KB.
- A request a browser makes from another site's page (`Sec-Fetch-Site` of `cross-site` or `same-site`, or an `Origin` other
  than the request's own) is refused `403`, as `/api/contact` refuses one. This is also MCP's required `Origin` check.
- `run_worker_first` gains `/mcp`, so the Worker answers it whether the switch is on or off.

### 3.2 Versions

The server is dual-era, since clients in use speak both:

- **Modern, `2026-07-28`.** Each request names its version in `params._meta["io.modelcontextprotocol/protocolVersion"]`
  and the `MCP-Protocol-Version` header, which must match, as must `Mcp-Method` and the method, and for `tools/call`
  `Mcp-Name` and the tool's name (decoding the `=?base64?…?=` form). A mismatch or missing header is `400` with
  `HeaderMismatch` (`-32020`). Results carry `resultType: "complete"`. Methods: `server/discover`, `tools/list`,
  `tools/call`, `ping`; any other is `404` with `-32601`.
- **Legacy, `2025-11-25`, `2025-06-18` and `2025-03-26`.** Opened by `initialize`, which answers the version asked for if it
  is one of these and `2025-11-25` otherwise, with the tools capability, server info and instructions. No session id is
  issued, which these versions allow. Methods: `initialize`, `ping`, `tools/list`, `tools/call`; any other is a `-32601`
  error. A request without `MCP-Protocol-Version` is taken as `2025-03-26`.
- Any other version is `400` with `UnsupportedProtocolVersionError` (`-32022`) listing the four above.
- A body that isn't JSON is `-32700`, and one that isn't a JSON-RPC 2.0 request `-32600`, both `400`.

`server/discover` and `tools/list` say they may be cached publicly for an hour; the tools change only when UKCP's options do.

## 4. `search_therapists`

### 4.1 Arguments

Every list is a JSON Schema `enum` of UKCP's values from `shared/options.json`, described in the site's plain words
(`shared/filterGroups.ts`) rather than UKCP's, with how UKCP combines what is chosen. UKCP lists only therapists who chose
every issue, therapy type, group and language given, so those descriptions say to give the one or two that matter most.

| Argument | UKCP's parameter | Notes |
|---|---|---|
| `location` | `Location` | A UK town, city or postcode, up to 200 characters. Left out, the search is of therapists working online or by phone. |
| `issues` | `HelpWithAdvanced` | 59 values. Each narrows. The assistant maps what someone says onto these ("grief" to Bereavement). |
| `session_types` | `TypesOfSession` | 5 values. Any one given matches. Online, only Online Therapy and Telephone Therapy apply. |
| `works_with` | `WorksWith` | 7 values. Each narrows. |
| `therapy_types` | `TypesOfTherapy` | 75 values. Each narrows. |
| `languages` | `Languages` | 86 values. Each narrows. |
| `wheelchair_accessible` | `OnlyWheelchairAccessible` | Near a place only. |
| `page` | | 1 to 5, of 10 each. |

UKCP's typeahead terms (`HelpWith`) are the issues and therapy types together, so they are left out. The arguments become
UKCP's parameter names and pass through `readParams` with `ALLOWED`, so the endpoint accepts exactly what the app does,
whatever a client's schema checking let through. Online searches go through `onlineSearch`, and need a filter besides the
session types by `narrowsOnline`, as the app's online view does.

### 4.2 Result

```json
{
  "total": 441,
  "place": "Bristol, UK",
  "order": "nearest first",
  "showing": "1 to 10",
  "therapists": [
    {
      "id": "Jane-Doe-ABC123",
      "name": "Jane Doe",
      "place": "Bristol BS8",
      "distance": "0.6 miles from Bristol",
      "sessions": "Face to Face - Long Term, Online Therapy",
      "summary": "I work with adults…",
      "tags": ["Anxiety", "Bereavement"]
    }
  ],
  "link": "https://therapysearch.babissimo.net/#/?Location=Bristol&HelpWithAdvanced=Bereavement",
  "help_now": "Need help now? …"
}
```

- Near a place the order is nearest first and the cards come from the nearest 48. Online it is UKCP's shuffle, which the
  cache holds for 6 hours, so pages agree within that time.
- `link` opens the same search on the site: `/#/` near a place and `/#/online` otherwise, with the query the app itself
  writes (`toQuery`). Pages beyond the fifth are the site's to show.
- `help_now` is the site's help-now line as plain text (§6), on every result, as the line is on every page of the site.
- The result is `structuredContent` under an `outputSchema`, and the same JSON as text content.

### 4.3 Errors

Tool errors (`isError: true`), in the app's words where it has them, each with the site's link where that still helps:

- A value outside UKCP's lists, naming the argument by its tool name.
- Online with no filter besides session type.
- A place UKCP didn't recognise (`locationFellBack`): "UKCP didn't recognise "Brightn". Try a town or a postcode."
- Too many searches (§7), UKCP not responding, and a page the Worker can't read.

## 5. `get_therapist`

### 5.1 Argument and result

`id`, a slug from `search_therapists` that matches `SLUG`. The result gives the name, place and languages; the profile's
about and practical sections in UKCP's order, with headings, paragraphs, lists and details; each office's name, address and
fees; and `links` to the profile on the site (`/#/therapist/<id>`) and on UKCP. A profile UKCP no longer has is a tool error
in the app's words.

### 5.2 No contact details

The contact route refuses other sites so the register can't be harvested through this one, and the tools keep to that:

- No email, contact id, phone or website. UKCP's result cards hold a phone number, which `readResults` already drops.
- Emails and UK phone numbers written into a profile or a search result are replaced with "(contact details are on the
  profile)".
- The result says that contact details are on the profile, behind `links.site`.

## 6. Instructions and safety

The server's instructions, also given in `search_therapists`'s description since some clients drop them, say:

- It searches UKCP's public register through an unofficial site that UKCP does not run.
- It is a directory, not a support service. Anyone at risk now: the help-now line (111's mental health option, Lifeline in
  Northern Ireland, Samaritans on 116 123, SHOUT to 85258, 999 in an emergency).
- Choose few values: each issue, therapy type, group or language added narrows the list.
- Contact details aren't given; the person follows the link to the profile.
- What someone types is seen by the assistant and its provider, and passes through this site to UKCP; the site keeps no
  record of who asked what.

The help-now line's plain text joins the copies a test already holds to `HelpNow`.

## 7. Rate limiting

Every call is forwarded with the rate key `mcp`, so all assistant traffic shares one allowance in the existing limiters:
a minute's requests that reach UKCP are at most 20 searches near a place (`EARLY_LIMIT`) and 20 online searches and
profiles together (`UPSTREAM_LIMIT`). Answers from the cache cost nothing. Site visitors keep their own allowances, so
UKCP and they are protected; the cost is that one heavy caller can hold up other assistant users for a minute. A
dedicated limiter can replace the key if use grows.

## 8. Testing

- Protocol: both eras from the spec's own examples; header mismatches, unsupported versions, notifications, `GET` and
  `DELETE`, other sites' requests, malformed bodies and the body limit.
- Tools: the definitions against `OPTIONS`; a search near a place, online, paged, a place UKCP fell back from, a value
  outside the lists, online with no filter, too many and UKCP down; the profile fixture with no contact details left in it.
- Nothing searched in a URL the cache is asked by; the rate key; the switch off.
- By hand: `wrangler dev` with the MCP Inspector in both eras, then Claude Code with the server added over HTTP.

## 9. Delivery

Four PRs, stacked:

1. The endpoint (§3), the switch and how to flip it in the README's deploying notes, the instructions with the help-now text
   (§6) and this spec, with no tools yet.
2. `search_therapists` (§4, §7), with §5.2's scrubbing, which its results need.
3. `get_therapist` (§5.1).
4. Once UKCP agrees: the switch on, the About card's "Who sees what" and the README saying how to add the server to an
   assistant.
