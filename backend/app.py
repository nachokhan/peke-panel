import json
import subprocess
from datetime import datetime, timedelta, timezone

from fastapi import (
    Depends, FastAPI, Form, HTTPException, Header, status
)
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from dotenv import load_dotenv
import os

load_dotenv()

# --- Configuration ---
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
ADMIN_USER = os.getenv("ADMIN_USER")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

# --- FastAPI App Initialization ---
app = FastAPI(title="2Brains Health Monitor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Authentication ---
def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """Creates a new JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(authorization: str | None = Header(default=None)):
    """
    Dependency to get the current user from the access token in the Authorization header.
    Raises HTTPException if the token is invalid or missing.
    """
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )
    try:
        token_type, token = authorization.split()
        if token_type.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None or username != ADMIN_USER:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return username
    except (ValueError, JWTError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

# --- Docker Service Logic ---
def get_docker_statuses():
    """
    Checks docker container statuses by running 'docker ps' and 'docker stats'.
    Returns a list of all active service statuses with resource usage or a mock list if Docker is not available.
    """
    try:
        # Command to get all running containers in JSON format
        ps_cmd = [
            "docker", "ps",
            "--format", "{{json .}}"
        ]
        ps_result = subprocess.run(ps_cmd, capture_output=True, text=True, check=True)
        
        output_lines = ps_result.stdout.strip().split('\n')
        if not output_lines or not output_lines[0]:
            return [] # No containers running

        running_containers_ps = [json.loads(line) for line in output_lines]

        # Command to get stats for all running containers
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

            # Determine health status
            health = container_ps.get("State", "stopped") # Default to stopped if no state
            if "unhealthy" in health:
                status_val = "unhealthy"
            elif "running" in health or "healthy" in health:
                status_val = "running"
            else:
                status_val = "stopped"

            status_list.append({
                "id": container_id,
                "name": container_ps.get("Names", "N/A"),
                "status": status_val,
                "uptime": container_ps.get("RunningFor", "N/A"),
                "port": container_ps.get("Ports", "").split("->")[0] if "->" in container_ps.get("Ports", "") else "N/A",
                "ram_usage": stats.get("MemUsage", "N/A"),
                "cpu_usage": stats.get("CPUPerc", "N/A"),
                "net_usage": f"{stats.get("NetIO", "N/A").split('/')[0].strip()} / {stats.get("NetIO", "N/A").split('/')[1].strip()}" if "/" in stats.get("NetIO", "N/A") else stats.get("NetIO", "N/A"),
            })
        return status_list

    except (FileNotFoundError, subprocess.CalledProcessError):
        # Fallback to mock data if Docker is not installed or command fails
        return [
            {"name": "Evolution API", "status": "running", "uptime": "6h", "port": "8080", "ram_usage": "128MiB / 512MiB", "cpu_usage": "5.12%", "net_usage": "10MB / 5MB"},
            {"name": "n8n", "status": "unhealthy", "uptime": "6h", "port": "5678", "ram_usage": "256MiB / 1GiB", "cpu_usage": "15.30%", "net_usage": "20MB / 10MB"},
            {"name": "Chatwoot Rails", "status": "running", "uptime": "6h", "port": "3000", "ram_usage": "512MiB / 1GiB", "cpu_usage": "25.75%", "net_usage": "30MB / 15MB"},
            {"name": "PostgreSQL 15", "status": "stopped", "uptime": "N/A", "port": "N/A", "ram_usage": "N/A", "cpu_usage": "N/A", "net_usage": "N/A"},
        ]

# --- API Endpoints ---

@app.post("/api/containers/{container_id}/start")
async def start_container(container_id: str, user: str = Depends(get_current_user)):
    """Starts a container."""
    try:
        subprocess.run(["docker", "start", container_id], check=True)
        return {"message": f"Container {container_id} started successfully."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to start container {container_id}: {e}")

@app.post("/api/containers/{container_id}/restart")
async def restart_container(container_id: str, user: str = Depends(get_current_user)):
    """Restarts a container."""
    try:
        subprocess.run(["docker", "restart", container_id], check=True)
        return {"message": f"Container {container_id} restarted successfully."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to restart container {container_id}: {e}")

@app.post("/api/containers/{container_id}/stop")
async def stop_container(container_id: str, user: str = Depends(get_current_user)):
    """Stops a container."""
    try:
        subprocess.run(["docker", "stop", container_id], check=True)
        return {"message": f"Container {container_id} stopped successfully."}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop container {container_id}: {e}")

@app.get("/api/containers/{container_id}/logs")
async def get_container_logs(container_id: str, lines: int = 100, user: str = Depends(get_current_user)):
    """Gets logs from a container."""
    try:
        result = subprocess.run(["docker", "logs", "--tail", str(lines), container_id], capture_output=True, text=True, check=True)
        return {"logs": result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to get logs for container {container_id}: {e.stderr}")


@app.post("/api/login")
async def login_for_access_token(username: str = Form(...), password: str = Form(...)):
    """Handles login form submission, returns a JWT token."""
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
    """Provides the Docker services status as JSON, protected by authentication."""
    return get_docker_statuses()

@app.get("/healthz")
def health_check():
    """Simple health check endpoint for external monitoring."""
    return {"status": "ok"}