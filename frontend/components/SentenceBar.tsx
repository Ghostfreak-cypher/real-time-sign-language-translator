"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, Trash2, Save, Play, Mic, StopCircle } from "lucide-react";
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
  words, text, onClear, onBackspace, onSave, onSpeak,
  muted, speaking, onToggleMute, onStopSpeech, lastConfidence,
}: Props) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text) return;
    setSaving(true);
    try { await onSave(lastConfidence); } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-card">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <Mic className="h-4 w-4 text-brand" />
          Generated Sentence
        </div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone-400">
          <span className="font-mono">{words.length} words</span>
          <span className="h-1 w-1 rounded-full bg-stone-300" />
          <span className="font-mono">{text.length} chars</span>
        </div>
      </div>

      {/* Sentence display */}
      <div className="min-h-[88px] px-4 py-4">
        {words.length === 0 ? (
          <p className="text-sm text-stone-400">
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
                  className="rounded-lg border border-brand-muted/40 bg-brand-light px-2.5 py-0.5 text-sm font-medium text-brand-dark"
                >
                  {w}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 bg-stone-50/60 px-3 py-2.5">
        <ActionButton
          onClick={onToggleMute}
          icon={muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          label={muted ? "Unmute" : "Mute"}
          tone={muted ? "warn" : "default"}
        />
        <ActionButton
          onClick={speaking ? onStopSpeech : () => onSpeak(text)}
          icon={speaking ? <StopCircle className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          label={speaking ? "Stop" : "Speak"}
          tone={speaking ? "danger" : "primary"}
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
  onClick, icon, label, tone = "default", disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "primary" | "danger" | "warn" | "success";
  disabled?: boolean;
}) {
  const toneClass = {
    default: "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100 hover:text-stone-800",
    primary: "border-brand-muted/50 bg-brand-light text-brand hover:bg-brand/10",
    danger:  "border-red-200    bg-red-50    text-red-600   hover:bg-red-100",
    warn:    "border-amber-200  bg-amber-50  text-amber-700 hover:bg-amber-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
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
