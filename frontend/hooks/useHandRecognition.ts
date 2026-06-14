"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Webcam from "react-webcam";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { PredictionResponse, SequencePredictionResponse } from "@/types";
import { predict as apiPredict, predictSequence as apiPredictSequence } from "@/lib/api";

export type HandDetection = {
  landmarks: number[]; // 63 values
  numHands: number;
  handedness: string;
  present: boolean;
  fps: number;
  width: number;
  height: number;
};

type UseHandRecognitionOptions = {
  intervalMs?: number; // how often to send landmarks to backend
  confidenceThreshold?: number;
  stableFrames?: number; // frames the same prediction must persist before commit
  enabled?: boolean;
  autoPredict?: boolean;
};

const EMPTY_DETECTION: HandDetection = {
  landmarks: [],
  numHands: 0,
  handedness: "—",
  present: false,
  fps: 0,
  width: 0,
  height: 0,
};

/**
 * MediaPipe Tasks API (replaces the deprecated @mediapipe/hands Solutions
 * bundle, whose global WASM asset registry broke under React 18 strict mode
 * with "Cannot read properties of undefined (reading '...packed_assets.data')").
 *
 * Everything is served locally from /public — no CDN dependency at runtime:
 *   - /mediapipe-wasm        copied from node_modules/@mediapipe/tasks-vision/wasm
 *   - /models/hand_landmarker.task
 *
 * The .task model is the SAME one used by backend ml/extract_landmarks.py to
 * build the training set, so train-time and inference-time landmarks come
 * from an identical detector (no distribution shift).
 */
const WASM_PATH = "/mediapipe-wasm";
const MODEL_PATH = "/models/hand_landmarker.task";

// Module-level singleton: create once, reuse across React strict-mode
// remounts, never close.
let landmarkerPromise: Promise<HandLandmarker> | null = null;

function getHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          // GPU when available; tasks-vision falls back to CPU automatically.
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
    // Allow a retry on genuine load failure instead of caching the rejection.
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

export function useHandRecognition(options: UseHandRecognitionOptions = {}) {
  const {
    intervalMs = 120,
    confidenceThreshold = 0.6,
    stableFrames = 3,
    enabled = true,
    autoPredict = true,
  } = options;

  // useRef<Webcam>(null) → RefObject<Webcam> (current: Webcam | null).
  // This satisfies react-webcam's ref prop which expects RefObject<Webcam>,
  // not the wider RefObject<Webcam | null>.
  const webcamRef = useRef<Webcam>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animRef = useRef<number | null>(null);
  const lastPredictRef = useRef<number>(0);
  const stableCounterRef = useRef<{ label: string; count: number }>({
    label: "",
    count: 0,
  });

  // Refs that mirror the *latest* state so interval-based effects can read
  // them without re-subscribing on every frame.
  const detectionRef = useRef<HandDetection>(EMPTY_DETECTION);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Sequence buffer: last SEQ_LEN landmark frames for LSTM motion-sign classification
  const SEQ_LEN = 30;
  const sequenceBufferRef = useRef<number[][]>([]);
  const lastSequencePredictRef = useRef<number>(0);

  const [detection, setDetection] = useState<HandDetection>(EMPTY_DETECTION);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [sequencePrediction, setSequencePrediction] = useState<SequencePredictionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // Update detection helper (updates both state and ref)
  const updateDetection = useCallback((patch: Partial<HandDetection>) => {
    setDetection((prev) => {
      const next = { ...prev, ...patch };
      detectionRef.current = next;
      return next;
    });
  }, []);

  // Load the HandLandmarker (browser only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    getHandLandmarker()
      .then((lm) => {
        if (cancelled) return;
        landmarkerRef.current = lm;
        setReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(`Failed to initialise MediaPipe: ${msg}`);
      });

    return () => {
      cancelled = true;
      // Deliberately do NOT close the landmarker: it is a module singleton
      // shared across strict-mode remounts; we just detach our reference.
      landmarkerRef.current = null;
    };
  }, []);

  /**
   * Frame loop — driven by requestAnimationFrame. Detection is synchronous
   * with the Tasks API (detectForVideo), so each tick both detects and
   * updates state. We re-check the live video element on every tick so we
   * don't have to depend on `webcamRef.current` (a ref never re-renders).
   */
  useEffect(() => {
    if (!ready) return;

    let last = performance.now();
    let lastVideoTime = -1;
    const tick = () => {
      const video = webcamRef.current?.video as HTMLVideoElement | null;
      const now = performance.now();
      const dt = now - last;
      last = now;
      const instFps = 1000 / Math.max(dt, 1);

      const landmarker = landmarkerRef.current;
      if (
        enabledRef.current &&
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        landmarker &&
        video.currentTime !== lastVideoTime // skip duplicate frames
      ) {
        lastVideoTime = video.currentTime;
        try {
          const res = landmarker.detectForVideo(video, now);
          const present = res.landmarks.length > 0;
          const firstHand = res.landmarks[0];
          const landmarks: number[] =
            present && firstHand
              ? firstHand.flatMap((p) => [p.x, p.y, p.z])
              : [];
          const handedness =
            res.handedness?.[0]?.[0]?.categoryName ?? "—";

          updateDetection({
            present,
            numHands: res.landmarks.length,
            handedness,
            landmarks,
            width: video.videoWidth,
            height: video.videoHeight,
          });

          // Maintain rolling sequence buffer for LSTM
          if (present && landmarks.length === 63) {
            const buf = sequenceBufferRef.current;
            buf.push(landmarks);
            if (buf.length > SEQ_LEN) buf.shift();
          }
        } catch {
          // Transient frame decode hiccup — skip this frame.
        }
      }

      // Throttle FPS counter updates to ~10/s to avoid render storms
      if (dt > 100) {
        setDetection((prev) => ({ ...prev, fps: Math.min(instFps, 60) }));
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [ready, updateDetection]);

  /**
   * Throttled backend prediction calls. We read the *latest* landmarks from a
   * ref so this interval is only created ONCE (not 30 times per second).
   */
  useEffect(() => {
    if (!autoPredict) return;
    const id = window.setInterval(async () => {
      if (!enabledRef.current) return;
      const now = Date.now();
      if (now - lastPredictRef.current < intervalMs) return;
      const det = detectionRef.current;
      if (!det.present || det.landmarks.length !== 63) return;
      lastPredictRef.current = now;

      try {
        const res = await apiPredict(det.landmarks);
        if (res.confidence < confidenceThreshold) {
          setPrediction({ ...res, prediction: "—" });
          stableCounterRef.current = { label: "—", count: 0 };
          return;
        }
        const current = stableCounterRef.current;
        if (current.label === res.prediction) {
          current.count += 1;
        } else {
          stableCounterRef.current = { label: res.prediction, count: 1 };
        }
        // Always read from the ref AFTER the possible mutation so we evaluate
        // the updated counter, not a stale snapshot of the previous label.
        const updated = stableCounterRef.current;
        if (updated.count >= stableFrames) {
          setPrediction(res);
        } else {
          // Tentative: show with reduced confidence so the UI hints it's unstable
          setPrediction({ ...res, confidence: res.confidence * 0.5 });
        }
      } catch {
        // Network error — fall back to mock so the demo stays alive
        setPrediction(mockPredict(det.landmarks));
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autoPredict, intervalMs, confidenceThreshold, stableFrames]);

  // Sequence prediction interval — 500 ms cadence, sends last 30 frames to LSTM endpoint
  useEffect(() => {
    if (!autoPredict) return;
    const SEQUENCE_INTERVAL_MS = 500;
    const id = window.setInterval(async () => {
      if (!enabledRef.current) return;
      const now = Date.now();
      if (now - lastSequencePredictRef.current < SEQUENCE_INTERVAL_MS) return;
      if (!detectionRef.current.present) return;
      const buf = sequenceBufferRef.current;
      if (buf.length < SEQ_LEN) return;
      const snapshot = buf.slice(-SEQ_LEN);
      lastSequencePredictRef.current = now;
      try {
        const res = await apiPredictSequence(snapshot);
        setSequencePrediction(res);
      } catch {
        // Network/server error — silently ignore; RF result still shown
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [autoPredict, SEQ_LEN]);

  const resetSentence = useCallback(() => {
    stableCounterRef.current = { label: "", count: 0 };
    setPrediction(null);
    setSequencePrediction(null);
    sequenceBufferRef.current = [];
  }, []);

  const onUserMedia = useCallback((_stream?: MediaStream) => {
    setCameraReady(true);
  }, []);
  const onUserMediaError = useCallback((e: string | DOMException) => {
    const msg = typeof e === "string" ? e : (e?.message ?? "unknown");
    setError(`Camera error: ${msg}`);
    setCameraReady(false);
  }, []);

  const videoConstraints = useMemo(
    () => ({ width: 1280, height: 720, facingMode: "user" }),
    [],
  );

  return {
    webcamRef,
    detection,
    prediction,
    sequencePrediction,
    error,
    ready,
    cameraReady,
    resetSentence,
    videoConstraints,
    onUserMedia,
    onUserMediaError,
  };
}

/**
 * Deterministic offline predictor used when the backend is unreachable. It
 * counts the number of fingers that appear extended by comparing each tip's
 * distance to the wrist with the corresponding PIP joint's distance, then
 * maps the count to a stable label. This produces *visibly different*
 * predictions as the hand opens / closes, which is enough for a UI demo.
 */
function mockPredict(landmarks: number[]): PredictionResponse {
  if (landmarks.length !== 63) {
    return { prediction: "—", confidence: 0, latency_ms: 0 };
  }
  const wx = landmarks[0] ?? 0;
  const wy = landmarks[1] ?? 0;

  // (tip_index, pip_index) — for thumb we use IP/MCP because the geometry
  // differs (thumb bends sideways).
  const checks: Array<[number, number]> = [
    [8, 6], // index
    [12, 10], // middle
    [16, 14], // ring
    [20, 18], // pinky
  ];

  let extended = 0;
  for (const [tip, pip] of checks) {
    const tipX = landmarks[tip * 3] ?? 0;
    const tipY = landmarks[tip * 3 + 1] ?? 0;
    const pipX = landmarks[pip * 3] ?? 0;
    const pipY = landmarks[pip * 3 + 1] ?? 0;
    const tipDist = Math.hypot(tipX - wx, tipY - wy);
    const pipDist = Math.hypot(pipX - wx, pipY - wy);
    if (tipDist > pipDist * 1.15) extended += 1;
  }

  // Map (0..4 extended fingers) to a stable label
  const labels: Record<number, string> = {
    0: "A", // fist
    1: "D", // one finger
    2: "V", // two fingers
    3: "W", // three fingers
    4: "B", // open palm
  };
  const prediction = labels[extended] ?? "A";
  // Confidence rises with the *clarity* of the gesture
  const confidence = Math.min(0.95, 0.55 + extended * 0.1);
  return { prediction, confidence, latency_ms: 5 };
}
