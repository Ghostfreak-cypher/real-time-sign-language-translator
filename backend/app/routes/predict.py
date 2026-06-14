"""Prediction routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..models.schemas import (
    LandmarkPayload,
    PredictionResponse,
    SequenceLandmarkPayload,
    SequencePredictionResponse,
)

router = APIRouter(prefix="/api", tags=["prediction"])


@router.post("/predict", response_model=PredictionResponse)
async def predict(payload: LandmarkPayload, request: Request) -> PredictionResponse:
    classifier = request.app.state.classifier
    if not classifier.is_loaded:
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


@router.post("/predict/sequence", response_model=SequencePredictionResponse)
async def predict_sequence(
    payload: SequenceLandmarkPayload, request: Request
) -> SequencePredictionResponse:
    lstm = getattr(request.app.state, "lstm_classifier", None)
    if lstm is None or not lstm.is_loaded:
        return SequencePredictionResponse(prediction="—", confidence=0.0, latency_ms=0.0)
    try:
        label, confidence, latency_ms = lstm.predict(payload.sequence)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SequencePredictionResponse(
        prediction=label, confidence=confidence, latency_ms=latency_ms
    )
