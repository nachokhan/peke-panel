from fastapi import APIRouter, Depends, HTTPException, status
from models.v2 import (
    StackListResponse,
    StackDetailResponse,
)
from services.docker_service_v2 import collect_v2_data
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
    """
    all_stacks_summary, _ = collect_v2_data()
    return {"stacks": all_stacks_summary}


@router.get("/stacks/{stack_id}", response_model=StackDetailResponse)
async def get_stack(stack_id: str, user: str = Depends(get_current_user)):
    """
    Return detailed info for a single stack, including per-container data.
    """
    _, detail_map = collect_v2_data()
    if stack_id not in detail_map:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stack '{stack_id}' not found",
        )
    return detail_map[stack_id]
