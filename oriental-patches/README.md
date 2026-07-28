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

## Weekly automation

See [`AUTOMATION.md`](./AUTOMATION.md) for the Cursor Automation prompt and setup steps.
A cloud agent cannot create the recurring schedule itself — activate it once at [cursor.com/automations/new](https://cursor.com/automations/new).
