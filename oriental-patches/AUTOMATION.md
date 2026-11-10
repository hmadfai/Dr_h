# Weekly patch-catalog automation

There are two complementary ways this catalog stays fresh:

1. **GitHub Actions scan** (`.github/workflows/oriental-patches-scan.yml`) —
   already wired up, runs automatically every Monday, and can be triggered
   on demand from the **Rescan now** button in the web UI. It runs
   `scripts/scan_sources.py`, a lightweight regex-based link scraper over a
   short list of known vendor pages (`scripts/sources.json`), merges any new
   links it finds, and opens a PR tagged `needs-review` for a human (or the
   next agent run) to curate.
2. **Cursor Automation** (optional, manual setup) — a smarter, LLM-driven
   weekly web search that can find patches the lightweight scanner can't
   (JS-rendered sites, search engines, new vendors). Cursor can't register
   this on a schedule via API, so set it up once in the UI if you want it.

## Option 1: Rescan now (already working)

- Open the catalog and click **Rescan now** → **Open on GitHub → Run
  workflow** (needs write access to the repo), or
- Use the **advanced** panel to paste a GitHub token (scope: classic `repo`,
  or fine-grained `Actions: Read and write` limited to this repo) and
  trigger it directly from the page. The token is stored only in your
  browser's local storage and sent only to `api.github.com`.
- Or run it locally:

  ```bash
  cd oriental-patches
  python3 scripts/scan_sources.py --verbose --out /tmp/candidates.json
  python3 scripts/merge_patches.py /tmp/candidates.json
  python3 scripts/validate_patches.py
  ```

Scanner limitations: it only reads plain HTML (no JS rendering), and a few
sites block generic bots (Synthonia, SonicWire's search, korg.shop all 403
or redirect-loop against it) — see the `_comment` in `sources.json`. Results
are tagged `needs-review` / `auto-scan`; review before trusting them fully.

## Option 2: Cursor Automation (optional, for deeper weekly search)

## Create the Automation

1. Open [cursor.com/automations/new](https://cursor.com/automations/new)
2. Trigger: **Scheduled** — weekly cron, e.g. `0 9 * * 1` (Mondays 09:00 UTC)
3. Repository: attach **this repo** (`hmadfai/Dr_h`)
4. Tools: enable web/browser access and **pull request creation**
5. Paste the prompt below and activate

## Automation prompt

```text
You maintain the keyboard patch catalog in this repository (`oriental-patches/`).

## Goal
Every run, search the public web for new or updated sound libraries and preset packs for these keyboards only:
- Korg Kronos (and NAUTILUS libraries that also target Kronos)
- Nord Stage 4
- Yamaha Montage (including Motif XF/MOXF libraries that Montage can load)
- Moog Muse

Include every musical style: keys, organ, guitar, synth, bass, leads, brass, strings, percussion, pop and covers, cinematic, factory banks, and oriental / Middle Eastern libraries. Do not drop a pack because it is not oriental.

## Where to look
Search vendor shops, manufacturer news, and reputable marketplaces. Prioritize:
- kelfar.net, korg.shop, korg.com news
- nordkeyboards.com/sounds, synth-sound.com, synthonia.com
- usa.yamaha.com Montage sound library, yamahamusicsoft.com, yamahasynth.com
- moogmusic.com/downloads (product=Muse), luftrum.com, limbicbits.com, sounds-for-synths.com, antonanru.sellfy.store
- Google/Bing queries like:
  "Kronos sound library", "Nord Stage 4 sound bank", "Montage expansion library",
  "Moog Muse preset pack"

## Data rules
1. Read `oriental-patches/data/patches.json` first.
2. Include any real patch or sample library for the four keyboards. Skip hardware accessories, tuning boxes, and store chrome (cart, account, store locator).
3. Use exact keyboard names from `keyboards` and subtypes from `subtypes`. If a new subtype is truly needed, add it to `subtypes` first.
4. Each patch needs: id (kebab-case), title, keyboard, subtype, url, issued_on (YYYY-MM-DD or null), vendor, price (string or null), description, source, found_on (today UTC), tags.
5. Deduplicate by `id` and `url`. Prefer updating an existing record over adding a near-duplicate.
6. Write candidates to a temp JSON file, then run:
   `python3 oriental-patches/scripts/merge_patches.py <candidates.json>`
   `python3 oriental-patches/scripts/validate_patches.py`
7. If validation fails, fix the data before finishing.

## Output / PR policy
- If nothing new or changed: do not open a PR. Leave a short run summary saying no updates.
- If data changed: open a PR titled `chore(oriental-patches): weekly catalog update YYYY-MM-DD` summarizing added/updated entries.
- Do not invent prices, dates, or product claims. Prefer null / Unknown over guessing.
- Do not scrape behind logins or paywalls; public pages only.
- Keep the filterable web UI working (`oriental-patches/web/`).
```

## Local preview

```bash
cd oriental-patches
python3 -m http.server 8080
# open http://localhost:8080/web/
```
