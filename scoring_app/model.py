"""Load and prepare the LightGBM / FairGBM text model for scoring."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import lightgbm as lgb

FAIRGBM_MARKER = "[------- FAIRGBM ------]"
END_PARAMS = "end of parameters"


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    index: int
    kind: str  # "numeric" | "categorical"
    min_value: float | None = None
    max_value: float | None = None
    categories: tuple[float, ...] | None = None


def clean_model_text(raw: str) -> str:
    """Remove FairGBM-only parameter block so standard LightGBM can load the file."""
    if FAIRGBM_MARKER not in raw:
        return raw
    start = raw.find(FAIRGBM_MARKER)
    end = raw.find(END_PARAMS)
    if start < 0 or end < 0 or end < start:
        return raw
    line_start = raw.rfind("\n", 0, start) + 1
    return raw[:line_start] + raw[end:]


def ensure_cleaned_model(model_path: str | Path, cleaned_path: str | Path | None = None) -> Path:
    """Write a LightGBM-compatible copy of the model and return its path."""
    model_path = Path(model_path)
    if cleaned_path is None:
        cleaned_path = model_path.with_name(model_path.stem + "_cleaned.txt")
    else:
        cleaned_path = Path(cleaned_path)

    raw = model_path.read_text(encoding="utf-8", errors="replace")
    cleaned = clean_model_text(raw)
    if not cleaned_path.exists() or cleaned_path.read_text(encoding="utf-8", errors="replace") != cleaned:
        cleaned_path.write_text(cleaned, encoding="utf-8")
    return cleaned_path


def load_booster(model_path: str | Path, cleaned_path: str | Path | None = None) -> lgb.Booster:
    """Load the booster from a FairGBM/LightGBM text model file."""
    path = ensure_cleaned_model(model_path, cleaned_path)
    return lgb.Booster(model_file=str(path))


def _parse_feature_infos(line: str) -> list[dict[str, Any]]:
    payload = line.split("=", 1)[1].strip()
    tokens = re.findall(r"\[[^\]]+\]|[^\s\[]+", payload)
    specs: list[dict[str, Any]] = []
    for token in tokens:
        if token.startswith("[") and token.endswith("]"):
            inner = token[1:-1]
            lo_s, hi_s = inner.split(":", 1)
            specs.append(
                {
                    "kind": "numeric",
                    "min_value": float(lo_s),
                    "max_value": float(hi_s),
                    "categories": None,
                }
            )
        else:
            cats = tuple(float(x) for x in token.split(":"))
            specs.append(
                {
                    "kind": "categorical",
                    "min_value": min(cats) if cats else None,
                    "max_value": max(cats) if cats else None,
                    "categories": cats,
                }
            )
    return specs


def get_feature_metadata(model_path: str | Path, booster: lgb.Booster | None = None) -> list[FeatureSpec]:
    """Parse feature names + training ranges / categories from the model text."""
    model_path = Path(model_path)
    names: list[str] | None = None
    info_line: str | None = None
    with model_path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("feature_names="):
                names = line.split("=", 1)[1].strip().split()
            elif line.startswith("feature_infos="):
                info_line = line
            if names is not None and info_line is not None:
                break

    if names is None and booster is not None:
        names = list(booster.feature_name())
    if names is None:
        raise ValueError("Could not find feature_names in model file")
    if info_line is None:
        raise ValueError("Could not find feature_infos in model file")

    infos = _parse_feature_infos(info_line)
    if len(infos) != len(names):
        raise ValueError(f"feature_infos length {len(infos)} != feature_names length {len(names)}")

    return [
        FeatureSpec(
            name=name,
            index=i,
            kind=info["kind"],
            min_value=info["min_value"],
            max_value=info["max_value"],
            categories=info["categories"],
        )
        for i, (name, info) in enumerate(zip(names, infos))
    ]
