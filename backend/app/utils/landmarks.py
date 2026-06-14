"""Geometric normalization for hand landmark feature vectors.

The classifier must be invariant to WHERE the hand is in the frame, how BIG
it appears (camera distance), what ANGLE it is held at, and WHICH hand is used.
Raw MediaPipe coordinates encode all four, causing train/serve distribution
shift when the model is trained on clean still images but used on live webcam.

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
    """Translate wrist to origin, scale by hand size, align to canonical rotation.

    Input/output: flat (63,) float32 vector (21 landmarks x [x, y, z]).

    Three invariances applied in order:
    1. Translation: subtract wrist so wrist is the origin.
    2. Scale: divide by wrist->middle-MCP distance (stable hand-size proxy).
    3. Rotation: rotate the xy plane so the wrist->middle-MCP vector points
       straight up ([0, -1] in image space). This removes in-plane hand tilt,
       which is the main reason a model trained on upright Kaggle stills fails
       on a tilted live hand.
    """
    arr = np.asarray(features, dtype=np.float32)
    if arr.size != 63:
        raise ValueError(f"Expected 63 features, got {arr.size}")
    pts = arr.reshape(21, 3) - arr.reshape(21, 3)[WRIST]

    scale = float(np.linalg.norm(pts[MIDDLE_MCP]))
    if scale < 1e-6:
        scale = float(np.abs(pts).max()) or 1.0
    pts = pts / scale

    # Align wrist→middle-MCP to [0, -1] (pointing up in image space)
    mcp_2d = pts[MIDDLE_MCP, :2]
    norm_2d = float(np.linalg.norm(mcp_2d))
    if norm_2d > 1e-6:
        mx, my = mcp_2d / norm_2d
        theta = float(np.arctan2(-1.0, 0.0) - np.arctan2(my, mx))
        c, s = np.cos(theta), np.sin(theta)
        rot = np.array([[c, -s], [s, c]], dtype=np.float32)
        pts[:, :2] = pts[:, :2] @ rot.T

    return pts.flatten()


def mirror_landmarks(features: ArrayLike) -> np.ndarray:
    """Flip x. On wrist-centered (normalized) vectors this swaps left/right
    handedness, letting training cover both hands from one-handed data."""
    pts = np.asarray(features, dtype=np.float32).reshape(21, 3).copy()
    pts[:, 0] = -pts[:, 0]
    return pts.flatten()


def jitter_landmarks(
    features: ArrayLike,
    rng: np.random.Generator,
    noise_std: float = 0.03,
    max_rotation_deg: float = 20.0,
) -> np.ndarray:
    """Augment a normalized vector: small in-plane rotation + Gaussian noise.

    Simulates camera roll and landmark estimation jitter seen on live video
    but absent from clean dataset stills. Defaults are intentionally stronger
    than what looks natural — the model needs to be robust, not just accurate
    on the clean test set.
    """
    pts = np.asarray(features, dtype=np.float32).reshape(21, 3).copy()
    theta = np.deg2rad(rng.uniform(-max_rotation_deg, max_rotation_deg))
    c, s = np.cos(theta), np.sin(theta)
    rot = np.array([[c, -s], [s, c]], dtype=np.float32)
    pts[:, :2] = pts[:, :2] @ rot.T
    pts += rng.normal(0.0, noise_std, size=pts.shape).astype(np.float32)
    return pts.flatten()


def scale_jitter_landmarks(
    features: ArrayLike,
    rng: np.random.Generator,
    low: float = 0.85,
    high: float = 1.15,
) -> np.ndarray:
    """Multiply all coordinates by a random scale factor.

    Even after normalization the scale estimate is noisy (MediaPipe landmark
    detection error in the wrist-MCP distance). Simulating this makes the
    model robust to slightly imperfect normalization at serve time.
    """
    pts = np.asarray(features, dtype=np.float32).copy()
    return pts * rng.uniform(low, high)


def normalize_batch(X: np.ndarray) -> np.ndarray:
    """Vectorized normalize_landmarks for an (n, 63) matrix."""
    P = X.reshape(-1, 21, 3).astype(np.float32)

    # Translation
    P = P - P[:, WRIST : WRIST + 1, :]

    # Scale
    scale = np.linalg.norm(P[:, MIDDLE_MCP, :], axis=1)  # (n,)
    fallback = np.abs(P).reshape(len(P), -1).max(axis=1)
    scale = np.where(scale < 1e-6, np.where(fallback > 0, fallback, 1.0), scale)
    P = P / scale[:, None, None]

    # Rotation alignment: align wrist→middle-MCP to [0, -1] in xy plane
    mcp_2d = P[:, MIDDLE_MCP, :2]  # (n, 2)
    norm_2d = np.linalg.norm(mcp_2d, axis=1)  # (n,)
    valid = norm_2d > 1e-6
    mx = np.where(valid, mcp_2d[:, 0] / np.where(valid, norm_2d, 1.0), 0.0)
    my = np.where(valid, mcp_2d[:, 1] / np.where(valid, norm_2d, 1.0), -1.0)
    theta = np.arctan2(-1.0, 0.0) - np.arctan2(my, mx)  # (n,)
    c = np.cos(theta)
    s = np.sin(theta)
    xy = P[:, :, :2]  # (n, 21, 2)
    x_new = xy[:, :, 0] * c[:, None] - xy[:, :, 1] * s[:, None]
    y_new = xy[:, :, 0] * s[:, None] + xy[:, :, 1] * c[:, None]
    P[:, :, 0] = x_new
    P[:, :, 1] = y_new

    return P.reshape(len(P), 63)
