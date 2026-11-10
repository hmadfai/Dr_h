# AGENTS.md

## Keyboard Patches weekly agent

This repository contains a patch catalog under `oriental-patches/` (the folder name is historical).

### Purpose
Find and maintain sound libraries and preset packs of every style for:
- Korg Kronos
- Nord Stage 4
- Yamaha Montage
- Moog Muse

Oriental and Middle Eastern libraries stay in the catalog. They are one subtype group, not the whole catalog. Filter them with subtype, and filter any instrument with keyboard.

### Important paths
- Catalog data: `oriental-patches/data/patches.json`
- Filterable UI: `oriental-patches/web/` (includes a **Rescan now** button)
- Lightweight scanner: `oriental-patches/scripts/scan_sources.py` + `sources.json`
- Merge tool: `oriental-patches/scripts/merge_patches.py`
- Validator: `oriental-patches/scripts/validate_patches.py`
- Scheduled + on-demand workflow: `.github/workflows/oriental-patches-scan.yml`
- Automation setup (incl. optional Cursor Automation): `oriental-patches/AUTOMATION.md`

### When updating the catalog
1. Search reputable public sources only.
2. Merge via `python3 oriental-patches/scripts/merge_patches.py`.
3. Validate via `python3 oriental-patches/scripts/validate_patches.py`.
4. Open a PR only when patches were added or updated.

### UI constraint
The web table must remain sliceable by **keyboard**, **date of issue**, and **subtype**.
