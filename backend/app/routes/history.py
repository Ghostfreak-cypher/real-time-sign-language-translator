"""History routes."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from ..models.schemas import HistoryCreate, HistoryItem

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=List[HistoryItem])
async def list_history(
    request: Request,
    q: Optional[str] = Query(None, description="Free-text search"),
    limit: int = Query(100, ge=1, le=500),
) -> List[HistoryItem]:
    service = request.app.state.history
    return await service.list(q=q, limit=limit)


@router.post("", response_model=HistoryItem, status_code=201)
async def create_history(payload: HistoryCreate, request: Request) -> HistoryItem:
    service = request.app.state.history
    return await service.create(payload)


@router.delete("/{item_id}", status_code=204)
async def delete_history(item_id: str, request: Request) -> None:
    service = request.app.state.history
    ok = await service.delete(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="History item not found")
