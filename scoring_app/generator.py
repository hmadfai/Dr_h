"""Random / dummy feature generators aligned with model feature ranges."""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

from .model import FeatureSpec


class RandomFeatureGenerator:
    """Generate synthetic individuals within the model's observed feature ranges."""

    def __init__(
        self,
        features: Iterable[FeatureSpec],
        missing_rate: float = 0.05,
        missing_sentinel: float = -9999.0,
        seed: int | None = None,
    ) -> None:
        self.features = list(features)
        self.missing_rate = float(missing_rate)
        self.missing_sentinel = float(missing_sentinel)
        self.rng = np.random.default_rng(seed)

    @property
    def feature_names(self) -> list[str]:
        return [f.name for f in self.features]

    def generate_one(self) -> dict[str, float]:
        row: dict[str, float] = {}
        for feat in self.features:
            row[feat.name] = float(self._sample_feature(feat))
        return row

    def generate(self, n: int = 1) -> pd.DataFrame:
        rows = [self.generate_one() for _ in range(n)]
        return pd.DataFrame(rows, columns=self.feature_names)

    def dummy_baseline(self) -> dict[str, float]:
        """Deterministic mid-range / modal dummy individual for smoke tests."""
        row: dict[str, float] = {}
        for feat in self.features:
            if feat.kind == "categorical" and feat.categories:
                # Prefer non-sentinel categories when available.
                non_missing = [c for c in feat.categories if c != self.missing_sentinel]
                row[feat.name] = float(non_missing[0] if non_missing else feat.categories[0])
            else:
                lo = 0.0 if feat.min_value is None else feat.min_value
                hi = 1.0 if feat.max_value is None else feat.max_value
                if lo <= self.missing_sentinel < hi and hi > lo:
                    # Avoid the common -9999 missing band when mid-point would land there.
                    lo = max(lo, 0.0) if hi > 0 else lo
                row[feat.name] = float((lo + hi) / 2.0)
        return row

    def _sample_feature(self, feat: FeatureSpec) -> float:
        if self.rng.random() < self.missing_rate:
            if feat.kind == "categorical" and feat.categories:
                if self.missing_sentinel in feat.categories:
                    return self.missing_sentinel
                # Fall back to first category as a "missing-like" draw.
                return float(feat.categories[0])
            return self.missing_sentinel

        if feat.kind == "categorical" and feat.categories:
            cats = [c for c in feat.categories if c != self.missing_sentinel] or list(feat.categories)
            return float(self.rng.choice(cats))

        lo = 0.0 if feat.min_value is None else float(feat.min_value)
        hi = 1.0 if feat.max_value is None else float(feat.max_value)
        if not np.isfinite(lo) or not np.isfinite(hi) or hi < lo:
            return 0.0
        if hi == lo:
            return lo

        # Prefer sampling away from extreme missing sentinels for usability.
        sample_lo, sample_hi = lo, hi
        if lo <= self.missing_sentinel and hi > 0:
            sample_lo = max(0.0, lo)
        if sample_hi <= sample_lo:
            sample_lo, sample_hi = lo, hi

        # Mix continuous and integer-like draws for count features.
        if sample_hi - sample_lo > 5 and abs(sample_lo - round(sample_lo)) < 1e-9:
            return float(self.rng.integers(int(np.floor(sample_lo)), int(np.floor(sample_hi)) + 1))
        return float(self.rng.uniform(sample_lo, sample_hi))
