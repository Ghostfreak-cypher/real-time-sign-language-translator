"""
Dataset collection utility.

Captures webcam frames, detects a single hand with MediaPipe, extracts the
21 (x, y, z) landmarks and saves them to:

    dataset/<gesture>/sample_<n>.npy

Usage:
    python collect_data.py --gesture A --samples 200
    python collect_data.py --gesture Hello --samples 150 --camera 0
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

DEFAULT_LANDMARKER = Path(__file__).resolve().parent / "models" / "hand_landmarker.task"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Collect sign-language landmark samples.")
    p.add_argument("--gesture", required=True, help="Gesture label, e.g. A, Hello")
    p.add_argument("--samples", type=int, default=200, help="Number of samples to capture")
    p.add_argument("--camera", type=int, default=0, help="Webcam index")
    p.add_argument(
        "--out",
        type=Path,
        default=Path("dataset"),
        help="Output dataset root directory",
    )
    p.add_argument("--delay", type=float, default=0.05, help="Seconds between captures")
    p.add_argument("--max-hands", type=int, default=1)
    p.add_argument(
        "--landmarker",
        type=Path,
        default=DEFAULT_LANDMARKER,
        help="Path to the MediaPipe hand_landmarker.task model.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    out_dir: Path = args.out / args.gesture
    out_dir.mkdir(parents=True, exist_ok=True)

    if not args.landmarker.exists():
        print(
            f"ERROR: hand landmarker model not found: {args.landmarker}. "
            "Download hand_landmarker.task into ml/models/.",
            file=sys.stderr,
        )
        return 1

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam.", file=sys.stderr)
        return 1

    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(args.landmarker)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=args.max_hands,
        min_hand_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )
    detector = mp_vision.HandLandmarker.create_from_options(options)

    print(f"Collecting '{args.gesture}' into {out_dir}. Press 'q' to stop early.")

    count = 0
    last_t = 0.0
    while count < args.samples:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = detector.detect_for_video(mp_image, int(time.time() * 1000))

        now = time.time()
        if res.hand_landmarks and (now - last_t) > args.delay:
            for hand_landmarks in res.hand_landmarks:
                lm = np.array([[p.x, p.y, p.z] for p in hand_landmarks], dtype=np.float32)
                np.save(out_dir / f"sample_{count:05d}.npy", lm.flatten())
                count += 1
                if count >= args.samples:
                    break
            last_t = now

        cv2.putText(
            frame,
            f"Gesture: {args.gesture}  {count}/{args.samples}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 255, 0),
            2,
        )
        cv2.imshow("Collect Data", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    detector.close()
    cv2.destroyAllWindows()
    print(f"Saved {count} samples to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
