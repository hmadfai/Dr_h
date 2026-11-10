#!/usr/bin/env python3
"""Merge candidate oriental-patch records into data/patches.json.

Usage:
  python3 scripts/merge_patches.py candidates.json
  python3 scripts/merge_patches.py --stdin < candidates.json

Candidates may be:
  - a JSON array of patch objects
  - an object with a "patches" array
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "patches.json"

REQUIRED = ("id", "title", "keyboard", "subtype", "url")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def normalize_candidates(raw) -> list[dict]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict) and isinstance(raw.get("patches"), list):
        return raw["patches"]
    raise ValueError("Candidates must be a list or an object with a patches array")


def validate_patch(patch: dict, catalog: dict) -> list[str]:
    errors = []
    for key in REQUIRED:
        if not patch.get(key):
            errors.append(f"missing required field: {key}")
    pid = patch.get("id")
    if pid and not ID_RE.match(pid):
        errors.append(f"id must be kebab-case: {pid}")
    if patch.get("keyboard") and patch["keyboard"] not in catalog["keyboards"]:
        errors.append(f"unknown keyboard: {patch.get('keyboard')}")
    if patch.get("subtype") and patch["subtype"] not in catalog["subtypes"]:
        errors.append(f"unknown subtype: {patch.get('subtype')}")
    return errors


def merge(catalog: dict, candidates: list[dict]) -> tuple[dict, dict]:
    by_id = {p["id"]: dict(p) for p in catalog.get("patches", [])}
    by_url = {p.get("url"): p["id"] for p in by_id.values() if p.get("url")}

    stats = {"added": 0, "updated": 0, "skipped": 0, "errors": []}

    for cand in candidates:
        errors = validate_patch(cand, catalog)
        if errors:
            stats["errors"].append({"id": cand.get("id"), "errors": errors})
            stats["skipped"] += 1
            continue

        pid = cand["id"]
        url = cand["url"]
        if pid not in by_id and url in by_url:
            # Same URL under a new id → update existing record instead of duplicating
            pid = by_url[url]
            cand = {**cand, "id": pid}

        existing = by_id.get(pid)
        if existing is None:
            record = {
                "id": pid,
                "title": cand["title"],
                "keyboard": cand["keyboard"],
                "subtype": cand["subtype"],
                "issued_on": cand.get("issued_on"),
                "vendor": cand.get("vendor"),
                "price": cand.get("price"),
                "url": url,
                "description": cand.get("description") or "",
                "source": cand.get("source") or "",
                "found_on": cand.get("found_on")
                or datetime.now(timezone.utc).date().isoformat(),
                "tags": sorted(set(cand.get("tags") or [])),
            }
            by_id[pid] = record
            by_url[url] = pid
            stats["added"] += 1
            continue

        changed = False
        for key in (
            "title",
            "keyboard",
            "subtype",
            "issued_on",
            "vendor",
            "price",
            "url",
            "description",
            "source",
        ):
            if key in cand and cand[key] not in (None, "") and cand[key] != existing.get(key):
                existing[key] = cand[key]
                changed = True
        if cand.get("tags"):
            merged_tags = sorted(set(existing.get("tags") or []) | set(cand["tags"]))
            if merged_tags != existing.get("tags"):
                existing["tags"] = merged_tags
                changed = True
        if changed:
            stats["updated"] += 1
        else:
            stats["skipped"] += 1

    patches = sorted(
        by_id.values(),
        key=lambda p: (
            p.get("issued_on") or "",
            p.get("keyboard") or "",
            p.get("title") or "",
        ),
        reverse=True,
    )
    catalog["patches"] = patches
    catalog["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    return catalog, stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidates", nargs="?", help="Path to candidates JSON")
    parser.add_argument("--stdin", action="store_true", help="Read candidates from stdin")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and report without writing",
    )
    args = parser.parse_args()

    if args.stdin or args.candidates in (None, "-"):
        raw = json.load(sys.stdin)
    else:
        raw = load_json(Path(args.candidates))

    candidates = normalize_candidates(raw)
    catalog = load_json(DATA_PATH)
    merged, stats = merge(catalog, candidates)

    print(json.dumps(stats, indent=2))
    if stats["errors"]:
        print("Validation errors present; refusing to write.", file=sys.stderr)
        return 1

    if args.dry_run:
        print("Dry run: no files written.")
        return 0

    DATA_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {DATA_PATH} ({len(merged['patches'])} patches).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
