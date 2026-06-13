"""
Standalone prediction script.

Opens the webcam, detects a hand, predicts the gesture with the trained model
and overlays the prediction on the live frame. Useful for quick smoke-tests
without the FastAPI server.

Usage:
    python predict.py --model ml/classifier.pkl
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import cv2
import joblib
import numpy as np

from app.utils.landmarks import normalize_landmarks

try:
    import mediapipe as mp  # type: ignore
    from mediapipe.tasks import python as mp_python  # type: ignore
    from mediapipe.tasks.python import vision as mp_vision  # type: ignore
except ImportError:
    raise SystemExit("mediapipe is required: pip install mediapipe")

DEFAULT_LANDMARKER = Path(__file__).resolve().parent / "models" / "hand_landmarker.task"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Live sign prediction.")
    p.add_argument("--model", type=Path, default=Path("ml/classifier.pkl"))
    p.add_argument("--camera", type=int, default=0)
    p.add_argument("--threshold", type=float, default=0.6, help="Min confidence to accept")
    p.add_argument(
        "--landmarker",
        type=Path,
        default=DEFAULT_LANDMARKER,
        help="Path to the MediaPipe hand_landmarker.task model.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.model.exists():
        raise SystemExit(f"Model not found: {args.model}. Run train.py first.")

    if not args.landmarker.exists():
        raise SystemExit(
            f"Hand landmarker model not found: {args.landmarker}. "
            "Download hand_landmarker.task into ml/models/."
        )

    bundle = joblib.load(args.model)
    model = bundle["model"] if isinstance(bundle, dict) else bundle
    preprocess = bundle.get("preprocess") if isinstance(bundle, dict) else None

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit("Cannot open webcam")

    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(args.landmarker)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )
    detector = mp_vision.HandLandmarker.create_from_options(options)

    prev = time.time()
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = detector.detect_for_video(mp_image, int(time.time() * 1000))

        label, conf = "—", 0.0
        if res.hand_landmarks:
            hand_landmarks = res.hand_landmarks[0]
            arr = np.array([[p.x, p.y, p.z] for p in hand_landmarks], dtype=np.float32)
            vec = arr.flatten()
            if preprocess:
                vec = normalize_landmarks(vec)
            arr = vec.reshape(1, -1)
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(arr)[0]
                idx = int(np.argmax(probs))
                conf = float(probs[idx])
                label = str(model.classes_[idx])
            else:
                label = str(model.predict(arr)[0])
                conf = 1.0

        if conf < args.threshold:
            label = "—"

        now = time.time()
        fps = 1.0 / max(now - prev, 1e-6)
        prev = now

        cv2.putText(
            frame,
            f"{label}  ({conf*100:.1f}%)  FPS:{fps:.0f}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 255, 0) if conf >= args.threshold else (0, 0, 255),
            2,
        )
        cv2.imshow("Predict", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    detector.close()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
