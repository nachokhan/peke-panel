import docker
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# --------------------------------------------------------------------------------------
# Global Docker client + cache config
# --------------------------------------------------------------------------------------

_client = docker.from_env()

STACK_SUMMARY_TTL_SEC = 2
STACK_DETAIL_TTL_SEC = 2

_cache_summaries: Optional[List[Dict]] = None
_cache_summaries_ts: float = 0.0

_cache_details: Dict[str, Dict] = {}
_cache_details_ts: Dict[str, float] = {}

_MAX_WORKERS = 4  # max parallel stats calls


# --------------------------------------------------------------------------------------
# Helpers básicos
# --------------------------------------------------------------------------------------

def _iter_all_containers():
    """
    Return all containers (running + stopped).
    """
    return _client.containers.list(all=True)


def _split_mem(mem_usage: str) -> Tuple[str, str]:
    """
    "41.27MiB / 5.783GiB" -> ("41.27MiB", "5.783GiB")
    """
    parts = [p.strip() for p in mem_usage.split("/")]
    if len(parts) == 2:
        return parts[0], parts[1]
    if len(parts) == 1:
        return parts[0], "N/A"
    return ("N/A", "N/A")


def _uptime_from_started_at(started_at: str) -> str:
    """
    Convert Docker StartedAt timestamp into "22h" / "5m".
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
    StartedAt -> uptime en segundos (int).
    """
    try:
        cleaned = re.sub(r"(\d{6})\d+Z$", r"\1Z", started_at)
        dt = datetime.strptime(cleaned, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        return int((datetime.now(timezone.utc) - dt).total_seconds())
    except Exception:
        return 0


def _classify_state(container) -> str:
    """
    "running", "stopped", "unhealthy"
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
    Stack/group name:
    1. com.docker.compose.project label si existe
    2. si no, prefijo antes del primer '-' del nombre
    3. si no, el nombre completo
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
    ["3000/tcp -> 127.0.0.1:3000", "443/tcp"] o ["N/A"] si no hay puertos.
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


# --------------------------------------------------------------------------------------
# Stats (caro). Lo aislamos y lo hacemos paralelo solo para contenedores running.
# --------------------------------------------------------------------------------------

def _get_stats_for_container(container) -> Dict[str, str]:
    """
    Usa container.stats(stream=False).
    Calcula CPU %, RAM usada/limite y Net I/O total.
    Puede levantar excepciones si el contenedor está en un estado raro.
    """
    stats = container.stats(stream=False)

    # CPU %
    try:
        cpu_total = stats["cpu_stats"]["cpu_usage"]["total_usage"]
        cpu_prev_total = stats["precpu_stats"]["cpu_usage"]["total_usage"]

        system_total = stats["cpu_stats"].get("system_cpu_usage")
        system_prev_total = stats["precpu_stats"].get("system_cpu_usage")

        cpu_delta = cpu_total - cpu_prev_total
        system_delta = (
            (system_total - system_prev_total)
            if (system_total is not None and system_prev_total is not None)
            else 0
        )

        cpu_count = (
            stats["cpu_stats"].get("online_cpus")  # new docker
            or len(
                stats["cpu_stats"]["cpu_usage"].get("percpu_usage", [])
            )                                       # old docker
            or 1
        )

        perc = 0.0
        if system_delta > 0 and cpu_delta > 0 and cpu_count > 0:
            # official Docker formula:
            # CPU% = (cpu_delta / system_delta) * cpu_count * 100
            perc = (cpu_delta / system_delta) * cpu_count * 100.0

        cpu_perc = f"{perc:.2f}%"
        print("CPU %:", cpu_perc)
    except Exception as e:
        print("Error calculando CPU %: ", e)
        cpu_perc = "N/A"

    # Mem "xx / yy"
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

    # Net "rx / tx"
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

    print("Stats for container: ", container.id, "->", cpu_perc, mem_usage_str, net_io_str)

    return {
        "cpu": cpu_perc,
        "mem": mem_usage_str,
        "net": net_io_str,
    }


def _safe_stats(container) -> Dict[str, str]:
    """
    Wrapper que nunca rompe.
    """
    try:
        return _get_stats_for_container(container)
    except Exception:
        return {"cpu": "N/A", "mem": "N/A", "net": "N/A"}


# --------------------------------------------------------------------------------------
# Conversión de memoria a bytes / formatos humanos
# --------------------------------------------------------------------------------------

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
    Dado "41.27MiB / 5.783GiB" -> (used_bytes, limit_bytes)
    """
    if mem_str == "N/A":
        return (None, None)
    used_str, limit_str = _split_mem(mem_str)
    used_bytes = _parse_mem_to_bytes(used_str)
    limit_bytes = _parse_mem_to_bytes(limit_str)
    return used_bytes, limit_bytes


def _fmt_seconds(sec: int) -> str:
    """
    7322 -> "2h" o "12m"
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


# --------------------------------------------------------------------------------------
# Summary: rápido, sin stats
# --------------------------------------------------------------------------------------

def _build_stack_summaries() -> List[Dict]:
    """
    Para /api/v2/stacks.
    Rápido:
    - NO llama container.stats()
    - Calcula count, longest_uptime, status ("healthy"/"degraded"/"stopped")
    - cpu_avg / ram_* -> "N/A"
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


# --------------------------------------------------------------------------------------
# Detail: paralelo para stats sólo en contenedores running
# --------------------------------------------------------------------------------------

def _build_stack_detail(stack_id: str) -> Optional[Dict]:
    """
    Para /api/v2/stacks/{stack_id}.
    - Reúne contenedores del stack.
    - Corre stats() SOLO en los que están "running", en paralelo (ThreadPoolExecutor).
    - Para los que no están "running", rellena "N/A".
    """
    # 1. Filtrar contenedores que pertenecen al stack
    containers_all: List = []
    for c in _iter_all_containers():
        if _stack_name_for_container(c) == stack_id:
            containers_all.append(c)

    if not containers_all:
        return None  # stack no existe

    # 2. Dividir entre running y no-running
    running_containers = []
    nonrunning_map: Dict[str, Dict[str, str]] = {}

    for c in containers_all:
        state_class = _classify_state(c)
        if state_class == "running":
            running_containers.append(c)
        else:
            # no llamamos stats() para estos
            nonrunning_map[c.id] = {"cpu": "N/A", "mem": "N/A", "net": "N/A"}

    # 3. Pedir stats() en paralelo solo para running
    stats_map: Dict[str, Dict[str, str]] = {}
    if running_containers:
        with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as ex:
            futures = {ex.submit(_safe_stats, c): c for c in running_containers}
            for fut in as_completed(futures):
                c = futures[fut]
                stats_map[c.id] = fut.result()

    # Agregar los no-running al stats_map
    for cid, st in nonrunning_map.items():
        stats_map[cid] = st

    # 4. Armar respuesta final y agregar agregados
    containers_data: List[Dict] = []
    cpu_vals: List[float] = []
    ram_used_total_bytes = 0
    ram_host_total_bytes = 0
    longest_uptime_s = 0
    health_flags: List[str] = []

    for c in containers_all:
        cid = c.id

        state_class = _classify_state(c)
        started_at = c.attrs.get("State", {}).get("StartedAt", "")
        uptime_h = _uptime_from_started_at(started_at)
        uptime_s = _uptime_seconds(started_at)
        ports_list = _format_ports(c)

        st = stats_map.get(cid, {"cpu": "N/A", "mem": "N/A", "net": "N/A"})

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

        # agregados
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

    # CPU promedio
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


# --------------------------------------------------------------------------------------
# Caché (TTL corto)
# --------------------------------------------------------------------------------------

def get_stack_summaries_cached() -> List[Dict]:
    """
    Cache de summaries con TTL corto.
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
    Cache de detalle por stack con TTL corto.
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

    # si no existe el stack, no cachear None
    if data is not None:
        _cache_details[stack_id] = data
        _cache_details_ts[stack_id] = now

    return data
