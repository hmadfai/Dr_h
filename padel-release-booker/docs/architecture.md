# Architecture

## Layers

```
src/
  core/        Pure TypeScript. No Electron import anywhere in this tree.
                Domain model, state machine, release-time calendar math,
                booking engine, scheduler, adapters (mock + assisted),
                persistence (SQLite repositories), security/notification
                interfaces. Fully unit-testable with plain Vitest + Node.

  main/        Electron main process. Wires core/ modules to real I/O:
                SQLite file on disk, Electron's safeStorage (Keychain-backed
                on macOS), Notification API, shell.openExternal, tray,
                powerMonitor, single-instance lock. Owns the only
                `AppRuntime` instance and registers every IPC handler.

  preload/     The only file with access to both `electron` APIs and the
                renderer's `window`. Exposes a narrow, fully-typed
                `window.padelApi` via contextBridge — nothing else.

  renderer/    React UI. Contextisolated, sandboxed, nodeIntegration
                disabled. Talks to main only through `window.padelApi`.

  shared/      Types/constants referenced by more than one layer (the IPC
                channel list and request/response shapes).
```

This mirrors the spec's required separation: **renderer = interface only;
main process = scheduler, persistence, notifications, integration
orchestration; Playtomic adapter = all external-service interaction; booking
engine = matching/authorization/retries/reconciliation; mock adapter =
deterministic offline development and testing.**

## Why core/ has no Electron dependency

Every scenario in spec section 9 (slots appearing late, rate limiting,
sleep/wake, DST, two competing workers, restart mid-booking, etc.) needs to
be reproducible deterministically and fast, in CI, without a display. Making
`core/` a plain TypeScript/Node tree means the entire booking engine,
scheduler, state machine, and calendar math run under Vitest with an
injectable fake clock and a fully scriptable mock adapter — no Electron
runtime, no real time passing, no flakiness. `main/` is the thin layer that
gives `core/` a real database file, a real clock, a real notifier, and a
real (but still constrained) way to open a browser tab.

## Occurrence state machine

```
DRAFT -> ARMED -> PREFLIGHT -> WAITING_FOR_RELEASE -> CHECKING -> BOOKING -> CONFIRMED
                                                          |           |
                                                          v           v
                                                       EXPIRED   AWAITING_USER_ACTION -> CONFIRMED / FAILED / UNKNOWN_OUTCOME
                                                                      ^                        |
                                                                      |                        v
                                                                      +---------------- UNKNOWN_OUTCOME -> CONFIRMED / FAILED / AWAITING_USER_ACTION
any non-terminal state <-> PAUSED (emergency stop / resume)
any non-terminal state -> EXPIRED (missed while asleep, booking window closed, etc.)
```

Implemented in `core/domain/stateMachine.ts` as a pure function
`applyOccurrenceEvent(current, event) -> next`. It throws on any transition
not explicitly modeled — in a booking/payment system, silently ignoring an
unexpected event is how double-charges happen, so every edge is enumerated
and tested (`tests/unit/stateMachine.test.ts`).

`PAUSE` records `pausedFromStatus` so `RESUME` returns to exactly where it
left off; the scheduler then re-evaluates wall-clock conditions from there
rather than assuming any time passed correctly while paused.

## Scheduler vs. booking engine

- **`core/engine/scheduler.ts`** decides *when*. It re-reads wall-clock time
  on every heartbeat tick (default every 5s) rather than relying on one
  long-lived `setTimeout` per occurrence, because a `setTimeout` spanning a
  Mac sleep period is unreliable — some platforms delay it, Electron/Chromium
  may defer it arbitrarily. Re-checking wall-clock time on a short heartbeat,
  plus an explicit "re-evaluate immediately" hook wired to
  `powerMonitor.on('resume', ...)`, is the only approach that is correct
  across sleep/wake, manual clock changes, and timezone changes without
  restarting the app.
- **`core/engine/bookingEngine.ts`** decides *what happens* once the
  scheduler says "now". `runPreflight` validates session/authorization/club
  readiness without submitting anything. `pollOccurrenceOnce` is one
  CHECKING-phase attempt: for the mock adapter (or any future adapter with
  `capabilities.supportsAutomaticBooking`), it checks availability across
  approved candidates in priority order, enforces price cap/currency/surface
  filters, enforces booking-count caps, checks for an existing matching
  booking before submitting, acquires the occurrence lock, submits, and maps
  the result (or a specific thrown error type) to state-machine events. For
  the assisted adapter, it instead opens the real page and hands off.
  `reconcileUnknownOutcome` is the only path allowed to resolve
  `UNKNOWN_OUTCOME`, and it never resubmits a booking — only an authoritative
  existing-booking check can move it forward.

## Timezone-aware calendar math

`core/time/releaseSchedule.ts`:

- `addCalendarDays` does calendar-field subtraction (`Y/M/D ± N days`), never
  `N * 86 400 000` ms. A DST transition changes how many real seconds separate
  two calendar days, but "7 days before November 10th" must still mean
  November 3rd regardless.
- `resolveLocalTimeToUtc` detects DST ambiguity/nonexistence by actually
  probing the IANA zone's offset at two candidate instants and checking
  self-consistency (does the zone actually use that offset at the instant it
  implies?), rather than trusting whatever a date library defaults to. It
  returns which of three cases applied (`unambiguous`, `ambiguous-resolved`,
  `nonexistent-resolved`) so the caller can show a warning. Policies:
  - **Ambiguous** (fall-back repeated hour): `earliest` picks the first
    chronological occurrence (before clocks fall back); `latest` picks the
    second.
  - **Nonexistent** (spring-forward gap): `push-forward` resolves to the
    chronologically later candidate (the real local reading ends up *after*
    the gap, e.g. a requested 02:30 in a 02:00→03:00 gap reads back as
    03:30); `push-back` resolves to the earlier candidate (reads back as
    01:30, clamped just before the gap).
- Release rules only support what the spec allows: an exact one-off UTC
  timestamp, or "N calendar days before the playing date at HH:MM club-local
  time" — `daysBefore` is always a whole-day integer applied via
  `addCalendarDays`, never multiplied into milliseconds.

## Duplicate/payment safety

- **Single instance lock**: `app.requestSingleInstanceLock()` in
  `main/index.ts` — a second launch just focuses the existing window.
- **Per-occurrence execution lock**: `core/engine/duplicateGuard.ts`
  (in-memory for tests) and `core/persistence/repositories/occurrenceLockRepository.ts`
  (SQLite-backed for the real app, so a lock survives a crash/restart).
  `pollOccurrenceOnce` acquires it before calling `submitBooking` and only
  releases it on a definitive outcome (confirmed, failed, or requires user
  action); on an unknown outcome it is deliberately **not** released until
  `reconcileUnknownOutcome` runs, so nothing else can attempt a second
  submission for that occurrence in the meantime.
- **Unique local intent id**: every `Occurrence` gets a random `intentId`
  (`core/domain/occurrenceFactory.ts`) which adapters are asked to forward as
  an idempotency key (`BookingSubmitParams.intentId`) — the mock adapter
  receives it; whether a future real adapter can actually use it
  server-side depends entirely on what that service supports.
- **Pre-submission duplicate check**: before calling `submitBooking`, the
  engine calls `adapter.findExistingBooking(...)` so a previous,
  successfully-recorded-but-not-yet-visible booking is detected rather than
  re-booked.
- **Never a blind retry on uncertain outcomes**: any error during
  `submitBooking` other than a recognized "requires user action" challenge is
  treated as `UNKNOWN_OUTCOME`, persisted, and only resolved by
  `reconcileUnknownOutcome`'s authoritative check — never by calling
  `submitBooking` again.
- **What this does *not* guarantee**: the local lock prevents *this app* from
  racing itself. It cannot make Playtomic's own servers exactly-once; a
  request can still reach their servers and have its response lost. This
  is exactly why unknown outcomes always go through reconciliation (or, if
  the adapter can't reconcile, to a mandatory manual review) instead of a
  second attempt.

## Authorization and material-change detection

`core/domain/authorization.ts` builds a canonical, hashed view of exactly the
fields the spec says must gate automatic checkout (club, dates, courts,
fallback options, release schedule, price cap, currency, payment method
label, cancellation policy summary, booking-count caps). `armRule` re-derives
this hash at arm time and stores it on the `AuthorizationSnapshot`; the
scheduler's `onPreflightDue` callback re-derives it again right before
release and refuses to proceed (routing to `PREFLIGHT_FAILED`) if it no
longer matches the currently active authorization — so editing a rule after
arming it, or any drift in club/price/policy data, requires a fresh review
rather than silently continuing under stale consent.

## Adapters

See [`integration-feasibility.md`](./integration-feasibility.md) for *why*
only two adapters exist. Both implement `core/adapters/PlaytomicAdapter.ts`:

- **Mock** (`core/adapters/mockAdapter.ts`): takes an injectable `MockWorld`
  object that tests/demo code mutate directly to script exact scenarios
  (slots appearing at a given wall-clock time, rate limiting, network
  errors, requires-user-action, etc.). `capabilities.touchesRealService` is
  `false` and is asserted by `assertMockNeverClaimsReal`.
- **Assisted** (`core/adapters/assistedAdapter.ts`): the only adapter with
  `touchesRealService: true`. Every URL it opens is re-validated against
  `core/urlAllowlist.ts` (only `playtomic.com`/`www.playtomic.com`/`app.playtomic.io`,
  `https:` only) before `main/shell/externalUrlOpener.ts` calls
  `shell.openExternal`. It has no availability-check or submit-booking
  capability — calling either throws `AdapterCapabilityError` by design.

## Electron security defaults

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the
  only `BrowserWindow` (`main/index.ts`).
- A strict `Content-Security-Policy` is set both via an HTTP response header
  (`session.defaultSession.webRequest.onHeadersReceived`) and a matching
  `<meta>` tag in `renderer/index.html`, defense in depth.
- `webContents.setWindowOpenHandler` and `will-navigate` both deny anything
  not on the Playtomic allowlist (or the packaged renderer's own `file://`
  origin), routing allowed external links through `shell.openExternal`
  instead of letting Electron spawn a second, less-restricted window.
- The preload script (`src/preload/index.ts`) is the *only* place
  `contextBridge`/`ipcRenderer` are imported; it exposes exactly the
  `PadelApi` surface and nothing else — no raw `ipcRenderer`, no `require`.
- Every IPC argument is re-validated in `main/ipc/handlers.ts` with zod
  schemas from `core/domain/validation.ts` before touching the database or
  an adapter, regardless of what the (trusted, but defense-in-depth-checked)
  preload bridge already constrained client-side.

## Secrets and persistence

- SQLite (`better-sqlite3`, schema in `core/persistence/schema.ts`) holds
  **only structured booking data** — clubs, rules, occurrences, booking
  records, authorization snapshots, non-secret connection metadata, and
  per-occurrence locks. It is deliberately not the place for anything secret.
- `main/security/electronSecretsStore.ts` uses Electron's `safeStorage` API,
  which macOS backs with Keychain-protected encryption keys, as the
  "maintained macOS Keychain integration" called for in the spec (instead of
  the unmaintained `keytar` native module). It additionally writes the
  resulting ciphertext to a `0600`-permission file. Today, with only the
  mock and assisted adapters implemented, nothing secret actually needs to
  be stored yet — assisted mode never receives your Playtomic password, you
  type it directly into your own browser — but the store exists so a future
  adapter, and the "remove local session data" control, have a real,
  already-reviewed place to put and delete tokens.
- `.gitignore` excludes the runtime SQLite file, any `*.local.json`, and a
  `diagnostics/` directory so none of this is ever committed.

## Known limitations of this implementation (be explicit about these)

- **No live/automatic Playtomic adapter.** By design — see the feasibility
  report. "Automatic" mode only exists end-to-end in the Mock sandbox.
- **Assisted mode cannot verify login, search, slot selection, or payment
  completion.** It opens a page and asks you to self-report the outcome
  (`reportUserOutcome`). There is no way to algorithmically confirm a real
  booking without either an API or scripted automation, neither of which is
  available/permitted per the feasibility report.
- **Packaging/signing was not executed or verified in this environment**
  (no macOS host was available during development — see the Troubleshooting
  guide). The `electron-builder.yml` config is provided and its YAML has
  been validated to parse correctly, but `npm run build:mac` itself has not
  been run.
- **better-sqlite3 is a native module.** It must be rebuilt for Electron's
  Node ABI before packaging (`npm run rebuild:native`) and rebuilt back for
  plain Node (`npm run rebuild:node`) if you want to run the test suite
  again afterward. See the README.
