"""
Extract MediaPipe hand landmarks from an image dataset (e.g. the Kaggle
ASL Alphabet dataset) into the .npy format that train.py consumes.

For every image it runs MediaPipe Hands in static-image mode, takes the first
detected hand's 21 (x, y, z) landmarks, flattens them to 63 floats and saves:

    <out>/<label>/sample_<n>.npy

OpenCV preprocessing fallback: if MediaPipe cannot detect a hand in the raw
image, the image is retried with CLAHE contrast enhancement, then with a
sharpening kernel. This recovers landmarks from dark/blurry images that would
otherwise be silently skipped, increasing the dataset coverage.

Usage (run from the backend/ directory):
    python -m ml.extract_landmarks \
        --src dataset/asl_alphabet_train/asl_alphabet_train \
        --out dataset/landmarks \
        --limit-per-class 1000
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

try:
    import mediapipe as mp  # type: ignore
    from mediapipe.tasks import python as mp_python  # type: ignore
    from mediapipe.tasks.python import vision as mp_vision  # type: ignore
except ImportError:
    print("mediapipe is required. Install with: pip install mediapipe", file=sys.stderr)
    raise

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}
DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "hand_landmarker.task"
SKIP_CLASSES = {"nothing"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extract hand landmarks from images.")
    p.add_argument(
        "--src",
        type=Path,
        default=Path("dataset/asl_alphabet_train/asl_alphabet_train"),
        help="Root containing one subfolder per class.",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path("dataset/landmarks"),
        help="Output root for the .npy landmark dataset.",
    )
    p.add_argument(
        "--limit-per-class",
        type=int,
        default=1000,
        help="Max images to process per class (0 = no limit).",
    )
    p.add_argument(
        "--min-detection-confidence",
        type=float,
        default=0.3,
    )
    p.add_argument(
        "--model",
        type=Path,
        default=DEFAULT_MODEL,
        help="Path to the MediaPipe hand_landmarker.task model.",
    )
    p.add_argument(
        "--skip",
        nargs="*",
        default=sorted(SKIP_CLASSES),
        help="Class folder names to skip entirely.",
    )
    return p.parse_args()


# ── OpenCV preprocessing helpers ──────────────────────────────────────────────

def _apply_clahe(bgr: np.ndarray) -> np.ndarray:
    """Boost contrast with CLAHE on the L channel. Helps dark/low-contrast images."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def _apply_sharpen(bgr: np.ndarray) -> np.ndarray:
    """Apply an unsharp-mask sharpening kernel. Helps blurry images."""
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    return cv2.filter2D(bgr, -1, kernel)


# ── Landmark extraction ────────────────────────────────────────────────────────

def _detect(detector, bgr: np.ndarray) -> np.ndarray | None:
    """Run detector on a BGR image; return (63,) float32 or None."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    res = detector.detect(mp_image)
    if not res.hand_landmarks:
        return None
    hand = res.hand_landmarks[0]
    return np.array([[p.x, p.y, p.z] for p in hand], dtype=np.float32).flatten()


def extract_one(detector, img_path: Path) -> tuple[np.ndarray | None, str]:
    """Try original → CLAHE → sharpened until a hand is found.

    Returns (63-float vector | None, variant_label).
    variant_label is one of: "original", "clahe", "sharpened", "no_hand", "unreadable".
    """
    bgr = cv2.imread(str(img_path))
    if bgr is None:
        return None, "unreadable"

    for variant, img in (
        ("original", bgr),
        ("clahe", _apply_clahe(bgr)),
        ("sharpened", _apply_sharpen(bgr)),
    ):
        vec = _detect(detector, img)
        if vec is not None and vec.size == 63:
            return vec, variant

    return None, "no_hand"


def main() -> int:
    args = parse_args()
    if not args.src.exists():
        print(f"ERROR: source not found: {args.src}", file=sys.stderr)
        return 1

    skip = set(args.skip)
    class_dirs = sorted(p for p in args.src.iterdir() if p.is_dir())
    if not class_dirs:
        print(f"ERROR: no class subfolders under {args.src}", file=sys.stderr)
        return 1

    if not args.model.exists():
        print(f"ERROR: model not found: {args.model}", file=sys.stderr)
        return 1

    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(args.model)),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=args.min_detection_confidence,
    )
    detector = mp_vision.HandLandmarker.create_from_options(options)

    total_saved = 0
    total_missed = 0
    total_clahe = 0
    total_sharpened = 0
    start = time.time()

    for class_dir in class_dirs:
        label = class_dir.name
        if label in skip:
            print(f"  - skipping class: {label}")
            continue

        images = sorted(
            f for f in class_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS
        )
        if args.limit_per_class > 0:
            images = images[: args.limit_per_class]
        if not images:
            print(f"  ! no images in {label}")
            continue

        out_dir = args.out / label
        out_dir.mkdir(parents=True, exist_ok=True)

        saved = missed = clahe_hits = sharp_hits = 0
        for img_path in images:
            vec, variant = extract_one(detector, img_path)
            if vec is None:
                missed += 1
                continue
            np.save(out_dir / f"sample_{saved:05d}.npy", vec)
            saved += 1
            if variant == "clahe":
                clahe_hits += 1
            elif variant == "sharpened":
                sharp_hits += 1

        total_saved += saved
        total_missed += missed
        total_clahe += clahe_hits
        total_sharpened += sharp_hits
        pct = 100 * saved / max(len(images), 1)
        extra = ""
        if clahe_hits or sharp_hits:
            extra = f" [+{clahe_hits} clahe, +{sharp_hits} sharpened]"
        print(f"  + {label}: {saved}/{len(images)} extracted ({pct:.0f}%), {missed} no-hand{extra}")

    detector.close()
    elapsed = time.time() - start
    recovered = total_clahe + total_sharpened
    print(
        f"\nDone in {elapsed:.0f}s. Saved {total_saved} samples "
        f"({total_missed} images had no detectable hand)."
    )
    if recovered:
        print(f"OpenCV preprocessing recovered {recovered} extra samples "
              f"({total_clahe} via CLAHE, {total_sharpened} via sharpening).")
    print(f"Output -> {args.out}")
    if total_saved == 0:
        print("No samples extracted; nothing to train on.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
