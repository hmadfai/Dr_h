# AICCA — Accumulator Analyst

West Ham–themed interactive GUI for dual-accumulator construction across **Premier League, Championship, League One & League Two** (2026-27 · **2,036 fixtures**).

## Quick start

Open locally (no build step):

```bash
cd aicca
python3 -m http.server 8080
# then visit http://localhost:8080
```

Or open `aicca/index.html` directly in a browser.

## Features

- **Fixture panel** — searchable / sortable matrix of all 2,036 fixtures
- **Acca A** — comprehensive Betfair families (Match Odds, Goals, Player, Corners, Cards, Half-Time; Scorecast optional), 5–7 legs, ≥5/1, ≥60% HIGH
- **Acca B** — 1X2 only, 4–5 legs, 100% HIGH, ≥5/1
- **Validation** — no shared fixtures, odds floor, market-family coverage, correlation guard (cards+corners)
- **Refresh Fixtures** — round-level validation status (Checking / Valid / Updates Found)
- **Output modal** — side-by-side brief with Opta edges, risk flags, PDF/print export

## Data

| League | Fixtures |
|--------|----------|
| Premier League | 380 |
| Championship | 552 |
| League One | 552 |
| League Two | 552 |
| **Total** | **2,036** |

Regenerate from CSVs:

```bash
python3 aicca/scripts/generate_fixtures.py
```

## Branding

Claret `#7A263A` · Sky blue `#1BB1E7` · fonts Syne + Outfit
