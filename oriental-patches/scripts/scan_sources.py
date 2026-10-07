#!/usr/bin/env python3
"""Rescan configured public sources for candidate oriental patches.

This is a lightweight, dependency-free scanner: it fetches each page in
``sources.json``, pulls out links whose text or URL matches one of that
source's keywords, and skips anything already present in
``data/patches.json`` (by URL). The result is a list of *candidates* for
``merge_patches.py`` — not a final, curated catalog — so a human or an
agent should still sanity-check titles, subtypes, and dates before they
land in the published data.

Usage:
  python3 scripts/scan_sources.py                  # print candidates JSON
  python3 scripts/scan_sources.py --out out.json   # write to a file
  python3 scripts/scan_sources.py --verbose         # progress on stderr
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "scripts" / "sources.json"
DATA_PATH = ROOT / "data" / "patches.json"
DEFAULT_SUBTYPE = "Ethnic / World"
REQUEST_TIMEOUT = 20
USER_AGENT = (
    "Mozilla/5.0 (compatible; OrientalPatchesBot/1.0; "
    "+https://github.com/hmadfai/Dr_h)"
)

LINK_RE = re.compile(
    r'<a\b[^>]*\bhref=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL
)
TAG_RE = re.compile(r"<[^>]+>")
SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "#")
SKIP_HOST_FRAGMENTS = (
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "linkedin.com",
    "pinterest.com",
    "wa.me",
)


def log(msg: str, verbose: bool) -> None:
    if verbose:
        print(msg, file=sys.stderr)


def fetch(url: str, verbose: bool) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.read().decode(charset, errors="replace")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        log(f"  ! failed to fetch {url}: {exc}", verbose)
        return None


def clean_text(html_fragment: str) -> str:
    text = TAG_RE.sub(" ", html_fragment)
    text = text.replace("&amp;", "&").replace("&nbsp;", " ")
    text = text.replace("&#8217;", "'").replace("&#039;", "'")
    return re.sub(r"\s+", " ", text).strip()


def slugify(title: str, url: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    if not base:
        base = re.sub(r"[^a-z0-9]+", "-", urlparse(url).path.lower()).strip("-")
    base = re.sub(r"-{2,}", "-", base)
    return (base or "scan-candidate")[:60].strip("-")


def extract_links(html: str, base_url: str) -> list[tuple[str, str]]:
    links = []
    for href, inner_html in LINK_RE.findall(html):
        href = href.strip()
        if not href or href.startswith(SKIP_SCHEMES):
            continue
        absolute = urljoin(base_url, href)
        host = urlparse(absolute).netloc.lower()
        if any(frag in host for frag in SKIP_HOST_FRAGMENTS):
            continue
        text = clean_text(inner_html)
        links.append((absolute, text))
    return links


GENERIC_LABELS = {
    "home", "shop", "store", "blog", "news", "about", "about us", "contact",
    "contact us", "cart", "checkout", "login", "log in", "sign in", "register",
    "my account", "search", "products", "product", "menu", "faq", "support",
    "privacy policy", "terms", "terms of service", "sitemap", "read more",
    "learn more", "click here", "view all", "see more", "next", "previous",
    "last post", "rss", "reply", "quote", "new topic", "post reply",
    "permalink", "share", "print",
}
SKIP_URL_FRAGMENTS = ("type=rss", "/rss", "feed=rss", ".rss", "/feed")


def matches_keywords(url: str, text: str, keywords: list[str]) -> bool:
    # Match against the path/query (not the domain) plus the link text, so a
    # keyword that happens to be a substring of the source's own domain
    # (e.g. "kelfar" in kelfar.net) doesn't make every nav link on that
    # domain look relevant. Use word boundaries so short keywords like "oud"
    # or "nay" don't match inside unrelated words (e.g. "CloudTech").
    parsed = urlparse(url)
    haystack = f"{parsed.path.replace('-', ' ').replace('/', ' ')} {parsed.query} {text}".lower()
    if text.strip().lower() in GENERIC_LABELS:
        return False
    for kw in keywords:
        pattern = r"\b" + re.escape(kw.lower()) + r"\b"
        if re.search(pattern, haystack):
            return True
    return False


def vendor_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    host = host[4:] if host.startswith("www.") else host
    return host


def load_existing_urls() -> set[str]:
    if not DATA_PATH.exists():
        return set()
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return {p.get("url") for p in data.get("patches", []) if p.get("url")}


def scan(sources: list[dict], verbose: bool) -> list[dict]:
    existing_urls = load_existing_urls()
    today = datetime.now(timezone.utc).date().isoformat()
    seen_in_run: set[str] = set()
    candidates: list[dict] = []

    for source in sources:
        name = source["name"]
        url = source["url"]
        keyboard = source["keyboard"]
        keywords = source.get("keywords", [])
        log(f"Scanning {name} ({url})", verbose)

        html = fetch(url, verbose)
        if html is None:
            continue

        source_root = url.rstrip("/")
        links = extract_links(html, url)
        hits = 0
        for link_url, link_text in links:
            if link_url.rstrip("/") == source_root:
                continue
            if link_url in existing_urls or link_url in seen_in_run:
                continue
            if any(frag in link_url.lower() for frag in SKIP_URL_FRAGMENTS):
                continue
            if not link_text or len(link_text) < 3:
                continue
            if not matches_keywords(link_url, link_text, keywords):
                continue

            seen_in_run.add(link_url)
            hits += 1
            candidates.append(
                {
                    "id": slugify(link_text, link_url),
                    "title": link_text[:120],
                    "keyboard": keyboard,
                    "subtype": DEFAULT_SUBTYPE,
                    "issued_on": None,
                    "vendor": vendor_from_url(link_url),
                    "price": None,
                    "url": link_url,
                    "description": (
                        f"Auto-detected by weekly scan on {name}. "
                        "Needs review: confirm subtype, issue date, and relevance."
                    ),
                    "source": name,
                    "found_on": today,
                    "tags": ["needs-review", "auto-scan"],
                }
            )
        log(f"  -> {hits} new candidate link(s)", verbose)

    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", help="Write candidates JSON to this path instead of stdout")
    parser.add_argument("--verbose", action="store_true", help="Log progress to stderr")
    args = parser.parse_args()

    config = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    candidates = scan(config.get("sources", []), args.verbose)

    payload = json.dumps(candidates, indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(payload + "\n", encoding="utf-8")
        log(f"Wrote {len(candidates)} candidate(s) to {args.out}", True)
    else:
        print(payload)

    log(f"Total new candidates: {len(candidates)}", args.verbose)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
