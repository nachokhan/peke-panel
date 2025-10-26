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



To get Peke-Panel up and running on your local machine, follow these steps:



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



3.  **Build and run with Docker Compose:**



    Ensure you have Docker and Docker Compose installed. From the project root directory, execute:



    ```bash

    docker-compose up --build -d

    ```



    This command will build the frontend and backend Docker images, and then start the services in detached mode.



4.  **Access the application:**



    Once the services are running, open your web browser and navigate to `http://localhost:3000` (or the port you specified in your `.env` file).



## Running on a server



The steps to run the project on a server are the same as running it locally. However, for a production environment, you should consider the following:



*   **Security:** Ensure that your `.env` file is not exposed and that you are using strong secrets.

*   **Domain and SSL:** You should configure a reverse proxy (like Nginx or Traefik) to point your domain to the frontend container and enable SSL.

*   **Detached mode:** Always run the containers in detached mode (`-d` flag) on a server.