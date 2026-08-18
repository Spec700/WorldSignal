# WorldSignal

WorldSignal is a local-first global situational-awareness dashboard. MVP-A presents authoritative
natural-hazard events on an interactive 3D globe, a synchronized keyboard-accessible event stream,
local filters and timeline controls, source health, and an evidence-oriented event dossier.

> WorldSignal is not an official emergency-warning service. Source data may be delayed, revised, or
> unavailable. Always open the original report and follow responsible authorities and local
> emergency guidance.

## MVP-A capabilities

- Retrieves global M4.5+ earthquakes from the U.S. Geological Survey (USGS).
- Retrieves GDACS tropical cyclones, floods, droughts, volcanoes, and significant forest fires,
  including paginated results.
- Makes no event request until the user selects **Load current events** and never polls afterward.
- Normalizes both providers behind one validated `WorldEvent` contract while retaining
  source-native severity and provenance.
- Keeps the globe, event stream, visible count, filters, timeline, selection, and dossier on one
  reducer-coordinated state model.
- Fetches validated GDACS paths and polygons only for the selected event.
- Tracks new, updated, resolved, and unchanged events between successful manual retrievals in the
  current browser session.
- Runs without an account, API key, commercial map token, cloud database, analytics, or paid
  service.

MVP-B incident signals, persistent history/replay, alerts, accounts, collaboration, deployment, and
mobile-native applications are not part of this release.

## Prerequisites

- Node.js 24.x
- npm 11 or later
- A modern WebGL-capable desktop browser
- Google Chrome installed locally only when running the Playwright suite (the app itself is not
  Chrome-specific)

Confirm the local runtime before installing:

```bash
node --version
npm --version
```

## Install and run on localhost

```bash
git clone https://github.com/Spec700/WorldSignal.git
cd WorldSignal
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The initial globe intentionally contains no
event data. Choose 24H, 7D, or 30D and select **Load current events**.

For a production-mode local run:

```bash
npm run build
npm start
```

The application needs outbound HTTPS access to USGS and GDACS only when a user initiates a source
retrieval or requests selected GDACS geometry. Fonts, Earth imagery, and country boundaries are
served from the local project.

## Operator behavior

### Manual retrieval

- The default source range is 7 days.
- Choosing a range before the first load changes the upcoming request but does not contact a
  source.
- Choosing a different range after a successful load makes one new explicit source request.
- **Refresh** is the only retry action. There is no timer, polling loop, WebSocket, background
  worker, cron job, or automatic retry.
- During refresh, the previous retrieval stays visible and is labeled as previous rather than
  current.
- A partial result retains successful source events and identifies every failed source. If both
  sources fail before any successful load, WorldSignal shows a blocking error rather than an empty
  or “all clear” result.

### Filters and timeline

Category, display-priority, source, lifecycle, and text filters run locally over the loaded batch.
The timeline is also a local filter: moving its cursor never makes a network request.

An instantaneous event becomes visible at its occurrence time and remains visible through the
cursor. A duration event is visible while the cursor intersects its start/end interval; ongoing
events use the end of the requested range. The timeline is not historical replay—MVP-A stores no
successive source snapshots.

### Keyboard and motion

- `/` or `Cmd/Ctrl+K`: focus event search
- `R`: manual refresh when focus is outside an editable control
- `Arrow Up` / `Arrow Down`: move between event rows
- `Enter` / `Space`: select the focused event row
- `Escape`: clear selection

Every globe event has an equivalent real button in the event stream. Reduced-motion preferences
remove the retrieval sweep, selection pulse, and animated camera travel.

## Architecture

```text
Browser action
    │
    ▼
Next.js local API route
    ├── USGS adapter ── validate ── normalize ── source health
    └── GDACS adapter ─ validate ── normalize ── source health
                              │
                              ▼
                     validated EventBatch
                              │
                              ▼
                  one client reducer/context
                    │         │         │
                    ▼         ▼         ▼
               globe/list  timeline  dossier
```

The server boundary constructs approved upstream URLs, enforces timeouts and response-size limits,
validates raw payloads, and returns only canonical application data. The browser never accepts an
arbitrary proxy URL. Selection-scoped GDACS geometry passes through a separate parameter-validated
local route. There is no event database or persistent application state in MVP-A.

## Modules and sources

| Module/category                                                 | Canonical source                                                                                   | Request scope                                             | Authentication |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------- |
| Natural Hazards — earthquakes                                   | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/)                   | M4.5+ rolling 24H, 7D, or 30D GeoJSON feed                | None           |
| Natural Hazards — cyclone, flood, drought, volcano, forest fire | [Global Disaster Alert and Coordination System](https://www.gdacs.org/gdacsapi/swagger/index.html) | `TC`, `FL`, `DR`, `VO`, `WF`; all alert levels; paginated | None           |

USGS exclusively owns the MVP-A earthquake category. WorldSignal does not request GDACS earthquake
records or attempt speculative cross-source event merging.

“Authoritative source” in the dossier means the record came through the documented USGS or GDACS
source selected for that category. It does not mean WorldSignal independently verified every
upstream fact. Display priority is a transparent WorldSignal navigation aid derived from
source-native magnitude/alert fields; it is not a universal emergency severity scale.

## Source and model limitations

- Upstream services provide no WorldSignal availability guarantee. A timeout, HTTP error, malformed
  response, schema change, or defensive pagination ceiling is surfaced against the affected source.
- USGS rolling feeds can add, revise, or remove records. USGS review status is retained as a fact and
  is not treated as event lifecycle.
- GDACS coverage represents significant humanitarian-impact alerts, not every natural hazard.
  Geometry and severity fields vary by hazard and episode.
- A centroid is a reference point, never an implied affected area. WorldSignal renders a detailed
  path or polygon only when the selected GDACS response supplies and passes validation for it.
- New/updated/resolved badges compare successful manual retrievals only within the open browser
  session. Leaving a rolling window never creates a false “resolved” badge.
- Times default to the computer's local timezone. The dossier also preserves explicit UTC source
  timestamps.
- No casualty estimate, forecast, official warning, or response recommendation is generated.

## Verification commands

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:e2e
npm run build
```

Unit and integration tests use frozen fixtures and mocked upstream requests. Playwright intercepts
the local application API with committed sanitized fixtures while exercising the real browser,
WebGL renderer, local assets, and application state. Live-source browser smoke checks are separate
because the deterministic suite must not depend on internet availability.

The Playwright configuration uses the locally installed stable Chrome channel; it does not download
a second browser into the repository.

## Troubleshooting

### npm reports an unsupported Node version

Install or activate Node 24.x, then verify `node --version`. Do not work around the engine check with
an older runtime; Next.js and the verified toolchain are pinned for Node 24.

### What is `node_modules`?

`npm install` normally creates `node_modules`. It is the local unpacked dependency tree used to run,
build, lint, and test WorldSignal—not project source. Git ignores it, production browsers do not
receive the whole directory, and it can be deleted and reconstructed from `package-lock.json` with
`npm install` (or `npm ci` for an exact clean install). Do not commit it or replace project
dependencies with global installations.

### Port 3000 is already in use

Stop the other local server or run `npm run dev -- --port 3001`, then open the printed localhost URL.

### A source is unavailable

Read the per-source category and timestamp in the left rail. Confirm outbound HTTPS access, then use
the explicit **Refresh** action. Repeated schema errors can indicate an upstream contract change;
capture only safe diagnostics and update the adapter plus frozen fixture tests before accepting the
new shape.

### Detailed geometry is unavailable

The event centroid and original report remain usable. Use **Retry geometry** only if the source error
appears temporary. WorldSignal does not substitute an unvalidated geometry or repeatedly retry in
the background.

### The globe is blank or country outlines are unavailable

Enable WebGL/hardware acceleration, reload in a current desktop browser, and verify that local files
under `public/textures` and `public/data` are present. Event investigation remains available through
the accessible stream if the canvas cannot render.

### Playwright cannot find Chrome

Install stable Google Chrome in the platform's normal application location and rerun
`npm run test:e2e`. This requirement applies only to the end-to-end test runner.

### Resetting local data

MVP-A has no account state, service worker, event database, or browser storage to reset. Reloading the
page clears its in-memory batch and session change baseline. MVP-B is not implemented, so no MVP-B
data or reset operation exists yet.

## Attribution and license

Visible in-app credits identify NASA Blue Marble imagery, Natural Earth boundaries, USGS earthquake
data, and GDACS disaster data. Fonts and third-party software retain their own licenses. See
[NOTICE.md](NOTICE.md) for source links, terms, and bundled-asset details.

WorldSignal source code is available under the [MIT License](LICENSE). Contributions should keep
source adapters validated at their boundary, add deterministic tests for behavior changes, pass all
verification commands above, preserve attribution, and remain within the documented MVP-A logic
unless a scope change is explicitly approved.
