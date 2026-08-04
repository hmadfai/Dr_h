#!/usr/bin/env python3
"""Build Opta-style team stats + key players from football-data.co.uk CSVs + TheSportsDB."""
from __future__ import annotations

import csv
import json
import math
import statistics
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT_STATS = ROOT / "data" / "team-stats.js"
OUT_JSON = ROOT / "data" / "team-stats.json"
OUT_PLAYERS = ROOT / "data" / "players.js"
OUT_PLAYERS_JSON = ROOT / "data" / "players.json"

# Fixture name -> football-data.co.uk name(s)
ALIAS = {
    "Man Utd": "Man United",
    "Spurs": "Tottenham",
    "Wolverhampton Wanderers": "Wolves",
    "West Ham United": "West Ham",
    "West Bromwich Albion": "West Brom",
    "Sheffield Wednesday": "Sheffield Weds",
    "Queens Park Rangers": "QPR",
    "Birmingham City": "Birmingham",
    "Blackburn Rovers": "Blackburn",
    "Bolton Wanderers": "Bolton",
    "Bradford City": "Bradford",
    "Burton Albion": "Burton",
    "Cambridge United": "Cambridge",
    "Cardiff City": "Cardiff",
    "Charlton Athletic": "Charlton",
    "Cheltenham Town": "Cheltenham",
    "Colchester United": "Colchester",
    "Crewe Alexandra": "Crewe",
    "Derby County": "Derby",
    "Doncaster Rovers": "Doncaster",
    "Exeter City": "Exeter",
    "Grimsby Town": "Grimsby",
    "Huddersfield Town": "Huddersfield",
    "Leicester City": "Leicester",
    "Lincoln City": "Lincoln",
    "Luton Town": "Luton",
    "MK Dons": "Milton Keynes Dons",
    "Norwich City": "Norwich",
    "Northampton Town": "Northampton",
    "Oldham Athletic": "Oldham",
    "Oxford United": "Oxford",
    "Peterborough United": "Peterboro",
    "Plymouth Argyle": "Plymouth",
    "Preston North End": "Preston",
    "Rotherham United": "Rotherham",
    "Salford City": "Salford",
    "Shrewsbury Town": "Shrewsbury",
    "Stoke City": "Stoke",
    "Swansea City": "Swansea",
    "Swindon Town": "Swindon",
    "Tranmere Rovers": "Tranmere",
    "Wigan Athletic": "Wigan",
    "Wycombe Wanderers": "Wycombe",
    "York City": "York",
    "Accrington Stanley": "Accrington",
    "Bristol Rovers": "Bristol Rvs",
    "Mansfield Town": "Mansfield",
    "Stockport County": "Stockport",
}

# Reverse map for display
CSV_TO_CANON = {v: k for k, v in ALIAS.items()}
# identity for names that already match
for n in [
    "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Burnley",
    "Chelsea", "Crystal Palace", "Everton", "Fulham", "Leeds", "Liverpool",
    "Man City", "Newcastle", "Nott'm Forest", "Sunderland", "Hull", "Ipswich",
    "Coventry", "Bristol City", "Millwall", "Portsmouth", "Sheffield United",
    "Watford", "Wrexham", "AFC Wimbledon", "Barnsley", "Blackpool", "Reading",
    "Leyton Orient", "Port Vale", "Stevenage", "Barnet", "Bromley", "Chesterfield",
    "Crawley Town", "Fleetwood Town", "Gillingham", "Newport County", "Notts County",
    "Walsall", "Middlesbrough", "Southampton",
]:
    CSV_TO_CANON.setdefault(n, n)

DIV_LEAGUE = {
    "E0": "Premier League",
    "E1": "Championship",
    "E2": "League One",
    "E3": "League Two",
}


def fnum(x, default=0.0):
    try:
        if x is None or x == "":
            return default
        return float(x)
    except ValueError:
        return default


def load_matches():
    matches = []
    for season in ("2526", "2425"):
        for div in ("E0", "E1", "E2", "E3"):
            path = RAW / f"{div}_{season}.csv"
            if not path.exists():
                continue
            with path.open(newline="", encoding="utf-8", errors="replace") as fh:
                for row in csv.DictReader(fh):
                    row["_div"] = div
                    row["_season"] = season
                    row["_league"] = DIV_LEAGUE[div]
                    matches.append(row)
    return matches


def canon(csv_name: str) -> str:
    return CSV_TO_CANON.get(csv_name, csv_name)


def aggregate(matches):
    """Build per-team Opta-style profiles from shot/corner/card/odds data."""
    # Prefer latest season (2526) when available; fall back to 2425
    by_team_season = defaultdict(lambda: defaultdict(list))
    for m in matches:
        for side in ("H", "A"):
            name = m["HomeTeam"] if side == "H" else m["AwayTeam"]
            by_team_season[name][m["_season"]].append((side, m))

    profiles = {}
    for csv_name, seasons in by_team_season.items():
        season = "2526" if "2526" in seasons else sorted(seasons.keys())[-1]
        games = seasons[season]
        if not games:
            continue

        def side_stats(side_filter=None):
            subset = [(s, g) for s, g in games if side_filter is None or s == side_filter]
            n = len(subset) or 1
            gf = ga = sot_for = sot_ag = shots_for = shots_ag = 0.0
            corners_for = corners_ag = fouls_for = fouls_ag = 0.0
            y_for = y_ag = r_for = r_ag = 0.0
            pts = 0
            cs = 0
            btts = 0
            over25 = 0
            ht_lead = 0
            form = []
            odds_home_wins = []
            for s, g in subset:
                if s == "H":
                    fth, fta = fnum(g["FTHG"]), fnum(g["FTAG"])
                    hs, as_ = fnum(g.get("HS")), fnum(g.get("AS"))
                    hst, ast = fnum(g.get("HST")), fnum(g.get("AST"))
                    hc, ac = fnum(g.get("HC")), fnum(g.get("AC"))
                    hf, af = fnum(g.get("HF")), fnum(g.get("AF"))
                    hy, ay = fnum(g.get("HY")), fnum(g.get("AY"))
                    hr, ar = fnum(g.get("HR")), fnum(g.get("AR"))
                    hth, hta = fnum(g.get("HTHG")), fnum(g.get("HTAG"))
                    res = g.get("FTR")
                    win = res == "H"
                    draw = res == "D"
                    bf = fnum(g.get("BFEH") or g.get("B365H"), 0)
                else:
                    fth, fta = fnum(g["FTAG"]), fnum(g["FTHG"])  # for/against from team POV
                    hs, as_ = fnum(g.get("AS")), fnum(g.get("HS"))
                    hst, ast = fnum(g.get("AST")), fnum(g.get("HST"))
                    hc, ac = fnum(g.get("AC")), fnum(g.get("HC"))
                    hf, af = fnum(g.get("AF")), fnum(g.get("HF"))
                    hy, ay = fnum(g.get("AY")), fnum(g.get("HY"))
                    hr, ar = fnum(g.get("AR")), fnum(g.get("HR"))
                    hth, hta = fnum(g.get("HTAG")), fnum(g.get("HTHG"))
                    res = g.get("FTR")
                    win = res == "A"
                    draw = res == "D"
                    bf = fnum(g.get("BFEA") or g.get("B365A"), 0)

                gf += fth
                ga += fta
                shots_for += hs
                shots_ag += as_
                sot_for += hst
                sot_ag += ast
                corners_for += hc
                corners_ag += ac
                fouls_for += hf
                fouls_ag += af
                y_for += hy
                y_ag += ay
                r_for += hr
                r_ag += ar
                if fta == 0:
                    cs += 1
                if fth > 0 and fta > 0:
                    btts += 1
                if fth + fta > 2.5:
                    over25 += 1
                if hth > hta:
                    ht_lead += 1
                if win:
                    pts += 3
                    form.append("W")
                elif draw:
                    pts += 1
                    form.append("D")
                else:
                    form.append("L")
                if bf:
                    odds_home_wins.append(bf)

            # xG proxy: shots on target * 0.32 + (shots-sot)*0.05 (empirical)
            xg = (sot_for * 0.32 + max(shots_for - sot_for, 0) * 0.05) / n
            xga = (sot_ag * 0.32 + max(shots_ag - sot_ag, 0) * 0.05) / n
            # PPDA proxy: lower when fouls high relative to opp shots (pressing intensity proxy)
            # Real PPDA unavailable; approximate as opp passes allowed ~ shots_ag*18 / fouls_for
            ppda = (shots_ag * 18.0 / max(fouls_for, 1)) if fouls_for else 12.0
            ppda = round(min(max(ppda / n * n, 4.0), 22.0), 2)  # clamp
            # actually average per game:
            ppda = round((shots_ag * 18.0) / max(fouls_for, 1), 2)
            ppda = min(max(ppda, 4.5), 20.0)

            shot_acc = (sot_for / shots_for * 100) if shots_for else 0
            set_piece_threat = corners_for / n * 0.12  # goals/xG proxy from corners volume

            return {
                "played": len(subset),
                "ppg": round(pts / n, 3),
                "gf_pg": round(gf / n, 3),
                "ga_pg": round(ga / n, 3),
                "xg_pg": round(xg, 3),
                "xga_pg": round(xga, 3),
                "shots_pg": round(shots_for / n, 2),
                "sot_pg": round(sot_for / n, 2),
                "shot_accuracy_pct": round(shot_acc, 1),
                "corners_for_pg": round(corners_for / n, 2),
                "corners_ag_pg": round(corners_ag / n, 2),
                "fouls_pg": round(fouls_for / n, 2),
                "fouls_drawn_pg": round(fouls_ag / n, 2),
                "yellows_pg": round(y_for / n, 2),
                "reds_pg": round(r_for / n, 3),
                "clean_sheet_pct": round(cs / n * 100, 1),
                "btts_pct": round(btts / n * 100, 1),
                "over25_pct": round(over25 / n * 100, 1),
                "ht_lead_pct": round(ht_lead / n * 100, 1),
                "ppda_proxy": round(ppda, 2),
                "set_piece_threat": round(set_piece_threat, 3),
                "form_last10": "".join(form[-10:]),
                "form_last5": "".join(form[-5:]),
                "avg_exchange_odds_when_backed": round(statistics.mean(odds_home_wins), 3) if odds_home_wins else None,
            }

        overall = side_stats()
        home = side_stats("H")
        away = side_stats("A")
        div = games[0][1]["_div"]
        league = games[0][1]["_league"]

        # Strength index 0-100 from xG diff + ppg
        strength = min(99, max(1, round(50 + (overall["xg_pg"] - overall["xga_pg"]) * 18 + (overall["ppg"] - 1.3) * 20)))

        profiles[canon(csv_name)] = {
            "name": canon(csv_name),
            "csvName": csv_name,
            "sourceSeason": f"20{season[:2]}-20{season[2:]}",
            "sourceLeague": league,
            "sourceDiv": div,
            "strength": strength,
            "overall": overall,
            "home": home,
            "away": away,
            "sources": ["football-data.co.uk", "Opta-proxy (shots/SOT→xG)", "Betfair Exchange closing (BFE*)"],
        }
    return profiles


def http_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "AICCA/1.0 (stats-builder)"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode())


# TheSportsDB team search for key attackers (best-effort)
TSDB_LEAGUE = {
    "Premier League": 4328,
    "Championship": 4329,
    "League One": 4396,
    "League Two": 4397,
}


def fetch_players_for_teams(team_names):
    """Best-effort player threats via TheSportsDB (free tier may be sparse)."""
    players = {}
    # Search a subset of high-profile teams to avoid rate limits
    priority = [
        "Arsenal", "Liverpool", "Man City", "Man Utd", "Chelsea", "Spurs",
        "Newcastle", "Aston Villa", "West Ham United", "Leeds", "Sunderland",
        "Burnley", "Sheffield United", "Wrexham", "Leicester City",
    ]
    for name in priority:
        if name not in team_names and name not in ALIAS:
            continue
        try:
            q = name.replace(" ", "%20")
            d = http_json(f"https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t={q}")
            teams = d.get("teams") or []
            if not teams:
                continue
            tid = teams[0]["idTeam"]
            pd = http_json(f"https://www.thesportsdb.com/api/v1/json/3/lookup_all_players.php?id={tid}")
            plist = pd.get("player") or []
            attackers = []
            creators = []
            defenders = []
            for p in plist:
                pos = (p.get("strPosition") or "").lower()
                entry = {
                    "name": p.get("strPlayer"),
                    "position": p.get("strPosition"),
                    "nationality": p.get("strNationality"),
                }
                if any(x in pos for x in ("forward", "striker", "attacker")):
                    attackers.append(entry)
                elif any(x in pos for x in ("midfield", "wing")):
                    creators.append(entry)
                elif any(x in pos for x in ("defen", "back", "goalkeeper")):
                    defenders.append(entry)
            players[name] = {
                "team": name,
                "source": "TheSportsDB",
                "topAttackers": attackers[:4],
                "creators": creators[:4],
                "defenders": defenders[:4],
                "penaltyTaker": attackers[0]["name"] if attackers else None,
            }
        except Exception as exc:  # noqa: BLE001
            print(f"player fetch skip {name}: {exc}")
    return players


def synthesize_players(profiles):
    """Deterministic role placeholders when live roster sparse — still metric-linked."""
    out = {}
    for name, p in profiles.items():
        seed = sum(ord(c) for c in name)
        xg = p["overall"]["xg_pg"]
        out[name] = {
            "team": name,
            "source": "AICCA role model (season-shot derived)",
            "topAttackers": [
                {
                    "name": f"{name} Lead Striker",
                    "role": "ST",
                    "xg90": round(xg * 0.38, 3),
                    "sot90": round(p["overall"]["sot_pg"] * 0.35, 2),
                },
                {
                    "name": f"{name} Second Forward",
                    "role": "CF/W",
                    "xg90": round(xg * 0.22, 3),
                    "sot90": round(p["overall"]["sot_pg"] * 0.22, 2),
                },
            ],
            "creators": [
                {
                    "name": f"{name} Key Creator",
                    "role": "AM/W",
                    "xa90": round(xg * 0.18, 3),
                    "chances90": round(1.2 + (seed % 10) / 10, 2),
                }
            ],
            "cardRisks": [
                {
                    "name": f"{name} Aggressive CB",
                    "role": "CB",
                    "fouls90": round(p["overall"]["fouls_pg"] * 0.28, 2),
                    "yellowRate": round(p["overall"]["yellows_pg"] * 0.3, 2),
                }
            ],
            "penaltyTaker": f"{name} Lead Striker",
            "setPieceTaker": f"{name} Key Creator",
        }
    return out


def write_js(path: Path, global_name: str, obj):
    path.write_text(f"window.{global_name} = {json.dumps(obj, indent=2)};\n", encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size} bytes, {len(obj)} keys)")


def main():
    matches = load_matches()
    print(f"loaded {len(matches)} matches")
    profiles = aggregate(matches)
    print(f"profiles {len(profiles)}")

    # Attach fixture coverage report
    fx = json.loads((ROOT / "data" / "fixtures.json").read_text())
    fx_teams = sorted(set(f["home"] for f in fx) | set(f["away"] for f in fx))
    missing = [t for t in fx_teams if t not in profiles]
    print(f"fixture teams covered {len(fx_teams)-len(missing)}/{len(fx_teams)}")
    if missing:
        print("missing:", ", ".join(missing))
        # Create minimal stubs for missing (e.g. York if not in CSV)
        for t in missing:
            profiles[t] = {
                "name": t,
                "csvName": None,
                "sourceSeason": "prior-tier-stub",
                "sourceLeague": "Unknown",
                "sourceDiv": None,
                "strength": 45,
                "overall": {
                    "played": 0, "ppg": 1.2, "gf_pg": 1.1, "ga_pg": 1.2,
                    "xg_pg": 1.05, "xga_pg": 1.15, "shots_pg": 11, "sot_pg": 3.5,
                    "shot_accuracy_pct": 32, "corners_for_pg": 4.5, "corners_ag_pg": 4.8,
                    "fouls_pg": 11, "fouls_drawn_pg": 11, "yellows_pg": 1.8, "reds_pg": 0.05,
                    "clean_sheet_pct": 25, "btts_pct": 52, "over25_pct": 50, "ht_lead_pct": 30,
                    "ppda_proxy": 11.5, "set_piece_threat": 0.54, "form_last10": "", "form_last5": "",
                    "avg_exchange_odds_when_backed": None,
                },
                "home": None,
                "away": None,
                "sources": ["stub — limited prior data"],
            }

    live_players = fetch_players_for_teams(set(profiles))
    synth = synthesize_players(profiles)
    # Merge: prefer live names onto synth metrics
    for team, live in live_players.items():
        if team not in synth:
            continue
        if live.get("topAttackers"):
            for i, a in enumerate(live["topAttackers"][:2]):
                if i < len(synth[team]["topAttackers"]):
                    synth[team]["topAttackers"][i]["name"] = a["name"]
                    synth[team]["topAttackers"][i]["nationality"] = a.get("nationality")
        if live.get("creators"):
            synth[team]["creators"][0]["name"] = live["creators"][0]["name"]
        if live.get("penaltyTaker"):
            synth[team]["penaltyTaker"] = live["penaltyTaker"]
        synth[team]["source"] = "TheSportsDB roster + football-data metrics"

    meta = {
        "generatedFrom": ["football-data.co.uk 2025-26 (+2024-25 fallback)", "TheSportsDB players"],
        "xgModel": "SOT*0.32 + (shots-SOT)*0.05 per game",
        "ppdaModel": "opp_shots*18 / fouls (pressing proxy)",
        "teamCount": len(profiles),
    }

    payload = {"meta": meta, "teams": profiles}
    write_js(OUT_STATS, "AICCA_TEAM_STATS", payload)
    OUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    write_js(OUT_PLAYERS, "AICCA_PLAYERS", synth)
    OUT_PLAYERS_JSON.write_text(json.dumps(synth, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
