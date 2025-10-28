import docker
import re
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional
import time

# Reuse a single docker client for all calls
_client = docker.from_env()

# Cache config (seconds)
STACK_SUMMARY_TTL_SEC = 2
STACK_DETAIL_TTL_SEC = 2

_cache_summaries: Optional[List[Dict]] = None
_cache_summaries_ts: float = 0.0

_cache_details: Dict[str, Dict] = {}
_cache_details_ts: Dict[str, float] = {}


def _iter_all_containers():
    """
    Return all containers (running + stopped).
    """
    return _client.containers.list(all=True)


def _split_mem(mem_usage: str) -> Tuple[str, str]:
    """
    Split "41.27MiB / 5.783GiB" -> ("41.27MiB", "5.783GiB").
    """
    parts = [p.strip() for p in mem_usage.split("/")]
    if len(parts) == 2:
        return parts[0], parts[1]
    if len(parts) == 1:
        return parts[0], "N/A"
    return ("N/A", "N/A")


def _uptime_from_started_at(started_at: str) -> str:
    """
    Convert Docker StartedAt timestamp into a compact uptime string ("22h", "5m").
    """
    try:
        cleaned = re.sub(r"(\d{6})\d+Z$", r"\1Z", started_at)
        dt = datetime.strptime(cleaned, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    except Exception:
        return "N/A"

    delta = datetime.now(timezone.utc) - dt
    secs = int(delta.total_seconds())
    hours = secs // 3600
    mins = (secs % 3600) // 60
    if hours > 0:
        return f"{hours}h"
    else:
        return f"{mins}m"


def _uptime_seconds(started_at: str) -> int:
    """
    Parse StartedAt and return uptime in seconds.
    """
    try:
        cleaned = re.sub(r"(\d{6})\d+Z$", r"\1Z", started_at)
        dt = datetime.strptime(cleaned, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        return int((datetime.now(timezone.utc) - dt).total_seconds())
    except Exception:
        return 0


def _classify_state(container) -> str:
    """
    Derive high-level state string ("running", "stopped", "unhealthy")
    based on container attrs.
    """
    state = container.attrs.get("State", {})
    health = state.get("Health", {})
    health_status = health.get("Status")

    if health_status == "unhealthy":
        return "unhealthy"

    running = state.get("Running", False)
    if running:
        return "running"

    return "stopped"


def _stack_name_for_container(container) -> str:
    """
    Pick a stack/group name for the container:
    1. Prefer com.docker.compose.project label.
    2. Fallback = prefix before the first '-' in container.name.
    """
    labels = container.attrs.get("Config", {}).get("Labels", {}) or {}
    compose_project = labels.get("com.docker.compose.project")
    if compose_project:
        return compose_project

    name = getattr(container, "name", "") or ""
    if "-" in name:
        return name.split("-")[0]
    return name


def _format_ports(container) -> List[str]:
    """
    Produce a list like ["3000/tcp -> 127.0.0.1:3000", "443/tcp"].
    """
    ports: List[str] = []
    net_settings = container.attrs.get("NetworkSettings", {})
    port_map = net_settings.get("Ports") or {}
    for container_port, bindings in port_map.items():
        if bindings is None:
            ports.append(container_port)
        else:
            for b in bindings:
                hostip = b.get("HostIp", "")
                hostport = b.get("HostPort", "")
                ports.append(f"{container_port} -> {hostip}:{hostport}")
    if not ports:
        return ["N/A"]
    return ports


def _get_stats_for_container(container) -> Dict[str, str]:
    """
    Use container.stats(stream=False) to read cpu%, mem, net io.
    We compute approximate CPU % using delta between cpu_stats and precpu_stats.
    NOTE: This is expensive. Only call this when detail is needed.
    """
    stats = container.stats(stream=False)

    # CPU %
    try:
        cpu_total = stats["cpu_stats"]["cpu_usage"]["total_usage"]
        cpu_prev = stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_total = stats["cpu_stats"]["system_cpu_usage"]
        system_prev = stats["precpu_stats"]["system_cpu_usage"]

        cpu_delta = cpu_total - cpu_prev
        system_delta = system_total - system_prev

        perc = 0.0
        if system_delta > 0 and cpu_delta > 0:
            perc = (
                cpu_delta / system_delta
            ) * len(stats["cpu_stats"]["cpu_usage"]["percpu_usage"]) * 100.0
        cpu_perc = f"{perc:.2f}%"
    except Exception:
        cpu_perc = "N/A"

    # Memory usage "xx / yy"
    try:
        mem_usage = stats["memory_stats"]["usage"]
        mem_limit = stats["memory_stats"]["limit"]

        def _fmt_bytes(n: float) -> str:
            gib = n / (1024 ** 3)
            mib = n / (1024 ** 2)
            if gib >= 1:
                return f"{gib:.3f}GiB"
            return f"{mib:.2f}MiB"

        mem_usage_h = _fmt_bytes(mem_usage)
        mem_limit_h = _fmt_bytes(mem_limit)
        mem_usage_str = f"{mem_usage_h} / {mem_limit_h}"
    except Exception:
        mem_usage_str = "N/A"

    # Net I/O "rx / tx"
    try:
        networks = stats.get("networks", {})
        rx_total = 0
        tx_total = 0
        for _, data in networks.items():
            rx_total += data.get("rx_bytes", 0)
            tx_total += data.get("tx_bytes", 0)

        def _fmt_net(n: float) -> str:
            mb = n / (1024 ** 2)
            if mb >= 1:
                return f"{mb:.2f}MB"
            kb = n / 1024
            return f"{kb:.2f}kB"

        net_io_str = f"{_fmt_net(rx_total)} / {_fmt_net(tx_total)}"
    except Exception:
        net_io_str = "N/A"

    return {
        "cpu": cpu_perc,
        "mem": mem_usage_str,
        "net": net_io_str,
    }


def _parse_mem_to_bytes(s: str) -> Optional[int]:
    """
    "41.27MiB" -> bytes
    "5.783GiB" -> bytes
    """
    m = re.match(r"([0-9.]+)(MiB|GiB)", s)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2)
    if unit == "GiB":
        return int(val * (1024 ** 3))
    if unit == "MiB":
        return int(val * (1024 ** 2))
    return None


def _mem_bytes_from_stat_string(mem_str: str) -> Tuple[Optional[int], Optional[int]]:
    """
    Given "41.27MiB / 5.783GiB" return (used_bytes, limit_bytes).
    """
    if mem_str == "N/A":
        return (None, None)
    used_str, limit_str = _split_mem(mem_str)
    used_bytes = _parse_mem_to_bytes(used_str)
    limit_bytes = _parse_mem_to_bytes(limit_str)
    return used_bytes, limit_bytes


def _fmt_seconds(sec: int) -> str:
    """
    7322 -> "2h" (if >=1h) or "12m"
    """
    hours = sec // 3600
    mins = (sec % 3600) // 60
    if hours > 0:
        return f"{hours}h"
    return f"{mins}m"


def _fmt_bytes_to_human(n: int) -> str:
    """
    12345678 -> "12MiB" / "1.23GiB"
    """
    if n == 0:
        return "0MiB"
    gib = n / (1024 ** 3)
    mib = n / (1024 ** 2)
    if gib >= 1:
        return f"{gib:.2f}GiB"
    return f"{mib:.0f}MiB"


def _build_stack_summaries() -> List[Dict]:
    """
    Fast path for /api/v2/stacks.
    We DO NOT call container.stats() here.
    We only look at container.attrs:
      - state (healthy / degraded / stopped)
      - uptime (for longest_uptime)
      - which stack it belongs to
    cpu_avg / ram_total_used / ram_host_total -> "N/A" because they
    require stats to compute accurately.
    """
    stacks: Dict[str, Dict] = {}

    for c in _iter_all_containers():
        stack_id = _stack_name_for_container(c)
        state_class = _classify_state(c)

        started_at = c.attrs.get("State", {}).get("StartedAt", "")
        uptime_sec = _uptime_seconds(started_at)

        if stack_id not in stacks:
            stacks[stack_id] = {
                "count": 0,
                "longest_uptime": 0,
                "health_flags": [],
            }

        stacks[stack_id]["count"] += 1
        stacks[stack_id]["health_flags"].append(state_class)
        if uptime_sec > stacks[stack_id]["longest_uptime"]:
            stacks[stack_id]["longest_uptime"] = uptime_sec

    summaries: List[Dict] = []
    for stack_id, data in stacks.items():
        health_flags = data["health_flags"]
        if all(s == "stopped" for s in health_flags):
            status_val = "stopped"
        elif any(s == "unhealthy" for s in health_flags):
            status_val = "degraded"
        else:
            status_val = "healthy"

        summaries.append({
            "stack_id": stack_id,
            "display_name": stack_id,
            "containers_count": data["count"],
            "status": status_val,
            "longest_uptime": _fmt_seconds(data["longest_uptime"]),
            "cpu_avg": "N/A",
            "ram_total_used": "N/A",
            "ram_host_total": "N/A",
        })

    return summaries


def _build_stack_detail(stack_id: str) -> Optional[Dict]:
    """
    Slow-ish path for /api/v2/stacks/{stack_id}.
    We ONLY inspect containers that belong to this stack_id,
    and we DO call container.stats() for those containers.
    """
    containers_data: List[Dict] = []
    cpu_vals: List[float] = []
    ram_used_total_bytes = 0
    ram_host_total_bytes = 0
    longest_uptime_s = 0
    health_flags: List[str] = []

    for c in _iter_all_containers():
        current_stack_id = _stack_name_for_container(c)
        if current_stack_id != stack_id:
            continue

        state_class = _classify_state(c)
        started_at = c.attrs.get("State", {}).get("StartedAt", "")
        uptime_h = _uptime_from_started_at(started_at)
        uptime_s = _uptime_seconds(started_at)

        # This is the expensive call, but now only for this stack
        try:
            st = _get_stats_for_container(c)
        except Exception:
            st = {
                "cpu": "N/A",
                "mem": "N/A",
                "net": "N/A",
            }

        ports_list = _format_ports(c)

        containers_data.append({
            "id": c.short_id,
            "name": c.name,
            "state": state_class,
            "uptime": uptime_h,
            "cpu": st["cpu"],
            "ram": st["mem"],
            "net": st["net"],
            "ports": ports_list,
            "actions": {
                "can_logs": True,
                "can_shell": True,
                "can_restart": True,
            },
        })

        # Aggregate metrics for summary
        health_flags.append(state_class)
        if uptime_s > longest_uptime_s:
            longest_uptime_s = uptime_s

        if st["cpu"].endswith("%"):
            try:
                cpu_vals.append(float(st["cpu"].replace("%", "")))
            except Exception:
                pass

        used_b, limit_b = _mem_bytes_from_stat_string(st["mem"])
        if used_b is not None:
            ram_used_total_bytes += used_b
        if limit_b is not None and limit_b > ram_host_total_bytes:
            ram_host_total_bytes = limit_b

    if not containers_data:
        # Stack not found
        return None

    # Stack status (not currently returned in StackDetailResponse,
    # but could be logged/extended later)
    if all(s == "stopped" for s in health_flags):
        stack_status = "stopped"
    elif any(s == "unhealthy" for s in health_flags):
        stack_status = "degraded"
    else:
        stack_status = "healthy"
    _ = stack_status  # silence linter for now

    # Avg CPU across containers in this stack
    if cpu_vals:
        cpu_avg_val = sum(cpu_vals) / len(cpu_vals)
        cpu_avg_str = f"{cpu_avg_val:.2f}%"
    else:
        cpu_avg_str = "0.00%"

    detail = {
        "stack_id": stack_id,
        "display_name": stack_id,
        "summary": {
            "containers_count": len(containers_data),
            "cpu_avg": cpu_avg_str,
            "ram_total_used": _fmt_bytes_to_human(ram_used_total_bytes),
            "ram_host_total": (
                _fmt_bytes_to_human(ram_host_total_bytes)
                if ram_host_total_bytes
                else "N/A"
            ),
        },
        "containers": containers_data,
    }

    return detail


def get_stack_summaries_cached() -> List[Dict]:
    """
    Cached wrapper around _build_stack_summaries().
    Cache TTL is STACK_SUMMARY_TTL_SEC.
    """
    global _cache_summaries, _cache_summaries_ts
    now = time.time()
    if (
        _cache_summaries is not None
        and (now - _cache_summaries_ts) < STACK_SUMMARY_TTL_SEC
    ):
        return _cache_summaries

    data = _build_stack_summaries()
    _cache_summaries = data
    _cache_summaries_ts = now
    return data


def get_stack_detail_cached(stack_id: str) -> Optional[Dict]:
    """
    Cached wrapper around _build_stack_detail(stack_id).
    Cache TTL is STACK_DETAIL_TTL_SEC (per stack).
    """
    global _cache_details, _cache_details_ts
    now = time.time()

    ts = _cache_details_ts.get(stack_id, 0)
    if (
        stack_id in _cache_details
        and (now - ts) < STACK_DETAIL_TTL_SEC
    ):
        return _cache_details[stack_id]

    data = _build_stack_detail(stack_id)

    # If data is None (stack not found), don't cache negative result.
    if data is not None:
        _cache_details[stack_id] = data
        _cache_details_ts[stack_id] = now

    return data
