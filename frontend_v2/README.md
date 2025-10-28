# Frontend v2 (Sidebar stacks + right panel containers)

Este frontend reemplaza el layout del dashboard por uno con **panel izquierdo de stacks (compose)** y **panel derecho** con los containers del stack seleccionado, manteniendo **todas las funcionalidades existentes** (login, status polling, logs, shell/exec, start/stop/restart).

## APIs soportadas

- **Preferido:** `v2`
  - `GET /api/v2/stacks` → lista de stacks `{ name, containers_count, cpu_total?, ram_total?, longest_uptime? }`
  - `GET /api/v2/stacks/:stack/containers` → containers del stack, con campos: `{ id, name, status, uptime, port, cpu, ram, net, networks?, depends_on? }`
- **Fallback:** `v1`
  - `GET /api/status` → se agrupa en un único stack `default` con todos los containers (sin edges).

Acciones compatibles (v1):
- `POST /api/containers/:id/start|stop|restart`
- `GET /api/containers/:id/logs?lines=N`
- `POST /api/containers/:id/exec` con `{ command }`

> Si el backend no provee `v2`, el sidebar mostrará un único stack **default** y el grafo será una grilla de nodos sin edges.

## Desarrollo

```bash
npm install
npm start
```

## Producción con Docker

```bash
# construir
docker build -t frontend_v2:latest .
```

## Notas

- El SVG usa `foreignObject` para tarjetas HTML; funciona en navegadores modernos.
- La topología (edges depends_on / networks) está **deshabilitada** en esta versión inicial por simplicidad. Se puede extender cuando el backend exponga esos datos.
