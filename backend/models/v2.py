from pydantic import BaseModel
from typing import List, Literal, Dict


class StackSummary(BaseModel):
    stack_id: str
    display_name: str
    containers_count: int
    status: Literal["healthy", "degraded", "stopped"]
    longest_uptime: str
    cpu_avg: str
    ram_total_used: str
    ram_host_total: str


class StackListResponse(BaseModel):
    stacks: List[StackSummary]


class ContainerInfo(BaseModel):
    id: str
    name: str
    state: str            # "running" | "stopped" | "unhealthy"
    uptime: str
    cpu: str              # "0.04%" etc
    ram: str              # "41.27MiB / 5.783GiB"
    net: str              # "3.83MB / 4.22MB"
    ports: List[str]
    actions: Dict[str, bool]  # { "can_logs": true, ... }


class StackDetailSummary(BaseModel):
    containers_count: int
    cpu_avg: str
    ram_total_used: str
    ram_host_total: str


class StackDetailResponse(BaseModel):
    stack_id: str
    display_name: str
    summary: StackDetailSummary
    containers: List[ContainerInfo]
