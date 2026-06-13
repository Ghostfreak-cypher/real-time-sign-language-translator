"""Text-to-speech service using pyttsx3 (offline TTS)."""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import pyttsx3  # type: ignore

    PYTTSX3_AVAILABLE = True
except Exception as exc:  # noqa: BLE001
    logger.warning("pyttsx3 unavailable: %s", exc)
    PYTTSX3_AVAILABLE = False


class SpeechService:
    """Thread-safe offline TTS wrapper."""

    def __init__(self, rate: int = 175, volume: float = 1.0) -> None:
        self.rate = rate
        self.volume = volume
        self._lock = threading.Lock()
        self._engine = None
        if PYTTSX3_AVAILABLE:
            try:
                self._engine = pyttsx3.init()
                self._engine.setProperty("rate", rate)
                self._engine.setProperty("volume", volume)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to init pyttsx3 engine: %s", exc)
                self._engine = None

    def is_ready(self) -> bool:
        return self._engine is not None

    def speak_sync(self, text: str) -> None:
        if not text.strip():
            return
        with self._lock:
            try:
                if self._engine is None:
                    logger.info("[TTS fallback] %s", text)
                    return
                # Re-apply rate/volume before every utterance so changes made
                # via the /api/speak endpoint (which mutate self.rate / self.volume)
                # actually take effect instead of using the stale init values.
                self._engine.setProperty("rate", self.rate)
                self._engine.setProperty("volume", self.volume)
                self._engine.say(text)
                self._engine.runAndWait()
            except Exception as exc:  # noqa: BLE001
                logger.exception("TTS failed: %s", exc)

    async def speak(self, text: str) -> None:
        """Speak asynchronously without blocking the event loop.

        An asyncio lock ensures that concurrent requests queue up rather than
        spawning unbounded threads and exhausting the executor pool.
        """
        if not hasattr(self, "_alock"):
            self._alock = asyncio.Lock()
        async with self._alock:  # type: ignore[attr-defined]
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self.speak_sync, text)

    def set_muted(self, muted: bool) -> None:
        if self._engine is None:
            return
        try:
            self._engine.setProperty("volume", 0.0 if muted else self.volume)
        except Exception:  # noqa: BLE001
            pass
