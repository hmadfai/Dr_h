# LightGBM Individual Scoring App

Independently score an individual with the saved LightGBM/FairGBM model, generate dummy/random feature rows, and visualize the boosting trees (with the decision path highlighted) that produce the probability.

## Quick start

```bash
pip install -r requirements.txt
streamlit run app.py
```

Or run the CLI smoke test (dummy + random data, exports a tree HTML preview):

```bash
python run_smoke_test.py
```

## What it does

1. **Loads** `LightGBM_model.txt` (FairGBM-only parameter blocks are stripped automatically so standard LightGBM can score).
2. **Scores** one individual → probability, raw margin, and predicted label.
3. **Generates** dummy baseline or random individuals from the model’s `feature_infos` ranges / categories.
4. **Visualizes** trees used in the probability: per-tree contributions, cumulative raw score → sigmoid probability, and interactive path-highlighted tree plots.

## Project layout

- `app.py` — Streamlit UI
- `run_smoke_test.py` — CLI test with dummy/random data
- `scoring_app/` — model loading, generator, scorer, tree visualization
- `LightGBM_model.txt` — source model
- `models/LightGBM_model_cleaned.txt` — auto-generated LightGBM-compatible copy

## Scoring notes

- Objective is binary logistic (`sigmoid`); probability = `1 / (1 + exp(-raw_score))`.
- Raw score is the sum of leaf values across all 1000 trees for the individual’s decision paths.
- Feature order must match the model’s `feature_names`.
