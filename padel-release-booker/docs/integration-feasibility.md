# Playtomic Integration Feasibility Report

**Status: VERIFIED FINDINGS — read before trusting any "live" booking claim in this app.**

This report documents what was actually checked, on which date, against which sources, and
what conclusion follows. It is the basis for the adapter architecture decision in
[`architecture.md`](./architecture.md). Nothing in this document should be read as legal
advice; it is an engineering risk assessment.

Research date: **2026-10-07**. Playtomic is a commercial product and can change its API,
terms, or website at any time without notice — re-verify before relying on any claim below,
especially the dated quotes.

## 1. Is there an official, player-facing booking API?

**No.** Two official Playtomic API surfaces were found, and neither is a player-facing
booking API:

### 1.1 Playtomic "Third Party API" / "Club API" (`third-party.playtomic.io`)

- Source: <https://third-party.playtomic.io/>, <https://third-party.playtomic.io/endpoints/auth/>,
  <https://third-party.playtomic.io/endpoints/bookings/>, <https://third-party.playtomic.io/endpoints/payments/>,
  and the Playtomic Manager help article
  <https://helpmanager.playtomic.com/hc/en-gb/articles/38836515997073-Playtomic-API-Complete-Guide>
  (updated 17 Aug 2026).
- **Who can get credentials:** club owners/managers, generated inside **Playtomic Manager**
  (the club-management back office at `manager.playtomic.io`) under
  `Settings → Developer Tools`. Chain operators get credentials via account manager/support.
  **A player does not have, and cannot self-serve, these credentials for a venue they do not
  manage.**
- **Auth:** `client_id` + `secret` → `POST /api/v1/oauth/token` → bearer token, 1‑hour
  expiry. This is a club-to-Playtomic OAuth client-credentials flow, not a player login.
- **Capabilities actually documented:** `GET /api/v1/bookings` (list bookings for a venue,
  read-only, historical window limited to ~3 months back) and `GET /api/v1/payments`
  (read-only list of paid/refunded payments for a venue). The Playtomic Manager guide
  explicitly calls this "a secure, **read-only** interface." **No endpoint to create a
  booking, check live availability, or take payment was found anywhere in this API's
  documentation.**
- **Conclusion:** even if our user were a club manager (they are not, for an arbitrary club
  they want to play at), this API cannot place a booking. It cannot be used to implement the
  "check availability and book" requirement.

### 1.2 Playtomic Connect (`playtomic.com/connect`)

- Source: <https://playtomic.com/connect>,
  <https://helpmanager.playtomic.com/hc/en-gb/articles/47390286355089-Third-party-integrations-and-Playtomic-Connect>
  (updated 2 Oct 2026).
- This is a **B2B partner certification program** for companies that want to sell add-on
  services to clubs (e.g. loyalty tools, CRMs) through Playtomic Manager. It requires a
  partner application, a qualification call, a technical assessment and a legal agreement.
  It is not a self-serve developer program and is explicitly **not** aimed at individual
  players automating their own bookings.
- Notably, the linked help-center article shows Playtomic is **actively tightening access**
  for "external tools or automations connected to club accounts... without official
  authorization," which is evidence the company does not want unmanaged automated
  integrations, even though that specific notice is addressed to club managers rather than
  players.

**Verdict for section 1:** There is no official API a player can use to authenticate as
themselves, see live availability, create a private court booking, pay for it, and get a
verifiable confirmation. The only official API is a read-only, club-manager-only reporting
API.

## 2. Does the normal player-facing website support the full booking workflow?

- Source: <https://playtomic.com/>, <https://playtomic.com/padel-courts>, Playtomic Help
  Center article "How to make a reservation in Playtomic app"
  (<https://playerhelp.playtomic.com/hc/en-gb/articles/19831881490449>, updated 17 Aug 2026),
  Playtomic Help Center article "How to create your account in Playtomic"
  (<https://playerhelp.playtomic.com/hc/en-gb/articles/19831938095633>), and venue listing
  pages that describe booking "in the app or browser" (e.g. padeli.com club pages).
- Players can browse and (per third-party venue pages and the website itself) book courts
  from a desktop browser at `playtomic.com`, not only the mobile app. Email/password
  **account creation**, however, is app-only; the website only offers Apple/Google/Facebook
  sign-up. A player who already has an account (any sign-up method) can log in on the
  website.
- The documented app booking flow (sport → club → date/time → court/duration → payment
  method → "Pay") strongly implies the same steps exist on the web client, since it is the
  same backend platform, but Playtomic's own docs describe the **app** flow step-by-step and
  do not give an equivalent authoritative player-facing article for the **desktop web**
  flow. This was not exhaustively re-verified by driving an authenticated browser session
  end-to-end (doing so would itself be exactly the kind of unattended automated check this
  report is trying to scope responsibly before building).

### 2.1 `robots.txt` signal

`https://playtomic.com/robots.txt` (fetched 2026-10-07) contains:

```
User-Agent: *
Disallow: /api
Disallow: /wl
Disallow: /search
Disallow: /blog/post
Disallow: /tournaments/*
Disallow: /activities/*
Disallow: /*?*q=
Disallow: /*?*sport=
Disallow: /*?*date=
```

This **explicitly disallows automated access to `/api`, `/search`, and any URL carrying
`sport=` or `date=` query parameters** — i.e. exactly the availability-search surfaces a
release-day booking bot would need to poll. `robots.txt` is a crawler directive, not a
technical access control, and it does not by itself govern a human using their own logged-in
browser session. But it is a clear, dated, first-party statement of Playtomic's preference
that automated agents stay off these paths, and the task's own ground rules say explicitly
not to treat "no prohibition found" as permission — here we *did* find a prohibition-shaped
signal, so it is treated as one.

## 3. What do third parties actually use, and why it does not count as "supported access"

Multiple reverse-engineering write-ups (e.g. an MCP-connector vendor's public documentation,
and independent "Playtomic bot" blog posts) describe using Playtomic's **internal, undocumented
mobile-app API** at `app.playtomic.io` (endpoints such as `GET /api/v1/tenants`,
`GET /api/v1/availability`, `POST /api/v3/auth/login`, discovered by inspecting the iOS app's
network traffic). One such vendor states outright: *"Playtomic has no public API. The mobile
app uses an internal HTTP API that nobody outside Playtomic was supposed to use."*

Per this project's explicit instructions, **this is not treated as proof of supported
access**, regardless of how widely it is used:

- It is not documented or versioned for external consumers; Playtomic can change or block it
  at any time with no notice, and the Playtomic Manager article above shows they are already
  doing exactly that to unauthorized integrations.
- Blog posts arguing automation is "probably legal" (no criminal-law violation, no explicit
  ToS anti-bot clause as of their reading) are not Playtomic statements and were produced by
  companies selling booking-bot products — they are not a substitute for verified, supported
  access, and the account-suspension risk they themselves describe ("Playtomic can suspend
  any account, for any reason, without notice") is real and uninsurable by this app.
- Playtomic's own Legal Conditions (<https://playtomic.com/legal-conditions>, fetched in
  full on 2026-10-07) confirm clubs are independent third parties and that Playtomic can
  terminate/suspend access at its discretion; no anti-bot clause was found, but absence of an
  explicit clause is not an affirmative grant.

## 4. Decision for this application

Given 1–3, this project implements three adapters behind one `PlaytomicAdapter` interface,
and is honest in the UI about which one is active:

| Mode | What it does | Automated? | Uses undocumented API? |
|---|---|---|---|
| **Mock** | Fully deterministic, offline, simulated club/availability/booking data for development, demos, and the automated test suite. Never touches the real Playtomic service. | Yes, but entirely local/fake | No |
| **Assisted** (the only mode that touches the real Playtomic service) | At the configured preflight/release time, opens the real, allowlisted `playtomic.com` club page in your **default system browser** (a normal, human-driven browser tab — not a scripted/headless session) and sends a native notification. **You** log in, search, pick the slot, and pay, exactly as you would without this app. The app records the outcome from your own confirmation. | No — a human performs every booking step | No — only opens a normal browser tab to a normal page |
| **Automatic (live)** | Would check availability and submit a booking/payment without a human clicking through Playtomic's own UI for that step. | — | — |

**Automatic (live) mode is not implemented.** It is deliberately absent, not merely
"TODO," because:

1. No officially supported player API exists to do it (section 1).
2. The only realistic technical path (scripting the web app or calling the internal mobile
   API) either targets paths Playtomic's own `robots.txt` asks automated agents to avoid
   (section 2.1), or relies on an undocumented internal API explicitly excluded as "proof of
   supported access" by this project's own ground rules (section 3).
3. The task's explicit restrictions forbid bypassing security/rate limits, using stealth
   evasion, and claiming automation is permitted just because no prohibition was found — and
   here a prohibition-shaped signal (`robots.txt`) *was* found.

The code is structured so that **if** you later obtain a genuinely supported path — for
example Playtomic grants you/your club explicit API access, or you get written confirmation
that scripted web automation on your own account is acceptable — a new adapter implementing
the same `PlaytomicAdapter` interface can be added and armed through the existing
authorization/state-machine/duplicate-protection machinery without redesigning the app. Until
then, the booking engine will refuse to arm "automatic" mode at all; only "dry run" and
"assisted" are selectable, and this is enforced in code (`core/adapters/`), not just in the
UI copy.

## 5. What this means for you in practice

- The app **can** reliably tell you, ahead of time, when a club's slots are expected to
  release (based on the release rule you enter — see "verified vs. user-entered" in the
  Release Schedule screen) and remind/notify you.
- The app **can** open the correct club page for you at the right second and keep trying to
  bring it to your attention (notification, tray badge, sound) through a bounded window.
- The app **cannot** guarantee it clicks the "Pay" button before another human does, because
  that step requires you.
- If you want fully unattended booking, you would need to either (a) obtain explicit,
  documented permission from Playtomic for your own automated access and implement a new
  adapter against that, or (b) accept the account-suspension and reliability risk of
  automating the undocumented internal API yourself — this project does not do that for you.

## 6. Sources

- <https://third-party.playtomic.io/>
- <https://third-party.playtomic.io/endpoints/auth/>
- <https://third-party.playtomic.io/endpoints/bookings/>
- <https://third-party.playtomic.io/endpoints/payments/>
- <https://helpmanager.playtomic.com/hc/en-gb/articles/38836515997073-Playtomic-API-Complete-Guide>
- <https://playtomic.com/connect>
- <https://helpmanager.playtomic.com/hc/en-gb/articles/47390286355089-Third-party-integrations-and-Playtomic-Connect>
- <https://playtomic.com/legal-conditions>
- <https://playtomic.com/robots.txt>
- <https://playtomic.com/> and <https://playtomic.com/padel-courts>
- <https://playerhelp.playtomic.com/hc/en-gb/articles/19831881490449-How-to-make-a-reservation-in-Playtomic-app>
- <https://playerhelp.playtomic.com/hc/en-gb/articles/19831938095633-How-to-create-your-account-in-Playtomic>
- Third-party reverse-engineering write-ups (cited only as evidence of *what is technically
  possible*, never as evidence of *what is permitted*): AnythingMCP's "Playtomic to MCP" and
  "Connect Playtomic to OpenClaw" guides; padelsnipe.com blog posts on Playtomic automation
  legality.

All sources were fetched live during development of this report (2026-10-07). Re-check them
before making any decision that depends on them continuing to be true.
