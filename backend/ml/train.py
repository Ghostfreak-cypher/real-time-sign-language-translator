"""
Training script for the sign-language classifier.

Loads the dataset from dataset/<gesture>/sample_*.npy, trains a Random Forest
classifier, prints a classification report and saves the model bundle to
ml/classifier.pkl.

Usage:
    python train.py --dataset dataset --out ml/classifier.pkl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Tuple

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

from app.utils.landmarks import (
    jitter_landmarks,
    mirror_landmarks,
    normalize_batch,
)

# Version tag stored in the model bundle so the serving layer applies the
# exact same preprocessing. Bump if normalize_landmarks ever changes.
PREPROCESS_VERSION = "wrist_mcp_v1"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train sign-language classifier.")
    p.add_argument("--dataset", type=Path, default=Path("dataset"))
    p.add_argument("--out", type=Path, default=Path("ml/classifier.pkl"))
    p.add_argument("--test-size", type=float, default=0.2)
    p.add_argument("--n-estimators", type=int, default=300)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--no-augment",
        action="store_true",
        help="Disable mirror + jitter augmentation of the training split.",
    )
    return p.parse_args()


def load_dataset(root: Path) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    if not root.exists():
        raise FileNotFoundError(f"Dataset directory not found: {root}")

    X: List[np.ndarray] = []
    y: List[str] = []
    labels: List[str] = []
    for gesture_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        label = gesture_dir.name
        files = sorted(gesture_dir.glob("*.npy"))
        if not files:
            print(f"  ! Skipping empty class: {label}")
            continue
        # Only register the label after confirming it has samples, so the
        # saved label list never contains classes with zero training examples.
        labels.append(label)
        for f in files:
            arr = np.load(f)
            if arr.size != 63:
                # Support both flattened (63,) and (21,3) shapes
                arr = arr.flatten()
                if arr.size != 63:
                    print(f"  ! Skipping bad sample: {f}")
                    continue
            X.append(arr.astype(np.float32))
            y.append(label)
        print(f"  + {label}: {len(files)} samples")

    if not X:
        raise RuntimeError("No samples found. Run collect_data.py first.")
    return np.stack(X), np.array(y), labels


def main() -> int:
    args = parse_args()
    print(f"Loading dataset from {args.dataset} ...")
    X, y, labels = load_dataset(args.dataset)
    print(f"Loaded {X.shape[0]} samples, {len(labels)} classes: {labels}")

    # Geometric normalization (translation + scale invariance). The serving
    # layer applies the identical transform — see app/utils/landmarks.py.
    X = normalize_batch(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    if not args.no_augment:
        # Augment the TRAIN split only (never the test set):
        #   - mirrored copies -> works for left AND right hands
        #   - rotation + noise jitter -> robustness to camera roll and the
        #     landmark wobble of live video that clean stills don't have
        rng = np.random.default_rng(args.seed)
        mirrored = np.stack([mirror_landmarks(v) for v in X_train])
        jittered = np.stack([jitter_landmarks(v, rng) for v in X_train])
        X_train = np.concatenate([X_train, mirrored, jittered])
        y_train = np.concatenate([y_train, y_train, y_train])
        print(f"Augmented training split -> {X_train.shape[0]} samples")

    clf = RandomForestClassifier(
        n_estimators=args.n_estimators,
        random_state=args.seed,
        n_jobs=-1,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {acc * 100:.2f}%\n")
    print(classification_report(y_test, y_pred, zero_division=0))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": clf,
            "labels": sorted(set(labels)),
            "preprocess": PREPROCESS_VERSION,
        },
        args.out,
    )
    print(f"Saved model bundle to {args.out}")

    metrics_path = args.out.with_suffix(".metrics.json")
    metrics_path.write_text(
        json.dumps(
            {
                "accuracy": acc,
                "labels": sorted(set(labels)),
                "preprocess": PREPROCESS_VERSION,
            },
            indent=2,
        )
    )
    print(f"Saved metrics to {metrics_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
