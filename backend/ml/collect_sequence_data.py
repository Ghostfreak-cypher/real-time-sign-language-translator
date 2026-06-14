"""
Webcam tool for recording 30-frame gesture sequences for LSTM training.

Each recorded sequence is saved as a (30, 63) float32 .npy file under:
    dataset/sequences/<label>/seq_<n>.npy

Usage (run from the backend/ directory):
    python -m ml.collect_sequence_data --gesture J --sequences 60
    python -m ml.collect_sequence_data --gesture Z --sequences 60
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
    print("mediapipe is required: pip install mediapipe", file=sys.stderr)
    raise

DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "hand_landmarker.task"
SEQ_LEN = 30          # frames per sequence — must match lstm_classifier.py and train_lstm.py
FRAME_INTERVAL = 0.08  # seconds between frames within a sequence (~12 fps capture rate)
COUNTDOWN_SEC = 3      # countdown before each recording starts


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Record gesture sequences for LSTM training.")
    p.add_argument("--gesture", required=True, help="Gesture label (e.g. J, Z).")
    p.add_argument("--sequences", type=int, default=60, help="Number of sequences to record.")
    p.add_argument("--camera", type=int, default=0, help="Webcam device index.")
    p.add_argument("--out", type=Path, default=Path("dataset/sequences"))
    p.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    return p.parse_args()


def extract_landmarks(detector, frame_bgr: np.ndarray, ts_ms: float) -> np.ndarray | None:
    """Return (63,) float32 or None from a BGR frame."""
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    res = detector.detect_for_video(mp_image, int(ts_ms))
    if not res.hand_landmarks:
        return None
    hand = res.hand_landmarks[0]
    return np.array([[p.x, p.y, p.z] for p in hand], dtype=np.float32).flatten()


def draw_hud(
    frame: np.ndarray,
    gesture: str,
    state: str,
    seq_done: int,
    seq_total: int,
    frames_captured: int,
    countdown: float,
) -> None:
    h, w = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 60), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

    cv2.putText(frame, f"Gesture: {gesture}", (10, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 1)
    cv2.putText(frame, f"Sequences: {seq_done}/{seq_total}", (10, 46),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

    if state == "countdown":
        msg = f"Get ready... {countdown:.1f}s"
        color = (0, 200, 255)
    elif state == "recording":
        msg = f"Recording  {frames_captured}/{SEQ_LEN}"
        color = (0, 60, 255)
        # Red progress bar
        bar_w = int(w * frames_captured / SEQ_LEN)
        cv2.rectangle(frame, (0, h - 8), (bar_w, h), color, -1)
    else:
        msg = "Done! Press any key or wait..."
        color = (0, 220, 60)

    cv2.putText(frame, msg, (10, h - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    cv2.putText(frame, "Q = quit  SPACE = skip", (w - 240, h - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (150, 150, 150), 1)


def main() -> int:
    args = parse_args()
    if not args.model.exists():
        print(f"ERROR: model not found: {args.model}", file=sys.stderr)
        return 1

    out_dir = args.out / args.gesture
    out_dir.mkdir(parents=True, exist_ok=True)
    existing = len(list(out_dir.glob("seq_*.npy")))
    print(f"Recording {args.sequences} sequences for '{args.gesture}' -> {out_dir}")
    print(f"  ({existing} sequences already exist; new ones start at seq_{existing:04d}.npy)")

    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(args.model)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    detector = mp_vision.HandLandmarker.create_from_options(options)
    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    seq_done = 0
    seq_idx = existing

    try:
        while seq_done < args.sequences:
            # ── Countdown phase ───────────────────────────────────────────
            deadline = time.time() + COUNTDOWN_SEC
            while time.time() < deadline:
                ok, frame = cap.read()
                if not ok:
                    break
                frame = cv2.flip(frame, 1)
                remaining = max(0.0, deadline - time.time())
                draw_hud(frame, args.gesture, "countdown", seq_done, args.sequences, 0, remaining)
                cv2.imshow("Sequence Collector", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    return 0
                if key == ord(" "):
                    deadline = 0  # skip countdown

            # ── Recording phase ───────────────────────────────────────────
            frames: list[np.ndarray] = []
            last_frame_time = 0.0
            start_ts = time.time()

            while len(frames) < SEQ_LEN:
                ok, frame = cap.read()
                if not ok:
                    break
                frame = cv2.flip(frame, 1)
                now = time.time()
                ts_ms = (now - start_ts) * 1000.0

                if now - last_frame_time >= FRAME_INTERVAL:
                    lm = extract_landmarks(detector, frame, ts_ms)
                    if lm is not None:
                        frames.append(lm)
                        last_frame_time = now

                draw_hud(frame, args.gesture, "recording", seq_done, args.sequences,
                         len(frames), 0.0)
                cv2.imshow("Sequence Collector", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    return 0
                if key == ord(" "):
                    frames = []  # restart this sequence
                    last_frame_time = 0.0

            if len(frames) == SEQ_LEN:
                seq_arr = np.stack(frames)  # (30, 63)
                np.save(out_dir / f"seq_{seq_idx:04d}.npy", seq_arr)
                seq_idx += 1
                seq_done += 1
                print(f"  Saved sequence {seq_done}/{args.sequences}")

            # Brief "done" flash
            ok, frame = cap.read()
            if ok:
                frame = cv2.flip(frame, 1)
                draw_hud(frame, args.gesture, "done", seq_done, args.sequences, SEQ_LEN, 0.0)
                cv2.imshow("Sequence Collector", frame)
                cv2.waitKey(300)

    finally:
        cap.release()
        cv2.destroyAllWindows()
        detector.close()

    print(f"\nDone. {seq_done} sequences saved to {out_dir}")
    print("Next: python -m ml.train_lstm --dataset dataset/sequences --out ml/lstm_classifier.keras")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
