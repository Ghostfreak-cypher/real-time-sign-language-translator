"""
Train a Keras LSTM classifier on gesture sequences for motion signs (J, Z).

Loads (30, 63) .npy sequence files produced by collect_sequence_data.py,
applies the same normalize_batch transform used by the RF model and the
serving layer (train/serve consistency), trains a two-layer LSTM, and saves:
    ml/lstm_classifier.keras
    ml/lstm_classifier_labels.json

Usage (run from the backend/ directory):
    python -m ml.train_lstm \
        --dataset dataset/sequences \
        --out ml/lstm_classifier.keras \
        --epochs 50
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Tuple

import numpy as np

SEQ_LEN = 30  # must match collect_sequence_data.py and lstm_classifier.py


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train LSTM for motion signs.")
    p.add_argument("--dataset", type=Path, default=Path("dataset/sequences"))
    p.add_argument("--out", type=Path, default=Path("ml/lstm_classifier.keras"))
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--test-size", type=float, default=0.2)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def load_dataset(root: Path) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    if not root.exists():
        raise FileNotFoundError(f"Dataset directory not found: {root}")

    X: List[np.ndarray] = []
    y: List[int] = []
    labels: List[str] = []

    gesture_dirs = sorted(p for p in root.iterdir() if p.is_dir())
    if not gesture_dirs:
        raise RuntimeError(f"No gesture sub-directories found in {root}")

    for label_idx, gesture_dir in enumerate(gesture_dirs):
        label = gesture_dir.name
        files = sorted(gesture_dir.glob("seq_*.npy"))
        if not files:
            print(f"  ! Skipping empty class: {label}")
            continue
        labels.append(label)
        for f in files:
            arr = np.load(f)
            if arr.shape == (SEQ_LEN, 63):
                X.append(arr.astype(np.float32))
                y.append(label_idx)
            else:
                print(f"  ! Bad shape {arr.shape} in {f}, skipping")
        print(f"  + {label}: {len(files)} sequences")

    if not X:
        raise RuntimeError("No sequences found. Run collect_sequence_data.py first.")

    return np.stack(X), np.array(y, dtype=np.int32), labels


def main() -> int:
    args = parse_args()

    try:
        import tensorflow as tf  # noqa: PLC0415
    except ImportError:
        print("TensorFlow is required: pip install tensorflow>=2.17.0", file=sys.stderr)
        return 1

    from app.utils.landmarks import normalize_batch  # noqa: PLC0415

    np.random.seed(args.seed)
    tf.random.set_seed(args.seed)

    print(f"Loading sequences from {args.dataset} ...")
    X, y, labels = load_dataset(args.dataset)
    num_classes = len(labels)
    print(f"Loaded {X.shape[0]} sequences, {num_classes} classes: {labels}")

    # Normalize each frame with the same transform as the RF model.
    # X shape: (N, 30, 63) — reshape to (N*30, 63), normalize, reshape back.
    n = X.shape[0]
    X_flat = X.reshape(n * SEQ_LEN, 63)
    X_flat = normalize_batch(X_flat)
    X = X_flat.reshape(n, SEQ_LEN, 63)

    # Train / validation split (stratified manually)
    rng = np.random.default_rng(args.seed)
    indices = rng.permutation(n)
    split = int(n * (1 - args.test_size))
    train_idx, val_idx = indices[:split], indices[split:]
    X_train, y_train = X[train_idx], y[train_idx]
    X_val, y_val = X[val_idx], y[val_idx]

    # One-hot encode labels
    y_train_oh = tf.keras.utils.to_categorical(y_train, num_classes)
    y_val_oh = tf.keras.utils.to_categorical(y_val, num_classes)

    print(f"Training split: {len(X_train)}, Validation split: {len(X_val)}")

    # ── Model ─────────────────────────────────────────────────────────────────
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(SEQ_LEN, 63)),
        tf.keras.layers.LSTM(128, return_sequences=True),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.LSTM(64),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=10, restore_best_weights=True
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=5, min_lr=1e-5
        ),
    ]

    history = model.fit(
        X_train, y_train_oh,
        validation_data=(X_val, y_val_oh),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    val_acc = max(history.history.get("val_accuracy", [0]))
    print(f"\nBest validation accuracy: {val_acc * 100:.2f}%")

    # ── Save ──────────────────────────────────────────────────────────────────
    args.out.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(args.out))
    print(f"Saved model to {args.out}")

    labels_path = args.out.with_suffix(".labels.json")
    # Use the same stem but .labels.json extension
    labels_path = args.out.parent / (args.out.stem + "_labels.json")
    labels_path.write_text(json.dumps(labels, indent=2), encoding="utf-8")
    print(f"Saved labels to {labels_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
