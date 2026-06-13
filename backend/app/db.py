"""MongoDB connection using motor (async)."""
from __future__ import annotations

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import settings

logger = logging.getLogger(__name__)


class Database:
    """Lazy database connection holder."""

    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None


database = Database()


async def connect_to_mongo() -> None:
    """Open MongoDB connection and ensure indexes."""
    try:
        database.client = AsyncIOMotorClient(settings.mongo_uri, serverSelectionTimeoutMS=2000)
        database.db = database.client[settings.mongo_db]
        # Trigger a ping to verify the connection
        await database.client.admin.command("ping")
        await database.db["history"].create_index("timestamp")
        logger.info("Connected to MongoDB at %s", settings.mongo_uri)
    except Exception as exc:  # noqa: BLE001
        logger.warning("MongoDB not reachable (%s). Continuing in offline mode.", exc)
        database.db = None


async def close_mongo_connection() -> None:
    """Close MongoDB connection."""
    if database.client:
        database.client.close()
        logger.info("Closed MongoDB connection")


def get_db() -> Optional[AsyncIOMotorDatabase]:
    """Return the active database handle (or None if not connected)."""
    return database.db
