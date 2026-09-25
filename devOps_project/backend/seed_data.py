"""
Standalone Seed Script to populate realistic Azure DevOps sample data.
Usage:
    python backend/seed_data.py
    python backend/seed_data.py --email user@example.com
"""

import sys
import os
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

# Add parent directory to path to load .env
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
if "host.docker.internal" in MONGO_URL:
    MONGO_URL = MONGO_URL.replace("host.docker.internal", "127.0.0.1")

client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
db = client["devops_task_manager"]

tasks_collection = db["tasks"]
sprints_collection = db["sprints"]
queries_collection = db["queries"]
comments_collection = db["comments"]
users_collection = db["users"]


def seed_for_user(user_email):
    user_email = user_email.lower().strip()
    now = datetime.now(timezone.utc)
    print(f"[*] Seeding Azure DevOps data for: {user_email}")

    # 1. Sprints
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

    # 2. Work Items
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

    tasks_count = 0
    for item in demo_items:
        existing = tasks_collection.find_one({"title": item["title"], "email": user_email})
        if not existing:
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
            tasks_count += 1

            comments_collection.insert_one({
                "task_id": str(res_t.inserted_id),
                "author": "devops_lead@company.com",
                "author_name": "DevOps Lead",
                "text": "Reviewed specifications and sprint capacity. Approved for implementation.",
                "created_at": now.isoformat()
            })

    # 3. Custom Queries
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

    queries_count = 0
    for q in demo_queries:
        if not queries_collection.find_one({"name": q["name"], "created_by": user_email}):
            queries_collection.insert_one({
                "name": q["name"],
                "description": q["description"],
                "filters": q["filters"],
                "created_by": user_email,
                "created_at": now
            })
            queries_count += 1

    print(f"[+] Added {tasks_count} tasks, 2 sprints, {queries_count} queries for {user_email}.")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--email" and len(sys.argv) > 2:
        target_email = sys.argv[2]
        seed_for_user(target_email)
        return

    # Seed for admin and top registered users
    top_users = list(users_collection.find({"email": {"$exists": True}}).limit(10))
    emails = [u["email"] for u in top_users if u.get("email") and "@" in u["email"]]
    
    # Always include admin@gmail.com and standard accounts
    if "admin@gmail.com" not in emails:
        emails.append("admin@gmail.com")

    for email in set(emails):
        seed_for_user(email)

    print("\n[SUCCESS] All sample DevOps data successfully seeded into MongoDB!")


if __name__ == "__main__":
    main()
