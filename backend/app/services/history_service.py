"""History service (MongoDB-backed, with in-memory fallback)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from ..db import get_db
from ..models.schemas import HistoryCreate, HistoryItem

logger = logging.getLogger(__name__)


# Maximum number of items kept in the in-memory fallback store.
# Prevents unbounded growth when MongoDB is offline for an extended period.
_MAX_MEMORY: int = 500


class HistoryService:
    """Persist translation history. Uses MongoDB if available, else in-memory."""

    def __init__(self) -> None:
        self._memory: List[dict] = []

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def _append_memory(self, item: dict) -> None:
        """Append to the in-memory store and enforce the size cap."""
        self._memory.append(item)
        if len(self._memory) > _MAX_MEMORY:
            self._memory = self._memory[-_MAX_MEMORY:]

    async def create(self, payload: HistoryCreate) -> HistoryItem:
        item = {
            # Use a random UUID so IDs stay unique across deletions and
            # restarts, preventing collisions in the in-memory fallback.
            "_id": str(uuid.uuid4()),
            "text": payload.text,
            "prediction": payload.prediction,
            "confidence": float(payload.confidence),
            "timestamp": self._now(),
        }
        db = get_db()
        if db is not None:
            try:
                res = await db["history"].insert_one(item.copy())
                item["_id"] = str(res.inserted_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Mongo insert failed, using memory: %s", exc)
                # MongoDB is available but the insert failed — fall back to
                # the in-memory store so the create call still succeeds.
                self._append_memory(item)
        else:
            self._append_memory(item)
        return HistoryItem(
            text=item["text"],
            prediction=item["prediction"],
            confidence=item["confidence"],
            timestamp=item["timestamp"],
        )

    async def list(
        self, q: Optional[str] = None, limit: int = 100
    ) -> List[HistoryItem]:
        db = get_db()
        items: List[dict] = []
        if db is not None:
            try:
                cursor = db["history"].find().sort("timestamp", -1).limit(limit)
                async for doc in cursor:
                    items.append(doc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Mongo list failed: %s", exc)
        if not items:
            items = list(reversed(self._memory))[:limit]

        if q:
            q_lower = q.lower()
            items = [d for d in items if q_lower in (d.get("text", "") or "").lower()]

        out: List[HistoryItem] = []
        for d in items:
            out.append(
                HistoryItem(
                    text=d.get("text", ""),
                    prediction=d.get("prediction", ""),
                    confidence=float(d.get("confidence", 0.0)),
                    timestamp=d.get("timestamp", self._now()),
                )
            )
        return out

    async def delete(self, item_id: str) -> bool:
        db = get_db()
        if db is not None:
            try:
                from bson import ObjectId  # type: ignore

                try:
                    oid = ObjectId(item_id)
                except Exception:
                    oid = item_id
                res = await db["history"].delete_one({"_id": oid})
                return res.deleted_count > 0
            except Exception as exc:  # noqa: BLE001
                logger.warning("Mongo delete failed: %s", exc)
        before = len(self._memory)
        self._memory = [m for m in self._memory if str(m.get("_id")) != item_id]
        return len(self._memory) < before
