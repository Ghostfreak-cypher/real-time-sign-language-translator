"""Speech routes (text-to-speech)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..models.schemas import SpeakRequest

router = APIRouter(prefix="/api/speak", tags=["speech"])


@router.post("")
async def speak(payload: SpeakRequest, request: Request) -> dict:
    speech = request.app.state.speech
    if payload.rate is not None:  # explicit None check — rate=0 is a valid value
        try:
            speech.rate = int(payload.rate)
        except Exception:  # noqa: BLE001
            pass
    if payload.volume is not None:
        try:
            speech.volume = float(payload.volume)
        except Exception:  # noqa: BLE001
            pass
    await speech.speak(payload.text)
    return {"spoken": payload.text, "ok": True}
