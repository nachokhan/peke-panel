# Peke-Panel

Peke-Panel is a web-based control panel designed to monitor and manage containerized applications. It provides a user-friendly interface to view application dashboards, access container logs, and perform basic operations.

## Features

*   **User Authentication:** Secure login page for authorized access.
*   **Dashboard:** Overview of deployed applications or services.
*   **Container Log Viewer:** Static updateable log with search, update, download, copy, and clear functionalities.

## Technologies Used

*   **Frontend:** React.js, JavaScript, HTML, CSS
*   **Backend:** Python, FastAPI
*   **Containerization:** Docker, Docker Compose

## Running the project

To get Peke-Panel up and running, follow these steps:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/nachokhan/peke-panel
    cd peke-panel
    ```

2.  **Environment Variables:**

    Create a `.env` file by copying the example file:

    ```bash
    cp .env.example .env
    ```

    Update the `.env` file with your desired credentials and settings.

### Development Mode

For development with features like hot-reloading:

1.  **Build and run with Docker Compose:**

    ```bash
    docker-compose up --build -d
    ```

2.  **Access the application:**

    Open your browser and go to `http://localhost:3000` (or your configured port).

### Production Mode

For a production environment:

1.  **Build and run with Docker Compose for production:**

    ```bash
    docker-compose -f docker-compose.production.yml up --build -d
    ```

2.  **Access the application:**

    Open your browser and go to `http://localhost:3000` (or your configured port).

    **Note:** For production, it's recommended to use a reverse proxy (like Nginx or Traefik) for SSL and domain configuration.