"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CameraOff,
  Loader2,
  Scan,
  Hand as HandIcon,
  ScanLine,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import type { HandDetection } from "@/hooks/useHandRecognition";
import type { PredictionResponse } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  webcamRef: React.RefObject<Webcam>;
  videoConstraints: MediaTrackConstraints;
  onUserMedia: (stream?: MediaStream) => void;
  onUserMediaError: (e: string | DOMException) => void;
  detection: HandDetection;
  prediction: PredictionResponse | null;
  enabled: boolean;
  ready: boolean;
  cameraReady: boolean;
  error: string | null;
  onToggle: () => void;
  className?: string;
};

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export function WebcamPanel({
  webcamRef,
  videoConstraints,
  onUserMedia,
  onUserMediaError,
  detection,
  prediction,
  enabled,
  ready,
  cameraReady,
  error,
  onToggle,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });

  // Keep the canvas backing store in sync with the video's intrinsic size so
  // landmark coordinates (which are normalized to [0,1]) map correctly.
  // Re-runs when the camera goes from "not ready" -> "ready".
  useEffect(() => {
    if (!enabled || !cameraReady) return;
    const video = webcamRef.current?.video as HTMLVideoElement | null;
    if (!video) return;

    const sync = () => {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      setCanvasSize({ width: w, height: h });
    };
    sync();
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("resize", sync);
    return () => {
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("resize", sync);
    };
  }, [enabled, cameraReady, webcamRef]);

  // Draw landmark overlay whenever the detection or canvas size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Account for device pixel ratio for crisp lines on hi-DPI screens.
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (canvas.width !== canvasSize.width * dpr) {
      canvas.width = canvasSize.width * dpr;
      canvas.height = canvasSize.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    if (!detection.present || detection.landmarks.length !== 63) return;

    const w = canvasSize.width;
    const h = canvasSize.height;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(167,139,250,0.85)";
    ctx.fillStyle = "rgba(6,182,212,0.95)";

    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 21; i++) {
      const x = (detection.landmarks[i * 3] ?? 0) * w;
      const y = (detection.landmarks[i * 3 + 1] ?? 0) * h;
      pts.push({ x, y });
    }

    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const p1 = pts[a];
      const p2 = pts[b];
      if (!p1 || !p2) continue;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    detection.landmarks,
    detection.present,
    canvasSize.width,
    canvasSize.height,
  ]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-card transition-shadow duration-500",
        detection.present && "neon-active",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full",
                detection.present ? "bg-emerald-400" : "bg-zinc-500",
              )}
              style={{ opacity: detection.present ? 0.6 : 0.2 }}
            />
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                detection.present ? "bg-emerald-400" : "bg-zinc-500",
              )}
            />
          </span>
          Live Webcam
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[10px] text-zinc-500 md:inline">
            {detection.width || canvasSize.width}×
            {detection.height || canvasSize.height}
          </span>
          <button
            onClick={onToggle}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
              enabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
          >
            {enabled ? (
              <Camera className="h-3.5 w-3.5" />
            ) : (
              <CameraOff className="h-3.5 w-3.5" />
            )}
            {enabled ? "Running" : "Paused"}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="scanlines relative aspect-video w-full bg-black"
      >
        {enabled ? (
          <>
            {/*
              We render the webcam un-mirrored here and let CSS handle the
              mirror so the canvas overlay stays in lock-step with the
              underlying pixels. Using the `mirrored` prop together with
              `transform: scaleX(-1)` was double-flipping the video and
              cancelling the selfie effect.
            */}
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              onUserMedia={onUserMedia}
              onUserMediaError={onUserMediaError}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ transform: "scaleX(-1)" }}
            />
            <ScanOverlay visible={detection.present} />
            <CornerBrackets locked={detection.present} />
            <PredictionOverlay
              prediction={prediction}
              present={detection.present}
            />
            {!ready && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading MediaPipe…
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-rose-300">
                {error}
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
            <CameraOff className="h-8 w-8" />
            <p className="text-sm">Camera paused</p>
            <button
              onClick={onToggle}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
            >
              <Camera className="h-3.5 w-3.5" /> Start
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-white/[0.02] text-center text-xs">
        <Stat
          label="Hands"
          value={String(detection.numHands)}
          icon={<HandIcon className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Landmarks"
          value={detection.present ? "21" : "0"}
          icon={<Scan className="h-3.5 w-3.5" />}
        />
        <Stat
          label="FPS"
          value={detection.fps ? Math.round(detection.fps).toString() : "—"}
          icon={<ScanLine className="h-3.5 w-3.5" />}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-zinc-400">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm font-semibold text-zinc-100">
        {value}
      </div>
    </div>
  );
}

function ScanOverlay({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
          <div className="scan-beam" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** HUD-style corner brackets that tighten + recolor when a hand locks on. */
function CornerBrackets({ locked }: { locked: boolean }) {
  const color = locked ? "border-cyan-400/90" : "border-white/20";
  const size = "h-6 w-6";
  return (
    <div
      className={cn(
        "pointer-events-none absolute transition-all duration-500",
        locked ? "inset-3" : "inset-5",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0 rounded-tl border-l-2 border-t-2 transition-colors duration-500",
          size,
          color,
        )}
      />
      <span
        className={cn(
          "absolute right-0 top-0 rounded-tr border-r-2 border-t-2 transition-colors duration-500",
          size,
          color,
        )}
      />
      <span
        className={cn(
          "absolute bottom-0 left-0 rounded-bl border-b-2 border-l-2 transition-colors duration-500",
          size,
          color,
        )}
      />
      <span
        className={cn(
          "absolute bottom-0 right-0 rounded-br border-b-2 border-r-2 transition-colors duration-500",
          size,
          color,
        )}
      />
      {locked && (
        <span className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-300/90">
          Tracking
        </span>
      )}
    </div>
  );
}

function PredictionOverlay({
  prediction,
  present,
}: {
  prediction: PredictionResponse | null;
  present: boolean;
}) {
  if (!present || !prediction) return null;
  if (
    prediction.prediction === "—" ||
    prediction.prediction === "Model not trained"
  ) {
    return null;
  }
  return (
    <motion.div
      key={prediction.prediction}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs backdrop-blur"
    >
      <span className="font-mono text-base font-semibold text-white">
        {prediction.prediction}
      </span>
      <span className="font-mono text-[10px] text-emerald-300">
        {(prediction.confidence * 100).toFixed(0)}%
      </span>
    </motion.div>
  );
}
