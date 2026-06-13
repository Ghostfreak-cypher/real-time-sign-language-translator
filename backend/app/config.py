"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Centralized application settings."""

    app_name: str = "Real-Time Sign Language Translator"
    api_version: str = "v1"
    debug: bool = False  # override with DEBUG=true in .env for local dev

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

    # MongoDB
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "sign_language_translator"

    # Model
    model_path: str = "ml/classifier.pkl"

    # Speech
    speech_rate: int = 175
    speech_volume: float = 1.0

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
