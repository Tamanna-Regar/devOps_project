# DevOps Task Manager

A full-stack task management app with role-based access (user / admin),
built as a DevOps learning project covering CI/CD, Docker, and deployment.

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React (Vite) |
| Backend    | FastAPI |
| Database   | MongoDB |
| Auth       | JWT (bearer tokens) + bcrypt password hashing |
| Containers | Docker, Docker Compose |
| CI/CD      | GitHub Actions |

## Features

- User registration and login (JWT-based auth)
- Role-based access: normal users manage their own tasks, admins see and
  manage everyone's tasks and users
- Full task CRUD (create, read, update, delete)
- Admin panel: search/filter tasks, promote/demote users, remove users
- Health check (`/health`) and project info (`/api/info`) endpoints
- Dockerized frontend + backend + database
- Automated pipeline: test → build Docker images → deploy on every push to `main`

## Project structure

```
.
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/ProtectedRoute.jsx
│   │   ├── services/api.js
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Register.jsx
│   │       ├── Dashboard.jsx
│   │       └── AdminDashboard.jsx (+ .css)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .dockerignore
├── backend/
│   ├── main.py
│   ├── test_main.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml
└── .github/workflows/deploy.yml
```

## Running locally with Docker Compose

```bash
git clone <your-repo-url>
cd <project-folder>
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend docs: http://127.0.0.1:8000/docs

## Environment variables (backend)

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable      | Description                                  |
|---------------|-----------------------------------------------|
| `MONGO_URL`   | MongoDB connection string                     |
| `JWT_SECRET`  | Long random string used to sign login tokens  |

**Never commit a real `.env` file** — `.dockerignore` and `.gitignore` already exclude it.

## Running tests

```bash
cd backend
pip install -r requirements.txt
pytest test_main.py -v
```

## CI/CD pipeline

On every push to `main`, GitHub Actions:
1. Runs the backend test suite
2. Builds and pushes Docker images (frontend + backend) to Docker Hub
3. SSHes into the deployment server and restarts the containers via `docker compose`

Required GitHub repo secrets:
- `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`

## API overview

| Method | Route | Access |
|--------|-------|--------|
| POST | `/api/register` | Public |
| POST | `/api/login` | Public |
| GET | `/api/tasks/{email}` | Logged in |
| POST | `/api/tasks` | Logged in |
| PUT | `/api/tasks/{id}` | Logged in |
| DELETE | `/api/tasks/{id}` | Logged in |
| GET | `/api/admin/tasks` | Admin only |
| GET | `/api/admin/users` | Admin only |
| PUT | `/api/admin/users/{id}/role` | Admin only |
| DELETE | `/api/admin/users/{id}` | Admin only |
| GET | `/health` | Public |
| GET | `/api/info` | Public |