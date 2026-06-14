"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import close_mongo_connection, connect_to_mongo, get_db
from .routes import history, predict, speech
from .services.classifier import SignClassifier
from .services.history_service import HistoryService
from .services.lstm_classifier import LSTMClassifier
from .services.speech import SpeechService

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("sign-translator")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise and tear down shared resources."""
    logger.info("Starting %s", settings.app_name)
    await connect_to_mongo()

    app.state.classifier = SignClassifier(model_path=settings.model_path)
    app.state.lstm_classifier = LSTMClassifier(
        model_path=settings.lstm_model_path,
        labels_path=settings.lstm_labels_path,
    )
    app.state.history = HistoryService()
    app.state.speech = SpeechService(
        rate=settings.speech_rate, volume=settings.speech_volume
    )

    yield

    logger.info("Shutting down")
    await close_mongo_connection()


app = FastAPI(
    title=settings.app_name,
    version=settings.api_version,
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.all_cors_origins,  # never include "*" with credentials
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(predict.router)
app.include_router(history.router)
app.include_router(speech.router)


@app.get("/", tags=["meta"])
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.api_version,
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
async def health() -> dict:
    db = get_db()
    classifier = getattr(app.state, "classifier", None)
    lstm = getattr(app.state, "lstm_classifier", None)
    return {
        "status": "ok",
        "model_loaded": classifier.is_loaded if classifier else False,
        "lstm_loaded": lstm.is_loaded if lstm else False,
        "database": "connected" if db is not None else "offline",
        "version": settings.api_version,
    }
