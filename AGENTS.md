# AGENTS.md

## Oriental Patches weekly agent

This repository contains an **Oriental Patches** catalog under `oriental-patches/`.

### Purpose
Find and maintain oriental / Middle Eastern sound patches for:
- Korg Kronos
- Nord Stage 4
- Yamaha Montage

### Important paths
- Catalog data: `oriental-patches/data/patches.json`
- Filterable UI: `oriental-patches/web/`
- Merge tool: `oriental-patches/scripts/merge_patches.py`
- Validator: `oriental-patches/scripts/validate_patches.py`
- Automation setup: `oriental-patches/AUTOMATION.md`

### When updating the catalog
1. Search reputable public sources only.
2. Merge via `python3 oriental-patches/scripts/merge_patches.py`.
3. Validate via `python3 oriental-patches/scripts/validate_patches.py`.
4. Open a PR only when patches were added or updated.

### UI constraint
The web table must remain sliceable by **keyboard**, **date of issue**, and **subtype**.
