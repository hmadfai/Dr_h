# Troubleshooting

## Setup / build issues

### `npm install` fails with an `ERESOLVE` peer-dependency error
`electron-vite` pins a `vite` peer range. If you bump `vite` past that range
yourself, `npm install` will refuse to resolve. Stick to the versions in
`package.json`/`package-lock.json`, or re-check `electron-vite`'s current
`peerDependencies` before upgrading `vite`.

### `better-sqlite3` fails to load with a `NODE_MODULE_VERSION` mismatch
`better-sqlite3` is a native module compiled against a specific Node/Electron
ABI. This project intentionally does **not** run `electron-rebuild`
automatically on `npm install`, because that would leave the module built
for Electron's ABI and break `npm test`/`npm run dev` under plain Node.

- For development and tests (plain Node): `npm run rebuild:node`
- Before packaging for Electron: `npm run rebuild:native` (this is also run
  automatically as the first step of `npm run build:mac`)

If you switch back and forth, re-run the matching command — the symptom is
always an error like *"was compiled against a different Node.js version"*.

### Electron's binary never downloads / `npm run dev` hangs
Electron's postinstall step downloads a prebuilt Chromium+Node binary for
your platform from GitHub Releases. If your network blocks that, `npm run
dev` cannot start. This affected the Linux sandbox this project was
originally developed in — the app could be built and fully unit-tested
there, but **never actually launched** (no Electron binary, no display). If
you hit this on your Mac, check your network/proxy and that
`ELECTRON_SKIP_BINARY_DOWNLOAD`/`ELECTRON_MIRROR` aren't misconfigured.

## Connection

### "OS-level encryption is not available" when connecting
This comes from `ElectronSecretsStore`, which requires macOS Keychain access
via Electron's `safeStorage`. On macOS this should always be available; if
you see this, check Keychain Access isn't in a locked/corrupted state, and
that you're not running the unsigned development build inside a sandboxed
CI/VM without Keychain support at all (common in headless Linux CI — expected
there, not expected on a real Mac).

### Assisted mode "connect" doesn't actually log me in
That's intentional — assisted mode cannot drive a real login for you (see
`docs/integration-feasibility.md`). "Connect" opens Playtomic's real login
page in your browser; you sign in there, the same as without this app.

## Scheduling / release timing

### My rule's preview shows a release time I didn't expect
Release timing is either an exact UTC timestamp you entered, or "N calendar
days before the play date at HH:MM club-local time" that you entered. This
app does not know, verify, or guess a club's actual release policy — it is
always marked "user-entered, not verified" in the UI. If it's wrong, the
club's real policy is different from what you entered; fix the rule.

### A release was "missed while asleep" / marked EXPIRED with that reason
The scheduler only acts on wall-clock heartbeats. If your Mac was asleep (or
the app wasn't running) when a release time passed, and by the time it woke
the configured catch-up window had already elapsed, the occurrence is marked
missed rather than attempted late — attempting an obviously-late, low-value
check isn't worth the complexity/risk of doing something unexpected long
after the real release moment. Increase the catch-up window, or (more
reliably) keep the Mac awake and the app running across the release window —
see "Sleep and power" below.

### Two rules seem to be fighting over the same lock / nothing happens
Check Dashboard → Scheduler health for a recent heartbeat. If the heartbeat
is stale, the scheduler loop itself may be stuck (file a bug with
exported diagnostics attached — see Booking History → Export). Per-occurrence
execution locks (`occurrence_locks` table) expire after 5 minutes if a
worker crashes mid-attempt; you should not need to intervene manually.

## Sleep and power

### Does this app work with the lid closed?
No guarantee. If the Mac is asleep, no code — this app's or anyone else's —
runs. An optional, scoped "prevent sleep during the release window" setting
can reduce the chance of missing a release, but it cannot make a *powered
off* Mac do anything, and it does not override you manually closing the lid
in a way macOS itself decides to honor. The Dashboard shows a visible warning
whenever the app is not actually positioned to run a scheduled booking
(e.g., emergency-stopped, or no armed rules).

### I closed the window and the app disappeared
It didn't quit — closing the window hides it; the app keeps running in the
background (tray icon) and the scheduler keeps ticking. Use the tray menu's
"Quit" (or Cmd+Q) to actually exit, which also stops the scheduler. This is
the designed, documented behavior from spec section 7, not a bug.

## Bookings

### A booking shows "UNKNOWN_OUTCOME" / "Unknown" — what do I do?
This means a submission (mock mode) could not be confirmed as either
succeeded or failed — never that the app silently retried. The app will
attempt one authoritative reconciliation check automatically. If that also
cannot determine the outcome, the occurrence moves to
`AWAITING_USER_ACTION` and genuinely requires you to check your account (or,
in Mock mode, is simply a simulated case you can use to validate this exact
flow safely).

### I want to double check nothing dangerous happened
Use Booking History → "Export redacted diagnostics" and read the JSON; it
excludes account identifiers (partially redacted), credentials (never
stored in the first place — they live only in Keychain via `safeStorage`,
and only once a future adapter actually needs to store something), and
booking references by default.

## I think I found a bug
Please include: your macOS version, the app version, whether you're on Mock
or Assisted mode, the exported diagnostics file, and exact timestamps
(local + what timezone) of what you expected vs. what happened.
