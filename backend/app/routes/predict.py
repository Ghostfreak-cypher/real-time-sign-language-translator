"""Prediction routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..models.schemas import LandmarkPayload, PredictionResponse

router = APIRouter(prefix="/api", tags=["prediction"])


@router.post("/predict", response_model=PredictionResponse)
async def predict(payload: LandmarkPayload, request: Request) -> PredictionResponse:
    classifier = request.app.state.classifier
    if not classifier.is_loaded:
        # Don't block demo - return a clear "no model" prediction
        return PredictionResponse(
            prediction="Model not trained",
            confidence=0.0,
            top_k=[],
            latency_ms=0.0,
        )
    try:
        label, confidence, top_k, latency_ms = classifier.predict(payload.landmarks)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PredictionResponse(
        prediction=label, confidence=confidence, top_k=top_k, latency_ms=latency_ms
    )
