"""Pydantic models for request/response schemas."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class LandmarkPayload(BaseModel):
    """63 landmark values (21 landmarks x [x, y, z])."""

    landmarks: List[float] = Field(
        ...,
        min_length=63,
        max_length=63,
        description="21 hand landmarks flattened to 63 values (x,y,z).",
    )
    handedness: Optional[str] = "Right"
    num_hands: Optional[int] = 1


class PredictionResponse(BaseModel):
    """Sign prediction response."""

    prediction: str
    confidence: float
    top_k: Optional[List[dict]] = None
    latency_ms: Optional[float] = None


class SequenceLandmarkPayload(BaseModel):
    """30-frame sequence of landmark vectors for motion sign classification."""

    sequence: List[List[float]] = Field(
        ...,
        min_length=30,
        max_length=30,
        description="30 frames, each a flat list of 63 landmark floats.",
    )

    @field_validator("sequence")
    @classmethod
    def validate_frame_length(cls, frames: List[List[float]]) -> List[List[float]]:
        for i, frame in enumerate(frames):
            if len(frame) != 63:
                raise ValueError(f"Frame {i} has {len(frame)} values; expected 63.")
        return frames


class SequencePredictionResponse(BaseModel):
    """Response from the motion-sign LSTM classifier."""

    prediction: str
    confidence: float
    latency_ms: Optional[float] = None


class HistoryItem(BaseModel):
    """A single history record."""

    text: str
    timestamp: datetime
    confidence: float
    prediction: str


class HistoryCreate(BaseModel):
    """Payload to create a new history record."""

    text: str
    confidence: float
    prediction: str


class SpeakRequest(BaseModel):
    """Text-to-speech request."""

    text: str
    rate: Optional[int] = 175
    volume: Optional[float] = 1.0


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    model_loaded: bool
    database: str
    version: str
