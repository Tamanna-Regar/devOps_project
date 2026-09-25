# 🚀 DevOps Task Manager — Enterprise Cloud Platform

A production-grade, full-stack Task Management application built with **FastAPI**, **React + Vite**, and **MongoDB**, featuring **DevSecOps CI/CD**, **Infrastructure as Code (Terraform)**, **Kubernetes (K8s) Orchestration with HPA**, **Prometheus & Grafana Observability**, and **Automated S3 Backups**.

---

## 🏗️ End-to-End Enterprise Architecture

```
                                  [ Users & Clients ]
                                           │
                                           │ HTTPS (Port 443) / HTTP (Port 80)
                                           ▼
                       ┌───────────────────────────────────────┐
                       │   Nginx Reverse Proxy & SSL (Certbot) │
                       └───────────────────┬───────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                             │
                    ▼                                             ▼
       ┌─────────────────────────┐                   ┌─────────────────────────┐
       │   React 19 Frontend     │                   │   FastAPI Backend API   │
       │   (Vite, Nginx Alpine)  │                   │   (Python 3.12, Uvicorn)│
       └─────────────────────────┘                   └────────────┬────────────┘
                                                                  │
              ┌───────────────────────────┬───────────────────────┼───────────────────────────┐
              │                           │                       │                           │
              ▼                           ▼                       ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐    ┌──────────────────┐        ┌──────────────────┐
    │ MongoDB Database │        │ Prometheus 9090  │    │ CloudWatch Logs  │        │ AWS SES Email    │
    │ (Atlas or Local) │        │ & Grafana 3000   │    │ & Alarms Agent   │        │ (Password Reset) │
    └──────────────────┘        └──────────────────┘    └──────────────────┘        └──────────────────┘

 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                   CI/CD & DEVOPS AUTOMATION                                      │
 │                                                                                                  │
 │  GitHub Push ──▶ Pytest + Lint ──▶ Bandit SAST ──▶ Buildx ──▶ Trivy Scan ──▶ AWS ECR ──▶ Deploy │
 │                                                                                                  │
 │  Terraform (IaC) ─────────▶ Provisions AWS VPC + EC2 + Subnets + Security Groups + EIP + IAM     │
 │  Kubernetes (K8s) ────────▶ Namespace + Deployments + Services + Nginx Ingress + HPA Autoscaling │
 │  Disaster Recovery ───────▶ Automated Daily Cron `mongodump` ──▶ S3 Bucket with 7-Day Retention  │
 └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Complete Tech Stack

| Domain | Technologies Used |
| :--- | :--- |
| **Frontend & UI** | React 19, Vite, React Router 7, Azure Boards (Kanban), Azure Pipelines Viewer |
| **Backend API** | FastAPI (Python 3.12), Pydantic v2, Motor/PyMongo, SlowAPI Rate Limiter |
| **Work Item Tracking** | **Azure DevOps Model** (Work Item Types: 📋 Task, 🐛 Bug, 💡 Feature, 📖 Story) |
| **CI/CD Pipelines** | **Azure Pipelines Observability** (7-stage pipeline tracker & manual trigger API) |
| **Database** | MongoDB 7 / MongoDB Atlas Cloud (TLS Encrypted, Auto-Indexed) |
| **Authentication** | JWT (HS256) + Bcrypt Password Hashing + Role-Based Access Control (Admin/User) |
| **Containerization** | Multi-stage Dockerfiles + Docker Compose |
| **Infrastructure as Code** | **Terraform** (AWS VPC, Public Subnet, Security Groups, IAM Roles, EC2, Elastic IP) |
| **Container Orchestration** | **Kubernetes** (Deployments, Services, Nginx Ingress, Horizontal Pod Autoscaler - HPA) |
| **Observability & Monitoring** | **Prometheus** (`/metrics`), **Grafana** (Live Dashboards), **Node Exporter**, **AWS CloudWatch** |
| **DevSecOps CI/CD** | **GitHub Actions**, **Bandit** (SAST), **Trivy** (Container CVE scan), Smoke Tests |
| **Disaster Recovery** | Bash Cron Script, AWS S3 Encrypted Backups with 7-day retention policy |

---

## 🔷 Azure DevOps Style Features

### 1. Azure Boards (Interactive Kanban)
- **Interactive 3-Column Kanban Board:** `📌 To Do` ➔ `⚡ In Progress` ➔ `✅ Done`.
- **Azure Work Item Types:**
  - 📋 **Task** (Blue) — Standard operational & development tasks.
  - 🐛 **Bug** (Red) — Defects and incident tracking.
  - 💡 **Feature** (Purple) — New capabilities and architectural components.
  - 📖 **Story** (Teal) — User stories and product backlog requirements.
- **1-Click Quick Move Actions:** Move cards between columns seamlessly (`➔ Start`, `✔ Done`, `↺ Reopen`).
- **Real-Time Filtering:** Filter by Work Item Type, Priority, Status, and Search terms.

### 2. Azure Pipelines (CI/CD Observability)
- **Live Pipeline Execution Viewer:** Track build numbers, commit hashes, branches, and execution duration.
- **7-Stage DevSecOps Pipeline Flow:**
  `1. Checkout & Setup` ➔ `2. Unit Tests` ➔ `3. Bandit SAST` ➔ `4. Trivy Container Scan` ➔ `5. Docker Push` ➔ `6. EC2 Deployment` ➔ `7. Health Smoke Test`.
- **Manual Pipeline Trigger:** Dispatch new CI/CD pipeline runs on-demand via `POST /api/pipelines/trigger`.

---

## 📁 Repository Structure

```
.
├── .github/workflows/
│   └── deploy.yml              # DevSecOps Pipeline (Pytest, Bandit, Trivy, ECR, SSH Deploy)
├── backend/
│   ├── main.py                 # FastAPI Application (Auth, CRUD, /metrics, /health probes)
│   ├── test_main.py            # Comprehensive Pytest test suite (100% passing)
│   ├── requirements.txt        # Backend dependencies
│   └── Dockerfile              # Production Python container image
├── frontend/
│   ├── src/                    # React pages (Dashboard, AdminDashboard, Login, Register)
│   ├── nginx.conf              # SPA routing & caching
│   └── Dockerfile              # Multi-stage production React build
├── terraform/                  # 🏗️ Complete AWS Infrastructure as Code
│   ├── main.tf, vpc.tf         # Dedicated VPC, Subnets, Gateway, Route Tables
│   ├── ec2.tf, iam.tf          # EC2 Instance, Elastic IP, IAM Roles, User Data Bootstrap
│   ├── security_groups.tf      # Ports 80, 443, 22, 9090, 3000 firewall rules
│   └── outputs.tf              # Server Public IP, SSH command, Web URL
├── k8s/                        # ☸️ Production Kubernetes Manifests
│   ├── namespace.yaml          # Isolated namespace
│   ├── backend-deployment.yaml # Replicas, resource limits, liveness & readiness probes
│   ├── frontend-deployment.yaml# Nginx React frontend pods
│   ├── ingress.yaml            # TLS termination & route splitting
│   └── hpa.yaml                # Horizontal Pod Autoscaler (2 to 10 pods)
├── monitoring/                 # 📊 Prometheus & Grafana Observability
│   ├── docker-compose.monitoring.yml # Prometheus, Grafana, Node Exporter
│   ├── prometheus/             # Scrape configurations
│   └── grafana/                # Pre-built Dashboards & Datasources
├── scripts/                    # 💾 Automation & Disaster Recovery
│   ├── backup_mongodb.sh       # Automated backup to AWS S3
│   └── restore_mongodb.sh      # One-command disaster recovery
├── Makefile                    # Linux/macOS Automation Shortcuts
├── run.ps1                     # Windows PowerShell Automation Runner
└── docker-compose.prod.yml     # Production EC2 deployment stack
```

---

## ⚡ Quick Start (Local Development)

### Windows (PowerShell):
```powershell
# 1. Start application containers
.\run.ps1 up

# 2. Run all tests (Pytest + Frontend Build + Lint)
.\run.ps1 test

# 3. Start Prometheus & Grafana Monitoring Stack
.\run.ps1 monitor
```

### Linux / macOS (Make):
```bash
# 1. Start application containers
make up

# 2. Run test suites
make test

# 3. Start Prometheus & Grafana Monitoring Stack
make monitor
```

| Service | Local URL | Credentials / Notes |
| :--- | :--- | :--- |
| **Frontend Application** | [http://localhost:5173](http://localhost:5173) | User & Admin Portals |
| **Backend API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive Swagger UI |
| **Health Probes** | [http://localhost:8000/health](http://localhost:8000/health) | Liveness (`/health/live`), Readiness (`/health/ready`) |
| **Prometheus Metrics** | [http://localhost:8000/metrics](http://localhost:8000/metrics) | Scrape target |
| **Prometheus Console** | [http://localhost:9090](http://localhost:9090) | Target status & PromQL |
| **Grafana Dashboards** | [http://localhost:3000](http://localhost:3000) | `admin` / `admin` |

---

## 🏗️ Deploying Infrastructure with Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Update your ssh_key_name and region

terraform init
terraform plan
terraform apply -auto-approve
```
*Outputs: Static Elastic IP, SSH login command, and Web URL.* See [`terraform/README.md`](file:///d:/devOps_project/devOps_project/terraform/README.md) for details.

---

## ☸️ Deploying to Kubernetes

```bash
cp k8s/secret.yaml.example k8s/secret.yaml
# Edit credentials

kubectl apply -f k8s/
```
*Deploys Deployments, Services, Ingress, and Horizontal Pod Autoscaler.* See [`k8s/README.md`](file:///d:/devOps_project/devOps_project/k8s/README.md) for details.

---

## 🛡️ DevSecOps CI/CD Pipeline

The GitHub Actions workflow ([`.github/workflows/deploy.yml`](file:///d:/devOps_project/devOps_project/.github/workflows/deploy.yml)) runs automatically on every commit:
1. **Quality & SAST:** Runs `pytest` with a live MongoDB container, ESLint, Vite build, and **Bandit Security Scanner**.
2. **Container Scan:** Builds multi-arch Docker images and scans them for CVE vulnerabilities with **Aquasec Trivy**.
3. **Registry:** Pushes versioned SHA tags & `:latest` to **Amazon ECR**.
4. **Deploy & Verify:** SSH into AWS EC2, rolling restart with Docker Compose, and executes **Smoke Tests** to confirm healthy status.

---

## 💾 Automated Database Backups & S3 Disaster Recovery

Configure daily automated cron backups on the server:
```bash
0 2 * * * /home/ubuntu/devops_project/scripts/backup_mongodb.sh >> /var/log/devops/backup.log 2>&1
```
* **Restore Command:**
```bash
./scripts/restore_mongodb.sh
```
Pulls the latest backup from AWS S3 and restores database state seamlessly.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).