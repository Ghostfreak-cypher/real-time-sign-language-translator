"""LSTM classifier service for motion signs (J, Z).

TensorFlow is imported lazily inside _load() so the FastAPI startup stays fast
and clean when the model file is absent — no TF init noise on every restart.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

from ..utils.landmarks import normalize_batch

logger = logging.getLogger(__name__)

SEQ_LEN = 30   # frames per sequence — must match train_lstm.py


class LSTMClassifier:
    """Wraps a trained Keras LSTM model for motion-sign sequence classification."""

    def __init__(self, model_path: str, labels_path: str) -> None:
        self.model_path = model_path
        self.labels_path = labels_path
        self._model = None
        self._labels: List[str] = []
        self._load()

    def _load(self) -> None:
        model_file = Path(self.model_path)
        labels_file = Path(self.labels_path)

        if not model_file.exists():
            logger.warning(
                "LSTM model not found at %s. Motion-sign predictions disabled.", model_file
            )
            return
        if not labels_file.exists():
            logger.warning(
                "LSTM labels not found at %s. Motion-sign predictions disabled.", labels_file
            )
            return

        try:
            import tensorflow as tf  # noqa: PLC0415  (deferred import intentional)
            self._model = tf.keras.models.load_model(str(model_file))
            self._labels = json.loads(labels_file.read_text(encoding="utf-8"))
            logger.info(
                "Loaded LSTM classifier from %s (%d classes: %s)",
                model_file,
                len(self._labels),
                self._labels,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to load LSTM model: %s", exc)
            self._model = None
            self._labels = []

    @property
    def is_loaded(self) -> bool:
        return self._model is not None and len(self._labels) > 0

    def predict(self, sequence: List[List[float]]) -> Tuple[str, float, float]:
        """Classify a 30-frame landmark sequence.

        Args:
            sequence: list of 30 frames, each a flat list of 63 floats (raw coords).

        Returns:
            (label, confidence, latency_ms)
        """
        if not self.is_loaded:
            return "—", 0.0, 0.0

        if len(sequence) != SEQ_LEN:
            raise ValueError(f"Expected {SEQ_LEN} frames, got {len(sequence)}")
        for i, frame in enumerate(sequence):
            if len(frame) != 63:
                raise ValueError(f"Frame {i} has {len(frame)} values; expected 63.")

        # Normalize all frames with the same transform used at training time
        raw = np.array(sequence, dtype=np.float32)          # (30, 63)
        normed = normalize_batch(raw)                        # (30, 63)
        arr = normed[np.newaxis, ...]                        # (1, 30, 63)

        start = time.perf_counter()
        probs = self._model.predict(arr, verbose=0)[0]       # (num_classes,)
        latency_ms = (time.perf_counter() - start) * 1000.0

        idx = int(np.argmax(probs))
        label = self._labels[idx]
        confidence = float(probs[idx])
        return label, confidence, latency_ms
