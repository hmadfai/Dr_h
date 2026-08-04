#!/usr/bin/env python3
"""Generate AICCA's complete 2026-27 English league fixture dataset.

The checked-in CSV snapshots are the source of truth, so normal generation is
deterministic and does not require network access.  Pass ``--refresh-sources``
to replace those snapshots from Fixture Download's 2026-27 JSON feeds after
validating their shape, fixture counts, teams, rounds, and stadiums.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import tempfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "source"
JSON_PATH = ROOT / "data" / "fixtures.json"
JS_PATH = ROOT / "data" / "fixtures.js"
TOTAL_FIXTURES = 2_036


@dataclass(frozen=True)
class League:
    name: str
    code: str
    id_prefix: str
    source_name: str
    feed_slug: str
    rounds: int
    teams: int

    @property
    def expected_count(self) -> int:
        return self.rounds * (self.teams // 2)

    @property
    def source_path(self) -> Path:
        return SOURCE_DIR / self.source_name


LEAGUES = (
    League("Premier League", "PL", "pl", "premier-league.csv", "epl-2026", 38, 20),
    League("Championship", "CH", "ch", "championship.csv", "championship-2026", 46, 24),
    League("League One", "L1", "l1", "league-one.csv", "efl-league-one-2026", 46, 24),
    League("League Two", "L2", "l2", "league-two.csv", "efl-league-two-2026", 46, 24),
)


# The names match the fixture matrix exactly. Sponsorship names are retained
# where they are the stadium names published with the 2026-27 fixtures.
STADIUMS = {
    "AFC Wimbledon": "The Cherry Red Records Stadium",
    "Accrington Stanley": "Wham Stadium",
    "Arsenal": "Emirates Stadium",
    "Aston Villa": "Villa Park",
    "Barnet": "The Hive Stadium",
    "Barnsley": "Oakwell",
    "Birmingham City": "St. Andrew's @ Knighthead Park",
    "Blackburn Rovers": "Ewood Park",
    "Blackpool": "Bloomfield Road",
    "Bolton Wanderers": "Toughsheet Community Stadium",
    "Bournemouth": "Vitality Stadium",
    "Bradford City": "Mbanq Valley Parade",
    "Brentford": "Gtech Community Stadium",
    "Brighton": "American Express Stadium",
    "Bristol City": "Ashton Gate Stadium",
    "Bristol Rovers": "Memorial Stadium",
    "Bromley": "Copperjax Community Stadium",
    "Burnley": "Turf Moor",
    "Burton Albion": "Pirelli Stadium",
    "Cambridge United": "Cledara Abbey Stadium",
    "Cardiff City": "Cardiff City Stadium",
    "Charlton Athletic": "The Valley",
    "Chelsea": "Stamford Bridge",
    "Cheltenham Town": "EV Charger Points Stadium",
    "Chesterfield": "SMH Group Stadium",
    "Colchester United": "JobServe Community Stadium",
    "Coventry": "Coventry Building Society Arena",
    "Crawley Town": "Broadfield Stadium",
    "Crewe Alexandra": "Mornflake Stadium",
    "Crystal Palace": "Selhurst Park",
    "Derby County": "Pride Park Stadium",
    "Doncaster Rovers": "Club Doncaster Sports Village",
    "Everton": "Hill Dickinson Stadium",
    "Exeter City": "St James Park",
    "Fleetwood Town": "Highbury Stadium",
    "Fulham": "Craven Cottage",
    "Gillingham": "Priestfield Stadium",
    "Grimsby Town": "Blundell Park",
    "Huddersfield Town": "Accu Stadium",
    "Hull": "MKM Stadium",
    "Ipswich": "Portman Road",
    "Leeds": "Elland Road",
    "Leicester City": "King Power Stadium",
    "Leyton Orient": "BetWright Stadium",
    "Lincoln City": "LNER Stadium",
    "Liverpool": "Anfield",
    "Luton Town": "Kenilworth Road",
    "MK Dons": "Stadium MK",
    "Man City": "Etihad Stadium",
    "Man Utd": "Old Trafford",
    "Mansfield Town": "One Call Stadium",
    "Middlesbrough": "Riverside Stadium",
    "Millwall": "The Den",
    "Newcastle": "St. James' Park",
    "Newport County": "Rodney Parade",
    "Northampton Town": "Sixfields Stadium",
    "Norwich City": "Carrow Road",
    "Nott'm Forest": "The City Ground",
    "Notts County": "Meadow Lane",
    "Oldham Athletic": "Boundary Park",
    "Oxford United": "The Kassam Stadium",
    "Peterborough United": "Weston Homes Stadium",
    "Plymouth Argyle": "Home Park",
    "Port Vale": "Vale Park",
    "Portsmouth": "Fratton Park",
    "Preston North End": "Deepdale",
    "Queens Park Rangers": "MATRADE Loftus Road",
    "Reading": "Select Car Leasing Stadium",
    "Rochdale": "Crown Oil Arena",
    "Rotherham United": "AESSEAL New York Stadium",
    "Salford City": "AIG Stadium",
    "Sheffield United": "Bramall Lane",
    "Sheffield Wednesday": "Hillsborough",
    "Shrewsbury Town": "The Croud Meadow",
    "Southampton": "St. Mary's Stadium",
    "Spurs": "Tottenham Hotspur Stadium",
    "Stevenage": "Stevenage FC Stadium",
    "Stockport County": "Edgeley Park",
    "Stoke City": "bet365 Stadium",
    "Sunderland": "Stadium of Light",
    "Swansea City": "Swansea.com Stadium",
    "Swindon Town": "The Nigel Eady County Ground",
    "Tranmere Rovers": "Prenton Park",
    "Walsall": "Pallet-Track Bescot Stadium",
    "Watford": "Vicarage Road",
    "West Bromwich Albion": "The Hawthorns",
    "West Ham United": "London Stadium",
    "Wigan Athletic": "The Brick Community Stadium",
    "Wolverhampton Wanderers": "Molineux Stadium",
    "Wrexham": "Racecourse Ground",
    "Wycombe Wanderers": "Adams Park",
    "York City": "LNER Community Stadium",
}


def normalize_date(value: str) -> str:
    """Normalize ISO and DD/MM/YYYY fixture dates to YYYY-MM-DD."""
    date_part = value.strip().split()[0]
    for date_format in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_part, date_format).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Unsupported fixture date: {value!r}")


def validate_rows(league: League, rows: list[dict[str, Any]]) -> set[str]:
    if len(rows) != league.expected_count:
        raise ValueError(
            f"{league.name}: expected {league.expected_count} fixtures, got {len(rows)}"
        )

    rounds = Counter(int(row["round"]) for row in rows)
    expected_rounds = set(range(1, league.rounds + 1))
    if set(rounds) != expected_rounds:
        raise ValueError(f"{league.name}: rounds are incomplete")
    expected_per_round = league.teams // 2
    if any(count != expected_per_round for count in rounds.values()):
        raise ValueError(f"{league.name}: one or more rounds have the wrong fixture count")

    teams = {str(row["home"]) for row in rows} | {str(row["away"]) for row in rows}
    if len(teams) != league.teams:
        raise ValueError(f"{league.name}: expected {league.teams} teams, got {len(teams)}")
    missing_stadiums = teams - STADIUMS.keys()
    if missing_stadiums:
        raise ValueError(f"{league.name}: stadiums missing for {sorted(missing_stadiums)}")

    directed_pairs = Counter((str(row["home"]), str(row["away"])) for row in rows)
    if any(home == away for home, away in directed_pairs):
        raise ValueError(f"{league.name}: self fixture found")
    if len(directed_pairs) != league.expected_count or set(directed_pairs.values()) != {1}:
        raise ValueError(f"{league.name}: duplicate directed fixture found")

    appearances = Counter()
    home_counts = Counter()
    away_counts = Counter()
    for row in rows:
        home = str(row["home"])
        away = str(row["away"])
        appearances[home] += 1
        appearances[away] += 1
        home_counts[home] += 1
        away_counts[away] += 1
        normalize_date(str(row["date"]))
        if (away, home) not in directed_pairs:
            raise ValueError(f"{league.name}: reverse fixture missing for {home} vs {away}")

    games_per_team = (league.teams - 1) * 2
    home_or_away_games = league.teams - 1
    for team in teams:
        if appearances[team] != games_per_team:
            raise ValueError(f"{league.name}: {team} has {appearances[team]} fixtures")
        if home_counts[team] != home_or_away_games or away_counts[team] != home_or_away_games:
            raise ValueError(f"{league.name}: {team} has an invalid home/away split")
    return teams


def read_source(league: League) -> list[dict[str, Any]]:
    if not league.source_path.exists():
        raise FileNotFoundError(
            f"Missing {league.source_path}; run this script with --refresh-sources"
        )
    with league.source_path.open(newline="", encoding="utf-8") as source_file:
        reader = csv.DictReader(source_file)
        if reader.fieldnames != ["round", "date", "home", "away"]:
            raise ValueError(f"{league.source_path}: unexpected CSV columns")
        rows = list(reader)
    validate_rows(league, rows)
    return rows


def download_source(league: League) -> list[dict[str, Any]]:
    url = f"https://fixturedownload.com/feed/json/{league.feed_slug}"
    request = Request(url, headers={"User-Agent": "AICCA fixture generator/1.0"})
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        raise ValueError(f"{league.name}: fixture feed did not return a JSON array")

    rows: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            raise ValueError(f"{league.name}: fixture feed contains a non-object")
        home = str(item["HomeTeam"])
        venue = str(item["Location"])
        if home not in STADIUMS or venue != STADIUMS[home]:
            raise ValueError(
                f"{league.name}: unexpected venue {venue!r} for {home!r}"
            )
        rows.append(
            {
                "round": int(item["RoundNumber"]),
                "date": normalize_date(str(item["DateUtc"])),
                "home": home,
                "away": str(item["AwayTeam"]),
            }
        )
    validate_rows(league, rows)
    return rows


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as temporary_file:
        temporary_file.write(content)
        temporary_path = Path(temporary_file.name)
    temporary_path.replace(path)


def write_source(league: League, rows: Iterable[dict[str, Any]]) -> None:
    league.source_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="", dir=league.source_path.parent, delete=False
    ) as temporary_file:
        writer = csv.DictWriter(
            temporary_file, fieldnames=["round", "date", "home", "away"]
        )
        writer.writeheader()
        writer.writerows(rows)
        temporary_path = Path(temporary_file.name)
    temporary_path.replace(league.source_path)


def refresh_sources() -> None:
    downloaded = {league: download_source(league) for league in LEAGUES}
    all_teams = set().union(
        *(validate_rows(league, rows) for league, rows in downloaded.items())
    )
    if all_teams != STADIUMS.keys():
        raise ValueError("Stadium map does not exactly match the 92 fixture teams")
    for league, rows in downloaded.items():
        write_source(league, rows)


def build_fixtures() -> list[dict[str, Any]]:
    fixtures: list[dict[str, Any]] = []
    all_teams: set[str] = set()
    for league in LEAGUES:
        rows = read_source(league)
        all_teams.update(validate_rows(league, rows))
        round_indexes: Counter[int] = Counter()
        for row in rows:
            round_number = int(row["round"])
            fixture_index = round_indexes[round_number]
            round_indexes[round_number] += 1
            home = str(row["home"])
            away = str(row["away"])
            fixtures.append(
                {
                    "id": f"{league.id_prefix}-{round_number}-{fixture_index}",
                    "league": league.name,
                    "leagueCode": league.code,
                    "round": round_number,
                    "date": normalize_date(str(row["date"])),
                    "home": home,
                    "away": away,
                    "match": f"{home} vs {away}",
                    "venue": STADIUMS[home],
                    "status": "scheduled",
                    "lastValidated": None,
                }
            )

    if all_teams != STADIUMS.keys():
        raise ValueError("Stadium map does not exactly match the 92 fixture teams")
    if len(fixtures) != TOTAL_FIXTURES:
        raise ValueError(f"Expected {TOTAL_FIXTURES} fixtures, got {len(fixtures)}")
    ids = [fixture["id"] for fixture in fixtures]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate fixture IDs generated")
    return fixtures


def write_outputs(fixtures: list[dict[str, Any]]) -> None:
    json_text = json.dumps(fixtures, ensure_ascii=False, indent=2) + "\n"
    atomic_write_text(JSON_PATH, json_text)
    atomic_write_text(JS_PATH, f"window.AICCA_FIXTURES = {json_text.rstrip()};\n")


def print_summary(fixtures: list[dict[str, Any]]) -> None:
    counts = Counter(fixture["league"] for fixture in fixtures)
    for league in LEAGUES:
        actual = counts[league.name]
        if actual != league.expected_count:
            raise ValueError(
                f"{league.name}: expected {league.expected_count}, generated {actual}"
            )
        print(f"{league.name}: {actual}")
    print(f"Total: {len(fixtures)}")
    print(f"JavaScript: {JS_PATH}")
    print(f"JSON: {JSON_PATH}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh-sources",
        action="store_true",
        help="refresh checked-in CSV snapshots from the validated 2026-27 feeds",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.refresh_sources:
        refresh_sources()
    fixtures = build_fixtures()
    write_outputs(fixtures)
    print_summary(fixtures)


if __name__ == "__main__":
    main()
