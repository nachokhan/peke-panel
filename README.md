# Peke Panel

Web panel to monitor and control Docker containers on a host machine. Frontend in React (served by Caddy in production), backend in FastAPI. You can view status, read logs, run commands in containers, and start/stop/restart them.

## 1. Architecture
- **frontend/**  
  - React app.  
  - In production it is built and served by Caddy.  
  - Caddy also proxies `/api/*` → `backend:8000`.
- **backend/**  
  - FastAPI + uvicorn.  
  - Issues/validates JWT for auth.  
  - Uses Docker CLI against `/var/run/docker.sock` to: list containers, show stats, fetch logs, run `docker exec`, and control lifecycle.
- **docker-compose.yml** (dev): hot reload, frontend served by `npm start`, backend with `uvicorn --reload`.
- **docker-compose.production.yml** (prod): builds static frontend + production backend. Frontend exposes port 80 internally and is bound on the host as `127.0.0.1:${FRONTEND_PORT}`. Intended to sit behind your own reverse proxy (Caddy / Nginx / Traefik with TLS).

## 2. Security Warning
- Backend mounts the Docker socket from the host (`/var/run/docker.sock`). That means full control of Docker = basically root on the box.
- There is only one login (`ADMIN_USER`/`ADMIN_PASSWORD`). No rate limiting, no 2FA. JWT is stored in `localStorage`.
- Do **not** expose this panel directly to the public internet. In production we only bind it to `127.0.0.1` and expect you to put an external reverse proxy in front of it with TLS and optional extra auth / IP filtering.
- Always change default credentials and use a strong `SECRET_KEY` for JWT.

## 3. Environment Variables
Set these in `.env` (copy from `.env.example`):
- `SECRET_KEY`: random long string for JWT signing.
- `ADMIN_USER`: username for login.
- `ADMIN_PASSWORD`: password for login.
- `FRONTEND_PORT`: host port to access the UI.
  - Dev: maps `FRONTEND_PORT:3000`.
  - Prod: maps `127.0.0.1:FRONTEND_PORT -> 80` in the frontend container.

## 4. Development
1. Create `.env` from `.env.example` and edit credentials / port.
2. Run:
   ```bash
   docker compose up --build
   ```
3. Open: `http://localhost:<FRONTEND_PORT>` and log in with the creds from `.env`.
4. Hot reload is enabled for both frontend and backend.

Note: if the backend container can't access `/var/run/docker.sock`, you'll see mock data instead of real containers.

## 5. Production
1. Run:
   ```bash
   docker compose -f docker-compose.production.yml up --build -d
   ```
2. The frontend container serves the built React app on port 80 and is only exposed on `127.0.0.1:<FRONTEND_PORT>` on the host.
3. Put your public reverse proxy in front of that port to add TLS + any extra auth you want. Never expose the backend container directly.

## 6. Usage
After login you get a dashboard of containers with:
- status (running / stopped / unhealthy),
- uptime, port, CPU, RAM, NET.

Per container you can:
- Start / Stop / Restart
- View Logs (draggable modal with search, download, copy)
- Open Terminal (runs `docker exec sh -c "<cmd>"`, shows stdout/stderr/exit code)

Dark / Light theme can be toggled from the gear icon and is saved in the browser.
