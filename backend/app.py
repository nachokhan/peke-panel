import json
import subprocess
from datetime import timedelta

from fastapi import (
    Depends,
    FastAPI,
    Form,
    HTTPException,
    status,
    Body,
)
from fastapi.middleware.cors import CORSMiddleware

from routers.v2 import router as v2_router
from auth import (
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ADMIN_USER,
    ADMIN_PASSWORD,
)

# IMPORTANT: we import the snapshot loop
from services.snapshot import start_snapshot_loop

# --- FastAPI App Initialization ---
app = FastAPI(title="Docker Monitor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production limit to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# startup event: start the background refresh loop
@app.on_event("startup")
async def _on_startup():
    # start the loop that keeps the stack snapshot in memory
    await start_snapshot_loop()

# Register /api/v2 routes
app.include_router(v2_router)


# --- Docker Service Logic (v1 legacy) ---
def get_docker_statuses():
    """
    v1 logic legacy (dashboard viejo). Usa docker CLI via subprocess.
    """
    try:
        ps_cmd = [
            "docker", "ps",
            "--format", "{{json .}}"
        ]
        ps_result = subprocess.run(ps_cmd, capture_output=True, text=True, check=True)

        output_lines = ps_result.stdout.strip().split('\n')
        if not output_lines or not output_lines[0]:
            return []  # No containers running

        running_containers_ps = [json.loads(line) for line in output_lines]

        stats_cmd = [
            "docker", "stats", "--no-stream",
            "--format", "{{json .}}"
        ]
        stats_result = subprocess.run(stats_cmd, capture_output=True, text=True, check=True)

        stats_lines = stats_result.stdout.strip().split('\n')
        running_containers_stats = {}
        if stats_lines and stats_lines[0]:
            for line in stats_lines:
                stat = json.loads(line)
                running_containers_stats[stat["ID"]] = stat

        status_list = []
        for container_ps in running_containers_ps:
            container_id = container_ps.get("ID")
            stats = running_containers_stats.get(container_id, {})

            health = container_ps.get("State", "stopped")
            if "unhealthy" in health:
                status_val = "unhealthy"
            elif "running" in health or "healthy" in health:
                status_val = "running"
            else:
                status_val = "stopped"

            net_io = stats.get("NetIO", "N/A")
            if "/" in net_io:
                parts = net_io.split("/")
                net_usage_val = f"{parts[0].strip()} / {parts[1].strip()}"
            else:
                net_usage_val = net_io

            ports_val = container_ps.get("Ports", "")
            if "->" in ports_val:
                ports_val = ports_val.split("->")[0]
            else:
                ports_val = "N/A"

            status_list.append({
                "id": container_id,
                "name": container_ps.get("Names", "N/A"),
                "status": status_val,
                "uptime": container_ps.get("RunningFor", "N/A"),
                "port": ports_val,
                "ram_usage": stats.get("MemUsage", "N/A"),
                "cpu_usage": stats.get("CPUPerc", "N/A"),
                "net_usage": net_usage_val,
            })
        return status_list

    except (FileNotFoundError, subprocess.CalledProcessError):
        # fallback mock
        return [
            {"id": "mock1", "name": "Evolution API", "status": "running", "uptime": "6h", "port": "8080",
             "ram_usage": "128MiB / 512MiB", "cpu_usage": "5.12%", "net_usage": "10MB / 5MB"},
            {"id": "mock2", "name": "n8n", "status": "unhealthy", "uptime": "6h", "port": "5678",
             "ram_usage": "256MiB / 1GiB", "cpu_usage": "15.30%", "net_usage": "20MB / 10MB"},
            {"id": "mock3", "name": "Chatwoot Rails", "status": "running", "uptime": "6h", "port": "3000",
             "ram_usage": "512MiB / 1GiB", "cpu_usage": "25.75%", "net_usage": "30MB / 15MB"},
            {"id": "mock4", "name": "PostgreSQL 15", "status": "stopped", "uptime": "N/A", "port": "N/A",
             "ram_usage": "N/A", "cpu_usage": "N/A", "net_usage": "N/A"},
        ]


# --- API Endpoints v1 (legacy) ---

@app.post("/api/containers/{container_id}/start")
async def start_container(container_id: str, user: str = Depends(get_current_user)):
    try:
        subprocess.run(["docker", "start", container_id], check=True)
        return {"message": f"Container {container_id} started successfully."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to start container {container_id}: {e}")


@app.post("/api/containers/{container_id}/restart")
async def restart_container(container_id: str, user: str = Depends(get_current_user)):
    try:
        subprocess.run(["docker", "restart", container_id], check=True)
        return {"message": f"Container {container_id} restarted successfully."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to restart container {container_id}: {e}")


@app.post("/api/containers/{container_id}/stop")
async def stop_container(container_id: str, user: str = Depends(get_current_user)):
    try:
        subprocess.run(["docker", "stop", container_id], check=True)
        return {"message": f"Container {container_id} stopped successfully."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop container {container_id}: {e}")


@app.get("/api/containers/{container_id}/logs")
async def get_container_logs(container_id: str, lines: int = 100, user: str = Depends(get_current_user)):
    try:
        result = subprocess.run(
            ["docker", "logs", "--tail", str(lines), container_id],
            capture_output=True,
            text=True,
            check=True
        )
        return {"logs": result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to get logs for container {container_id}: {e.stderr}")


@app.post("/api/containers/{container_id}/exec")
async def exec_container_command(
    container_id: str,
    payload: dict = Body(...),
    user: str = Depends(get_current_user)
):
    """
    Run a shell command inside a container using `docker exec`.
    Expects JSON body: { "command": "<string>" }
    """
    command = payload.get("command")
    if not command:
        raise HTTPException(status_code=400, detail="Missing 'command' in request body")

    try:
        result = subprocess.run(
            ["docker", "exec", container_id, "sh", "-c", command],
            capture_output=True,
            text=True,
            check=False
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Docker CLI not available in backend container"
        )


@app.post("/api/login")
async def login_for_access_token(username: str = Form(...), password: str = Form(...)):
    if not (username == ADMIN_USER and password == ADMIN_PASSWORD):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": username}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/status")
async def get_status(user: str = Depends(get_current_user)):
    """
    Legacy /api/status para Dashboard.js viejo.
    """
    return get_docker_statuses()


@app.get("/healthz")
def health_check():
    """
    Health check para monitoreo externo.
    """
    return {"status": "ok"}
