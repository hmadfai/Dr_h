#!/usr/bin/env python3
"""CLI smoke test: dummy + random individuals through the scorer."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scoring_app.generator import RandomFeatureGenerator
from scoring_app.model import get_feature_metadata, load_booster
from scoring_app.scorer import build_leaf_maps, extract_tree_path, score_individual
from scoring_app.tree_viz import tree_figure_from_booster


def main() -> None:
    parser = argparse.ArgumentParser(description="Test LightGBM individual scoring")
    parser.add_argument(
        "--model",
        default=str(Path(__file__).resolve().parent / "LightGBM_model.txt"),
        help="Path to LightGBM/FairGBM text model",
    )
    parser.add_argument("--n-random", type=int, default=5, help="Random individuals to score")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--tree", type=int, default=0, help="Tree index to export as HTML")
    parser.add_argument(
        "--export-tree",
        default=str(Path(__file__).resolve().parent / "artifacts" / "tree_preview.html"),
        help="Where to write an interactive tree visualization",
    )
    args = parser.parse_args()

    model_path = Path(args.model)
    cleaned = model_path.parent / "models" / "LightGBM_model_cleaned.txt"
    cleaned.parent.mkdir(parents=True, exist_ok=True)
    artifacts = Path(__file__).resolve().parent / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)

    booster = load_booster(model_path, cleaned)
    specs = get_feature_metadata(model_path, booster)
    dump = booster.dump_model()
    leaf_maps = build_leaf_maps(dump)
    generator = RandomFeatureGenerator(specs, seed=args.seed)

    print(f"Loaded model with {booster.num_trees()} trees and {booster.num_feature()} features")

    dummy = generator.dummy_baseline()
    dummy_result = score_individual(
        booster, dummy, model_dump=dump, leaf_maps=leaf_maps
    )
    print("\nDummy baseline")
    print(
        f"  probability={dummy_result.probability:.6f} "
        f"raw={dummy_result.raw_score:.6f} label={dummy_result.prediction_label}"
    )

    # Verify contributions sum ≈ raw score
    contrib_sum = sum(c.contribution for c in dummy_result.tree_contributions)
    print(f"  sum(tree contributions)={contrib_sum:.6f} (should ≈ raw score)")

    print(f"\nRandom sample (n={args.n_random}, seed={args.seed})")
    batch = generator.generate(args.n_random)
    probs = booster.predict(batch)
    for i, p in enumerate(probs):
        print(f"  individual[{i}] probability={float(p):.6f}")

    detailed = score_individual(
        booster, batch.iloc[0], model_dump=dump, leaf_maps=leaf_maps
    )
    top = sorted(detailed.tree_contributions, key=lambda c: abs(c.contribution), reverse=True)[:5]
    print("\nTop tree contributions for first random individual:")
    for c in top:
        path = extract_tree_path(
            booster, batch.iloc[0], c.tree_index, model_dump=dump, leaf_maps=leaf_maps
        )
        print(
            f"  tree={c.tree_index:4d} leaf={c.leaf_index:3d} "
            f"contribution={c.contribution:+.6f} path_steps={len(path.path)}"
        )

    export_path = Path(args.export_tree)
    export_path.parent.mkdir(parents=True, exist_ok=True)
    tree_idx = args.tree
    contrib = extract_tree_path(
        booster, batch.iloc[0], tree_idx, model_dump=dump, leaf_maps=leaf_maps
    )
    fig = tree_figure_from_booster(booster, tree_idx, contrib, model_dump=dump)
    fig.write_html(str(export_path))
    print(f"\nWrote tree visualization to {export_path}")

    summary = {
        "dummy_probability": dummy_result.probability,
        "dummy_raw_score": dummy_result.raw_score,
        "contribution_sum": contrib_sum,
        "random_probabilities": [float(p) for p in probs],
        "top_contributions": [
            {"tree": c.tree_index, "leaf": c.leaf_index, "contribution": c.contribution}
            for c in top
        ],
    }
    summary_path = artifacts / "smoke_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote summary to {summary_path}")
    print("\nSummary JSON:")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
