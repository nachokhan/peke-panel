# Peke Panel

Peke Panel es una herramienta de monitoreo y gestión para contenedores y stacks de Docker. Proporciona una interfaz web para visualizar el estado de los servicios, su consumo de recursos (CPU, RAM) y realizar acciones básicas sobre ellos.

## Arquitectura

El proyecto sigue una arquitectura cliente-servidor:

-   **Backend**: Una API RESTful desarrollada en **Python** con **FastAPI**. Se comunica directamente con el daemon de Docker del host para obtener información en tiempo real y ejecutar comandos. Utiliza un sistema de snapshots en memoria para minimizar la carga y optimizar las respuestas.
-   **Frontend**: Una Single Page Application (SPA) desarrollada en **JavaScript** con **React**. Ofrece un dashboard interactivo para visualizar los stacks de Docker Compose, los contenedores dentro de cada stack y sus relaciones.

## Características Principales

-   **Visualización de Stacks**: Lista automáticamente todos los stacks de Docker Compose que se están ejecutando.
-   **Monitoreo de Contenedores**: Muestra el estado (running, stopped, unhealthy), uso de CPU y memoria de cada contenedor.
-   **Acciones de Contenedor**: Iniciar, detener y reiniciar contenedores directamente desde la interfaz.
-   **Visualización de Logs**: Permite ver los logs de cualquier contenedor en tiempo real.
-   **Terminal Interactiva**: Abrir una sesión de shell (`sh`) dentro de un contenedor en ejecución.

## Cómo ejecutar

El proyecto está completamente containerizado. Antes de empezar, crea un archivo `.env` a partir de `.env.example` y define las variables de entorno.

### Modo Desarrollo

Ideal para trabajar en el código. Usa los volúmenes de Docker para reflejar los cambios al instante (hot-reloading) tanto en el backend como en el frontend.

1.  **Levantar los servicios**:
    ```bash
    docker-compose up -d
    ```

2.  **Acceder a la aplicación**:
    -   Frontend: `http://localhost:3000`
    -   Backend API: `http://localhost:8000/docs`

### Modo Producción

Crea builds optimizadas y no utiliza volúmenes para el código fuente, por lo que es la forma recomendada para un despliegue estable.

1.  **Levantar los servicios**:
    ```bash
    docker-compose -f docker-compose.production.yml up -d
    ```

2.  **Acceder a la aplicación**: El frontend se expondrá en el puerto que definas en la variable `FRONTEND_PORT` de tu archivo `.env` (por defecto, el puerto 80 no se expone públicamente, solo en localhost).

---

## Despliegue en un Servidor (Reverse Proxy)

Para exponer Peke Panel de forma segura en un servidor, es recomendable usar un reverse proxy que gestione el tráfico y los certificados SSL. En el modo producción, el frontend sólo es accesible desde `localhost`, por lo que el reverse proxy debe apuntar al puerto definido en `FRONTEND_PORT`.

La API del backend (`/api/*`) debe ser redirigida al servicio del backend, que no está expuesto públicamente en el modo producción.

### Ejemplo con Caddy

Caddy es un servidor web moderno que automatiza la gestión de HTTPS. Crea un `Caddyfile` con la siguiente configuración:

```caddy
tudominio.com {
    # Redirige el tráfico de la API al backend
    handle /api/* {
        reverse_proxy localhost:8000
    }

    # Sirve el frontend y gestiona las rutas de la SPA
    handle {
        reverse_proxy localhost:3001 # Reemplaza 3001 con tu FRONTEND_PORT
    }
}
```

### Ejemplo con Nginx

Configura un nuevo `server` block en tu configuración de Nginx:

```nginx
server {
    listen 80;
    server_name tudominio.com;

    # Opcional: Redirigir HTTP a HTTPS (recomendado con Certbot)
    # listen 443 ssl;
    # ssl_certificate /path/to/your/fullchain.pem;
    # ssl_certificate_key /path/to/your/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://localhost:3001; # Reemplaza 3001 con tu FRONTEND_PORT
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```