from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="My DevOps Project",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Hello from my DevOps project!"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/api/info")
def info():
    return {
        "project": "Automated CI/CD Pipeline",
        "technology": "FastAPI",
        "version": "1.0"
    }