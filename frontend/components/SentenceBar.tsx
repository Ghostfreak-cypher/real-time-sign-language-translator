"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Volume2,
  VolumeX,
  Trash2,
  Save,
  Play,
  Mic,
  StopCircle,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  words: string[];
  text: string;
  onClear: () => void;
  onBackspace: () => void;
  onSave: (confidence: number) => Promise<void> | void;
  onSpeak: (text: string) => void;
  muted: boolean;
  speaking: boolean;
  onToggleMute: () => void;
  onStopSpeech: () => void;
  lastConfidence: number;
};

export function SentenceBar({
  words,
  text,
  onClear,
  onBackspace,
  onSave,
  onSpeak,
  muted,
  speaking,
  onToggleMute,
  onStopSpeech,
  lastConfidence,
}: Props) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text) return;
    setSaving(true);
    try {
      await onSave(lastConfidence);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Mic className="h-4 w-4 text-cyan-300" />
          Generated Sentence
        </div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="font-mono">{words.length} words</span>
          <span className="h-1 w-1 rounded-full bg-zinc-600" />
          <span className="font-mono">{text.length} chars</span>
        </div>
      </div>

      <div className="min-h-[88px] px-4 py-4">
        {words.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Your translated sentence will appear here. Detected signs are added
            automatically with smart spacing.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <AnimatePresence initial={false}>
              {words.map((w, i) => (
                <motion.span
                  key={`${w}-${i}`}
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-sm text-zinc-100"
                >
                  {w}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/5 bg-white/[0.02] px-3 py-2.5">
        <ActionButton
          onClick={onToggleMute}
          icon={
            muted ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )
          }
          label={muted ? "Unmute" : "Mute"}
          tone={muted ? "warn" : "default"}
        />
        {/*
          Single Speak/Stop toggle.
          - Not speaking: clicking calls onSpeak to start playback.
          - Speaking:     clicking calls onStopSpeech to cancel immediately.
          The redundant standalone "Stop" button that existed alongside this
          has been removed to eliminate the confusing duplicate controls.
        */}
        <ActionButton
          onClick={speaking ? onStopSpeech : () => onSpeak(text)}
          icon={
            speaking ? (
              <StopCircle className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )
          }
          label={speaking ? "Stop" : "Speak"}
          tone={speaking ? "active" : "primary"}
          disabled={!text && !speaking}
        />
        <div className="ml-auto flex items-center gap-2">
          <ActionButton
            onClick={onBackspace}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Backspace"
            tone="default"
            disabled={words.length === 0}
          />
          <ActionButton
            onClick={onClear}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Clear"
            tone="danger"
            disabled={words.length === 0}
          />
          <ActionButton
            onClick={handleSave}
            icon={<Save className="h-3.5 w-3.5" />}
            label={saving ? "Saving…" : "Save"}
            tone="success"
            disabled={!text || saving}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  tone = "default",
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "primary" | "active" | "warn" | "danger" | "success";
  disabled?: boolean;
}) {
  const toneClass = {
    default: "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
    primary:
      "border-violet-500/30 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25",
    active:
      "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    danger:
      "border-rose-500/20 bg-rose-500/5 text-rose-200 hover:bg-rose-500/15",
    success:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        toneClass,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
