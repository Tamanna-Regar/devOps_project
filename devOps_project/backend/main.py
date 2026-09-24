import os
import sys
import uuid
import re
import socket
import logging
from typing import Optional, List
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import boto3
from botocore.exceptions import ClientError
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from pymongo import MongoClient, ASCENDING, DESCENDING
from starlette.middleware.base import BaseHTTPMiddleware

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

# =========================================================
# PROMETHEUS METRICS (DevOps Observability)
# =========================================================

HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests received",
    ["method", "endpoint", "status"]
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"]
)

# =========================================================
# LOGGING (File + Console for CloudWatch Agent)
# =========================================================

LOG_DIR = "/var/log/devops"
LOG_FILE = os.path.join(LOG_DIR, "backend.log")

logger = logging.getLogger("devops_backend")
logger.setLevel(logging.INFO)

formatter = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s [%(request_id)s]: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S"
)

class RequestIdFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True

logger.addFilter(RequestIdFilter())

# Standard console logging (stdout)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# File logging for CloudWatch agent
try:
    if os.path.exists(LOG_DIR) or os.access(os.path.dirname(LOG_DIR) or ".", os.W_OK):
        os.makedirs(LOG_DIR, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        logger.info("Logging initialized at %s", LOG_FILE)
except Exception as log_err:
    logger.warning("File logging not available (%s), using console logging only.", log_err)

# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()

DEFAULT_JWT_SECRET = "devops-task-manager-secret-2026"
JWT_SECRET = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

ADMIN_REGISTRATION_SECRET = os.getenv("ADMIN_REGISTRATION_SECRET", "")

if JWT_SECRET == DEFAULT_JWT_SECRET:
    logger.warning(
        "⚠️  Using the DEFAULT JWT_SECRET. Set a real JWT_SECRET env var before deploying to production."
    )

raw_mongo_url = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
if "host.docker.internal" in raw_mongo_url:
    try:
        socket.gethostbyname("host.docker.internal")
        MONGO_URL = raw_mongo_url
    except (socket.gaierror, OSError):
        logger.info("host.docker.internal not resolvable on host; using 127.0.0.1")
        MONGO_URL = raw_mongo_url.replace("host.docker.internal", "127.0.0.1")
else:
    MONGO_URL = raw_mongo_url

# =========================================================
# AWS SES (EMAIL)
# =========================================================

AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
SES_SENDER_EMAIL = os.getenv("SES_SENDER_EMAIL", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

ses_client = None
if SES_SENDER_EMAIL:
    try:
        ses_client = boto3.client("ses", region_name=AWS_REGION)
        logger.info("AWS SES client initialized for region %s", AWS_REGION)
    except Exception as e:
        logger.error("Failed to initialize SES client: %s", e)
else:
    logger.warning("SES_SENDER_EMAIL not set — password reset emails will only be logged, not sent.")

# =========================================================
# MONGODB (Single robust connection)
# =========================================================

IS_ATLAS = MONGO_URL.startswith("mongodb+srv://")

mongo_kwargs = {
    "serverSelectionTimeoutMS": 5000,
    "connectTimeoutMS": 10000,
    "socketTimeoutMS": 10000,
    "maxPoolSize": 10,
    "minPoolSize": 1,
    "retryWrites": True,
}

if IS_ATLAS:
    mongo_kwargs["tls"] = True
    mongo_kwargs["tlsAllowInvalidCertificates"] = False

try:
    client = MongoClient(MONGO_URL, **mongo_kwargs)
    client.admin.command("ping")

    db = client["devops_task_manager"]
    users_collection = db["users"]
    tasks_collection = db["tasks"]

    db_type = "MongoDB Atlas ☁️" if IS_ATLAS else "Local MongoDB 🐳"
    logger.info("Connected to %s", db_type)

except Exception as e:
    logger.error("MongoDB connection error: %s", e)
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client["devops_task_manager"]
    users_collection = db["users"]
    tasks_collection = db["tasks"]


def check_database_connection() -> bool:
    """Return True if MongoDB is responsive to ping, else False."""
    try:
        client.admin.command("ping")
        return True
    except Exception:
        return False

# =========================================================
# RATE LIMITER
# =========================================================

limiter = Limiter(key_func=get_remote_address)

# =========================================================
# LIFESPAN (Index creation on startup, graceful shutdown)
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure indexes
    try:
        users_collection.create_index("email", unique=True)
        tasks_collection.create_index([("email", ASCENDING), ("_id", ASCENDING)])
        tasks_collection.create_index([("status", ASCENDING)])
        tasks_collection.create_index([("priority", ASCENDING)])
        logger.info("MongoDB indexes verified/created (users.email unique, tasks indexes).")
    except Exception as e:
        logger.warning("Could not initialize MongoDB indexes: %s", e)

    yield

    # Shutdown: close Mongo connection
    try:
        client.close()
        logger.info("MongoDB client connection closed cleanly.")
    except Exception as e:
        logger.warning("Error during MongoDB shutdown: %s", e)

# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="DevOps Task Manager",
    version="1.2.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# =========================================================
# REQUEST ID & PROMETHEUS METRICS MIDDLEWARE
# =========================================================

class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        start_time = datetime.now(timezone.utc)

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_s = (datetime.now(timezone.utc) - start_time).total_seconds()
            HTTP_REQUESTS_TOTAL.labels(
                method=request.method,
                endpoint=request.url.path,
                status=500
            ).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=request.method,
                endpoint=request.url.path
            ).observe(duration_s)

            logger.error(
                "Unhandled error on %s %s: %s",
                request.method,
                request.url.path,
                exc,
                extra={"request_id": request_id}
            )
            origin = request.headers.get("origin", "")
            err_res = JSONResponse(
                status_code=500,
                content={"detail": f"Internal server error: {str(exc)}"}
            )
            if origin:
                err_res.headers["Access-Control-Allow-Origin"] = origin
                err_res.headers["Access-Control-Allow-Credentials"] = "true"
            err_res.headers["X-Request-ID"] = request_id
            return err_res

        duration_s = (datetime.now(timezone.utc) - start_time).total_seconds()
        duration_ms = duration_s * 1000

        # Prometheus metrics recording
        HTTP_REQUESTS_TOTAL.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(
            method=request.method,
            endpoint=request.url.path
        ).observe(duration_s)

        response.headers["X-Request-ID"] = request_id

        logger.info(
            "%s %s -> %s (%.2fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            extra={"request_id": request_id}
        )

        return response

app.add_middleware(ObservabilityMiddleware)

def log_with_request(request: Request, level: str, msg: str, *args):
    """Helper to log with the request's correlation id attached."""
    request_id = getattr(request.state, "request_id", "-")
    getattr(logger, level)(msg, *args, extra={"request_id": request_id})

# =========================================================
# CORS
# =========================================================

raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:80,http://127.0.0.1:5173,http://127.0.0.1:80"
).split(",")

ALLOWED_ORIGINS = [orig.strip() for orig in raw_origins if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if "*" not in ALLOWED_ORIGINS else ["*"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Global unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    origin = request.headers.get("origin", "")
    res = JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )
    if origin:
        res.headers["Access-Control-Allow-Origin"] = origin
        res.headers["Access-Control-Allow-Credentials"] = "true"
    return res


# =========================================================
# SECURITY
# =========================================================

security = HTTPBearer(auto_error=False)


# =========================================================
# JWT CREATE
# =========================================================

def create_access_token(user_id: str, email: str, role: str):
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token


# =========================================================
# JWT DECODE
# =========================================================

def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Session expired. Please login again."
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token."
        )


# =========================================================
# CURRENT USER
# =========================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please login again."
        )

    token = credentials.credentials
    payload = decode_access_token(token)

    user_id = payload.get("sub")
    email = payload.get("email")
    role = payload.get("role", "user")

    if not user_id or not email:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token."
        )

    return {
        "id": user_id,
        "email": email,
        "role": role
    }


# =========================================================
# ADMIN AUTH
# =========================================================

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )
    return current_user


# =========================================================
# HELPERS
# =========================================================

def get_object_id(item_id: str):
    try:
        return ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")


ALLOWED_STATUSES = ["Pending", "In Progress", "Completed"]
ALLOWED_PRIORITIES = ["Low", "Medium", "High", "Urgent"]

def validate_status(status_value: str):
    if status_value not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid task status. Allowed: {ALLOWED_STATUSES}")


def validate_priority(priority_value: str):
    if priority_value not in ALLOWED_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid task priority. Allowed: {ALLOWED_PRIORITIES}")


def validate_password_strength(password: str):
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")
    if not re.search(r"[a-zA-Z]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one letter")


def task_to_response(task):
    created_at = task.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    updated_at = task.get("updated_at")
    if isinstance(updated_at, datetime):
        updated_at = updated_at.isoformat()

    return {
        "id": str(task["_id"]),
        "title": task.get("title", ""),
        "description": task.get("description", ""),
        "status": task.get("status", "Pending"),
        "priority": task.get("priority", "Medium"),
        "due_date": task.get("due_date"),
        "tags": task.get("tags", []),
        "email": task.get("email", ""),
        "created_at": created_at,
        "updated_at": updated_at
    }


def user_to_response(user):
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "user")
    }


def clamp_pagination(skip: int, limit: int, max_limit: int = 100):
    """Keep pagination params sane regardless of what the client sends."""
    skip = max(skip, 0)
    limit = min(max(limit, 1), max_limit)
    return skip, limit


# =========================================================
# MODELS
# =========================================================

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "user"
    admin_secret: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "Pending"
    priority: str = "Medium"
    due_date: Optional[str] = None
    tags: List[str] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class RoleUpdate(BaseModel):
    role: str


# =========================================================
# HOME & OBSERVABILITY
# =========================================================

@app.get("/")
def home():
    return {
        "message": "Welcome to DevOps Task Manager!",
        "status": "running"
    }


@app.get("/metrics", tags=["Observability"])
def metrics():
    """Prometheus metrics scrape endpoint for DevOps monitoring."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# =========================================================
# HEALTH (general + liveness/readiness probes)
# =========================================================

@app.get("/health", tags=["Health"])
def health():
    try:
        client.admin.command("ping")
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e)
            }
        )


@app.get("/health/live", tags=["Health"])
def liveness():
    """Liveness probe: process is up and responding. No DB check."""
    return {"status": "alive"}


@app.get("/health/ready", tags=["Health"])
def readiness():
    """Readiness probe: process can actually serve traffic (DB reachable)."""
    try:
        client.admin.command("ping")
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        logger.error("Readiness check failed: %s", e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not ready", "database": "disconnected"}
        )


# =========================================================
# INFO
# =========================================================

@app.get("/api/info")
def info():
    return {
        "project": "DevOps Task Manager",
        "technology": "FastAPI",
        "database": "MongoDB",
        "version": "1.2.0"
    }


# =========================================================
# REGISTER
# =========================================================

@app.post("/api/register")
@limiter.limit("10/minute")
def register(request: Request, user: UserRegister):
    name = user.name.strip()
    email = str(user.email).strip().lower()
    password = user.password

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    validate_password_strength(password)

    # Security: prevent unauthorized self-assignment of admin role
    if user.role.strip().lower() == "admin":
        if not ADMIN_REGISTRATION_SECRET or user.admin_secret != ADMIN_REGISTRATION_SECRET:
            raise HTTPException(
                status_code=403,
                detail="Self-registration as admin is forbidden. Only administrators can assign roles."
            )
        role = "admin"
    else:
        role = "user"
    existing_user = users_collection.find_one({"email": email})

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        hashed_password = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")
    except Exception as e:
        log_with_request(request, "exception", "Password hashing error: %s", e)
        raise HTTPException(status_code=500, detail="Unable to secure password")

    user_data = {
        "name": name,
        "email": email,
        "password": hashed_password,
        "role": role,
        "created_at": datetime.now(timezone.utc)
    }

    try:
        result = users_collection.insert_one(user_data)
    except Exception as e:
        log_with_request(request, "exception", "Register error: %s", e)
        raise HTTPException(status_code=500, detail="Registration failed")

    return {
        "message": "Registration successful",
        "user_id": str(result.inserted_id),
        "name": name,
        "email": email,
        "role": role
    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/login")
@limiter.limit("5/minute")
def login(request: Request, user: UserLogin):
    email = str(user.email).strip().lower()
    password = user.password

    existing_user = users_collection.find_one({"email": email})

    if not existing_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored_password = existing_user.get("password")

    if not stored_password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    try:
        password_correct = bcrypt.checkpw(
            password.encode("utf-8"),
            stored_password.encode("utf-8")
        )
    except Exception as e:
        log_with_request(request, "exception", "Password verification error: %s", e)
        password_correct = False

    if not password_correct:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(existing_user["_id"])
    role = existing_user.get("role", "user")

    access_token = create_access_token(user_id=user_id, email=email, role=role)

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": existing_user.get("name", ""),
            "email": email,
            "role": role
        }
    }


# =========================================================
# CURRENT USER
# =========================================================

@app.get("/api/me")
def get_me(current_user: dict = Depends(get_current_user)):
    user = users_collection.find_one({"_id": ObjectId(current_user["id"])})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {"user": user_to_response(user)}


# =========================================================
# ADD TASK
# =========================================================

@app.post("/api/tasks")
def add_task(
    request: Request,
    task: TaskCreate,
    current_user: dict = Depends(get_current_user)
):
    title = task.title.strip()
    description = (task.description or "").strip()
    task_status = task.status.strip()
    task_priority = (task.priority or "Medium").strip()

    if not title:
        raise HTTPException(status_code=400, detail="Task title cannot be empty")

    validate_status(task_status)
    validate_priority(task_priority)

    email = current_user["email"]
    now = datetime.now(timezone.utc)

    task_data = {
        "title": title,
        "description": description,
        "status": task_status,
        "priority": task_priority,
        "due_date": task.due_date,
        "tags": task.tags or [],
        "email": email,
        "created_at": now,
        "updated_at": now
    }

    try:
        result = tasks_collection.insert_one(task_data)
    except Exception as e:
        log_with_request(request, "exception", "Add task error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to add task")

    task_data["_id"] = result.inserted_id

    return {
        "message": "Task added successfully",
        "task": task_to_response(task_data)
    }


# =========================================================
# GET MY TASKS (paginated, searchable, filterable)
# =========================================================

@app.get("/api/tasks")
def get_my_tasks(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "_id",
    order: str = "desc",
    current_user: dict = Depends(get_current_user)
):
    email = current_user["email"]
    skip, limit = clamp_pagination(skip, limit)

    query = {"email": email}
    if status and status.strip() != "All":
        query["status"] = status.strip()
    if priority and priority.strip() != "All":
        query["priority"] = priority.strip()
    if search and search.strip():
        search_regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {"title": search_regex},
            {"description": search_regex}
        ]

    sort_direction = DESCENDING if order.lower() == "desc" else ASCENDING
    sort_field = sort_by if sort_by in ("_id", "created_at", "due_date", "priority", "title", "status") else "_id"

    try:
        total = tasks_collection.count_documents(query)
        tasks = list(
            tasks_collection
            .find(query)
            .sort(sort_field, sort_direction)
            .skip(skip)
            .limit(limit)
        )
    except Exception as e:
        log_with_request(request, "exception", "Get tasks error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load tasks")

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "tasks": [task_to_response(task) for task in tasks]
    }


# =========================================================
# GET TASKS BY EMAIL (Added for Frontend Dynamic Route)
# =========================================================

@app.get("/api/tasks/{email}")
def get_tasks_by_email(
    request: Request,
    email: str,
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    target_email = email.strip().lower()
    skip, limit = clamp_pagination(skip, limit)

    if (
        target_email != current_user["email"].lower()
        and current_user["role"] != "admin"
    ):
        raise HTTPException(status_code=403, detail="You cannot access tasks for this user")

    query = {"email": target_email}
    if status and status.strip() != "All":
        query["status"] = status.strip()
    if priority and priority.strip() != "All":
        query["priority"] = priority.strip()
    if search and search.strip():
        search_regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {"title": search_regex},
            {"description": search_regex}
        ]

    try:
        total = tasks_collection.count_documents(query)
        tasks = list(
            tasks_collection
            .find(query)
            .sort("_id", -1)
            .skip(skip)
            .limit(limit)
        )
    except Exception as e:
        log_with_request(request, "exception", "Get tasks by email error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load tasks")

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "tasks": [task_to_response(task) for task in tasks]
    }


# =========================================================
# GET SINGLE TASK
# =========================================================

@app.get("/api/tasks/id/{task_id}")
def get_single_task(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = get_object_id(task_id)

    task = tasks_collection.find_one({"_id": object_id})

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if (
        task.get("email") != current_user["email"]
        and current_user["role"] != "admin"
    ):
        raise HTTPException(status_code=403, detail="You cannot access this task")

    return {"task": task_to_response(task)}


# =========================================================
# UPDATE TASK
# =========================================================

@app.put("/api/tasks/{task_id}")
def update_task(
    request: Request,
    task_id: str,
    task: TaskUpdate,
    current_user: dict = Depends(get_current_user)
):
    object_id = get_object_id(task_id)

    existing_task = tasks_collection.find_one({"_id": object_id})

    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")

    if (
        existing_task.get("email") != current_user["email"]
        and current_user["role"] != "admin"
    ):
        raise HTTPException(status_code=403, detail="You cannot update this task")

    updates = {"updated_at": datetime.now(timezone.utc)}

    if task.title is not None:
        title = task.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Task title cannot be empty")
        updates["title"] = title

    if task.description is not None:
        updates["description"] = task.description.strip()

    if task.status is not None:
        task_status = task.status.strip()
        validate_status(task_status)
        updates["status"] = task_status

    if task.priority is not None:
        task_priority = task.priority.strip()
        validate_priority(task_priority)
        updates["priority"] = task_priority

    if task.due_date is not None:
        updates["due_date"] = task.due_date

    if task.tags is not None:
        updates["tags"] = task.tags

    try:
        tasks_collection.update_one(
            {"_id": object_id},
            {"$set": updates}
        )
    except Exception as e:
        log_with_request(request, "exception", "Update task error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update task")

    updated_task = tasks_collection.find_one({"_id": object_id})

    return {
        "message": "Task updated successfully",
        "task": task_to_response(updated_task)
    }


# =========================================================
# DELETE TASK
# =========================================================

@app.delete("/api/tasks/{task_id}")
def delete_task(
    request: Request,
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = get_object_id(task_id)

    existing_task = tasks_collection.find_one({"_id": object_id})

    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")

    if (
        existing_task.get("email") != current_user["email"]
        and current_user["role"] != "admin"
    ):
        raise HTTPException(status_code=403, detail="You cannot delete this task")

    try:
        result = tasks_collection.delete_one({"_id": object_id})
    except Exception as e:
        log_with_request(request, "exception", "Delete task error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete task")

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "message": "Task deleted successfully",
        "id": task_id
    }


# =========================================================
# ADMIN - ALL TASKS (paginated, searchable, filterable)
# =========================================================

@app.get("/api/admin/tasks")
def get_all_tasks(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "_id",
    order: str = "desc",
    current_user: dict = Depends(require_admin)
):
    skip, limit = clamp_pagination(skip, limit)

    query = {}
    if status and status.strip() != "All":
        query["status"] = status.strip()
    if priority and priority.strip() != "All":
        query["priority"] = priority.strip()
    if search and search.strip():
        search_regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {"title": search_regex},
            {"description": search_regex},
            {"email": search_regex}
        ]

    sort_direction = DESCENDING if order.lower() == "desc" else ASCENDING
    sort_field = sort_by if sort_by in ("_id", "created_at", "due_date", "priority", "title", "status", "email") else "_id"

    try:
        total = tasks_collection.count_documents(query)
        tasks = list(
            tasks_collection
            .find(query)
            .sort(sort_field, sort_direction)
            .skip(skip)
            .limit(limit)
        )
    except Exception as e:
        log_with_request(request, "exception", "Admin tasks error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load tasks")

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "tasks": [task_to_response(task) for task in tasks]
    }


# =========================================================
# FORGOT PASSWORD
# =========================================================

def send_reset_email(to_email: str, reset_link: str):
    if not ses_client or not SES_SENDER_EMAIL:
        logger.info("SES client not configured. Reset link for %s: %s", to_email, reset_link)
        return

    subject = "DevOps Task Manager - Password Reset"
    body_text = f"Click the link to reset your password: {reset_link}"
    body_html = f"""
    <html>
        <body>
            <h2>Password Reset</h2>
            <p>You requested a password reset. Click the button below to set a new password:</p>
            <a href="{reset_link}" style="display:inline-block;padding:10px 20px;background-color:#007BFF;color:#fff;text-decoration:none;border-radius:5px;">Reset Password</a>
            <p>If you did not request this, please ignore this email.</p>
        </body>
    </html>
    """

    try:
        ses_client.send_email(
            Destination={'ToAddresses': [to_email]},
            Message={
                'Body': {
                    'Html': {'Charset': "UTF-8", 'Data': body_html},
                    'Text': {'Charset': "UTF-8", 'Data': body_text},
                },
                'Subject': {'Charset': "UTF-8", 'Data': subject},
            },
            Source=SES_SENDER_EMAIL,
        )
    except ClientError as e:
        logger.error("SES Send Error: %s", e.response['Error']['Message'])
        raise HTTPException(status_code=500, detail="Failed to send reset email")


@app.post("/api/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest):
    email = str(body.email).strip().lower()

    user = users_collection.find_one({"email": email})

    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")

    payload = {
        "sub": str(user["_id"]),
        "email": email,
        "purpose": "password_reset",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15)
    }
    reset_token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    send_reset_email(email, reset_link)

    return {"message": "Password reset link sent to your email."}


# =========================================================
# RESET PASSWORD
# =========================================================

@app.post("/api/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetPasswordRequest):
    try:
        payload = jwt.decode(body.token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        if payload.get("purpose") != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid token type")

        user_id = payload.get("sub")
        email = payload.get("email")

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Reset link expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid reset link")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    hashed_password = bcrypt.hashpw(
        body.new_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    result = users_collection.update_one(
        {"_id": ObjectId(user_id), "email": email},
        {"$set": {"password": hashed_password}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Failed to reset password. User not found.")

    return {"message": "Password reset successfully. You can now log in."}


# =========================================================
# ADMIN - USERS (paginated)
# =========================================================

@app.get("/api/admin/users")
def get_all_users(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    current_user: dict = Depends(require_admin)
):
    skip, limit = clamp_pagination(skip, limit)

    try:
        total = users_collection.count_documents({})
        users = list(
            users_collection
            .find()
            .sort("_id", -1)
            .skip(skip)
            .limit(limit)
        )
    except Exception as e:
        log_with_request(request, "exception", "Get users error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load users")

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "users": [user_to_response(user) for user in users]
    }


# =========================================================
# ADMIN - UPDATE ROLE
# =========================================================

@app.put("/api/admin/users/{user_id}/role")
def update_user_role(
    user_id: str,
    body: RoleUpdate,
    current_user: dict = Depends(require_admin)
):
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")

    object_id = get_object_id(user_id)

    existing = users_collection.find_one({"_id": object_id})

    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    users_collection.update_one(
        {"_id": object_id},
        {"$set": {"role": body.role}}
    )

    updated = users_collection.find_one({"_id": object_id})

    return {
        "message": "Role updated successfully",
        "user": user_to_response(updated)
    }


# =========================================================
# ADMIN - DELETE USER
# =========================================================

@app.delete("/api/admin/users/{user_id}")
def delete_user(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    object_id = get_object_id(user_id)

    existing = users_collection.find_one({"_id": object_id})

    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    if str(existing["_id"]) == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    users_collection.delete_one({"_id": object_id})

    return {
        "message": "User deleted successfully",
        "id": user_id
    }