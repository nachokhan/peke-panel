from fastapi import APIRouter, Depends, HTTPException, status
from models.v2 import (
    StackListResponse,
    StackDetailResponse,
)
from auth import get_current_user

# Read from the in-memory snapshot
from services.snapshot import (
    get_summary_snapshot,
    get_detail_snapshot,
)

router = APIRouter(
    prefix="/api/v2",
    tags=["v2"],
    responses={404: {"description": "Not found"}},
)


@router.get("/stacks", response_model=StackListResponse)
async def list_stacks(user: str = Depends(get_current_user)):
    """
    Returns all stacks with lightweight aggregated info.
    Does NOT block by calling the Docker daemon at this moment.
    Reads the pre-calculated snapshot refreshed in the background every ~2s.
    """
    stacks = get_summary_snapshot()
    return {"stacks": stacks}


@router.get("/stacks/{stack_id}", response_model=StackDetailResponse)
async def get_stack(stack_id: str, user: str = Depends(get_current_user)):
    """
    Returns detailed info of a stack.
    Uses internal memory cache (get_detail_snapshot).
    If not cached yet, it calculates it once using the optimized version
    (stats in parallel only for running containers) and then saves it.
    """
    stack_detail = get_detail_snapshot(stack_id)
    if stack_detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stack '{stack_id}' not found",
        )
    return stack_detail
