# Oriental Patches

Weekly-updated catalog of oriental / Middle Eastern sound patches for:

- **Korg Kronos**
- **Nord Stage 4**
- **Yamaha Montage**

## Browse

```bash
cd oriental-patches
python3 -m http.server 8080
```

Open [http://localhost:8080/web/](http://localhost:8080/web/).

Filter the table by keyboard, issue date range, and subtype. Sort columns by clicking headers.

## Data

`data/patches.json` is the source of truth. Weekly agent runs merge new findings into this file.

```bash
python3 scripts/validate_patches.py
python3 scripts/merge_patches.py candidates.json
```

## Rescan / weekly automation

A GitHub Actions workflow (`.github/workflows/oriental-patches-scan.yml`)
already scans public sources every Monday and opens a PR with anything new.
Click **Rescan now** in the web UI to trigger it on demand, or run it
locally:

```bash
python3 scripts/scan_sources.py --verbose --out /tmp/candidates.json
python3 scripts/merge_patches.py /tmp/candidates.json
python3 scripts/validate_patches.py
```

See [`AUTOMATION.md`](./AUTOMATION.md) for details, limitations, and an
optional Cursor Automation prompt for deeper, LLM-driven weekly search.
