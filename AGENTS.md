# AGENTS

## Cursor Cloud specific instructions

This repo is a minimal Python data-science project. Its only "application" is the
Jupyter notebook `Simulated Time Series.ipynb`, which simulates a SARIMA time series
(via `statsmodels`) and plots it with `matplotlib`.

### Environment
- Python dependencies are installed into a virtualenv at `.venv` (created during setup).
  Use `.venv/bin/python`, `.venv/bin/pip`, and `.venv/bin/jupyter`, or `source .venv/bin/activate`.
- The startup update script keeps `.venv` in sync with `requirements.txt`.
- `python3-venv` is a system package required to create the venv; it is not part of the
  update script. If the venv is missing on a fresh machine, install `python3.12-venv` first.

### Run the app
- Interactive dev server: `.venv/bin/jupyter lab --no-browser --ip=127.0.0.1 --port=8888`
  (serves notebooks from the repo root).
- Headless execution (good for verification/CI):
  `.venv/bin/jupyter nbconvert --to notebook --execute "Simulated Time Series.ipynb" --output /tmp/executed.ipynb`

### Tests / lint
- There are no automated tests and no lint configuration in this repo.

### Notes
- `README.md` and `EDA/readme.md` are placeholder/junk content, not real docs.
- `requirements.txt` originally contained junk lines (`version 1`, `cersion 2`, `version 3`)
  that broke `pip install`; it now lists the real dependencies the notebook imports.
- There is a separate `la_liga` remote branch unrelated to `main`.
