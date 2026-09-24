"""
Backend tests for DevOps Task Manager API.
Run with:  pytest test_main.py
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from main import app, check_database_connection

client = TestClient(app)
mongo_available = check_database_connection()


def test_health_check():
    response = client.get("/health")
    if mongo_available:
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    else:
        assert response.status_code == 503
        assert response.json()["status"] == "unhealthy"


def test_health_liveness_and_readiness():
    # Liveness probe
    live_res = client.get("/health/live")
    assert live_res.status_code == 200
    assert live_res.json()["status"] == "alive"

    # Readiness probe
    ready_res = client.get("/health/ready")
    assert ready_res.status_code in (200, 503)


def test_prometheus_metrics():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "http_requests_total" in response.text


def test_project_info():
    response = client.get("/api/info")
    assert response.status_code == 200
    body = response.json()
    assert body["project"] == "DevOps Task Manager"


def test_admin_self_registration_forbidden():
    email = f"hacker_{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/register",
        json={
            "name": "Malicious User",
            "email": email,
            "password": "SecurePass123",
            "role": "admin"
        },
    )
    # Should reject self-assigned admin
    assert response.status_code == 403


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_register_and_login_flow():
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"

    register_response = client.post(
        "/api/register",
        json={"name": "Test User", "email": email, "password": "testpass123"},
    )
    assert register_response.status_code == 200
    assert register_response.json()["email"] == email

    # Registering duplicate email fails
    duplicate_response = client.post(
        "/api/register",
        json={"name": "Test User", "email": email, "password": "testpass123"},
    )
    assert duplicate_response.status_code == 400

    # Wrong password fails
    bad_login = client.post(
        "/api/login",
        json={"email": email, "password": "wrongpassword123"},
    )
    assert bad_login.status_code == 401

    # Correct password succeeds
    good_login = client.post(
        "/api/login",
        json={"email": email, "password": "testpass123"},
    )
    assert good_login.status_code == 200
    body = good_login.json()
    assert "access_token" in body
    assert body["user"]["role"] == "user"


def test_protected_route_requires_token():
    # No Authorization header -> should be rejected
    response = client.get("/api/admin/tasks")
    assert response.status_code in (401, 403)


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_task_crud_flow():
    email = f"task_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "Task Tester", "email": email, "password": "password123"},
    )
    login_res = client.post(
        "/api/login",
        json={"email": email, "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create task with priority and tags
    create_res = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "title": "CI/CD Pipeline Setup",
            "description": "DevOps automated testing",
            "status": "In Progress",
            "priority": "High",
            "tags": ["devops", "ci"]
        },
    )
    assert create_res.status_code == 200
    created = create_res.json()["task"]
    assert created["priority"] == "High"
    task_id = created["id"]

    # Read tasks
    list_res = client.get("/api/tasks?priority=High", headers=headers)
    assert list_res.status_code == 200
    assert any(t["id"] == task_id for t in list_res.json()["tasks"])

    # Update task
    update_res = client.put(
        f"/api/tasks/{task_id}",
        headers=headers,
        json={"status": "Completed", "priority": "Urgent"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["task"]["status"] == "Completed"
    assert update_res.json()["task"]["priority"] == "Urgent"

    # Delete task
    del_res = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert del_res.status_code == 200
