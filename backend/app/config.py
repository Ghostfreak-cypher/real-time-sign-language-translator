"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Centralized application settings."""

    app_name: str = "Real-Time Sign Language Translator"
    api_version: str = "v1"
    debug: bool = False  # override with DEBUG=true in .env for local dev

    # CORS — override via CORS_ORIGINS="url1,url2" env var on the server
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

    @property
    def all_cors_origins(self) -> list[str]:
        import os
        extra = os.environ.get("CORS_ORIGINS", "")
        extras = [o.strip() for o in extra.split(",") if o.strip()]
        return list(dict.fromkeys(self.cors_origins + extras))

    # MongoDB
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "sign_language_translator"

    # RF model
    model_path: str = "ml/classifier.pkl"

    # LSTM sequence model (motion signs J, Z)
    lstm_model_path: str = "ml/lstm_classifier.keras"
    lstm_labels_path: str = "ml/lstm_classifier_labels.json"

    # Speech
    speech_rate: int = 175
    speech_volume: float = 1.0

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
