"""Visualize LightGBM trees and highlighted decision paths."""

from __future__ import annotations

from typing import Any, Sequence

import lightgbm as lgb
import plotly.graph_objects as go

from .scorer import SplitStep, TreeContribution


def _collect_nodes(
    node: dict[str, Any],
    feature_names: Sequence[str],
    path_node_ids: set[int],
    node_id: int = 0,
    depth: int = 0,
    records: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if records is None:
        records = []

    on_path = node_id in path_node_ids
    if "leaf_index" in node or ("leaf_value" in node and "split_feature" not in node):
        leaf_index = int(node.get("leaf_index", -1))
        leaf_value = float(node["leaf_value"])
        records.append(
            {
                "id": node_id,
                "depth": depth,
                "label": f"Leaf {leaf_index}\n{leaf_value:.4f}",
                "kind": "leaf",
                "on_path": on_path,
                "parent": (node_id - 1) // 2 if node_id > 0 else None,
            }
        )
        return records

    feat_idx = int(node["split_feature"])
    feat_name = feature_names[feat_idx] if feat_idx < len(feature_names) else f"f{feat_idx}"
    short = feat_name if len(feat_name) <= 28 else feat_name[:25] + "…"
    threshold = float(node.get("threshold", 0.0))
    decision_type = str(node.get("decision_type", "<="))
    if decision_type in {"==", "categorical"}:
        label = f"{short}\n== {threshold:g}"
    else:
        label = f"{short}\n<= {threshold:g}"

    records.append(
        {
            "id": node_id,
            "depth": depth,
            "label": label,
            "kind": "split",
            "on_path": on_path,
            "parent": (node_id - 1) // 2 if node_id > 0 else None,
        }
    )
    _collect_nodes(node["left_child"], feature_names, path_node_ids, node_id * 2 + 1, depth + 1, records)
    _collect_nodes(node["right_child"], feature_names, path_node_ids, node_id * 2 + 2, depth + 1, records)
    return records


def _layout_positions(records: list[dict[str, Any]]) -> dict[int, tuple[float, float]]:
    by_depth: dict[int, list[dict[str, Any]]] = {}
    for rec in records:
        by_depth.setdefault(rec["depth"], []).append(rec)

    positions: dict[int, tuple[float, float]] = {}
    max_depth = max(by_depth) if by_depth else 0
    for depth, nodes in by_depth.items():
        n = len(nodes)
        for i, node in enumerate(nodes):
            x = (i + 1) / (n + 1)
            y = max_depth - depth
            positions[node["id"]] = (x, y)
    return positions


def build_tree_figure(
    tree_structure: dict[str, Any],
    feature_names: Sequence[str],
    path: Sequence[SplitStep] | None = None,
    title: str = "Decision tree",
) -> go.Figure:
    path_node_ids = {step.node_id for step in (path or [])}
    records = _collect_nodes(tree_structure, feature_names, path_node_ids)
    positions = _layout_positions(records)
    id_to_rec = {r["id"]: r for r in records}

    edge_x: list[float | None] = []
    edge_y: list[float | None] = []
    path_edge_x: list[float | None] = []
    path_edge_y: list[float | None] = []

    for rec in records:
        parent = rec["parent"]
        if parent is None or parent not in positions:
            continue
        x0, y0 = positions[parent]
        x1, y1 = positions[rec["id"]]
        parent_on = id_to_rec[parent]["on_path"]
        child_on = rec["on_path"]
        if parent_on and child_on:
            path_edge_x += [x0, x1, None]
            path_edge_y += [y0, y1, None]
        else:
            edge_x += [x0, x1, None]
            edge_y += [y0, y1, None]

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=edge_x,
            y=edge_y,
            mode="lines",
            line=dict(color="#9aa3ad", width=1.2),
            hoverinfo="skip",
            name="other branches",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=path_edge_x,
            y=path_edge_y,
            mode="lines",
            line=dict(color="#c45c26", width=3.2),
            hoverinfo="skip",
            name="path taken",
        )
    )

    for kind, color, path_color, symbol in (
        ("split", "#1f4b66", "#c45c26", "circle"),
        ("leaf", "#2f6f4e", "#c45c26", "square"),
    ):
        subset = [r for r in records if r["kind"] == kind]
        if not subset:
            continue
        xs = [positions[r["id"]][0] for r in subset]
        ys = [positions[r["id"]][1] for r in subset]
        colors = [path_color if r["on_path"] else color for r in subset]
        sizes = [18 if r["on_path"] else 13 for r in subset]
        fig.add_trace(
            go.Scatter(
                x=xs,
                y=ys,
                mode="markers+text",
                text=[r["label"] for r in subset],
                textposition="top center",
                textfont=dict(size=10, color="#1b1f24"),
                marker=dict(size=sizes, color=colors, symbol=symbol, line=dict(width=1, color="#ffffff")),
                hovertext=[r["label"].replace("\n", " | ") for r in subset],
                hoverinfo="text",
                name="leaf" if kind == "leaf" else "split",
            )
        )

    fig.update_layout(
        title=title,
        showlegend=True,
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
        margin=dict(l=20, r=20, t=50, b=20),
        height=560,
        plot_bgcolor="#f3efe7",
        paper_bgcolor="#f7f4ee",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
    )
    return fig


def tree_figure_from_booster(
    booster: lgb.Booster,
    tree_index: int,
    contribution: TreeContribution | None = None,
    model_dump: dict[str, Any] | None = None,
) -> go.Figure:
    dump = model_dump if model_dump is not None else booster.dump_model()
    tree = dump["tree_info"][tree_index]
    feature_names = list(booster.feature_name())
    path = contribution.path if contribution is not None else None
    leaf = contribution.leaf_index if contribution is not None else "?"
    contrib = contribution.contribution if contribution is not None else float("nan")
    title = f"Tree {tree_index} — leaf {leaf} — contribution {contrib:.6f}"
    return build_tree_figure(tree["tree_structure"], feature_names, path=path, title=title)


def contribution_bar_figure(contributions: Sequence[TreeContribution], top_n: int = 30) -> go.Figure:
    ordered = sorted(contributions, key=lambda c: abs(c.contribution), reverse=True)[:top_n]
    ordered = list(reversed(ordered))  # largest abs at top
    fig = go.Figure(
        go.Bar(
            x=[c.contribution for c in ordered],
            y=[f"Tree {c.tree_index}" for c in ordered],
            orientation="h",
            marker_color=["#c45c26" if c.contribution >= 0 else "#1f4b66" for c in ordered],
            hovertemplate="Tree %{y}: %{x:.6f}<extra></extra>",
        )
    )
    fig.update_layout(
        title=f"Top {len(ordered)} tree contributions to raw score",
        xaxis_title="Contribution (added to raw margin)",
        yaxis_title="",
        height=max(360, 18 * len(ordered) + 80),
        margin=dict(l=80, r=20, t=50, b=40),
        plot_bgcolor="#f3efe7",
        paper_bgcolor="#f7f4ee",
    )
    return fig


def cumulative_score_figure(contributions: Sequence[TreeContribution], max_trees: int = 200) -> go.Figure:
    subset = list(contributions[:max_trees])
    xs = list(range(len(subset)))
    ys: list[float] = []
    running = 0.0
    for c in subset:
        running += c.contribution
        ys.append(running)
    probs = [1.0 / (1.0 + pow(2.718281828459045, -y)) for y in ys]
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=xs, y=ys, mode="lines", name="raw score", line=dict(color="#1f4b66", width=2)))
    fig.add_trace(
        go.Scatter(
            x=xs,
            y=probs,
            mode="lines",
            name="probability",
            yaxis="y2",
            line=dict(color="#c45c26", width=2),
        )
    )
    fig.update_layout(
        title=f"Cumulative score across first {len(subset)} trees",
        xaxis_title="Tree index",
        yaxis=dict(title="Raw score"),
        yaxis2=dict(title="Probability", overlaying="y", side="right", range=[0, 1]),
        height=420,
        margin=dict(l=60, r=60, t=50, b=40),
        plot_bgcolor="#f3efe7",
        paper_bgcolor="#f7f4ee",
        legend=dict(orientation="h"),
    )
    return fig


def path_table(path: Sequence[SplitStep]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for i, step in enumerate(path):
        rows.append(
            {
                "step": i,
                "direction": step.direction,
                "decision": step.decision,
                "feature": step.feature or "",
                "value_seen": step.value_seen,
                "threshold": step.threshold,
            }
        )
    return rows
