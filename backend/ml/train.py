"""
Training script for the sign-language classifier.

Loads the dataset from dataset/<gesture>/sample_*.npy, trains a Random Forest
classifier, prints a classification report and saves the model bundle to
ml/classifier.pkl.

Usage:
    python -m ml.train --dataset dataset/landmarks --out ml/classifier.pkl
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
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

from app.utils.landmarks import (
    jitter_landmarks,
    mirror_landmarks,
    normalize_batch,
    scale_jitter_landmarks,
)

# Bump this tag whenever normalize_landmarks changes so the serving layer
# applies the identical transform.  "wrist_mcp_rot_v2" adds rotation
# alignment on top of the translation+scale of v1.
PREPROCESS_VERSION = "wrist_mcp_rot_v2"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train sign-language classifier.")
    p.add_argument("--dataset", type=Path, default=Path("dataset/landmarks"))
    p.add_argument("--out", type=Path, default=Path("ml/classifier.pkl"))
    p.add_argument("--test-size", type=float, default=0.2)
    p.add_argument("--n-estimators", type=int, default=100)
    p.add_argument(
        "--max-depth",
        type=int,
        default=15,
        help="Max tree depth. Lower = smaller model. 15 keeps accuracy while "
             "staying well under 100 MB for deployment on free-tier hosts.",
    )
    p.add_argument(
        "--compress",
        type=int,
        default=6,
        choices=range(10),
        metavar="0-9",
        help="joblib zlib compression level for the output pkl (0=none, 9=max). "
             "Default 6 cuts file size ~10x with minimal load-time overhead.",
    )
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--no-augment",
        action="store_true",
        help="Disable augmentation of the training split.",
    )
    p.add_argument(
        "--top-confused",
        type=int,
        default=10,
        help="Print the N most-confused label pairs after evaluation.",
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
        labels.append(label)
        for f in files:
            arr = np.load(f)
            if arr.size != 63:
                arr = arr.flatten()
                if arr.size != 63:
                    print(f"  ! Skipping bad sample: {f}")
                    continue
            X.append(arr.astype(np.float32))
            y.append(label)
        print(f"  + {label}: {len(files)} samples")

    if not X:
        raise RuntimeError("No samples found. Run extract_landmarks.py or collect_data.py first.")
    return np.stack(X), np.array(y), labels


def print_top_confused(y_true, y_pred, labels: List[str], n: int = 10) -> None:
    sorted_labels = sorted(set(labels))
    cm = confusion_matrix(y_true, y_pred, labels=sorted_labels)
    np.fill_diagonal(cm, 0)  # ignore correct predictions
    pairs = []
    for i in range(len(sorted_labels)):
        for j in range(len(sorted_labels)):
            if cm[i, j] > 0:
                pairs.append((cm[i, j], sorted_labels[i], sorted_labels[j]))
    pairs.sort(reverse=True)
    print(f"\nTop {n} confused pairs (true → predicted, count):")
    for count, true_lbl, pred_lbl in pairs[:n]:
        print(f"  {true_lbl:>6} → {pred_lbl:<6}  {count:>4}x")


def main() -> int:
    args = parse_args()
    print(f"Loading dataset from {args.dataset} ...")
    X, y, labels = load_dataset(args.dataset)
    print(f"Loaded {X.shape[0]} samples, {len(labels)} classes")

    # Geometric normalization: translation + scale + rotation alignment.
    # The serving layer applies the identical transform — app/utils/landmarks.py.
    X = normalize_batch(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    if not args.no_augment:
        rng = np.random.default_rng(args.seed)

        # Mirror: swap left/right hand (covers both handedness from one-handed data)
        mirrored = np.stack([mirror_landmarks(v) for v in X_train])

        # Multiple jitter passes with varying strength — the diversity is the point.
        # Mild, medium, strong, and strong+scale to cover the full range of live-video
        # variation that clean training stills don't include.
        jitter_configs = [
            dict(noise_std=0.02, max_rotation_deg=15),
            dict(noise_std=0.04, max_rotation_deg=25),
            dict(noise_std=0.03, max_rotation_deg=20),
            dict(noise_std=0.05, max_rotation_deg=30),
        ]
        jitter_batches = []
        for cfg in jitter_configs:
            jittered = np.stack([jitter_landmarks(v, rng, **cfg) for v in X_train])
            jitter_batches.append(jittered)

        # Scale jitter: simulate imprecise hand-size normalization
        scaled = np.stack([scale_jitter_landmarks(v, rng) for v in X_train])

        X_train = np.concatenate([X_train, mirrored, *jitter_batches, scaled])
        y_train = np.concatenate([y_train] * (2 + len(jitter_configs) + 1))
        print(f"Augmented training split -> {X_train.shape[0]} samples "
              f"(mirror + {len(jitter_configs)} jitter passes + scale jitter)")

    clf = RandomForestClassifier(
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        random_state=args.seed,
        n_jobs=-1,
        class_weight="balanced",
        min_samples_leaf=3,
        max_features="sqrt",
    )
    print(f"Training RandomForest ({args.n_estimators} trees, max_depth={args.max_depth}) ...")
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nTest accuracy: {acc * 100:.2f}%\n")
    print(classification_report(y_test, y_pred, zero_division=0))
    print_top_confused(y_test, y_pred, labels, n=args.top_confused)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": clf,
            "labels": sorted(set(labels)),
            "preprocess": PREPROCESS_VERSION,
        },
        args.out,
        compress=args.compress,
    )
    print(f"\nSaved model bundle to {args.out}")

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
