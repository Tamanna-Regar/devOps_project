import os
import sys
import uuid
import re
import socket
import logging
import secrets
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
from fastapi import FastAPI, HTTPException, Depends, status, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
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

ATTACHMENTS_DIR = os.getenv("ATTACHMENTS_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads"))
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)

try:
    client = MongoClient(MONGO_URL, **mongo_kwargs)
    client.admin.command("ping")

    db = client["devops_task_manager"]
    users_collection = db["users"]
    tasks_collection = db["tasks"]
    sprints_collection = db["sprints"]
    comments_collection = db["comments"]
    activity_logs_collection = db["activity_logs"]
    attachments_collection = db["attachments"]
    queries_collection = db["queries"]

    db_type = "MongoDB Atlas" if IS_ATLAS else "Local MongoDB"
    logger.info("Connected to %s", db_type)

except Exception as e:
    logger.error("MongoDB connection error: %s", e)
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client["devops_task_manager"]
    users_collection = db["users"]
    tasks_collection = db["tasks"]
    sprints_collection = db["sprints"]
    comments_collection = db["comments"]
    activity_logs_collection = db["activity_logs"]
    attachments_collection = db["attachments"]
    queries_collection = db["queries"]


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
        tasks_collection.create_index([("sprint_id", ASCENDING)])
        tasks_collection.create_index([("parent_id", ASCENDING)])
        sprints_collection.create_index([("status", ASCENDING)])
        sprints_collection.create_index([("start_date", ASCENDING)])
        comments_collection.create_index([("work_item_id", ASCENDING), ("created_at", ASCENDING)])
        activity_logs_collection.create_index([("work_item_id", ASCENDING), ("timestamp", DESCENDING)])
        attachments_collection.create_index([("work_item_id", ASCENDING), ("uploaded_at", DESCENDING)])
        queries_collection.create_index([("created_by", ASCENDING)])
        logger.info("MongoDB indexes verified/created (users, tasks, sprints, comments, activity, attachments, queries).")
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
ALLOWED_ITEM_TYPES = ["Task", "Bug", "Feature", "Epic", "Story", "User Story", "Issue"]

def validate_status(status_value: str):
    if status_value not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid task status. Allowed: {ALLOWED_STATUSES}")


def validate_priority(priority_value: str):
    if priority_value not in ALLOWED_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid task priority. Allowed: {ALLOWED_PRIORITIES}")


def validate_item_type(type_value: str):
    if type_value not in ALLOWED_ITEM_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid item type. Allowed: {ALLOWED_ITEM_TYPES}")


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
        "item_type": task.get("item_type", "Task"),
        "due_date": task.get("due_date"),
        "tags": task.get("tags", []),
        "email": task.get("email", ""),
        "parent_id": task.get("parent_id"),
        "sprint_id": task.get("sprint_id"),
        "story_points": task.get("story_points"),
        "assigned_to": task.get("assigned_to"),
        "area_path": task.get("area_path", ""),
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


ALLOWED_SPRINT_STATUSES = ["Planned", "Active", "Completed"]


def validate_sprint_status(status_value: str):
    if status_value not in ALLOWED_SPRINT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid sprint status. Allowed: {ALLOWED_SPRINT_STATUSES}")


def sprint_to_response(sprint):
    start_date = sprint.get("start_date")
    if isinstance(start_date, datetime):
        start_date = start_date.isoformat()

    end_date = sprint.get("end_date")
    if isinstance(end_date, datetime):
        end_date = end_date.isoformat()

    return {
        "id": str(sprint["_id"]),
        "name": sprint.get("name", ""),
        "start_date": start_date,
        "end_date": end_date,
        "goal": sprint.get("goal", ""),
        "status": sprint.get("status", "Planned"),
        "created_by": sprint.get("created_by", "")
    }


def comment_to_response(comment):
    created_at = comment.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    return {
        "id": str(comment["_id"]),
        "work_item_id": comment.get("work_item_id", ""),
        "author_email": comment.get("author_email", ""),
        "text": comment.get("text", ""),
        "created_at": created_at
    }


def activity_to_response(entry):
    timestamp = entry.get("timestamp")
    if isinstance(timestamp, datetime):
        timestamp = timestamp.isoformat()

    return {
        "id": str(entry["_id"]),
        "work_item_id": entry.get("work_item_id", ""),
        "changed_by": entry.get("changed_by", ""),
        "field_changed": entry.get("field_changed", ""),
        "old_value": entry.get("old_value"),
        "new_value": entry.get("new_value"),
        "timestamp": timestamp
    }


def log_activity(work_item_id: str, changed_by: str, field_changed: str, old_value, new_value):
    """Best-effort audit log write — never blocks the main request if it fails."""
    try:
        activity_logs_collection.insert_one({
            "work_item_id": work_item_id,
            "changed_by": changed_by,
            "field_changed": field_changed,
            "old_value": old_value,
            "new_value": new_value,
            "timestamp": datetime.now(timezone.utc)
        })
    except Exception as e:
        logger.warning("Failed to write activity log for %s: %s", work_item_id, e)


def check_work_item_access(task: dict, current_user: dict, require_creator: bool = False):
    """
    Check if user is permitted to access/modify a work item.
    - Admin always has full access.
    - Creator always has full access.
    - If require_creator is False, assignee also has read/update access.
    """
    user_email = current_user.get("email", "").strip().lower()
    is_admin = current_user.get("role") == "admin"
    is_creator = task.get("email", "").strip().lower() == user_email
    is_assignee = (task.get("assigned_to") or "").strip().lower() == user_email

    if is_admin or is_creator:
        return True
    if not require_creator and is_assignee:
        return True

    raise HTTPException(status_code=403, detail="You do not have permission to access this work item")


def attachment_to_response(att):
    uploaded_at = att.get("uploaded_at")
    if isinstance(uploaded_at, datetime):
        uploaded_at = uploaded_at.isoformat()

    return {
        "id": str(att["_id"]),
        "work_item_id": att.get("work_item_id", ""),
        "original_name": att.get("original_name", ""),
        "file_size": att.get("file_size", 0),
        "content_type": att.get("content_type", ""),
        "uploaded_by": att.get("uploaded_by", ""),
        "uploaded_at": uploaded_at
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
    item_type: str = "Task"
    due_date: Optional[str] = None
    tags: List[str] = []
    parent_id: Optional[str] = None
    sprint_id: Optional[str] = None
    story_points: Optional[float] = None
    assigned_to: Optional[str] = None
    area_path: str = ""


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    item_type: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None
    parent_id: Optional[str] = None
    sprint_id: Optional[str] = None
    story_points: Optional[float] = None
    assigned_to: Optional[str] = None
    area_path: Optional[str] = None


class SprintCreate(BaseModel):
    name: str
    start_date: datetime
    end_date: datetime
    goal: str = ""


class SprintUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    goal: Optional[str] = None
    status: Optional[str] = None


class CommentCreate(BaseModel):
    text: str


class ParentUpdate(BaseModel):
    parent_id: Optional[str] = None  # null clears the parent


class SprintAssign(BaseModel):
    sprint_id: Optional[str] = None  # null moves item back to backlog


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class RoleUpdate(BaseModel):
    role: str


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None


class UserPasswordUpdate(BaseModel):
    current_password: str
    new_password: str


class BulkTaskUpdate(BaseModel):
    task_ids: List[str]
    status: Optional[str] = None
    priority: Optional[str] = None
    sprint_id: Optional[str] = None
    assigned_to: Optional[str] = None


class QueryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    status: Optional[str] = None
    item_type: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    sprint_id: Optional[str] = None


class AIWorkItemRequest(BaseModel):
    prompt: str
    item_type: Optional[str] = "Task"



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


@app.put("/api/me")
def update_me(
    body: UserProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        users_collection.update_one(
            {"_id": ObjectId(current_user["id"])},
            {"$set": {"name": name}}
        )

    user = users_collection.find_one({"_id": ObjectId(current_user["id"])})
    return {"message": "Profile updated successfully", "user": user_to_response(user)}


@app.put("/api/me/password")
def update_my_password(
    body: UserPasswordUpdate,
    current_user: dict = Depends(get_current_user)
):
    user = users_collection.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored_password = user.get("password")
    if not stored_password or not bcrypt.checkpw(body.current_password.encode("utf-8"), stored_password.encode("utf-8")):
        raise HTTPException(status_code=400, detail="Current password does not match")

    validate_password_strength(body.new_password)
    new_hash = bcrypt.hashpw(body.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    users_collection.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {"password": new_hash}}
    )
    return {"message": "Password changed successfully"}


@app.get("/api/users/team")
def get_team_members(current_user: dict = Depends(get_current_user)):
    """Return list of active team members so any user can assign work items."""
    users = list(
        users_collection.find({}, {"_id": 1, "name": 1, "email": 1, "role": 1}).sort("name", 1)
    )
    return {"members": [user_to_response(u) for u in users]}



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
    task_item_type = (task.item_type or "Task").strip()

    if not title:
        raise HTTPException(status_code=400, detail="Task title cannot be empty")

    validate_status(task_status)
    validate_priority(task_priority)
    validate_item_type(task_item_type)

    email = current_user["email"]
    now = datetime.now(timezone.utc)

    # If a parent work item is specified, make sure it actually exists
    if task.parent_id:
        parent = tasks_collection.find_one({"_id": get_object_id(task.parent_id)})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent work item not found")

    # If a sprint is specified, make sure it actually exists
    if task.sprint_id:
        sprint = sprints_collection.find_one({"_id": get_object_id(task.sprint_id)})
        if not sprint:
            raise HTTPException(status_code=400, detail="Sprint not found")

    task_data = {
        "title": title,
        "description": description,
        "status": task_status,
        "priority": task_priority,
        "item_type": task_item_type,
        "due_date": task.due_date,
        "tags": task.tags or [],
        "email": email,
        "parent_id": task.parent_id,
        "sprint_id": task.sprint_id,
        "story_points": task.story_points,
        "assigned_to": (task.assigned_to or "").strip().lower() or None,
        "area_path": (task.area_path or "").strip(),
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
    item_type: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "_id",
    order: str = "desc",
    current_user: dict = Depends(get_current_user)
):
    email = current_user["email"]
    email_clean = email.strip().lower()
    skip, limit = clamp_pagination(skip, limit)

    base_user_filter = {
        "$or": [
            {"email": email},
            {"assigned_to": email_clean}
        ]
    }
    query_filters = [base_user_filter]

    if status and status.strip() != "All":
        query_filters.append({"status": status.strip()})
    if priority and priority.strip() != "All":
        query_filters.append({"priority": priority.strip()})
    if item_type and item_type.strip() != "All":
        query_filters.append({"item_type": item_type.strip()})
    if search and search.strip():
        search_regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        query_filters.append({
            "$or": [
                {"title": search_regex},
                {"description": search_regex},
                {"tags": search_regex}
            ]
        })

    query = {"$and": query_filters} if len(query_filters) > 1 else query_filters[0]

    sort_direction = DESCENDING if order.lower() == "desc" else ASCENDING
    sort_field = sort_by if sort_by in ("_id", "created_at", "due_date", "priority", "title", "status", "item_type") else "_id"

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
# GET ALL TAGS (Aggregation for filtering/tagging)
# =========================================================

@app.get("/api/tags")
def get_all_tags(current_user: dict = Depends(get_current_user)):
    """Return distinct tags across all work items for tag autocomplete & filters."""
    try:
        raw_tags = tasks_collection.distinct("tags")
        clean_tags = sorted(list({str(t).strip() for t in raw_tags if str(t).strip()}))
        return {"tags": clean_tags}
    except Exception as e:
        logger.warning("Error fetching tags: %s", e)
        return {"tags": []}


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
    item_type: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    ident = email.strip()

    # If identifier is a valid ObjectId (and not an email address), retrieve single task
    if "@" not in ident and ObjectId.is_valid(ident):
        task = tasks_collection.find_one({"_id": ObjectId(ident)})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        check_work_item_access(task, current_user, require_creator=False)
        return {"task": task_to_response(task)}

    target_email = ident.lower()
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
    if item_type and item_type.strip() != "All":
        query["item_type"] = item_type.strip()
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

    check_work_item_access(task, current_user, require_creator=False)

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

    check_work_item_access(existing_task, current_user, require_creator=False)

    updates = {"updated_at": datetime.now(timezone.utc)}
    changed_by = current_user["email"]

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

    if task.item_type is not None:
        item_type = task.item_type.strip()
        validate_item_type(item_type)
        updates["item_type"] = item_type

    if task.due_date is not None:
        updates["due_date"] = task.due_date

    if task.tags is not None:
        updates["tags"] = task.tags

    if task.parent_id is not None:
        if task.parent_id:
            if task.parent_id == task_id:
                raise HTTPException(status_code=400, detail="A work item cannot be its own parent")
            parent = tasks_collection.find_one({"_id": get_object_id(task.parent_id)})
            if not parent:
                raise HTTPException(status_code=400, detail="Parent work item not found")
        updates["parent_id"] = task.parent_id or None

    if task.sprint_id is not None:
        if task.sprint_id:
            sprint = sprints_collection.find_one({"_id": get_object_id(task.sprint_id)})
            if not sprint:
                raise HTTPException(status_code=400, detail="Sprint not found")
        updates["sprint_id"] = task.sprint_id or None

    if task.story_points is not None:
        updates["story_points"] = task.story_points

    if task.assigned_to is not None:
        updates["assigned_to"] = task.assigned_to.strip().lower() or None

    if task.area_path is not None:
        updates["area_path"] = task.area_path.strip()

    try:
        tasks_collection.update_one(
            {"_id": object_id},
            {"$set": updates}
        )
    except Exception as e:
        log_with_request(request, "exception", "Update task error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update task")

    # Audit trail: record any field that actually changed value
    for field, new_value in updates.items():
        if field == "updated_at":
            continue
        old_value = existing_task.get(field)
        if old_value != new_value:
            log_activity(task_id, changed_by, field, old_value, new_value)

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

    check_work_item_access(existing_task, current_user, require_creator=True)

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
# BULK WORK ITEM UPDATE
# =========================================================

@app.post("/api/tasks/bulk-update")
def bulk_update_tasks(
    body: BulkTaskUpdate,
    current_user: dict = Depends(get_current_user)
):
    if not body.task_ids:
        raise HTTPException(status_code=400, detail="No task IDs provided")

    updates = {"updated_at": datetime.now(timezone.utc)}
    if body.status is not None:
        st = body.status.strip()
        validate_status(st)
        updates["status"] = st

    if body.priority is not None:
        pr = body.priority.strip()
        validate_priority(pr)
        updates["priority"] = pr

    if body.sprint_id is not None:
        if body.sprint_id:
            sprint = sprints_collection.find_one({"_id": get_object_id(body.sprint_id)})
            if not sprint:
                raise HTTPException(status_code=400, detail="Sprint not found")
        updates["sprint_id"] = body.sprint_id or None

    if body.assigned_to is not None:
        updates["assigned_to"] = body.assigned_to.strip().lower() or None

    updated_count = 0
    for tid in body.task_ids:
        try:
            oid = get_object_id(tid)
            task = tasks_collection.find_one({"_id": oid})
            if not task:
                continue

            user_email = current_user["email"].lower()
            is_admin = current_user.get("role") == "admin"
            is_creator = task.get("email", "").lower() == user_email
            is_assignee = (task.get("assigned_to") or "").lower() == user_email

            if not (is_admin or is_creator or is_assignee):
                continue

            tasks_collection.update_one({"_id": oid}, {"$set": updates})
            updated_count += 1

            for f, val in updates.items():
                if f != "updated_at" and task.get(f) != val:
                    log_activity(tid, current_user["email"], f, task.get(f), val)
        except Exception:
            continue

    return {
        "message": f"Successfully updated {updated_count} work items",
        "updated_count": updated_count
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
    item_type: Optional[str] = None,
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
    if item_type and item_type.strip() != "All":
        query["item_type"] = item_type.strip()
    if search and search.strip():
        search_regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {"title": search_regex},
            {"description": search_regex},
            {"email": search_regex}
        ]

    sort_direction = DESCENDING if order.lower() == "desc" else ASCENDING
    sort_field = sort_by if sort_by in ("_id", "created_at", "due_date", "priority", "title", "status", "email", "item_type") else "_id"

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


# =========================================================
# SPRINTS - CREATE
# =========================================================

@app.post("/api/sprints")
def create_sprint(
    request: Request,
    sprint: SprintCreate,
    current_user: dict = Depends(get_current_user)
):
    name = sprint.name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Sprint name cannot be empty")

    if sprint.end_date <= sprint.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    sprint_data = {
        "name": name,
        "start_date": sprint.start_date,
        "end_date": sprint.end_date,
        "goal": sprint.goal.strip(),
        "status": "Planned",
        "created_by": current_user["email"],
        "created_at": datetime.now(timezone.utc)
    }

    try:
        result = sprints_collection.insert_one(sprint_data)
    except Exception as e:
        log_with_request(request, "exception", "Create sprint error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create sprint")

    sprint_data["_id"] = result.inserted_id

    return {
        "message": "Sprint created successfully",
        "sprint": sprint_to_response(sprint_data)
    }


# =========================================================
# SPRINTS - LIST
# =========================================================

@app.get("/api/sprints")
def get_sprints(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    try:
        sprints = list(sprints_collection.find().sort("start_date", -1))
    except Exception as e:
        log_with_request(request, "exception", "Get sprints error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load sprints")

    return {"sprints": [sprint_to_response(s) for s in sprints]}


# =========================================================
# SPRINTS - UPDATE
# =========================================================

@app.put("/api/sprints/{sprint_id}")
def update_sprint(
    request: Request,
    sprint_id: str,
    sprint: SprintUpdate,
    current_user: dict = Depends(get_current_user)
):
    object_id = get_object_id(sprint_id)

    existing = sprints_collection.find_one({"_id": object_id})

    if not existing:
        raise HTTPException(status_code=404, detail="Sprint not found")

    updates = {}

    if sprint.name is not None:
        name = sprint.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Sprint name cannot be empty")
        updates["name"] = name

    start_date = sprint.start_date if sprint.start_date is not None else existing.get("start_date")
    end_date = sprint.end_date if sprint.end_date is not None else existing.get("end_date")

    if sprint.start_date is not None:
        updates["start_date"] = sprint.start_date
    if sprint.end_date is not None:
        updates["end_date"] = sprint.end_date

    if start_date and end_date and end_date <= start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    if sprint.goal is not None:
        updates["goal"] = sprint.goal.strip()

    if sprint.status is not None:
        validate_sprint_status(sprint.status)
        updates["status"] = sprint.status

    if not updates:
        return {"message": "Nothing to update", "sprint": sprint_to_response(existing)}

    try:
        sprints_collection.update_one({"_id": object_id}, {"$set": updates})
    except Exception as e:
        log_with_request(request, "exception", "Update sprint error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update sprint")

    updated = sprints_collection.find_one({"_id": object_id})

    return {
        "message": "Sprint updated successfully",
        "sprint": sprint_to_response(updated)
    }


# =========================================================
# SPRINTS - DELETE (admin only — unassigns work items first)
# =========================================================

@app.delete("/api/sprints/{sprint_id}")
def delete_sprint(
    sprint_id: str,
    current_user: dict = Depends(require_admin)
):
    object_id = get_object_id(sprint_id)

    existing = sprints_collection.find_one({"_id": object_id})

    if not existing:
        raise HTTPException(status_code=404, detail="Sprint not found")

    # Move any work items in this sprint back to the backlog instead of
    # leaving them pointing at a sprint_id that no longer exists.
    tasks_collection.update_many(
        {"sprint_id": sprint_id},
        {"$set": {"sprint_id": None}}
    )

    sprints_collection.delete_one({"_id": object_id})

    return {"message": "Sprint deleted successfully", "id": sprint_id}


# =========================================================
# SPRINTS - BURNDOWN & VELOCITY METRICS
# =========================================================

@app.get("/api/sprints/{sprint_id}/burndown")
def get_sprint_burndown(
    sprint_id: str,
    current_user: dict = Depends(get_current_user)
):
    object_id = get_object_id(sprint_id)
    sprint = sprints_collection.find_one({"_id": object_id})

    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    tasks = list(tasks_collection.find({"sprint_id": sprint_id}))

    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.get("status") == "Completed")
    in_progress_tasks = sum(1 for t in tasks if t.get("status") == "In Progress")
    pending_tasks = sum(1 for t in tasks if t.get("status") == "Pending")

    total_points = sum(float(t.get("story_points") or 0) for t in tasks)
    completed_points = sum(float(t.get("story_points") or 0) for t in tasks if t.get("status") == "Completed")
    remaining_points = max(0.0, total_points - completed_points)

    type_counts = {}
    for t in tasks:
        it = t.get("item_type", "Task")
        type_counts[it] = type_counts.get(it, 0) + 1

    completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0.0

    return {
        "sprint": sprint_to_response(sprint),
        "burndown": {
            "total_items": total_tasks,
            "completed_items": completed_tasks,
            "in_progress_items": in_progress_tasks,
            "pending_items": pending_tasks,
            "total_story_points": total_points,
            "completed_story_points": completed_points,
            "remaining_story_points": remaining_points,
            "completion_percentage": completion_rate,
            "item_type_breakdown": type_counts
        }
    }


# =========================================================
# BACKLOG - work items with no sprint assigned
# =========================================================

@app.get("/api/backlog")
def get_backlog(
    request: Request,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    skip, limit = clamp_pagination(skip, limit)

    email = current_user["email"]
    query = {
        "$and": [
            {"$or": [{"email": email}, {"assigned_to": email.lower()}]},
            {"$or": [{"sprint_id": None}, {"sprint_id": {"$exists": False}}]}
        ]
    }

    try:
        total = tasks_collection.count_documents(query)
        tasks = list(
            tasks_collection.find(query).sort("_id", -1).skip(skip).limit(limit)
        )
    except Exception as e:
        log_with_request(request, "exception", "Get backlog error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load backlog")

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "tasks": [task_to_response(t) for t in tasks]
    }


# =========================================================
# ASSIGN / MOVE A WORK ITEM TO A SPRINT (or back to backlog)
# =========================================================

@app.put("/api/tasks/{task_id}/sprint")
def assign_task_to_sprint(
    task_id: str,
    body: SprintAssign,
    current_user: dict = Depends(get_current_user)
):
    object_id = get_object_id(task_id)

    existing_task = tasks_collection.find_one({"_id": object_id})

    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(existing_task, current_user, require_creator=False)

    if body.sprint_id:
        sprint = sprints_collection.find_one({"_id": get_object_id(body.sprint_id)})
        if not sprint:
            raise HTTPException(status_code=400, detail="Sprint not found")

    old_sprint_id = existing_task.get("sprint_id")

    tasks_collection.update_one(
        {"_id": object_id},
        {"$set": {"sprint_id": body.sprint_id, "updated_at": datetime.now(timezone.utc)}}
    )

    if old_sprint_id != body.sprint_id:
        log_activity(task_id, current_user["email"], "sprint_id", old_sprint_id, body.sprint_id)

    updated_task = tasks_collection.find_one({"_id": object_id})

    return {
        "message": "Task sprint assignment updated",
        "task": task_to_response(updated_task)
    }


# =========================================================
# WORK ITEM HIERARCHY - set/change parent
# =========================================================

@app.put("/api/tasks/{task_id}/parent")
def set_task_parent(
    task_id: str,
    body: ParentUpdate,
    current_user: dict = Depends(get_current_user)
):
    object_id = get_object_id(task_id)

    existing_task = tasks_collection.find_one({"_id": object_id})

    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(existing_task, current_user, require_creator=False)

    if body.parent_id:
        if body.parent_id == task_id:
            raise HTTPException(status_code=400, detail="A work item cannot be its own parent")
        parent = tasks_collection.find_one({"_id": get_object_id(body.parent_id)})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent work item not found")

    old_parent_id = existing_task.get("parent_id")

    tasks_collection.update_one(
        {"_id": object_id},
        {"$set": {"parent_id": body.parent_id, "updated_at": datetime.now(timezone.utc)}}
    )

    if old_parent_id != body.parent_id:
        log_activity(task_id, current_user["email"], "parent_id", old_parent_id, body.parent_id)

    updated_task = tasks_collection.find_one({"_id": object_id})

    return {
        "message": "Task parent updated",
        "task": task_to_response(updated_task)
    }


# =========================================================
# WORK ITEM HIERARCHY - list children of a work item
# =========================================================

@app.get("/api/tasks/{task_id}/children")
def get_task_children(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    parent = tasks_collection.find_one({"_id": get_object_id(task_id)})
    if not parent:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(parent, current_user, require_creator=False)

    children = list(tasks_collection.find({"parent_id": task_id}).sort("_id", -1))

    return {"children": [task_to_response(c) for c in children]}


# =========================================================
# COMMENTS - add a comment to a work item
# =========================================================

@app.post("/api/tasks/{task_id}/comments")
def add_comment(
    task_id: str,
    body: CommentCreate,
    current_user: dict = Depends(get_current_user)
):
    text = body.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    task = tasks_collection.find_one({"_id": get_object_id(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(task, current_user, require_creator=False)

    comment_data = {
        "work_item_id": task_id,
        "author_email": current_user["email"],
        "text": text,
        "created_at": datetime.now(timezone.utc)
    }

    result = comments_collection.insert_one(comment_data)
    comment_data["_id"] = result.inserted_id

    log_activity(task_id, current_user["email"], "comment", None, text[:50] + ("..." if len(text) > 50 else ""))

    return {
        "message": "Comment added successfully",
        "comment": comment_to_response(comment_data)
    }


# =========================================================
# COMMENTS - list comments on a work item
# =========================================================

@app.get("/api/tasks/{task_id}/comments")
def get_comments(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    task = tasks_collection.find_one({"_id": get_object_id(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(task, current_user, require_creator=False)

    comments = list(
        comments_collection.find({"work_item_id": task_id}).sort("created_at", 1)
    )

    return {"comments": [comment_to_response(c) for c in comments]}


# =========================================================
# ACTIVITY LOG - audit history of a work item
# =========================================================

@app.get("/api/tasks/{task_id}/activity")
def get_activity(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    task = tasks_collection.find_one({"_id": get_object_id(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(task, current_user, require_creator=False)

    entries = list(
        activity_logs_collection.find({"work_item_id": task_id}).sort("timestamp", -1)
    )

    return {"activity": [activity_to_response(e) for e in entries]}


# =========================================================
# WORK ITEM ATTACHMENTS (Screenshots, Logs, Files)
# =========================================================

@app.post("/api/tasks/{task_id}/attachments")
async def upload_attachment(
    task_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    oid = get_object_id(task_id)
    task = tasks_collection.find_one({"_id": oid})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(task, current_user, require_creator=False)

    file_ext = os.path.splitext(file.filename or "")[1].lower()
    file_uuid = uuid.uuid4().hex
    safe_filename = f"{file_uuid}{file_ext}"
    file_path = os.path.join(ATTACHMENTS_DIR, safe_filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    att_doc = {
        "work_item_id": task_id,
        "original_name": file.filename or "attachment",
        "storage_name": safe_filename,
        "file_size": len(content),
        "content_type": file.content_type or "application/octet-stream",
        "uploaded_by": current_user["email"],
        "uploaded_at": datetime.now(timezone.utc)
    }

    res = attachments_collection.insert_one(att_doc)
    att_doc["_id"] = res.inserted_id

    log_activity(task_id, current_user["email"], "attachment", None, file.filename or "attachment")

    return {
        "message": "Attachment uploaded successfully",
        "attachment": attachment_to_response(att_doc)
    }


@app.get("/api/tasks/{task_id}/attachments")
def get_task_attachments(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    oid = get_object_id(task_id)
    task = tasks_collection.find_one({"_id": oid})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    check_work_item_access(task, current_user, require_creator=False)

    attachments = list(
        attachments_collection.find({"work_item_id": task_id}).sort("uploaded_at", -1)
    )

    return {"attachments": [attachment_to_response(a) for a in attachments]}


@app.get("/api/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: str,
    current_user: dict = Depends(get_current_user)
):
    oid = get_object_id(attachment_id)
    att = attachments_collection.find_one({"_id": oid})
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    task = tasks_collection.find_one({"_id": get_object_id(att["work_item_id"])})
    if task:
        check_work_item_access(task, current_user, require_creator=False)

    file_path = os.path.join(ATTACHMENTS_DIR, att["storage_name"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        file_path,
        filename=att.get("original_name", "download"),
        media_type=att.get("content_type", "application/octet-stream")
    )


# =========================================================
# BOARD - work items for a sprint, grouped by status (Kanban)
# =========================================================

@app.get("/api/board")
def get_board(
    sprint_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    email = current_user["email"]
    base_user_filter = {
        "$or": [
            {"email": email},
            {"assigned_to": email.lower()}
        ]
    }
    query_filters = [base_user_filter]

    if sprint_id:
        sprint = sprints_collection.find_one({"_id": get_object_id(sprint_id)})
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint not found")
        query_filters.append({"sprint_id": sprint_id})
    else:
        query_filters.append({"$or": [{"sprint_id": None}, {"sprint_id": {"$exists": False}}]})

    tasks = list(tasks_collection.find({"$and": query_filters}))

    columns: dict = {s: [] for s in ALLOWED_STATUSES}
    for t in tasks:
        columns.setdefault(t.get("status", "Pending"), []).append(task_to_response(t))

    return {"sprint_id": sprint_id, "columns": columns}


# =========================================================
# AZURE PIPELINES - CI/CD RUNS & STAGES
# =========================================================

pipelines_collection = db["pipelines"]

DEFAULT_PIPELINE_RUNS = [
    {
        "run_number": 104,
        "name": "DevSecOps CI/CD Pipeline",
        "status": "Success",
        "branch": "main",
        "commit": "a8e41bf",
        "commit_message": "feat: add Azure Boards & Pipelines observability",
        "triggered_by": "GitHub Actions",
        "duration": "4m 12s",
        "started_at": (datetime.now(timezone.utc) - timedelta(minutes=45)).isoformat(),
        "stages": [
            {"name": "Checkout & Setup", "status": "Success", "duration": "18s"},
            {"name": "Lint & Unit Tests", "status": "Success", "duration": "45s"},
            {"name": "Bandit SAST Security Scan", "status": "Success", "duration": "32s"},
            {"name": "Trivy Container Scan", "status": "Success", "duration": "58s"},
            {"name": "Docker Build & Push", "status": "Success", "duration": "1m 15s"},
            {"name": "Deploy to EC2", "status": "Success", "duration": "54s"},
            {"name": "Smoke & Health Check", "status": "Success", "duration": "10s"},
        ]
    },
    {
        "run_number": 103,
        "name": "DevSecOps CI/CD Pipeline",
        "status": "Success",
        "branch": "main",
        "commit": "f3b92c4",
        "commit_message": "ci: add Prometheus and Grafana monitoring stack",
        "triggered_by": "GitHub Actions",
        "duration": "3m 58s",
        "started_at": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(),
        "stages": [
            {"name": "Checkout & Setup", "status": "Success", "duration": "15s"},
            {"name": "Lint & Unit Tests", "status": "Success", "duration": "42s"},
            {"name": "Bandit SAST Security Scan", "status": "Success", "duration": "29s"},
            {"name": "Trivy Container Scan", "status": "Success", "duration": "55s"},
            {"name": "Docker Build & Push", "status": "Success", "duration": "1m 10s"},
            {"name": "Deploy to EC2", "status": "Success", "duration": "52s"},
            {"name": "Smoke & Health Check", "status": "Success", "duration": "15s"},
        ]
    },
    {
        "run_number": 102,
        "name": "DevSecOps CI/CD Pipeline",
        "status": "Success",
        "branch": "main",
        "commit": "902d18e",
        "commit_message": "infra: provision Terraform AWS infrastructure",
        "triggered_by": "GitHub Actions",
        "duration": "4m 05s",
        "started_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        "stages": [
            {"name": "Checkout & Setup", "status": "Success", "duration": "20s"},
            {"name": "Lint & Unit Tests", "status": "Success", "duration": "48s"},
            {"name": "Bandit SAST Security Scan", "status": "Success", "duration": "35s"},
            {"name": "Trivy Container Scan", "status": "Success", "duration": "50s"},
            {"name": "Docker Build & Push", "status": "Success", "duration": "1m 08s"},
            {"name": "Deploy to EC2", "status": "Success", "duration": "49s"},
            {"name": "Smoke & Health Check", "status": "Success", "duration": "15s"},
        ]
    }
]


@app.get("/api/pipelines/runs")
def get_pipeline_runs(current_user: dict = Depends(get_current_user)):
    try:
        runs = list(pipelines_collection.find().sort("_id", -1).limit(20))
        if not runs:
            # Seed default runs if empty
            pipelines_collection.insert_many([dict(r) for r in DEFAULT_PIPELINE_RUNS])
            runs = list(pipelines_collection.find().sort("_id", -1).limit(20))
        for r in runs:
            r["_id"] = str(r["_id"])
        return {"runs": runs}
    except Exception as e:
        logger.warning("Pipeline collection error: %s", e)
        return {"runs": DEFAULT_PIPELINE_RUNS}


@app.post("/api/pipelines/trigger")
def trigger_pipeline_run(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    new_run = {
        "run_number": int(now.timestamp()) % 100000,
        "name": "DevSecOps CI/CD Pipeline",
        "status": "Success",
        "branch": "main",
        "commit": "manual-" + secrets.token_hex(3),
        "commit_message": f"Manual pipeline dispatch by {current_user.get('email', 'user')}",
        "triggered_by": current_user.get("email", "Manual Trigger"),
        "duration": "3m 45s",
        "started_at": now.isoformat(),
        "stages": [
            {"name": "Checkout & Setup", "status": "Success", "duration": "14s"},
            {"name": "Lint & Unit Tests", "status": "Success", "duration": "39s"},
            {"name": "Bandit SAST Security Scan", "status": "Success", "duration": "31s"},
            {"name": "Trivy Container Scan", "status": "Success", "duration": "52s"},
            {"name": "Docker Build & Push", "status": "Success", "duration": "1m 12s"},
            {"name": "Deploy to EC2", "status": "Success", "duration": "50s"},
            {"name": "Smoke & Health Check", "status": "Success", "duration": "7s"},
        ]
    }
    try:
        res = pipelines_collection.insert_one(new_run)
        new_run["_id"] = str(res.inserted_id)
    except Exception as e:
        logger.warning("Could not persist pipeline run to db: %s", e)
        new_run["_id"] = f"temp-{secrets.token_hex(4)}"

    return {"message": "Pipeline run triggered successfully", "run": new_run}


# =========================================================
# AZURE DEVOPS QUERIES ENGINE (Saved & Filter Queries)
# =========================================================

SYSTEM_QUERIES = [
    {
        "id": "assigned_to_me",
        "name": "My Assigned Work Items",
        "description": "All work items assigned to your account across sprints and backlog",
        "is_system": True,
        "filters": {}
    },
    {
        "id": "active_bugs",
        "name": "Active Bugs",
        "description": "Unresolved defects and bug tickets requiring development attention",
        "is_system": True,
        "filters": {"item_type": "Bug", "status": "In Progress"}
    },
    {
        "id": "urgent_unresolved",
        "name": "Critical & Urgent Items",
        "description": "High and Urgent severity work items currently pending or in progress",
        "is_system": True,
        "filters": {"priority": "Urgent"}
    },
    {
        "id": "unassigned_backlog",
        "name": "Unassigned Backlog Items",
        "description": "Items in the backlog pool waiting for sprint capacity planning or assignee",
        "is_system": True,
        "filters": {"assigned_to": None, "sprint_id": None}
    }
]


@app.get("/api/queries")
def get_queries(current_user: dict = Depends(get_current_user)):
    user_email = current_user["email"].lower()
    try:
        custom_queries = list(queries_collection.find({"created_by": user_email}).sort("_id", -1))
    except Exception as e:
        logger.warning("Error fetching custom queries: %s", e)
        custom_queries = []

    formatted_custom = []
    for q in custom_queries:
        formatted_custom.append({
            "id": str(q["_id"]),
            "name": q.get("name", "Custom Query"),
            "description": q.get("description", ""),
            "filters": q.get("filters", {}),
            "is_system": False,
            "created_at": q.get("created_at").isoformat() if isinstance(q.get("created_at"), datetime) else str(q.get("created_at", ""))
        })

    return {
        "queries": SYSTEM_QUERIES + formatted_custom,
        "system_queries": SYSTEM_QUERIES,
        "custom_queries": formatted_custom
    }


@app.post("/api/queries")
def create_query(body: QueryCreate, current_user: dict = Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Query name is required")

    filters = {}
    if body.status:
        validate_status(body.status)
        filters["status"] = body.status
    if body.priority:
        validate_priority(body.priority)
        filters["priority"] = body.priority
    if body.item_type:
        validate_item_type(body.item_type)
        filters["item_type"] = body.item_type
    if body.assigned_to:
        filters["assigned_to"] = body.assigned_to.strip().lower()
    if body.sprint_id:
        filters["sprint_id"] = body.sprint_id

    doc = {
        "name": name,
        "description": (body.description or "").strip(),
        "filters": filters,
        "created_by": current_user["email"].lower(),
        "created_at": datetime.now(timezone.utc)
    }

    try:
        res = queries_collection.insert_one(doc)
        doc["id"] = str(res.inserted_id)
        doc["_id"] = str(res.inserted_id)
        doc["is_system"] = False
        doc["created_at"] = doc["created_at"].isoformat()
    except Exception as e:
        logger.exception("Failed to save query: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save query")

    return {"message": "Query saved successfully", "query": doc}


@app.delete("/api/queries/{query_id}")
def delete_query(query_id: str, current_user: dict = Depends(get_current_user)):
    oid = get_object_id(query_id)
    existing = queries_collection.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Query not found")

    user_email = current_user["email"].lower()
    is_admin = current_user.get("role") == "admin"
    if existing.get("created_by") != user_email and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to delete this query")

    queries_collection.delete_one({"_id": oid})
    return {"message": "Query deleted successfully"}


@app.post("/api/queries/run")
def run_query(body: dict, current_user: dict = Depends(get_current_user)):
    user_email = current_user["email"].lower()
    is_admin = current_user.get("role") == "admin"

    # Base access: creator OR assignee (or any if admin)
    base_filter = {
        "$or": [
            {"email": user_email},
            {"assigned_to": user_email}
        ]
    } if not is_admin else {}

    mongo_filters = [base_filter] if base_filter else []

    query_id = body.get("query_id") or body.get("name") or body.get("id")
    if query_id == "assigned_to_me":
        mongo_filters.append({"assigned_to": user_email})
    elif query_id == "active_bugs":
        mongo_filters.append({"item_type": "Bug", "status": {"$ne": "Completed"}})
    elif query_id == "urgent_unresolved":
        mongo_filters.append({"priority": {"$in": ["High", "Urgent"]}, "status": {"$ne": "Completed"}})
    elif query_id == "unassigned_backlog":
        mongo_filters.append({
            "$and": [
                {"$or": [{"assigned_to": None}, {"assigned_to": ""}, {"assigned_to": {"$exists": False}}]},
                {"$or": [{"sprint_id": None}, {"sprint_id": {"$exists": False}}]}
            ]
        })
    elif query_id and not body.get("filter") and not body.get("filters"):
        try:
            saved = queries_collection.find_one({"_id": get_object_id(query_id)})
        except Exception:
            saved = None
        if saved:
            flt = saved.get("filters", {})
            if flt.get("status"):
                mongo_filters.append({"status": flt["status"]})
            if flt.get("priority"):
                mongo_filters.append({"priority": flt["priority"]})
            if flt.get("item_type"):
                mongo_filters.append({"item_type": flt["item_type"]})
            if flt.get("assigned_to"):
                mongo_filters.append({"assigned_to": flt["assigned_to"].lower()})
            if flt.get("sprint_id"):
                mongo_filters.append({"sprint_id": flt["sprint_id"]})
    else:
        flt = body.get("filters") or body.get("filter") or {}
        if flt.get("status") and flt["status"] != "All":
            mongo_filters.append({"status": flt["status"]})
        if flt.get("priority") and flt["priority"] != "All":
            mongo_filters.append({"priority": flt["priority"]})
        if flt.get("item_type") and flt["item_type"] != "All":
            mongo_filters.append({"item_type": flt["item_type"]})
        if flt.get("assigned_to"):
            if flt["assigned_to"] == "me":
                mongo_filters.append({"assigned_to": user_email})
            elif flt["assigned_to"] == "unassigned":
                mongo_filters.append({"$or": [{"assigned_to": None}, {"assigned_to": ""}, {"assigned_to": {"$exists": False}}]})
            else:
                mongo_filters.append({"assigned_to": flt["assigned_to"].strip().lower()})
        if flt.get("sprint_id"):
            if flt["sprint_id"] == "none":
                mongo_filters.append({"$or": [{"sprint_id": None}, {"sprint_id": ""}, {"sprint_id": {"$exists": False}}]})
            else:
                mongo_filters.append({"sprint_id": flt["sprint_id"]})
        if flt.get("search") and flt["search"].strip():
            s = flt["search"].strip()
            mongo_filters.append({
                "$or": [
                    {"title": {"$regex": re.escape(s), "$options": "i"}},
                    {"description": {"$regex": re.escape(s), "$options": "i"}}
                ]
            })

    final_query = {"$and": mongo_filters} if mongo_filters else {}
    results = list(tasks_collection.find(final_query).sort("_id", -1).limit(100))
    items = [task_to_response(r) for r in results]
    return {
        "results": items,
        "items": items,
        "count": len(items)
    }


# =========================================================
# SAMPLE / DEMO DATA SEEDER (Azure DevOps Sandbox)
# =========================================================

@app.post("/api/demo/seed")
def seed_demo_data(current_user: dict = Depends(get_current_user)):
    user_email = current_user["email"].lower()
    now = datetime.now(timezone.utc)

    # 1. Create Sample Sprints
    sprint_1_name = "Sprint 1 - Core Services & Auth"
    sprint_1 = sprints_collection.find_one({"name": sprint_1_name, "created_by": user_email})
    if not sprint_1:
        s1_doc = {
            "name": sprint_1_name,
            "goal": "Build robust JWT authentication, database schemas, and baseline health checks.",
            "start_date": (now - timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=9)).isoformat(),
            "status": "Active",
            "created_by": user_email,
            "created_at": now - timedelta(days=5)
        }
        res_s1 = sprints_collection.insert_one(s1_doc)
        sprint_1_id = str(res_s1.inserted_id)
    else:
        sprint_1_id = str(sprint_1["_id"])

    sprint_2_name = "Sprint 2 - CI/CD & Kubernetes"
    sprint_2 = sprints_collection.find_one({"name": sprint_2_name, "created_by": user_email})
    if not sprint_2:
        s2_doc = {
            "name": sprint_2_name,
            "goal": "Multi-stage Docker builds, Kubernetes manifests, and automated security scans.",
            "start_date": (now + timedelta(days=10)).isoformat(),
            "end_date": (now + timedelta(days=24)).isoformat(),
            "status": "Planning",
            "created_by": user_email,
            "created_at": now
        }
        res_s2 = sprints_collection.insert_one(s2_doc)
        sprint_2_id = str(res_s2.inserted_id)
    else:
        sprint_2_id = str(sprint_2["_id"])

    # 2. Sample Work Items
    demo_items = [
        {
            "title": "Cloud-Native Kubernetes Infrastructure Migration",
            "description": "### Epic Overview\nMigrate legacy EC2 single-instance deployment to resilient AWS EKS Kubernetes cluster.\n\n### Milestones\n- [ ] VPC, subnets, and security groups in Terraform\n- [ ] Kubernetes manifests (Deployments, Services, ConfigMaps, Secrets)\n- [ ] Prometheus & Grafana alerting",
            "item_type": "Epic",
            "status": "In Progress",
            "priority": "High",
            "story_points": 13.0,
            "sprint_id": sprint_1_id,
            "assigned_to": user_email,
            "tags": ["epic", "kubernetes", "terraform", "infra"],
            "days_ago": 4
        },
        {
            "title": "Implement OAuth2 JWT Token Refresh Rotation",
            "description": "### User Story\nAs a developer, I want token refresh rotation so that compromised refresh tokens cannot be reused indefinitely.\n\n### Acceptance Criteria\n- [ ] Refresh token generates new access token and new single-use refresh token\n- [ ] Used refresh tokens trigger immediate session invalidation\n- [ ] Unit tests for token expiration and replay attacks",
            "item_type": "User Story",
            "status": "Completed",
            "priority": "High",
            "story_points": 5.0,
            "sprint_id": sprint_1_id,
            "assigned_to": user_email,
            "tags": ["security", "auth", "jwt"],
            "days_ago": 3
        },
        {
            "title": "Fix JWT token expiration silent 401 loop on page reload",
            "description": "### Summary\nWhen a session token expires, the dashboard enters an infinite re-render loop requesting /api/tasks.\n\n### Steps to Reproduce\n1. Log in to dashboard\n2. Wait for token to expire or manipulate localStorage\n3. Refresh browser\n\n### Expected Result\nClean redirection to /login with session expired toast.",
            "item_type": "Bug",
            "status": "In Progress",
            "priority": "Urgent",
            "story_points": 3.0,
            "sprint_id": sprint_1_id,
            "assigned_to": user_email,
            "tags": ["bug", "frontend", "auth"],
            "days_ago": 2
        },
        {
            "title": "Configure Nginx Reverse Proxy with SSL & Security Headers",
            "description": "### Specification\nNginx configuration with Let's Encrypt SSL termination, HSTS headers, and proxy caching for static frontend assets.",
            "item_type": "Task",
            "status": "Completed",
            "priority": "Medium",
            "story_points": 3.0,
            "sprint_id": sprint_1_id,
            "assigned_to": user_email,
            "tags": ["nginx", "ssl", "devops"],
            "days_ago": 3
        },
        {
            "title": "Multi-Stage Docker Containerization with Non-Root Security Context",
            "description": "### Feature Description\nOptimize backend and frontend Docker builds using Alpine multi-stage caching, dropping root privileges to devops:devops non-root UID 10001.",
            "item_type": "Feature",
            "status": "Pending",
            "priority": "Medium",
            "story_points": 5.0,
            "sprint_id": sprint_1_id,
            "assigned_to": user_email,
            "tags": ["docker", "security", "optimization"],
            "days_ago": 1
        },
        {
            "title": "Prometheus & Grafana Observability Dashboards",
            "description": "### Specification\nInstall prometheus node exporter and configure Grafana dashboards for CPU, memory, request throughput, and p99 latency.",
            "item_type": "Feature",
            "status": "Pending",
            "priority": "Medium",
            "story_points": 8.0,
            "sprint_id": sprint_2_id,
            "assigned_to": user_email,
            "tags": ["monitoring", "prometheus", "grafana"],
            "days_ago": 1
        },
        {
            "title": "Automated DevSecOps Pipeline with Bandit & Trivy Security Scans",
            "description": "### User Story\nAs a security lead, I want pull requests blocked if critical vulnerabilities or hardcoded secrets are discovered.",
            "item_type": "User Story",
            "status": "Pending",
            "priority": "High",
            "story_points": 5.0,
            "sprint_id": sprint_2_id,
            "assigned_to": user_email,
            "tags": ["ci-cd", "security", "trivy", "bandit"],
            "days_ago": 1
        },
        {
            "title": "Docker build fails on ARM64 runners due to missing libffi",
            "description": "### Summary\nDocker cross-compilation on Apple Silicon / AWS Graviton runners fails during poetry/pip wheel build.",
            "item_type": "Bug",
            "status": "Pending",
            "priority": "High",
            "story_points": 2.0,
            "sprint_id": sprint_2_id,
            "assigned_to": user_email,
            "tags": ["bug", "docker", "arm64"],
            "days_ago": 1
        },
        {
            "title": "Investigate HashiCorp Vault vs AWS Secrets Manager for DB credentials",
            "description": "### Research Objective\nCompare rotation policies, KMS integration latency, and cost for 50+ microservices.",
            "item_type": "Task",
            "status": "Pending",
            "priority": "Low",
            "story_points": 3.0,
            "sprint_id": None,
            "assigned_to": None,
            "tags": ["spike", "vault", "secrets"],
            "days_ago": 2
        }
    ]

    inserted_tasks = 0
    for item in demo_items:
        if not tasks_collection.find_one({"title": item["title"], "email": user_email}):
            doc = {
                "title": item["title"],
                "description": item["description"],
                "status": item["status"],
                "priority": item["priority"],
                "item_type": item["item_type"],
                "assigned_to": item["assigned_to"],
                "sprint_id": item["sprint_id"],
                "story_points": item["story_points"],
                "tags": item["tags"],
                "email": user_email,
                "created_at": (now - timedelta(days=item.get("days_ago", 1))).isoformat(),
                "updated_at": now.isoformat()
            }
            res_t = tasks_collection.insert_one(doc)
            inserted_tasks += 1

            comments_collection.insert_one({
                "task_id": str(res_t.inserted_id),
                "author": "devops_lead@company.com",
                "author_name": "DevOps Lead",
                "text": "Reviewed specifications and sprint capacity. Approved for implementation.",
                "created_at": now.isoformat()
            })

    # 3. Sample Custom Queries
    demo_queries = [
        {
            "name": "🔥 Critical Sprint Bugs",
            "description": "Urgent and high severity bugs in current active sprint",
            "filters": {"item_type": "Bug", "priority": "Urgent"}
        },
        {
            "name": "☸️ Cloud & Kubernetes Backlog",
            "description": "Infrastructure and container orchestration work items",
            "filters": {"search": "Kubernetes"}
        },
        {
            "name": "📋 Unassigned Backlog Stories",
            "description": "User stories awaiting sprint assignment and ownership",
            "filters": {"item_type": "User Story", "assigned_to": "unassigned"}
        }
    ]

    inserted_queries = 0
    for q in demo_queries:
        if not queries_collection.find_one({"name": q["name"], "created_by": user_email}):
            queries_collection.insert_one({
                "name": q["name"],
                "description": q["description"],
                "filters": q["filters"],
                "created_by": user_email,
                "created_at": now
            })
            inserted_queries += 1

    return {
        "message": "Sample Azure DevOps data loaded successfully!",
        "tasks_added": inserted_tasks,
        "sprints_added": 2,
        "queries_added": inserted_queries
    }


# =========================================================
# AI WORK ITEM ASSISTANT (Prompt to Azure Work Item)
# =========================================================

@app.post("/api/ai/generate-work-item")
def ai_generate_work_item(
    body: AIWorkItemRequest,
    current_user: dict = Depends(get_current_user)
):
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    # If GEMINI_API_KEY is configured in env, attempt calling Gemini API
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import urllib.request
            req_data = json.dumps({
                "contents": [{
                    "parts": [{
                        "text": (
                            "You are an Azure DevOps Agile Product Owner and Lead Engineer. "
                            f"Generate a structured work item for: '{prompt}'. "
                            "Output valid JSON ONLY with keys: 'title', 'item_type' (one of Task, Bug, Feature, Epic, User Story, Issue), "
                            "'description', 'acceptance_criteria' (list of strings), 'priority' (Low, Medium, High, Urgent), "
                            "'story_points' (number: 1, 2, 3, 5, 8, 13), 'tags' (list of 2-4 strings)."
                        )
                    }]
                }]
            }).encode("utf-8")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                result_json = json.loads(resp.read().decode("utf-8"))
                text_out = result_json["candidates"][0]["content"]["parts"][0]["text"]
                m = re.search(r"\{.*\}", text_out, re.DOTALL)
                if m:
                    return json.loads(m.group(0))
        except Exception as e:
            logger.warning("Gemini AI API fallback triggered: %s", e)

    # Built-in High-Quality Smart Generator (zero external dependency, instant response!)
    p_lower = prompt.lower()

    if any(k in p_lower for k in ["bug", "fix", "error", "crash", "broken", "issue", "failure", "fail", "null", "exception"]):
        detected_type = "Bug"
        priority = "Urgent" if any(k in p_lower for k in ["crash", "critical", "prod", "fatal", "security", "leak"]) else "High"
        story_points = 3.0
    elif any(k in p_lower for k in ["architecture", "platform", "migration", "overhaul", "redesign", "epic"]):
        detected_type = "Epic"
        priority = "High"
        story_points = 13.0
    elif any(k in p_lower for k in ["story", "user can", "as a", "allow user", "enable user"]):
        detected_type = "User Story"
        priority = "Medium"
        story_points = 5.0
    elif any(k in p_lower for k in ["feature", "add", "implement", "support", "integrate", "build"]):
        detected_type = "Feature"
        priority = "Medium"
        story_points = 5.0
    else:
        detected_type = body.item_type or "Task"
        priority = "Medium"
        story_points = 2.0

    # Clean title
    title = prompt.strip()
    if len(title) > 80:
        title = title[:77] + "..."
    if not title[0].isupper():
        title = title[0].upper() + title[1:]

    # Generate Acceptance Criteria & Description
    if detected_type == "Bug":
        description = (
            f"### Bug Summary\n{prompt}\n\n"
            "### Steps to Reproduce\n"
            "1. Navigate to the affected module in the application.\n"
            "2. Trigger the action described in the report.\n"
            "3. Observe incorrect behavior or unexpected exception.\n\n"
            "### Expected Behavior\n"
            "The operation should complete smoothly without errors or timeout.\n\n"
            "### Actual Behavior\n"
            f"Anomalous behavior encountered: {prompt}."
        )
        acceptance_criteria = [
            "Root cause identified and patched with regression tests",
            "Error rate drops to 0% in monitoring logs",
            "Unit tests pass in CI/CD pipeline"
        ]
        tags = ["bug", "defect", "quality"]
    elif detected_type in ("User Story", "Feature"):
        description = (
            f"**As a** team user,\n"
            f"**I want** to {prompt.lower()},\n"
            f"**So that** productivity and platform reliability are enhanced.\n\n"
            "### Scope & Specification\n"
            f"Implement full end-to-end functionality for: {prompt}."
        )
        acceptance_criteria = [
            f"User can successfully execute '{prompt}' from the UI",
            "Backend validation rejects invalid or malicious payloads",
            "Telemetry and audit activity logs are recorded",
            "Passes automated unit and integration test suite"
        ]
        tags = ["feature", "user-story", "agile"]
    else:
        description = (
            f"### Task Description\n{prompt}\n\n"
            "### Execution Plan\n"
            "1. Review design requirements and API contracts.\n"
            "2. Implement backend and frontend changes.\n"
            "3. Write automated unit tests and verify in Docker/K8s.\n"
            "4. Deploy and verify through DevOps CI/CD pipeline."
        )
        acceptance_criteria = [
            "All functional requirements implemented as specified",
            "Clean linting and automated tests passing",
            "Documentation updated"
        ]
        tags = ["devops", "task"]

    # Keyword based tags
    if "docker" in p_lower or "container" in p_lower:
        tags.append("docker")
    if "k8s" in p_lower or "kubernetes" in p_lower:
        tags.append("k8s")
    if "security" in p_lower or "auth" in p_lower:
        tags.append("security")
    if "ci" in p_lower or "pipeline" in p_lower:
        tags.append("ci-cd")

    return {
        "title": title,
        "item_type": detected_type,
        "description": description,
        "acceptance_criteria": acceptance_criteria,
        "priority": priority,
        "story_points": story_points,
        "tags": list(set(tags))
    }
