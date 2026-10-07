#!/usr/bin/env python3
"""Validate oriental-patches/data/patches.json schema and uniqueness."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "patches.json"
REQUIRED = ("id", "title", "keyboard", "subtype", "url")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main() -> int:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []

    for key in ("schema_version", "updated_at", "keyboards", "subtypes", "patches"):
        if key not in data:
            errors.append(f"catalog missing top-level key: {key}")

    keyboards = set(data.get("keyboards") or [])
    subtypes = set(data.get("subtypes") or [])
    seen_ids: set[str] = set()
    seen_urls: set[str] = set()

    for i, patch in enumerate(data.get("patches") or []):
        prefix = f"patches[{i}]"
        for key in REQUIRED:
            if not patch.get(key):
                errors.append(f"{prefix}: missing {key}")
        pid = patch.get("id")
        if pid:
            if not ID_RE.match(pid):
                errors.append(f"{prefix}: invalid id {pid!r}")
            if pid in seen_ids:
                errors.append(f"{prefix}: duplicate id {pid}")
            seen_ids.add(pid)
        url = patch.get("url")
        if url:
            if url in seen_urls:
                errors.append(f"{prefix}: duplicate url {url}")
            seen_urls.add(url)
        if patch.get("keyboard") not in keyboards:
            errors.append(f"{prefix}: keyboard not in catalog.keyboards")
        if patch.get("subtype") not in subtypes:
            errors.append(f"{prefix}: subtype not in catalog.subtypes")
        for date_key in ("issued_on", "found_on"):
            value = patch.get(date_key)
            if value is not None and not DATE_RE.match(str(value)):
                errors.append(f"{prefix}: {date_key} must be YYYY-MM-DD or null")

    if errors:
        print("INVALID")
        for err in errors:
            print(f"- {err}")
        return 1

    print(f"OK: {len(data['patches'])} patches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
