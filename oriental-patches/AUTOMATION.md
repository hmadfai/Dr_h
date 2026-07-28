# Weekly Oriental Patches Automation

Cursor cannot register a recurring Automation from this repository via API.
Create the schedule once in the UI, then point it at this prompt.

## Create the Automation

1. Open [cursor.com/automations/new](https://cursor.com/automations/new)
2. Trigger: **Scheduled** — weekly cron, e.g. `0 9 * * 1` (Mondays 09:00 UTC)
3. Repository: attach **this repo** (`hmadfai/Dr_h`)
4. Tools: enable web/browser access and **pull request creation**
5. Paste the prompt below and activate

## Automation prompt

```text
You maintain the Oriental Patches catalog in this repository.

## Goal
Every run, search the public web for new or updated oriental / Middle Eastern / Arabic / Turkish / Persian sound patches, libraries, and preset packs for these keyboards only:
- Korg Kronos (and NAUTILUS libraries that also target Kronos)
- Nord Stage 4
- Yamaha Montage (including Motif XF/MOXF libraries that Montage can load)

## Where to look
Search vendor shops, manufacturer news, and reputable marketplaces. Prioritize:
- kelfar.net, korg.shop, korg.com news
- norduserforum.com, synth-sound.com, synthonia.com and other Nord Stage 4 preset sellers
- yamahasynth.com, yamaha.com Montage/Motif compatibility pages, Montage/MODX library vendors
- Google/Bing queries like:
  "Kronos Arabic library", "Kronos Sha'bi", "Nord Stage 4 oriental pack",
  "Montage Middle Eastern library", "Motif XF Arabic X3A"

## Data rules
1. Read `oriental-patches/data/patches.json` first.
2. Only include patches that are clearly relevant to oriental / Middle Eastern musical use.
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
