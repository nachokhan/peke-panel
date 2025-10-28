from fastapi import APIRouter, Depends, HTTPException, status
from models.v2 import (
    StackListResponse,
    StackDetailResponse,
)
from services.docker_service_v3 import (
    get_stack_summaries_cached,
    get_stack_detail_cached,
)
from auth import get_current_user

router = APIRouter(
    prefix="/api/v2",
    tags=["v2"],
    responses={404: {"description": "Not found"}},
)


@router.get("/stacks", response_model=StackListResponse)
async def list_stacks(user: str = Depends(get_current_user)):
    """
    Return all stacks (groups of containers) with aggregate metrics.
    This uses a lightweight collector that:
      - does NOT call container.stats() per container
      - reuses cached results for ~2 seconds
    """
    stacks = get_stack_summaries_cached()
    return {"stacks": stacks}


@router.get("/stacks/{stack_id}", response_model=StackDetailResponse)
async def get_stack(stack_id: str, user: str = Depends(get_current_user)):
    """
    Return detailed info for a single stack, including per-container data.
    This path:
      - ONLY inspects containers in the requested stack
      - calls container.stats() for those containers (not the whole host)
      - reuses cached results for ~2 seconds
    """
    stack_detail = get_stack_detail_cached(stack_id)
    if stack_detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stack '{stack_id}' not found",
        )
    return stack_detail
