"""
Guided webcam data collection + automatic retrain.

Walks through every gesture in COLLECT_GESTURES, counts down, records
samples only when the detector is confident, draws the skeleton live,
then retrains the model when all gestures are done.

Run from the backend/ directory:
    python -m ml.live_collect
    python -m ml.live_collect --gestures A B C          # specific letters only
    python -m ml.live_collect --samples 150 --camera 1  # custom count / camera
    python -m ml.live_collect --no-retrain               # skip retrain step

Controls
--------
  SPACE  -- skip current gesture (already have enough data)
  Q      -- quit completely (partial data is kept)
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np

try:
    import mediapipe as mp  # type: ignore
    from mediapipe.tasks import python as mp_python  # type: ignore
    from mediapipe.tasks.python import vision as mp_vision  # type: ignore
except ImportError:
    raise SystemExit("pip install mediapipe")

# ── Gesture list ────────────────────────────────────────────────────────────
# Edit freely.  Letters are always valuable; add/remove phrases as needed.
DEFAULT_GESTURES: List[str] = [
    # ASL static letters (A–Z, excluding dynamic J and Z unless you want them)
    "A", "B", "C", "D", "E", "F", "G", "H", "I",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S",
    "T", "U", "V", "W", "X", "Y",
    # Common words  (record these last — they take more focus)
    "del", "space",
]

DEFAULT_LANDMARKER = Path(__file__).resolve().parent / "models" / "hand_landmarker.task"

# ── Skeleton connections ─────────────────────────────────────────────────────
CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (0,5),(5,6),(6,7),(7,8),
    (5,9),(9,10),(10,11),(11,12),
    (9,13),(13,14),(14,15),(15,16),
    (13,17),(17,18),(18,19),(19,20),
    (0,17),
]


# ── Drawing helpers ──────────────────────────────────────────────────────────

def draw_skeleton(frame: np.ndarray, landmarks: list, color=(0, 220, 180)) -> None:
    h, w = frame.shape[:2]
    pts = [(int(p.x * w), int(p.y * h)) for p in landmarks]
    for a, b in CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], color, 2, cv2.LINE_AA)
    for x, y in pts:
        cv2.circle(frame, (x, y), 4, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (x, y), 4, color, 1, cv2.LINE_AA)


def put_text(
    frame: np.ndarray,
    text: str,
    pos: tuple,
    scale: float = 0.8,
    color=(255, 255, 255),
    thickness: int = 2,
    shadow: bool = True,
) -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    if shadow:
        cv2.putText(frame, text, (pos[0]+2, pos[1]+2), font, scale, (0,0,0), thickness+1, cv2.LINE_AA)
    cv2.putText(frame, text, pos, font, scale, color, thickness, cv2.LINE_AA)


def draw_hud(
    frame: np.ndarray,
    gesture: str,
    count: int,
    target: int,
    fps: float,
    state: str,          # "countdown" | "recording" | "done"
    countdown_sec: Optional[float] = None,
) -> None:
    h, w = frame.shape[:2]
    bar_h = 52
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, bar_h), (15, 15, 25), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # Gesture name
    put_text(frame, f"Gesture: {gesture}", (12, 34), scale=1.0,
             color=(100, 220, 255), thickness=2)

    # FPS
    put_text(frame, f"{fps:.0f} FPS", (w - 110, 34), scale=0.65,
             color=(170, 170, 170), thickness=1)

    # Progress bar
    bar_y = h - 28
    cv2.rectangle(frame, (12, bar_y), (w - 12, bar_y + 16), (50, 50, 60), -1)
    filled = int((w - 24) * min(count / max(target, 1), 1.0))
    bar_color = (0, 200, 120) if state == "recording" else (60, 60, 80)
    if filled > 0:
        cv2.rectangle(frame, (12, bar_y), (12 + filled, bar_y + 16), bar_color, -1)
    put_text(frame, f"{count} / {target}", (12, bar_y - 6), scale=0.55,
             color=(200, 200, 200), thickness=1, shadow=False)

    # State badge
    if state == "countdown" and countdown_sec is not None:
        t = f"Get ready… {int(countdown_sec) + 1}"
        put_text(frame, t, (w // 2 - 130, h // 2 + 10), scale=1.5,
                 color=(255, 200, 50), thickness=3)
    elif state == "recording":
        dot_color = (0, 255, 100) if (int(time.time() * 2) % 2 == 0) else (0, 160, 60)
        cv2.circle(frame, (w - 28, 28), 9, dot_color, -1, cv2.LINE_AA)
        put_text(frame, "REC", (w - 80, 34), scale=0.65,
                 color=dot_color, thickness=1)
    elif state == "done":
        put_text(frame, "Done!", (w // 2 - 50, h // 2 + 10), scale=1.5,
                 color=(80, 255, 130), thickness=3)

    # Controls hint
    put_text(frame, "[SPACE] skip   [Q] quit", (12, h - 40), scale=0.45,
             color=(120, 120, 120), thickness=1, shadow=False)


# ── Core collect loop ────────────────────────────────────────────────────────

def collect_gesture(
    gesture: str,
    target: int,
    out_dir: Path,
    cap: cv2.VideoCapture,
    detector: mp_vision.HandLandmarker,
    delay_s: float = 0.04,
    countdown_s: float = 3.0,
    min_confidence: float = 0.65,
) -> int:
    """Returns number of samples saved (0 if skipped / quit)."""
    out_dir.mkdir(parents=True, exist_ok=True)

    # How many samples already exist for this gesture
    existing = sorted(out_dir.glob("sample_*.npy"))
    start_idx = len(existing)
    if start_idx >= target:
        print(f"  '{gesture}' already has {start_idx} samples — skipping.")
        return start_idx

    count = start_idx
    print(f"\n{'─'*50}")
    print(f"  Gesture : {gesture}")
    print(f"  Need    : {target - count} more samples  (have {count})")
    print(f"  Output  : {out_dir}")
    print(f"{'─'*50}")

    state = "countdown"
    countdown_start = time.time()
    last_save_t = 0.0
    fps = 0.0
    last_fps_t = time.time()
    frames_since_fps = 0
    quit_requested = False

    while count < target:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)

        # FPS calc
        frames_since_fps += 1
        now = time.time()
        elapsed_fps = now - last_fps_t
        if elapsed_fps >= 0.5:
            fps = frames_since_fps / elapsed_fps
            frames_since_fps = 0
            last_fps_t = now

        # Landmark detection
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = detector.detect_for_video(mp_img, int(now * 1000))

        hand_present = bool(res.hand_landmarks)

        # Draw skeleton if detected
        if hand_present:
            draw_skeleton(frame, res.hand_landmarks[0])

        # State machine
        elapsed_cd = now - countdown_start
        if state == "countdown":
            remaining = max(0.0, countdown_s - elapsed_cd)
            draw_hud(frame, gesture, count, target, fps, "countdown",
                     countdown_sec=remaining)
            if elapsed_cd >= countdown_s:
                state = "recording"

        elif state == "recording":
            draw_hud(frame, gesture, count, target, fps, "recording")
            if hand_present and (now - last_save_t) >= delay_s:
                lm = res.hand_landmarks[0]
                # Basic confidence gate: wrist and middle-MCP must be
                # far enough apart relative to the frame (hand is visible)
                wrist = lm[0]
                mcp = lm[9]
                dist = ((wrist.x - mcp.x)**2 + (wrist.y - mcp.y)**2) ** 0.5
                if dist > 0.04:  # ~4% of frame diagonal — rejects partial detections
                    arr = np.array([[p.x, p.y, p.z] for p in lm],
                                   dtype=np.float32).flatten()
                    np.save(out_dir / f"sample_{count:05d}.npy", arr)
                    count += 1
                    last_save_t = now

        cv2.imshow("Sign Bridge — Data Collection", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            quit_requested = True
            break
        if key == ord(" "):
            print(f"  Skipped '{gesture}' at {count} samples.")
            break

    # Brief "Done" flash
    if not quit_requested and count >= target:
        for _ in range(18):
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)
            draw_hud(frame, gesture, count, target, fps, "done")
            cv2.imshow("Sign Bridge — Data Collection", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    saved_this_run = count - start_idx
    print(f"  Saved {saved_this_run} new samples for '{gesture}' (total: {count})")
    if quit_requested:
        return -1  # signal to outer loop to break
    return count


# ── Entry point ──────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Guided webcam collection + auto-retrain."
    )
    p.add_argument(
        "--gestures", nargs="+", default=None,
        metavar="LABEL",
        help="Gestures to collect. Defaults to all DEFAULT_GESTURES.",
    )
    p.add_argument("--samples", type=int, default=200,
                   help="Target samples per gesture (default 200).")
    p.add_argument("--out", type=Path, default=Path("dataset/landmarks"),
                   help="Root dataset directory (default dataset/landmarks).")
    p.add_argument("--camera", type=int, default=0,
                   help="Webcam index (default 0).")
    p.add_argument("--countdown", type=float, default=3.0,
                   help="Countdown seconds before each gesture (default 3).")
    p.add_argument("--delay", type=float, default=0.04,
                   help="Min seconds between saved frames (default 0.04 → ~25 fps).")
    p.add_argument("--landmarker", type=Path, default=DEFAULT_LANDMARKER)
    p.add_argument("--no-retrain", action="store_true",
                   help="Skip retraining after collection.")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    gestures: List[str] = args.gestures or DEFAULT_GESTURES

    if not args.landmarker.exists():
        raise SystemExit(
            f"ERROR: hand landmarker not found at {args.landmarker}.\n"
            "Make sure ml/models/hand_landmarker.task exists."
        )

    # Init webcam
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit("ERROR: Cannot open webcam.")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # Init detector (VIDEO mode = fast tracking between frames)
    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(
            model_asset_path=str(args.landmarker)
        ),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    detector = mp_vision.HandLandmarker.create_from_options(options)

    print("\n╔══════════════════════════════════════════════╗")
    print("║   Sign Bridge  —  Webcam Data Collection     ║")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  Gestures  : {len(gestures)} total{' ' * (32 - len(str(len(gestures))))}║")
    print(f"║  Samples   : {args.samples} per gesture{' ' * (24 - len(str(args.samples)))}║")
    print(f"║  Output    : {str(args.out)[:32]:32s}║")
    print("╠══════════════════════════════════════════════╣")
    print("║  SPACE = skip gesture    Q = quit early      ║")
    print("╚══════════════════════════════════════════════╝\n")

    collected: List[str] = []
    for gesture in gestures:
        out_dir = args.out / gesture
        result = collect_gesture(
            gesture=gesture,
            target=args.samples,
            out_dir=out_dir,
            cap=cap,
            detector=detector,
            delay_s=args.delay,
            countdown_s=args.countdown,
        )
        if result == -1:
            print("\nQuit requested — stopping collection.")
            break
        if result >= args.samples:
            collected.append(gesture)

    cap.release()
    detector.close()
    cv2.destroyAllWindows()

    print(f"\nCollection complete. Gestures finished: {collected}")

    if args.no_retrain:
        print("Skipping retrain (--no-retrain). Run manually:")
        print(f"  python -m ml.train --dataset {args.out}")
        return 0

    # ── Auto retrain ──────────────────────────────────────────────────────────
    print("\n" + "═" * 50)
    print("  Retraining model on merged dataset …")
    print("═" * 50 + "\n")

    retrain_cmd = [
        sys.executable, "-m", "ml.train",
        "--dataset", str(args.out),
        "--out", "ml/classifier.pkl",
    ]
    result = subprocess.run(retrain_cmd, cwd=Path(__file__).resolve().parent.parent)

    if result.returncode == 0:
        print("\n✓ Model retrained successfully — ml/classifier.pkl updated.")
        print("  Restart the FastAPI server to load the new model:")
        print("  uvicorn app.main:app --reload --port 8000")
    else:
        print("\n✗ Training failed. Check the output above.")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
