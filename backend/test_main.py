"""
Backend tests for DevOps Task Manager API.
Run with:  pytest test_main.py
"""

import io
import uuid
import pytest
from fastapi.testclient import TestClient
from main import app, check_database_connection, limiter

# Disable rate limiting during automated tests to avoid 429 errors
limiter.enabled = False

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

    # Create task with priority, tags, and Azure item_type
    create_res = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "title": "CI/CD Pipeline Setup",
            "description": "DevOps automated testing",
            "status": "In Progress",
            "priority": "High",
            "item_type": "Bug",
            "tags": ["devops", "ci"]
        },
    )
    assert create_res.status_code == 200
    created = create_res.json()["task"]
    assert created["priority"] == "High"
    assert created["item_type"] == "Bug"
    task_id = created["id"]

    # Read tasks filtered by item_type
    list_res = client.get("/api/tasks?item_type=Bug", headers=headers)
    assert list_res.status_code == 200
    assert any(t["id"] == task_id for t in list_res.json()["tasks"])

    # Update task (including item_type transition to Feature)
    update_res = client.put(
        f"/api/tasks/{task_id}",
        headers=headers,
        json={"status": "Completed", "priority": "Urgent", "item_type": "Feature"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["task"]["status"] == "Completed"
    assert update_res.json()["task"]["priority"] == "Urgent"
    assert update_res.json()["task"]["item_type"] == "Feature"

    # Delete task
    del_res = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert del_res.status_code == 200


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_azure_pipelines_endpoints():
    email = f"devops_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "DevOps Engineer", "email": email, "password": "password123"},
    )
    login_res = client.post(
        "/api/login",
        json={"email": email, "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Get pipeline runs
    runs_res = client.get("/api/pipelines/runs", headers=headers)
    assert runs_res.status_code == 200
    runs = runs_res.json()["runs"]
    assert len(runs) >= 1
    assert "stages" in runs[0]

    # Trigger a new pipeline run
    trigger_res = client.post("/api/pipelines/trigger", headers=headers)
    assert trigger_res.status_code == 200
    new_run = trigger_res.json()["run"]
    assert new_run["status"] == "Success"
    assert len(new_run["stages"]) == 7


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_user_profile_and_password_update():
    email = f"profile_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "Original Name", "email": email, "password": "password123"},
    )
    login_res = client.post(
        "/api/login",
        json={"email": email, "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # GET /api/me
    me_res = client.get("/api/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["user"]["name"] == "Original Name"

    # PUT /api/me
    update_res = client.put("/api/me", headers=headers, json={"name": "Updated Name"})
    assert update_res.status_code == 200
    assert update_res.json()["user"]["name"] == "Updated Name"

    # PUT /api/me/password - bad current password
    bad_pw = client.put(
        "/api/me/password",
        headers=headers,
        json={"current_password": "wrongpassword123", "new_password": "NewSecretPass456"},
    )
    assert bad_pw.status_code == 400

    # PUT /api/me/password - success
    good_pw = client.put(
        "/api/me/password",
        headers=headers,
        json={"current_password": "password123", "new_password": "NewSecretPass456"},
    )
    assert good_pw.status_code == 200

    # Login with new password
    re_login = client.post(
        "/api/login",
        json={"email": email, "password": "NewSecretPass456"},
    )
    assert re_login.status_code == 200


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_team_members_and_tags():
    email = f"team_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "Team Scout", "email": email, "password": "password123"},
    )
    login_res = client.post(
        "/api/login",
        json={"email": email, "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # GET /api/users/team
    team_res = client.get("/api/users/team", headers=headers)
    assert team_res.status_code == 200
    members = team_res.json()["members"]
    assert any(m["email"] == email for m in members)

    # GET /api/tags
    tags_res = client.get("/api/tags", headers=headers)
    assert tags_res.status_code == 200
    assert "tags" in tags_res.json()


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_assignee_collaboration_and_comments():
    email_a = f"creator_{uuid.uuid4().hex[:8]}@example.com"
    email_b = f"assignee_{uuid.uuid4().hex[:8]}@example.com"
    email_c = f"stranger_{uuid.uuid4().hex[:8]}@example.com"

    for em in (email_a, email_b, email_c):
        client.post(
            "/api/register",
            json={"name": "Dev", "email": em, "password": "password123"},
        )

    token_a = client.post("/api/login", json={"email": email_a, "password": "password123"}).json()["access_token"]
    token_b = client.post("/api/login", json={"email": email_b, "password": "password123"}).json()["access_token"]
    token_c = client.post("/api/login", json={"email": email_c, "password": "password123"}).json()["access_token"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    headers_c = {"Authorization": f"Bearer {token_c}"}

    # User A creates a task assigned to User B
    create_res = client.post(
        "/api/tasks",
        headers=headers_a,
        json={
            "title": "Collaborative Task",
            "assigned_to": email_b,
            "status": "Pending",
            "item_type": "User Story",
        },
    )
    assert create_res.status_code == 200
    task_id = create_res.json()["task"]["id"]

    # Assignee (User B) can view the task
    get_res = client.get(f"/api/tasks/{task_id}", headers=headers_b)
    assert get_res.status_code == 200
    assert get_res.json()["task"]["title"] == "Collaborative Task"

    # Assignee (User B) can update status to "In Progress"
    up_res = client.put(
        f"/api/tasks/{task_id}",
        headers=headers_b,
        json={"status": "In Progress"},
    )
    assert up_res.status_code == 200
    assert up_res.json()["task"]["status"] == "In Progress"

    # Assignee (User B) can post a comment
    comment_res = client.post(
        f"/api/tasks/{task_id}/comments",
        headers=headers_b,
        json={"text": "Started working on this story!"},
    )
    assert comment_res.status_code == 200
    assert comment_res.json()["comment"]["author_email"] == email_b

    # User A can view comments
    list_comments = client.get(f"/api/tasks/{task_id}/comments", headers=headers_a)
    assert list_comments.status_code == 200
    assert len(list_comments.json()["comments"]) >= 1

    # Activity log is recorded
    act_res = client.get(f"/api/tasks/{task_id}/activity", headers=headers_b)
    assert act_res.status_code == 200
    assert len(act_res.json()["activity"]) >= 1

    # Stranger (User C) is rejected with 403
    forbidden_res = client.put(
        f"/api/tasks/{task_id}",
        headers=headers_c,
        json={"status": "Completed"},
    )
    assert forbidden_res.status_code == 403


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_sprints_burndown_and_hierarchy():
    email = f"scrum_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "Scrum Master", "email": email, "password": "password123"},
    )
    login_res = client.post("/api/login", json={"email": email, "password": "password123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create sprint
    sprint_res = client.post(
        "/api/sprints",
        headers=headers,
        json={
            "name": "Sprint 42",
            "start_date": "2026-10-01",
            "end_date": "2026-10-15",
            "goal": "Deliver core features",
        },
    )
    assert sprint_res.status_code == 200
    sprint_id = sprint_res.json()["sprint"]["id"]

    # List sprints
    sprints_list = client.get("/api/sprints", headers=headers)
    assert sprints_list.status_code == 200
    assert any(s["id"] == sprint_id for s in sprints_list.json()["sprints"])

    # Create parent epic
    epic_res = client.post(
        "/api/tasks",
        headers=headers,
        json={"title": "Epic Feature", "item_type": "Epic", "sprint_id": sprint_id, "story_points": 8},
    )
    assert epic_res.status_code == 200
    epic_id = epic_res.json()["task"]["id"]

    # Create child task
    child_res = client.post(
        "/api/tasks",
        headers=headers,
        json={"title": "Child Task 1", "item_type": "Task", "sprint_id": sprint_id, "story_points": 3, "status": "Completed"},
    )
    assert child_res.status_code == 200
    child_id = child_res.json()["task"]["id"]

    # Link parent
    parent_res = client.put(f"/api/tasks/{child_id}/parent", headers=headers, json={"parent_id": epic_id})
    assert parent_res.status_code == 200

    # Get children
    children_res = client.get(f"/api/tasks/{epic_id}/children", headers=headers)
    assert children_res.status_code == 200
    assert any(c["id"] == child_id for c in children_res.json()["children"])

    # Burndown metrics
    burn_res = client.get(f"/api/sprints/{sprint_id}/burndown", headers=headers)
    assert burn_res.status_code == 200
    burndown = burn_res.json()["burndown"]
    assert burndown["total_items"] >= 2
    assert burndown["completed_items"] >= 1
    assert burndown["total_story_points"] >= 11.0
    assert burndown["completed_story_points"] >= 3.0

    # Board view
    board_res = client.get(f"/api/board?sprint_id={sprint_id}", headers=headers)
    assert board_res.status_code == 200
    assert "columns" in board_res.json()


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_bulk_update_and_file_attachments():
    email = f"bulk_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "Bulk User", "email": email, "password": "password123"},
    )
    login_res = client.post("/api/login", json={"email": email, "password": "password123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create 2 tasks
    t1 = client.post("/api/tasks", headers=headers, json={"title": "Batch Item 1"}).json()["task"]["id"]
    t2 = client.post("/api/tasks", headers=headers, json={"title": "Batch Item 2"}).json()["task"]["id"]

    # Bulk update both to "In Progress" and priority "Urgent"
    bulk_res = client.post(
        "/api/tasks/bulk-update",
        headers=headers,
        json={"task_ids": [t1, t2], "status": "In Progress", "priority": "Urgent"},
    )
    assert bulk_res.status_code == 200
    assert bulk_res.json()["updated_count"] == 2

    # Verify updates
    assert client.get(f"/api/tasks/{t1}", headers=headers).json()["task"]["status"] == "In Progress"
    assert client.get(f"/api/tasks/{t2}", headers=headers).json()["task"]["priority"] == "Urgent"

    # Test File Attachment Upload
    fake_file = io.BytesIO(b"Log error line 42: NullPointer")
    upload_res = client.post(
        f"/api/tasks/{t1}/attachments",
        headers=headers,
        files={"file": ("error.log", fake_file, "text/plain")},
    )
    assert upload_res.status_code == 200
    attachment = upload_res.json()["attachment"]
    assert attachment["original_name"] == "error.log"
    attachment_id = attachment["id"]

    # List attachments
    list_att = client.get(f"/api/tasks/{t1}/attachments", headers=headers)
    assert list_att.status_code == 200
    assert any(a["id"] == attachment_id for a in list_att.json()["attachments"])

    # Download attachment
    dl_res = client.get(f"/api/attachments/{attachment_id}/download", headers=headers)
    assert dl_res.status_code == 200
    assert b"Log error line 42" in dl_res.content


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_queries_engine():
    email = f"query_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "Query User", "email": email, "password": "password123"},
    )
    login_res = client.post("/api/login", json={"email": email, "password": "password123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get Queries (System queries must be present)
    get_q_res = client.get("/api/queries", headers=headers)
    assert get_q_res.status_code == 200
    body = get_q_res.json()
    assert "system_queries" in body
    assert "custom_queries" in body
    system_ids = [sq["id"] for sq in body["system_queries"]]
    assert "assigned_to_me" in system_ids
    assert "active_bugs" in system_ids
    assert "urgent_unresolved" in system_ids

    # 2. Create a test bug item
    task_res = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "title": "Severe memory leak in worker pool",
            "item_type": "Bug",
            "priority": "Urgent",
            "status": "Pending",
        },
    )
    assert task_res.status_code == 200
    bug_id = task_res.json()["task"]["id"]

    # 3. Run System Query: active_bugs
    run_res = client.post(
        "/api/queries/run",
        headers=headers,
        json={"name": "active_bugs", "filter": {}},
    )
    assert run_res.status_code == 200
    items = run_res.json()["items"]
    assert any(i["id"] == bug_id for i in items)

    # 4. Save Custom Query
    create_q_res = client.post(
        "/api/queries",
        headers=headers,
        json={
            "name": "High Priority Bugs",
            "description": "Custom query for urgent defects",
            "filter": {"item_type": "Bug", "priority": "Urgent"},
        },
    )
    assert create_q_res.status_code == 200
    query_id = create_q_res.json()["query"]["id"]

    # 5. Verify custom query listed
    list_q = client.get("/api/queries", headers=headers).json()
    assert any(cq["id"] == query_id for cq in list_q["custom_queries"])

    # 6. Delete custom query
    del_res = client.delete(f"/api/queries/{query_id}", headers=headers)
    assert del_res.status_code == 200

    # 7. Verify deletion
    list_q_after = client.get("/api/queries", headers=headers).json()
    assert not any(cq["id"] == query_id for cq in list_q_after["custom_queries"])


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_ai_generate_work_item():
    email = f"ai_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "AI Tester", "email": email, "password": "password123"},
    )
    login_res = client.post("/api/login", json={"email": email, "password": "password123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Call AI generation endpoint
    res = client.post(
        "/api/ai/generate-work-item",
        headers=headers,
        json={
            "prompt": "Implement Redis distributed caching for session management and rate limiting",
            "item_type": "Feature",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "title" in body
    assert len(body["title"]) > 0
    assert "description" in body
    assert "acceptance_criteria" in body
    assert isinstance(body["acceptance_criteria"], list)
    assert len(body["acceptance_criteria"]) > 0
    assert "story_points" in body
    assert "priority" in body
    assert "tags" in body
    assert isinstance(body["tags"], list)


@pytest.mark.skipif(not mongo_available, reason="MongoDB is not reachable")
def test_seed_demo_data():
    email = f"seed_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/register",
        json={"name": "Seed User", "email": email, "password": "password123"},
    )
    login_res = client.post("/api/login", json={"email": email, "password": "password123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    seed_res = client.post("/api/demo/seed", headers=headers)
    assert seed_res.status_code == 200
    data = seed_res.json()
    assert "message" in data
    assert data["tasks_added"] >= 5
    assert data["sprints_added"] == 2
    assert data["queries_added"] == 3

    # Check tasks appear in user tasks
    tasks_res = client.get("/api/tasks", headers=headers)
    assert tasks_res.status_code == 200
    assert len(tasks_res.json()["tasks"]) >= 5


