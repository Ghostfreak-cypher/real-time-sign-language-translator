"""Sign classifier service wrapping a trained scikit-learn model."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import List, Optional, Tuple

import joblib
import numpy as np

from ..utils.landmarks import normalize_landmarks

logger = logging.getLogger(__name__)

DEFAULT_LABELS: List[str] = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "Hello", "Thank You", "Yes", "No", "Please", "Sorry", "Help", "I Love You",
]


class SignClassifier:
    """Lazy-loaded classifier. Falls back to a dummy classifier if model missing."""

    def __init__(self, model_path: str = "ml/classifier.pkl") -> None:
        self.model_path = model_path
        self.model = None
        self.labels: List[str] = list(DEFAULT_LABELS)
        # Preprocessing version stamped into the bundle by ml/train.py.
        # None for legacy bundles trained on raw coordinates.
        self.preprocess: Optional[str] = None
        self._load()

    def _load(self) -> None:
        path = Path(self.model_path)
        if not path.exists():
            logger.warning(
                "Classifier not found at %s. Using fallback zero-confidence predictions.",
                path,
            )
            return
        try:
            bundle = joblib.load(str(path))
            if isinstance(bundle, dict):
                self.model = bundle.get("model")
                self.labels = bundle.get("labels", self.labels)
                self.preprocess = bundle.get("preprocess")
            else:
                self.model = bundle
            logger.info(
                "Loaded classifier from %s (%d classes, preprocess=%s)",
                path,
                len(self.labels),
                self.preprocess,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to load model: %s", exc)
            self.model = None

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    def predict(self, features: List[float]) -> Tuple[str, float, List[dict], float]:
        """Predict a single gesture.

        Returns (label, confidence, top_k, latency_ms).
        """
        if len(features) != 63:
            raise ValueError(f"Expected 63 features, got {len(features)}")

        if self.model is None:
            return "Unknown", 0.0, [], 0.0

        # Apply the exact transform the model was trained with (train/serve
        # consistency). Legacy raw-coordinate bundles skip this.
        vec = normalize_landmarks(features) if self.preprocess else features
        arr = np.asarray(vec, dtype=np.float32).reshape(1, -1)
        start = time.perf_counter()
        probs = None
        try:
            if hasattr(self.model, "predict_proba"):
                probs = self.model.predict_proba(arr)[0]
                idx = int(np.argmax(probs))
                confidence = float(probs[idx])
                label = str(self.model.classes_[idx])
            else:
                pred = self.model.predict(arr)[0]
                label = str(pred)
                confidence = 1.0
        except Exception as exc:  # noqa: BLE001
            logger.exception("Prediction failed: %s", exc)
            return "Unknown", 0.0, [], 0.0
        latency_ms = (time.perf_counter() - start) * 1000.0

        top_k: List[dict] = []
        if probs is not None:
            order = np.argsort(probs)[::-1][:3]
            for i in order:
                top_k.append({"label": str(self.model.classes_[i]), "confidence": float(probs[i])})

        return label, confidence, top_k, latency_ms
