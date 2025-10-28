import asyncio
import time
import logging
from typing import List, Dict, Optional

from services.docker_service_v3 import (
    _build_stack_summaries,
    _build_stack_detail,
)

log = logging.getLogger(__name__)

# --------------------------------------------------------------------
# Config
# --------------------------------------------------------------------

REFRESH_INTERVAL_SEC = 2          # cada cuánto refrescamos el summary global
DETAIL_TTL_SEC = 2                # cuánto dura "fresco" el detalle de un stack

# --------------------------------------------------------------------
# Estado global en memoria
# --------------------------------------------------------------------

# Snapshot liviano (lista de stacks con status, uptime, etc.)
_STACKS_SUMMARY: List[Dict] = []
_LAST_REFRESH_TS: float = 0.0

# Cache de detalle por stack (contiene CPU/RAM/etc.)
_STACKS_DETAIL: Dict[str, Dict] = {}
_STACKS_DETAIL_TS: Dict[str, float] = {}

_background_task: Optional[asyncio.Task] = None


# --------------------------------------------------------------------
# Loop background para refrescar el summary
# --------------------------------------------------------------------

async def _refresh_loop():
    """
    Loop que mantiene _STACKS_SUMMARY actualizado cada REFRESH_INTERVAL_SEC.
    IMPORTANTE: esto NO recalcula todos los detalles de todos los stacks,
    porque eso implicaría pedir stats() de todos los contenedores todo el tiempo.
    Ese cálculo se hace on-demand con TTL aparte.
    """
    global _STACKS_SUMMARY, _LAST_REFRESH_TS

    while True:
        start = time.time()
        try:
            new_summary = _build_stack_summaries()
            _STACKS_SUMMARY = new_summary
            _LAST_REFRESH_TS = time.time()
        except Exception as e:
            # si falla, mantenemos el último snapshot bueno y logeamos
            log.exception("snapshot refresh failed: %s", e)

        elapsed = time.time() - start
        sleep_for = max(0.1, REFRESH_INTERVAL_SEC - elapsed)
        await asyncio.sleep(sleep_for)


async def start_snapshot_loop():
    """
    Llamado en startup de FastAPI. Lanza el refresco continuo del summary.
    """
    global _background_task
    if _background_task is None:
        _background_task = asyncio.create_task(_refresh_loop())


# --------------------------------------------------------------------
# Lectura del summary (lista de stacks)
# --------------------------------------------------------------------

def get_summary_snapshot() -> List[Dict]:
    """
    Devuelve el snapshot más reciente del summary global.
    Este summary NO tiene CPU/RAM en vivo (va con "N/A"), por diseño.
    """
    return _STACKS_SUMMARY


# --------------------------------------------------------------------
# Lectura del detalle de un stack (CPU/RAM vivas)
# --------------------------------------------------------------------

def get_detail_snapshot(stack_id: str) -> Optional[Dict]:
    """
    Devuelve detalle de un stack (incluye CPU%, RAM usada, etc.).
    Comportamiento:
      1. Si lo tenemos cacheado y no venció el TTL, lo devolvemos.
      2. Si no está o está vencido, lo volvemos a construir con _build_stack_detail()
         (que ya está optimizado: stats() paralelo solo para contenedores running),
         guardamos cache y timestamp nuevo, y devolvemos eso.

    Esto permite que el frontend haga polling (por ejemplo cada 2-3s),
    y reciba números "frescos" de CPU/RAM sin recalcular todo el host
    en cada request.
    """
    global _STACKS_DETAIL, _STACKS_DETAIL_TS

    now = time.time()
    ts = _STACKS_DETAIL_TS.get(stack_id, 0)

    still_valid = (now - ts) < DETAIL_TTL_SEC
    if stack_id in _STACKS_DETAIL and still_valid:
        return _STACKS_DETAIL[stack_id]

    # TTL vencido o nunca calculado: construir de nuevo
    try:
        detail = _build_stack_detail(stack_id)
    except Exception:
        detail = None

    if detail is None:
        # stack inexistente -> no cacheamos nada nuevo
        return None

    _STACKS_DETAIL[stack_id] = detail
    _STACKS_DETAIL_TS[stack_id] = now
    return detail
