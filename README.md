# Priority Signals

Priority Signals is an open-source, local-first security operations platform for protecting
important people from physical and digital threats. The current application contains two modules:

- **WorldSignal** — global natural-hazard awareness on an interactive 3D globe.
- **CredSignal** — credential-exposure intelligence, protectee attribution, and response
  coordination backed by local PostgreSQL.

Use the product switcher in the application header to move between modules.

> Priority Signals is not an official emergency-warning service, credential-vault product, breach
> feed, or notification-delivery service. WorldSignal source data can be delayed or revised.
> CredSignal currently uses manual intake and has no authentication or authorization enforcement.
> Do not expose this MVP to an untrusted network or load real sensitive data into it.

![WorldSignal showing a selected cyclone, validated geometry, event stream, filters, dossier, and timeline](docs/worldsignal-mvp-a.png)

## Current capabilities

### WorldSignal

- Retrieves global M4.5+ earthquakes from the U.S. Geological Survey (USGS).
- Retrieves GDACS tropical cyclones, floods, droughts, volcanoes, and significant forest fires,
  including paginated results.
- Makes no event request until an operator selects **Load current events** and never polls
  afterward.
- Normalizes both providers behind one validated event contract while retaining source-native
  severity and provenance.
- Keeps the globe, keyboard-accessible event stream, filters, timeline, selection, and dossier on
  one reducer-coordinated state model.
- Fetches validated GDACS paths and polygons only for the selected event.
- Tracks new, updated, resolved, and unchanged events between successful manual retrievals in the
  current browser session.
- Runs without an account, API key, commercial map token, analytics, or paid service.

WorldSignal remains its original MVP-A: incident signals, persistent hazard history/replay, alerts,
accounts, collaboration, and mobile-native applications are not implemented yet.

### CredSignal

- Maintains a persistent protectee roster with monitoring tiers, statuses, approved identities,
  and operator-maintained location history.
- Accepts manual credential-exposure records with source, service, confidence, severity, notes, and
  optional full credential values.
- Encrypts stored credential values with AES-256-GCM, fingerprints them separately for deduplication,
  and records every reveal in the activity log.
- Matches exact approved identities automatically and routes unmatched findings to an analyst queue
  for explicit, reasoned attribution.
- Opens response cases with priority-based due dates and credential-specific default tasks.
- Supports case ownership, priority and due-date changes, assigned task creation/editing, controlled
  task lifecycles, and audited case transitions.
- Prevents case closure while response tasks remain active; dismissing a case cancels its unfinished
  tasks and updates linked exposure state atomically.
- Tracks manual victim coordination through draft, planned, sent, acknowledged, and failed states.
  These records document contact; the application does not send messages.
- Shows each active protectee at an approved operational location on the globe with aggregate
  unresolved credential risk.
- Preserves append-only operator activity for intake, matching, credential reveal, roster changes,
  case work, tasks, and communication transitions.

CredSignal is intentionally local and manual in this open-source MVP. The database contains role and
operator models for the future, but the interface currently uses a demo operator selector and does
not enforce authentication, permissions, workspace isolation at login, external breach-feed
ingestion, automated notification, or production key management.

## Prerequisites

- Node.js 24.x
- npm 11 or later
- Docker with Docker Compose support, for local PostgreSQL
- A modern WebGL-capable desktop browser
- Google Chrome installed locally only when running the Playwright suite

Confirm the local runtime before installing:

```bash
node --version
npm --version
docker --version
docker compose version
```

## Install and run locally

Clone the repository and install the dependency tree:

```bash
git clone https://github.com/Spec700/WorldSignal.git
cd WorldSignal
npm install
```

Create the ignored local environment file:

```bash
cp .env.example .env
openssl rand -base64 32
```

Paste the generated key into `CREDSIGNAL_DATA_KEY` in `.env`. Keep that file private and stable:
changing or losing the key makes previously stored credential values unreadable.

Start PostgreSQL, apply committed migrations, and load the synthetic demonstration workspace:

```bash
npm run db:start
npm run db:migrate
npm run db:seed
```

Then start Priority Signals:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route opens WorldSignal;
[http://localhost:3000/credsignal](http://localhost:3000/credsignal) opens CredSignal directly.

The Docker Compose service binds PostgreSQL only to `127.0.0.1:5432` and persists its data in the
named `priority-signals-postgres` volume. The Next.js application continues to run through the local
Node.js process, which keeps development and debugging straightforward.

For a production-mode local run:

```bash
npm run build
npm start
```

## Synthetic data and secrets

`npm run db:seed` creates synthetic operators, protectees, identities, locations, credential
exposures, cases, tasks, communications, and activity. The `.example` and `.test` identities are not
real people or accounts. The seed is idempotent for the configured workspace and is safe to rerun.

Full credential values are encrypted before PostgreSQL storage and are never written to application
logs, URLs, or browser storage. Encryption does not compensate for the current lack of access
control. Use synthetic values only until authentication, authorization, deployment hardening, and
managed key storage are implemented.

## Operator behavior

### WorldSignal retrieval

- The default source range is 7 days.
- Choosing a range before the first load changes the upcoming request but does not contact a source.
- Choosing a different range after a successful load makes one new explicit source request.
- **Refresh** is the only retry action. There is no timer, polling loop, WebSocket, background worker,
  cron job, or automatic retry.
- A partial result retains successful source events and identifies every failed source.
- Category, display-priority, source, lifecycle, text, and timeline filters operate locally over the
  loaded batch.

Keyboard controls:

- `/` or `Cmd/Ctrl+K`: focus event search
- `R`: retrieve hazards again when focus is outside an editable control
- `Arrow Up` / `Arrow Down`: move between event rows
- `Enter` / `Space`: select the focused event row
- `Escape`: clear selection or close the active operational panel

Every globe event has an equivalent button in the event stream. Reduced-motion preferences remove
the retrieval sweep, selection pulse, and animated camera travel.

### CredSignal operations

- Add and maintain protectees before attributing findings to them.
- Use an approved identity for exact matching, or leave a finding unmatched for manual triage.
- Treat **Reveal and audit** as a sensitive operator action; the plaintext is cleared from the
  interface after 60 seconds.
- Move response tasks through the available lifecycle controls. Complete or cancel every task before
  closing its case.
- Record victim coordination only after contact occurs through an approved external channel.
- Locations are maintained by operators and are not live tracking or breach-source locations.

## Architecture

```text
Priority Signals
├── WorldSignal
│   browser action
│       └── validated Next.js source routes
│           ├── USGS adapter
│           └── GDACS adapter + selected-event geometry
│               └── client reducer ── globe / stream / filters / dossier
└── CredSignal
    server-rendered dashboard + audited Server Actions
        └── domain validation and transactional workflows
            └── PostgreSQL via Drizzle ORM
                ├── protectees / identities / locations
                ├── sources / encrypted exposures / matches
                ├── response cases / tasks / communications
                └── append-only activity
```

WorldSignal's server boundary constructs approved upstream URLs, enforces timeouts and response-size
limits, validates raw payloads, and returns canonical application data. CredSignal validates inputs
at the action boundary and uses database transactions and row locks for multi-record workflow
changes such as matching, case closure, and task coordination.

## Modules and sources

| Module                                                    | Data source                                                                      | Request or intake scope                                      | Authentication                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| WorldSignal earthquakes                                   | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/) | M4.5+ rolling 24H, 7D, or 30D GeoJSON feed                   | None                             |
| WorldSignal cyclone, flood, drought, volcano, forest fire | [GDACS](https://www.gdacs.org/gdacsapi/swagger/index.html)                       | `TC`, `FL`, `DR`, `VO`, `WF`; all alert levels; paginated    | None                             |
| CredSignal credential findings                            | Manual operator intake                                                           | Synthetic or locally obtained records entered by an operator | Demo operator only; not enforced |

USGS exclusively owns the current WorldSignal earthquake category. WorldSignal does not request
GDACS earthquake records or attempt speculative cross-source event merging. “Authoritative source”
means a record arrived through the documented USGS or GDACS adapter; it does not mean Priority
Signals independently verified every upstream fact.

## Verification

Run the deterministic checks:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Unit and HTTP integration tests use committed sanitized fixtures. Playwright intercepts WorldSignal's
local API while exercising the real browser, WebGL renderer, local assets, and application state.
The browser suite uses the locally installed stable Chrome channel and does not download another
browser into the repository.

CredSignal's PostgreSQL integration suite is opt-in because it changes a disposable test workspace
in the local database. With PostgreSQL running and `.env` configured:

```bash
RUN_CREDSIGNAL_DB_TESTS=1 npm test -- tests/integration/credsignal-workflows.test.ts
```

The suite creates a process-scoped workspace, verifies the complete persistence and workflow chain,
and removes that workspace afterward.

## Database commands

```bash
npm run db:start      # start local PostgreSQL
npm run db:migrate    # apply committed migrations
npm run db:seed       # create/update the synthetic local workspace
npm run db:studio     # inspect the database with Drizzle Studio
npm run db:stop       # stop containers without deleting persisted data
```

To delete all local CredSignal database data and recreate it from the seed:

```bash
docker compose down --volumes
npm run db:start
npm run db:migrate
npm run db:seed
```

`docker compose down --volumes` permanently removes the local PostgreSQL volume. Do not run it if
the database contains anything you need to retain.

## Troubleshooting

### npm reports an unsupported Node version

Install or activate Node 24.x, then verify `node --version`. The project intentionally does not work
around its Node engine requirement.

### What is `node_modules`?

`npm install` creates `node_modules`, the local unpacked dependency tree used to run, build, lint,
and test Priority Signals. It is not project source, Git ignores it, and production browsers do not
receive the whole directory. It can be deleted and reconstructed from `package-lock.json` with
`npm install` or `npm ci`; project dependencies should not be replaced with global installations.

### CredSignal says the local workspace is required

Confirm Docker is healthy, then run `npm run db:migrate` and `npm run db:seed`. Verify that `.env`
contains the same database URL used by the Compose service and a valid base64-encoded 32-byte
`CREDSIGNAL_DATA_KEY`.

### Existing credentials can no longer be revealed

Restore the exact `CREDSIGNAL_DATA_KEY` that encrypted them. `CREDSIGNAL_KEY_VERSION` records key
metadata but the MVP does not yet provide a multi-key rotation system.

### Port 3000 or 5432 is already in use

Stop the conflicting local process. For the application only, you can use
`npm run dev -- --port 3001`. PostgreSQL is deliberately bound to local port 5432 by Compose.

### A WorldSignal source is unavailable

Read the per-source status in the left rail. Confirm outbound HTTPS access and use the explicit
**Refresh** action. Repeated schema errors can indicate an upstream contract change.

### The globe is blank

Enable WebGL or hardware acceleration and verify that local files under `public/textures` and
`public/data` are present. Investigation remains available through the accessible queue or stream.

### Playwright cannot find Chrome

Install stable Google Chrome in the platform's normal application location and rerun
`npm run test:e2e`.

## Attribution and license

Visible in-app credits identify NASA Blue Marble imagery, Natural Earth boundaries, USGS earthquake
data, and GDACS disaster data. Fonts and third-party software retain their licenses. See
[NOTICE.md](NOTICE.md) for source links, terms, and bundled-asset details.

Priority Signals source code is available under the [MIT License](LICENSE). Contributions should
preserve security and data-source boundaries, add deterministic tests for behavior changes, pass
the verification commands above, retain attribution, and avoid introducing real secrets or personal
data into fixtures.
