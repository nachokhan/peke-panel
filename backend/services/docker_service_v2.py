import docker
from datetime import datetime, timezone
from typing import Dict, List, Tuple
import re


def _split_mem(mem_usage: str) -> Tuple[str, str]:
    """
    Split a string like "41.27MiB / 5.783GiB" -> ("41.27MiB","5.783GiB").
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

    name = container.name or ""
    if "-" in name:
        return name.split("-")[0]
    return name


def _format_ports(container) -> List[str]:
    """
    Produce a list like ["3000/tcp -> 127.0.0.1:3000", "443/tcp"].
    """
    ports = []
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


def collect_v2_data():
    """
    Build two data structures:
    - all_stacks_summary: list of stacks summaries for /api/v2/stacks
    - stacks_detail_map: dict[stack_id] -> detailed stack view for /api/v2/stacks/{id}
    """
    client = docker.from_env()

    stacks: Dict[str, Dict] = {}

    for container in client.containers.list(all=True):
        stack_id = _stack_name_for_container(container)

        state_class = _classify_state(container)
        ports_list = _format_ports(container)

        started_at = container.attrs.get("State", {}).get("StartedAt", "")
        uptime_human = _uptime_from_started_at(started_at)

        # stats (cpu/mem/net)
        try:
            stats_info = _get_stats_for_container(container)
        except Exception:
            stats_info = {
                "cpu": "N/A",
                "mem": "N/A",
                "net": "N/A",
            }

        used_bytes = None
        limit_bytes = None
        if stats_info["mem"] != "N/A":
            used_str, limit_str = _split_mem(stats_info["mem"])

            def parse_mem_to_bytes(s: str):
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

            used_bytes = parse_mem_to_bytes(used_str)
            limit_bytes = parse_mem_to_bytes(limit_str)

        # uptime in seconds for aggregation
        try:
            cleaned = re.sub(r"(\d{6})\d+Z$", r"\1Z", started_at)
            dt = datetime.strptime(cleaned, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
            uptime_seconds = int((datetime.now(timezone.utc) - dt).total_seconds())
        except Exception:
            uptime_seconds = 0

        cont_entry = {
            "id": container.short_id,
            "name": container.name,
            "state": state_class,
            "uptime": uptime_human,
            "cpu": stats_info["cpu"],
            "ram": stats_info["mem"],
            "net": stats_info["net"],
            "ports": ports_list,
            "actions": {
                "can_logs": True,
                "can_shell": True,
                "can_restart": True,
            },
        }

        if stack_id not in stacks:
            stacks[stack_id] = {
                "containers": [],
                "cpu_vals": [],
                "ram_used_total_bytes": 0,
                "host_total_bytes": 0,
                "longest_uptime_s": 0,
                "health_flags": [],
            }

        stacks[stack_id]["containers"].append(cont_entry)
        stacks[stack_id]["health_flags"].append(state_class)

        try:
            if stats_info["cpu"].endswith("%"):
                cpu_float = float(stats_info["cpu"].replace("%", ""))
                stacks[stack_id]["cpu_vals"].append(cpu_float)
        except Exception:
            pass

        if used_bytes is not None:
            stacks[stack_id]["ram_used_total_bytes"] += used_bytes

        if limit_bytes is not None and limit_bytes > stacks[stack_id]["host_total_bytes"]:
            stacks[stack_id]["host_total_bytes"] = limit_bytes

        if uptime_seconds > stacks[stack_id]["longest_uptime_s"]:
            stacks[stack_id]["longest_uptime_s"] = uptime_seconds

    def fmt_seconds(sec: int) -> str:
        hours = sec // 3600
        mins = (sec % 3600) // 60
        if hours > 0:
            return f"{hours}h"
        return f"{mins}m"

    def fmt_bytes_to_human(n: int) -> str:
        if n == 0:
            return "0MiB"
        gib = n / (1024 ** 3)
        mib = n / (1024 ** 2)
        if gib >= 1:
            return f"{gib:.2f}GiB"
        return f"{mib:.0f}MiB"

    all_stacks_summary = []
    stacks_detail_map = {}

    for stack_id, data in stacks.items():
        containers = data["containers"]
        cpu_vals = data["cpu_vals"]
        ram_used_total_bytes = data["ram_used_total_bytes"]
        ram_host_total_bytes = data["host_total_bytes"]
        longest_uptime_s = data["longest_uptime_s"]
        health_flags = data["health_flags"]

        containers_count = len(containers)

        if cpu_vals:
            cpu_avg_val = sum(cpu_vals) / len(cpu_vals)
            cpu_avg_str = f"{cpu_avg_val:.2f}%"
        else:
            cpu_avg_str = "0.00%"

        ram_used_h = fmt_bytes_to_human(ram_used_total_bytes)
        ram_host_h = (
            fmt_bytes_to_human(ram_host_total_bytes)
            if ram_host_total_bytes
            else "N/A"
        )

        if all(s == "stopped" for s in health_flags):
            stack_status = "stopped"
        elif any(s == "unhealthy" for s in health_flags):
            stack_status = "degraded"
        else:
            stack_status = "healthy"

        longest_uptime_h = fmt_seconds(longest_uptime_s)

        all_stacks_summary.append({
            "stack_id": stack_id,
            "display_name": stack_id,
            "containers_count": containers_count,
            "status": stack_status,
            "longest_uptime": longest_uptime_h,
            "cpu_avg": cpu_avg_str,
            "ram_total_used": ram_used_h,
            "ram_host_total": ram_host_h,
        })

        stacks_detail_map[stack_id] = {
            "stack_id": stack_id,
            "display_name": stack_id,
            "summary": {
                "containers_count": containers_count,
                "cpu_avg": cpu_avg_str,
                "ram_total_used": ram_used_h,
                "ram_host_total": ram_host_h,
            },
            "containers": containers,
        }

    return all_stacks_summary, stacks_detail_map
