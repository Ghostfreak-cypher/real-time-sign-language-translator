"""FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
import contextlib
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

    # Lightweight services — start synchronously (fast).
    app.state.history = HistoryService()
    app.state.speech = SpeechService(rate=settings.speech_rate, volume=settings.speech_volume)

    # Stub classifiers: point at a missing path so they return zero-confidence
    # predictions immediately while the real models load in the background.
    # This lets uvicorn bind the port before the heavy joblib/keras I/O runs.
    app.state.classifier = SignClassifier(model_path="__loading__")
    app.state.lstm_classifier = LSTMClassifier(
        model_path="__loading__", labels_path="__loading__"
    )

    loop = asyncio.get_event_loop()

    async def _load_models() -> None:
        logger.info("Loading ML models in background...")
        real_clf = await loop.run_in_executor(
            None, lambda: SignClassifier(model_path=settings.model_path)
        )
        app.state.classifier = real_clf

        real_lstm = await loop.run_in_executor(
            None,
            lambda: LSTMClassifier(
                model_path=settings.lstm_model_path,
                labels_path=settings.lstm_labels_path,
            ),
        )
        app.state.lstm_classifier = real_lstm
        logger.info(
            "Models ready — RF loaded=%s, LSTM loaded=%s",
            real_clf.is_loaded,
            real_lstm.is_loaded,
        )

    _load_task = asyncio.create_task(_load_models())

    yield

    _load_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await _load_task
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
