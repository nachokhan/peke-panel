# Peke-Panel

Peke-Panel is a web-based control panel designed to monitor and manage containerized applications. It provides a user-friendly interface to view application dashboards, access container logs, and perform basic operations.

## Features

*   **User Authentication:** Secure login page for authorized access.
*   **Dashboard:** Overview of deployed applications or services.
*   **Container Log Viewer:** Real-time log streaming with search, pause/resume, download, copy, and clear functionalities.

## Technologies Used

*   **Frontend:** React.js, JavaScript, HTML, CSS
*   **Backend:** Python
*   **Containerization:** Docker, Docker Compose

## Setup and Installation

To get Peke-Panel up and running on your local machine, follow these steps:

1.  **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd peke-panel
    ```

2.  **Build and run with Docker Compose:**

    Ensure you have Docker and Docker Compose installed. From the project root directory, execute:

    ```bash
    docker-compose up --build
    ```

    This command will build the frontend and backend Docker images, and then start the services.

## Usage

Once the services are running:

1.  Open your web browser and navigate to `http://localhost:3001` (or the port specified in your Docker Compose configuration for the frontend).
2.  Log in using your credentials (if authentication is configured).
3.  Navigate to the dashboard to view your applications.
4.  Access the logs for any container by clicking on the appropriate action in the dashboard. The log viewer provides tools to search, pause, download, copy, and clear logs.