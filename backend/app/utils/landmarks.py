"""Geometric normalization for hand landmark feature vectors.

The classifier must be invariant to WHERE the hand is in the frame, how BIG
it appears (camera distance), and WHICH hand is used. Raw MediaPipe
coordinates encode all three, which destroys live accuracy for a model
trained on cropped dataset images (train/serve distribution shift).

`normalize_landmarks` is the single source of truth used by BOTH
`ml/train.py` (at dataset load time) and the live prediction service, so the
transform can never drift between training and inference.
"""
from __future__ import annotations

from typing import List, Sequence, Union

import numpy as np

WRIST = 0
MIDDLE_MCP = 9  # wrist -> middle-finger knuckle: stable, gesture-invariant hand size

ArrayLike = Union[Sequence[float], np.ndarray]


def normalize_landmarks(features: ArrayLike) -> np.ndarray:
    """Translate wrist to origin and divide by hand size.

    Input/output: flat (63,) float32 vector (21 landmarks x [x, y, z]).

    - Translation invariance: subtract the wrist point.
    - Scale invariance: divide by the wrist->middle-MCP distance, a hand-size
      proxy that does not change with finger pose (unlike e.g. the bounding
      box, which collapses for a fist).
    """
    arr = np.asarray(features, dtype=np.float32)
    if arr.size != 63:
        raise ValueError(f"Expected 63 features, got {arr.size}")
    pts = arr.reshape(21, 3) - arr.reshape(21, 3)[WRIST]
    scale = float(np.linalg.norm(pts[MIDDLE_MCP]))
    if scale < 1e-6:  # degenerate detection; avoid div-by-zero
        scale = float(np.abs(pts).max()) or 1.0
    return (pts / scale).flatten()


def mirror_landmarks(features: ArrayLike) -> np.ndarray:
    """Flip x. On wrist-centered (normalized) vectors this swaps left/right
    handedness, letting training cover both hands from one-handed data."""
    pts = np.asarray(features, dtype=np.float32).reshape(21, 3).copy()
    pts[:, 0] = -pts[:, 0]
    return pts.flatten()


def jitter_landmarks(
    features: ArrayLike,
    rng: np.random.Generator,
    noise_std: float = 0.02,
    max_rotation_deg: float = 12.0,
) -> np.ndarray:
    """Augment a normalized vector: small in-plane rotation + Gaussian noise.

    Simulates camera roll and landmark estimation jitter seen on live video
    but absent from clean dataset stills.
    """
    pts = np.asarray(features, dtype=np.float32).reshape(21, 3).copy()
    theta = np.deg2rad(rng.uniform(-max_rotation_deg, max_rotation_deg))
    c, s = np.cos(theta), np.sin(theta)
    rot = np.array([[c, -s], [s, c]], dtype=np.float32)
    pts[:, :2] = pts[:, :2] @ rot.T
    pts += rng.normal(0.0, noise_std, size=pts.shape).astype(np.float32)
    return pts.flatten()


def normalize_batch(X: np.ndarray) -> np.ndarray:
    """Vectorized normalize_landmarks for an (n, 63) matrix."""
    P = X.reshape(-1, 21, 3).astype(np.float32)
    P = P - P[:, WRIST : WRIST + 1, :]
    scale = np.linalg.norm(P[:, MIDDLE_MCP, :], axis=1)  # (n,)
    fallback = np.abs(P).reshape(len(P), -1).max(axis=1)
    scale = np.where(scale < 1e-6, np.where(fallback > 0, fallback, 1.0), scale)
    return (P / scale[:, None, None]).reshape(len(P), 63)
