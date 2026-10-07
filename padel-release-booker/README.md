# Padel Release Booker

A local-first macOS desktop app that helps you prepare for a Playtomic
club's court-release moment, watch for availability right at/after that
moment, and — only with your explicit, reviewed authorization — attempt one
matching booking. It runs entirely on your Mac: no cloud hosting, no paid
automation service, no remote server.

**Read this first:** [`docs/integration-feasibility.md`](docs/integration-feasibility.md).
Playtomic has no official player-facing API for authenticating, checking
availability, booking, and paying. This app therefore has **no fully
automatic "live" booking mode**. It ships with:

- **Mock mode** — a complete, fully offline sandbox with fictional club data,
  so you can learn, build, and test rules with zero risk. Never a real
  booking.
- **Assisted mode** — the only mode that touches the real Playtomic service.
  At the right moment, it opens the real, allowlisted club page in your own
  browser and notifies you. You log in, search, pick the slot, and pay —
  exactly as you would without this app, just reminded at the right second.

This app **does not** guarantee booking success or exact instantaneous
execution. It depends on network latency, competing users, your own
authentication/payment steps, Playtomic's own platform behavior, and whether
your Mac is actually awake and the app actually running at the right time.

## What's real vs. fictional in this repo

- Everything under `src/`, `tests/`, config files, and this documentation is
  real, working code.
- "Riverside Padel Club" / "Harbourview Padel & Tennis" and all sample data
  in `src/main/mockFixtures.ts` and `samples/` are **explicitly fictional**,
  used only by Mock mode and the test suite. Enter your real club through
  the in-app Setup Wizard — nothing about your club or schedule is
  hardcoded.

## Requirements

- macOS **13 (Ventura) or later** to run the packaged app (Electron 44's
  minimum). Apple Silicon (arm64) is the primary target; an Intel (x64)
  build is produced from the same config (see Packaging below).
- Node.js **22.12+** and npm, for development/building only (not required to
  run the packaged `.app`).

## Setup

```bash
git clone <this-repo-url>
cd padel-release-booker
npm install
```

`npm install` does **not** rebuild native modules for Electron's ABI (see
"Native module ABI" below) — this keeps a plain `npm install` safe for
immediately running tests.

## Development

```bash
npm run dev
```

Starts `electron-vite`'s dev server (hot-reloading renderer) and launches
the Electron app pointed at it. Requires a graphical macOS session (this
cannot run headless — there is no supported way to drive the real UI without
a display).

## Tests

```bash
npm run typecheck   # tsc --noEmit, strict mode, both app and tooling configs
npm run lint        # currently an alias for typecheck (see note below)
npm test            # vitest run — all unit + UI tests
npm run test:watch  # vitest in watch mode
```

The test suite (`tests/unit/*.test.ts(x)`) covers the booking engine,
scheduler, state machine, timezone/DST arithmetic, duplicate-execution
guards, authorization hashing, the URL allowlist, the SQLite persistence
layer, and a React UI smoke test for creating/reviewing/arming/pausing a
rule — all against the mock adapter and an injectable fake clock, so they
run instantly and never touch a real network or a real Playtomic account.
**No test ever makes a real paid reservation; dry-run and mock paths never
issue a state-changing request against anything real.**

> Note on `lint`: a full ESLint flat-config setup was intentionally not
> added under this task's time budget beyond what strict `tsc` already
> catches (unused locals, strict null checks, no implicit any, etc.). If you
> want stricter style linting, add `eslint` + `typescript-eslint` and point
> the `lint` script at it; nothing in the codebase depends on the current
> alias.

## Build

```bash
npm run build            # electron-vite build -> out/main, out/preload, out/renderer
npm run build:unpack     # build + electron-builder --dir (unpacked app, current platform)
npm run build:mac        # rebuild native modules for Electron, build, then electron-builder --mac
```

### Native module ABI (`better-sqlite3`)

`better-sqlite3` is a native module. A plain `npm install` leaves it built
for **plain Node** (so `npm test`/`npm run dev`'s Node-side tooling works).
Before packaging for Electron, rebuild it for Electron's ABI:

```bash
npm run rebuild:native   # electron-rebuild -f -w better-sqlite3
```

and if you need to go back to running tests under plain Node afterward:

```bash
npm run rebuild:node      # npm rebuild better-sqlite3
```

`npm run build:mac` runs `rebuild:native` automatically as its first step.

### Packaging, signing, and notarization

`electron-builder.yml` targets macOS `dmg` and `zip` for both `arm64` and
`x64`, with `minimumSystemVersion: 13.0.0`. **It is currently configured for
an unsigned build** (`hardenedRuntime: false`, no entitlements, no
`identity`/notarization config). This means:

- The resulting `.app`/`.dmg` will trigger Gatekeeper's "cannot be opened
  because it is from an unidentified developer" warning on first launch.
  Users can right-click → Open to bypass this for a build they trust, but
  it is not the one-click experience of a signed, notarized app.
- Keychain access via `safeStorage`, notifications, and other OS-gated
  features generally still work for an unsigned, locally-built app on your
  own Mac, but some entitlement-gated capabilities and all distribution
  outside of "run it on your own machine" require code signing.

To ship a signed, notarized build, you need an active Apple Developer
Program membership, a Developer ID Application certificate, and to set
`CSC_LINK`/`CSC_KEY_PASSWORD` (or use `electron-builder`'s keychain-based
signing) plus `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` for
notarization, then enable `mac.hardenedRuntime: true` with appropriate
entitlements. That is intentionally left as a follow-up: it requires a paid
Apple account this task cannot provide or verify on your behalf.

**This project's build/packaging steps were authored and the config's
syntax was validated, but `npm run build:mac` itself was not executed**
during development — the environment used to write this app had no macOS
host, so the `.dmg`/`.zip` outputs and macOS-only features (Keychain,
Tray icon rendering, native notification permission prompts,
`start-at-login`) are **not** verified on real macOS. What **was** verified,
on Linux under Xvfb (a virtual display), by actually launching the built
`out/main/index.js` with the real Electron binary and driving it over the
Chrome DevTools Protocol (not just unit tests): the main process boots, the
single-instance lock and SQLite schema are created, the sandboxed preload
bridge loads and exposes `window.padelApi` to the renderer with no
JavaScript errors, the React UI renders and navigates across all four pages,
and the mock-mode "resolve club by URL" flow round-trips through real IPC to
the main process and back. This caught and fixed a real bug (the preload
script was built as ESM but Electron's sandboxed preload loader cannot
`import` ESM — see `docs/troubleshooting.md`). It does **not** verify
anything macOS-specific (Keychain via `safeStorage`, the Tray icon,
native notification permission UX, start-at-login, code signing/Gatekeeper).
Please run the build and packaging commands yourself on a Mac and report
back if anything fails; do not take "it launched on Linux" as proof the
packaged macOS app behaves identically.

## Documentation map

- [`docs/integration-feasibility.md`](docs/integration-feasibility.md) — what
  was actually checked about Playtomic's API/terms/website, and why the
  adapter architecture is what it is.
- [`docs/architecture.md`](docs/architecture.md) — layers, state machine,
  scheduler design, timezone math, duplicate/payment safety, security.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common problems.
- [`docs/before-first-live-booking-checklist.md`](docs/before-first-live-booking-checklist.md) —
  read before you arm a rule against a real club you care about.
- [`samples/sample-rule-fictional-club.json`](samples/sample-rule-fictional-club.json) —
  documents the shape of a rule using clearly fictional data (the app has no
  JSON import; enter rules through the Setup Wizard, which validates every
  field).

## Project status / what's honestly verified right now

- ✅ Core logic (state machine, scheduler, booking engine, timezone/DST math,
  duplicate guards, authorization hashing, SQLite persistence) — unit
  tested, 81 tests passing, strict `tsc` clean.
- ✅ `electron-vite build` succeeds (main, preload, renderer all compile and
  bundle).
- ✅ A React UI smoke test exercises create → preview → create & review →
  arm, plus pause/resume/delete, against a mocked `window.padelApi`.
- ✅ **Real (non-macOS) runtime smoke test**: the packaged main process was
  actually launched with the real Electron 44 binary under Xvfb on Linux and
  driven over the Chrome DevTools Protocol — window opens, preload bridge
  loads with zero renderer JS errors, SQLite tables are created on disk, and
  Dashboard / Connection / Setup Wizard / Booking History all render and
  respond to real IPC round-trips (mock club resolution included). This is
  **not** a macOS verification, but it is a real, non-mocked boot of the
  actual built app, not just unit tests against the core logic.
- ❌ **Still not verified**: the tray icon's real rendering and click
  behavior, real native macOS notification permission prompts, real macOS
  Keychain reads/writes via `safeStorage`, start-at-login registration, and
  the packaged `.app`/`.dmg`/code-signing flow. The development environment
  for this task has no macOS host; see `docs/troubleshooting.md`. Please
  verify these yourself on a Mac before trusting this for a booking you care
  about.
