# AICCA — Accumulator Analyst

West Ham–themed interactive GUI for dual-accumulator construction across **Premier League, Championship, League One & League Two** (2026-27 · **2,036 fixtures**).

## Quick start

```bash
cd aicca
python3 -m http.server 8080
# visit http://localhost:8080
```

## Wired data sources

| Layer | Source | Role |
|-------|--------|------|
| Fixtures | Preloaded 2026-27 matrix | Full season selection |
| Live refresh | **ESPN** scoreboard + **TheSportsDB** events | Date/venue/status validation |
| Team metrics | **football-data.co.uk** 2025-26 (+24/25 fallback) | xG proxy, PPDA proxy, corners, cards, form, BTTS |
| Exchange odds | Betfair closing columns (`BFE*`) | Blend with model 1X2 prices |
| Players | TheSportsDB rosters + role model | Anytime / card-risk legs |
| Optional live odds | The Odds API | Set `window.AICCA_ODDS_API_KEY` |

Rebuild stats:

```bash
python3 aicca/scripts/build_team_stats.py
```

## Features

- **Fixture panel** — searchable / sortable matrix of all 2,036 fixtures
- **Acca A** — comprehensive Betfair families (5–7 legs, ≥5/1, ≥60% HIGH)
- **Acca B** — 1X2 only (4–5 legs, 100% HIGH, ≥5/1)
- **Metric-driven legs** — selections priced from home/away xG, PPDA, corners, cards, HT rates
- **Live Refresh** — ESPN + TheSportsDB round validation with status pills
- **Output modal** — Opta-proxy edges, risk flags, PDF/print

## Branding

Claret `#7A263A` · Sky blue `#1BB1E7` · fonts Syne + Outfit
