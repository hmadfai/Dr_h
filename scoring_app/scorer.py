"""Score individuals and extract per-tree decision paths."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

import lightgbm as lgb
import numpy as np
import pandas as pd


@dataclass
class SplitStep:
    node_id: int
    feature: str | None
    feature_index: int | None
    threshold: float | str | None
    decision: str
    direction: str  # "left" | "right" | "leaf"
    value_seen: float | None
    is_categorical: bool = False


def _format_threshold(threshold: Any, *, categorical: bool) -> str:
    """Format numeric or categorical LightGBM dump thresholds (e.g. '1||4')."""
    if threshold is None:
        return "?"
    if categorical or isinstance(threshold, str):
        text = str(threshold).replace("||", ", ")
        return text
    try:
        return f"{float(threshold):g}"
    except (TypeError, ValueError):
        return str(threshold)


def _coerce_threshold(raw: Any, *, categorical: bool) -> float | str | None:
    if raw is None:
        return None
    if categorical or isinstance(raw, str):
        # Keep categorical bitsets / category lists as readable strings.
        return str(raw)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return str(raw)


@dataclass
class TreeContribution:
    tree_index: int
    leaf_index: int
    contribution: float
    shrinkage: float
    path: list[SplitStep] = field(default_factory=list)


@dataclass
class ScoreResult:
    probability: float
    raw_score: float
    prediction_label: int
    threshold: float
    leaf_indices: np.ndarray
    tree_contributions: list[TreeContribution]
    feature_vector: np.ndarray
    feature_names: list[str]


def _as_feature_frame(
    features: Mapping[str, float] | pd.Series | pd.DataFrame | np.ndarray | Sequence[float],
    feature_names: Sequence[str],
) -> pd.DataFrame:
    if isinstance(features, pd.DataFrame):
        missing = [c for c in feature_names if c not in features.columns]
        if missing:
            raise ValueError(f"Missing features: {missing[:5]}{'...' if len(missing) > 5 else ''}")
        return features.loc[:, list(feature_names)].copy()

    if isinstance(features, pd.Series):
        return pd.DataFrame([features.reindex(feature_names).astype(float).tolist()], columns=list(feature_names))

    if isinstance(features, Mapping):
        row: dict[str, float] = {}
        for name in feature_names:
            raw = features.get(name, np.nan)
            try:
                row[name] = float(raw) if raw is not None and raw != "" else np.nan
            except (TypeError, ValueError):
                row[name] = np.nan
        return pd.DataFrame([row], columns=list(feature_names))

    arr = np.asarray(features, dtype=float)
    if arr.ndim == 1:
        if arr.shape[0] != len(feature_names):
            raise ValueError(f"Expected {len(feature_names)} features, got {arr.shape[0]}")
        return pd.DataFrame([arr], columns=list(feature_names))
    if arr.ndim == 2:
        if arr.shape[1] != len(feature_names):
            raise ValueError(f"Expected {len(feature_names)} columns, got {arr.shape[1]}")
        return pd.DataFrame(arr, columns=list(feature_names))
    raise ValueError("Unsupported feature input shape")


def _leaf_value_map(tree_structure: dict[str, Any]) -> dict[int, float]:
    values: dict[int, float] = {}

    def visit(node: dict[str, Any]) -> None:
        if "split_feature" not in node:
            values[int(node.get("leaf_index", len(values)))] = float(node["leaf_value"])
            return
        visit(node["left_child"])
        visit(node["right_child"])

    visit(tree_structure)
    return values


def build_leaf_maps(model_dump: dict[str, Any]) -> list[dict[int, float]]:
    return [_leaf_value_map(tree["tree_structure"]) for tree in model_dump["tree_info"]]


def find_path_to_leaf(
    node: dict[str, Any],
    target_leaf: int,
    feature_names: Sequence[str],
    x: np.ndarray,
    path: list[SplitStep] | None = None,
    node_id: int = 0,
) -> list[SplitStep] | None:
    """Return the structural path ending at target_leaf."""
    if path is None:
        path = []

    if "split_feature" not in node:
        leaf_index = int(node.get("leaf_index", -1))
        if leaf_index == target_leaf:
            path.append(
                SplitStep(
                    node_id=node_id,
                    feature=None,
                    feature_index=None,
                    threshold=None,
                    decision=f"leaf={leaf_index} (value={float(node['leaf_value']):.6f})",
                    direction="leaf",
                    value_seen=float(node["leaf_value"]),
                    is_categorical=False,
                )
            )
            return path
        return None

    feat_idx = int(node["split_feature"])
    feat_name = feature_names[feat_idx] if feat_idx < len(feature_names) else f"f{feat_idx}"
    decision_type = str(node.get("decision_type", "<="))
    is_cat = decision_type in {"==", "categorical"}
    threshold = _coerce_threshold(node.get("threshold", 0.0), categorical=is_cat)
    thr_text = _format_threshold(threshold, categorical=is_cat)
    try:
        value = float(x[feat_idx]) if feat_idx < len(x) else np.nan
    except (TypeError, ValueError):
        value = np.nan
    decision = (
        f"{feat_name} in {{{thr_text}}} ?"
        if is_cat
        else f"{feat_name} <= {thr_text} ?"
    )

    for direction, child_key in (("left", "left_child"), ("right", "right_child")):
        next_id = node_id * 2 + (1 if direction == "left" else 2)
        step = SplitStep(
            node_id=node_id,
            feature=feat_name,
            feature_index=feat_idx,
            threshold=threshold,
            decision=decision,
            direction=direction,
            value_seen=value,
            is_categorical=is_cat,
        )
        found = find_path_to_leaf(node[child_key], target_leaf, feature_names, x, path + [step], next_id)
        if found is not None:
            return found
    return None


def extract_tree_path(
    booster: lgb.Booster,
    features: Mapping[str, float] | pd.Series | np.ndarray | Sequence[float],
    tree_index: int,
    model_dump: dict[str, Any] | None = None,
    leaf_maps: Sequence[Mapping[int, float]] | None = None,
) -> TreeContribution:
    feature_names = list(booster.feature_name())
    frame = _as_feature_frame(features, feature_names)
    x = frame.to_numpy(dtype=float)[0]
    leaf_index = int(booster.predict(frame, pred_leaf=True)[0][tree_index])

    dump = model_dump if model_dump is not None else booster.dump_model()
    tree = dump["tree_info"][tree_index]
    if leaf_maps is None:
        leaf_values = _leaf_value_map(tree["tree_structure"])
    else:
        leaf_values = leaf_maps[tree_index]
    contribution = float(leaf_values.get(leaf_index, 0.0))
    path = find_path_to_leaf(tree["tree_structure"], leaf_index, feature_names, x) or []
    return TreeContribution(
        tree_index=tree_index,
        leaf_index=leaf_index,
        contribution=contribution,
        shrinkage=float(tree.get("shrinkage", 1.0)),
        path=path,
    )


def score_individual(
    booster: lgb.Booster,
    features: Mapping[str, float] | pd.Series | pd.DataFrame | np.ndarray | Sequence[float],
    threshold: float = 0.5,
    model_dump: dict[str, Any] | None = None,
    leaf_maps: Sequence[Mapping[int, float]] | None = None,
    detail_tree_indices: Sequence[int] | None = None,
) -> ScoreResult:
    """Compute probability / raw score and per-tree contributions.

    Paths are only materialized for ``detail_tree_indices`` (default: none).
    Call ``extract_tree_path`` or pass indices for visualization.
    """
    feature_names = list(booster.feature_name())
    frame = _as_feature_frame(features, feature_names)
    first = frame.iloc[[0]]

    probability = float(booster.predict(first)[0])
    raw_score = float(booster.predict(first, raw_score=True)[0])
    leaf_indices = booster.predict(first, pred_leaf=True)[0].astype(int)

    dump = model_dump if model_dump is not None else booster.dump_model()
    maps = list(leaf_maps) if leaf_maps is not None else build_leaf_maps(dump)
    detail_set = set(detail_tree_indices or [])

    x = first.to_numpy(dtype=float)[0]
    contributions: list[TreeContribution] = []
    for tree_index, tree in enumerate(dump["tree_info"]):
        leaf_index = int(leaf_indices[tree_index])
        contribution = float(maps[tree_index].get(leaf_index, 0.0))
        path: list[SplitStep] = []
        if tree_index in detail_set:
            path = find_path_to_leaf(tree["tree_structure"], leaf_index, feature_names, x) or []
        contributions.append(
            TreeContribution(
                tree_index=tree_index,
                leaf_index=leaf_index,
                contribution=contribution,
                shrinkage=float(tree.get("shrinkage", 1.0)),
                path=path,
            )
        )

    return ScoreResult(
        probability=probability,
        raw_score=raw_score,
        prediction_label=int(probability >= threshold),
        threshold=threshold,
        leaf_indices=leaf_indices,
        tree_contributions=contributions,
        feature_vector=x,
        feature_names=feature_names,
    )
