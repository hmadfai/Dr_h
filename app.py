"""Streamlit app: independently score individuals with the LightGBM model."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st

from scoring_app.generator import RandomFeatureGenerator
from scoring_app.model import get_feature_metadata, load_booster
from scoring_app.scorer import build_leaf_maps, extract_tree_path, score_individual
from scoring_app.tree_viz import (
    contribution_bar_figure,
    cumulative_score_figure,
    path_table,
    tree_figure_from_booster,
)

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "LightGBM_model.txt"
CLEANED_MODEL = ROOT / "models" / "LightGBM_model_cleaned.txt"


@st.cache_resource(show_spinner="Loading model…")
def get_model(model_path: str):
    path = Path(model_path)
    CLEANED_MODEL.parent.mkdir(parents=True, exist_ok=True)
    booster = load_booster(path, CLEANED_MODEL)
    features = get_feature_metadata(path, booster)
    dump = booster.dump_model()
    leaf_maps = build_leaf_maps(dump)
    return booster, features, dump, leaf_maps


def main() -> None:
    st.set_page_config(page_title="LightGBM Individual Scorer", layout="wide")
    st.title("LightGBM Individual Scorer")
    st.caption(
        "Score a single individual with the saved model, generate dummy data, "
        "and inspect the trees / decision paths that produce the probability."
    )

    model_path = st.sidebar.text_input("Model file", value=str(DEFAULT_MODEL))
    threshold = st.sidebar.slider("Decision threshold", 0.0, 1.0, 0.5, 0.01)
    missing_rate = st.sidebar.slider("Random missing rate", 0.0, 0.5, 0.05, 0.01)
    seed = st.sidebar.number_input("Random seed", min_value=0, value=42, step=1)

    if not Path(model_path).exists():
        st.error(f"Model file not found: {model_path}")
        st.stop()

    booster, feature_specs, model_dump, leaf_maps = get_model(model_path)
    generator = RandomFeatureGenerator(feature_specs, missing_rate=missing_rate, seed=int(seed))

    st.sidebar.markdown(f"**Trees:** {booster.num_trees()}  \n**Features:** {booster.num_feature()}")

    if "feature_row" not in st.session_state:
        st.session_state.feature_row = generator.dummy_baseline()

    col_a, col_b, col_c = st.columns([1, 1, 1])
    with col_a:
        if st.button("Load dummy baseline", use_container_width=True):
            st.session_state.feature_row = generator.dummy_baseline()
    with col_b:
        if st.button("Generate random individual", use_container_width=True):
            st.session_state.feature_row = generator.generate_one()
    with col_c:
        n_batch = st.number_input("Batch size", min_value=1, max_value=500, value=10, step=1)

    with st.expander("Feature values (editable)", expanded=True):
        df = pd.DataFrame([st.session_state.feature_row])
        edited = st.data_editor(df, use_container_width=True, num_rows="fixed", key="feature_editor")
        st.session_state.feature_row = edited.iloc[0].to_dict()

    score_col, batch_col = st.columns([2, 1])
    with score_col:
        run = st.button("Score individual", type="primary", use_container_width=True)
    with batch_col:
        run_batch = st.button("Score random batch", use_container_width=True)

    if run_batch:
        batch = generator.generate(int(n_batch))
        probs = booster.predict(batch)
        batch = batch.copy()
        batch.insert(0, "probability", probs)
        batch.insert(1, "label", (probs >= threshold).astype(int))
        st.subheader("Random batch scores")
        st.dataframe(batch, use_container_width=True)
        st.download_button(
            "Download batch CSV",
            batch.to_csv(index=False).encode("utf-8"),
            file_name="random_batch_scores.csv",
            mime="text/csv",
        )

    if run or "last_result" in st.session_state:
        if run:
            with st.spinner("Scoring…"):
                result = score_individual(
                    booster,
                    st.session_state.feature_row,
                    threshold=threshold,
                    model_dump=model_dump,
                    leaf_maps=leaf_maps,
                )
                st.session_state.last_result = result
                st.session_state.last_features = dict(st.session_state.feature_row)
        result = st.session_state.last_result
        features_for_path = st.session_state.get("last_features", st.session_state.feature_row)

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Probability", f"{result.probability:.6f}")
        m2.metric("Raw score", f"{result.raw_score:.6f}")
        m3.metric("Predicted label", str(result.prediction_label))
        m4.metric("Trees used", str(len(result.tree_contributions)))

        st.plotly_chart(contribution_bar_figure(result.tree_contributions, top_n=40), use_container_width=True)
        st.plotly_chart(
            cumulative_score_figure(result.tree_contributions, max_trees=min(300, booster.num_trees())),
            use_container_width=True,
        )

        st.subheader("Tree used in the probability calculation")
        st.caption(
            "Each boosting tree adds a leaf contribution to the raw margin; "
            "probability = sigmoid(sum of contributions). Highlighted nodes show the path taken for this individual."
        )

        ranked = sorted(result.tree_contributions, key=lambda c: abs(c.contribution), reverse=True)
        default_tree = ranked[0].tree_index if ranked else 0
        tree_index = st.slider("Tree index to visualize", 0, booster.num_trees() - 1, int(default_tree))

        contribution = extract_tree_path(
            booster,
            features_for_path,
            tree_index,
            model_dump=model_dump,
            leaf_maps=leaf_maps,
        )

        viz_cols = st.columns([3, 2])
        with viz_cols[0]:
            fig = tree_figure_from_booster(booster, tree_index, contribution, model_dump=model_dump)
            st.plotly_chart(fig, use_container_width=True)
        with viz_cols[1]:
            st.markdown(
                f"**Leaf:** {contribution.leaf_index}  \n"
                f"**Contribution:** `{contribution.contribution:.8f}`"
            )
            st.dataframe(pd.DataFrame(path_table(contribution.path)), use_container_width=True, height=480)

        st.subheader("Top contributing trees")
        top_k = st.slider("How many top trees to show", 1, 12, 4)
        top = ranked[:top_k]
        for item in top:
            contrib = extract_tree_path(
                booster,
                features_for_path,
                item.tree_index,
                model_dump=model_dump,
                leaf_maps=leaf_maps,
            )
            with st.expander(
                f"Tree {contrib.tree_index} | leaf {contrib.leaf_index} | contribution {contrib.contribution:.6f}",
                expanded=(contrib.tree_index == tree_index),
            ):
                st.plotly_chart(
                    tree_figure_from_booster(booster, contrib.tree_index, contrib, model_dump=model_dump),
                    use_container_width=True,
                )

        payload = {
            "probability": result.probability,
            "raw_score": result.raw_score,
            "prediction_label": result.prediction_label,
            "threshold": result.threshold,
            "features": dict(zip(result.feature_names, map(float, result.feature_vector))),
            "top_tree_contributions": [
                {
                    "tree_index": c.tree_index,
                    "leaf_index": c.leaf_index,
                    "contribution": c.contribution,
                }
                for c in ranked[:20]
            ],
        }
        st.download_button(
            "Download score JSON",
            json.dumps(payload, indent=2).encode("utf-8"),
            file_name="individual_score.json",
            mime="application/json",
        )


if __name__ == "__main__":
    main()
