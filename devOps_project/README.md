# 🚀 DevOps Task Manager

A full-stack Task Management application built with **FastAPI + React + MongoDB**, containerized with **Docker**, and deployed automatically to **AWS EC2** via **GitHub Actions CI/CD**.

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│   MongoDB   │
│  React/Vite │     │   FastAPI   │     │  (internal) │
│   (Port 80) │     │ (Port 8000) │     │ (Port 27017)│
└─────────────┘     └─────────────┘     └─────────────┘
       ▲
   AWS EC2
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React + Vite, Nginx (production) |
| **Backend** | FastAPI (Python 3.12) |
| **Database** | MongoDB 7 |
| **Auth** | JWT (HS256) + bcrypt |
| **Containers** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions |
| **Hosting** | AWS EC2 |

---

## ⚙️ Local Development Setup

### Prerequisites
- Docker & Docker Compose installed
- Git

### 1. Clone the repo
```bash
git clone https://github.com/<your-username>/devOps_project.git
cd devOps_project
```

### 2. Setup environment variables
```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

### 3. Run with Docker Compose
```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## 🔐 Environment Variables

### Backend (`backend/.env`)
```env
MONGO_URL=mongodb://localhost:27017
JWT_SECRET=your-super-secret-key-here
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
```

### GitHub Actions Secrets (Settings → Secrets)
| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM User access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM User secret key |
| `AWS_REGION` | AWS Region (e.g., `ap-south-1`) |
| `SERVER_HOST` | EC2 public IP address |
| `SERVER_USER` | EC2 SSH username (e.g., `ubuntu`) |
| `SERVER_SSH_KEY` | EC2 private SSH key (full content) |
| `JWT_SECRET` | JWT signing secret |
| `VITE_API_URL` | Backend URL for frontend build |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |
| `DOMAIN` | Your domain name (e.g., `example.com`) |
| `MONGO_URL` | MongoDB Atlas connection string (`mongodb+srv://...`) |

---

## 📦 AWS ECR (Elastic Container Registry) Setup

We use AWS ECR instead of Docker Hub for secure, private container image hosting.

### 1. Create Repositories in AWS
Go to AWS Console → Elastic Container Registry → Create Repository:
- Create `devops-backend`
- Create `devops-frontend`
*(Keep them private)*

### 2. IAM User for GitHub Actions
1. Go to AWS IAM → Users → Create user (e.g., `github-actions-deployer`).
2. Attach policies:
   - `AmazonEC2ContainerRegistryPowerUser` (to push/pull images).
3. Create an **Access Key** for this user.
4. Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` to your GitHub Repository Secrets.

### 3. Give EC2 Permission to Pull
Your EC2 instance needs permission to pull images from ECR.
1. Go to IAM → Roles. Find the role attached to your EC2 instance (e.g., the one with CloudWatch permissions).
2. Attach the `AmazonEC2ContainerRegistryReadOnly` policy to this role.

---

## 🗄️ MongoDB Atlas Setup (Free Cloud Database)

> Atlas is used in **production**. Local Docker MongoDB is used for development.

### 1. Create Free Atlas Account
```
→ Go to: https://cloud.mongodb.com
→ Sign up for free
→ Create Organization & Project
```

### 2. Create Free Cluster
```
→ Click "Create" → Choose "M0 Free" tier
→ Select AWS as provider
→ Select same region as your EC2 (e.g., ap-south-1 for Mumbai)
→ Click "Create Deployment"
```

### 3. Create Database User
```
→ Security → Database Access → Add New Database User
→ Username: devops-user
→ Password: (generate a strong one)
→ Role: Read and Write to any database
```

### 4. Whitelist EC2 IP
```
→ Security → Network Access → Add IP Address
→ Add your EC2 public IP  (or 0.0.0.0/0 for all - less secure)
```

### 5. Get Connection String
```
→ Clusters → Connect → Drivers → Python
→ Copy: mongodb+srv://devops-user:<password>@cluster0.xxxxx.mongodb.net/
→ Replace <password> with your DB user password
→ Final URL: mongodb+srv://devops-user:mypassword@cluster0.xxxxx.mongodb.net/devops_task_manager?retryWrites=true&w=majority
```

### 6. Add to GitHub Secrets
```
Name:  MONGO_URL
Value: mongodb+srv://devops-user:mypassword@cluster0.xxxxx.mongodb.net/devops_task_manager?retryWrites=true&w=majority
```

### Dev vs Prod Database:
| Environment | Database |
|-------------|----------|
| Local Dev | `mongodb://localhost:27017` (Docker) |
| Production | `mongodb+srv://...` (Atlas Cloud) |

---

## 📊 AWS CloudWatch Monitoring (Logs & Metrics)

We use **Amazon CloudWatch** to monitor the EC2 instance (CPU, RAM, Disk) and application logs, with SNS email alerts for critical issues.

### 1. Assign IAM Role to EC2
Your EC2 instance needs permission to send data to CloudWatch.
1. Go to AWS IAM → Roles → Create Role
2. Select EC2 → Attach `CloudWatchAgentServerPolicy`
3. Go to EC2 → Actions → Security → Modify IAM Role → Attach this role

### 2. Install CloudWatch Agent (On EC2)
SSH into your EC2 instance and run the setup script:
```bash
cd ~/devops_project
chmod +x cloudwatch/setup_cloudwatch.sh
./cloudwatch/setup_cloudwatch.sh
```

### 3. Create Alarms & Dashboard (On Local Machine)
Run these scripts from your local machine (requires configured AWS CLI):
```bash
# Create SNS topic and Alarms (High CPU, Memory, Disk, Backend Errors)
./cloudwatch/create_alarms.sh <your-ec2-instance-id> your-email@example.com

# Create a CloudWatch Dashboard
./cloudwatch/create_dashboard.sh <your-ec2-instance-id>
```
*Note: Check your email to confirm the SNS subscription!*

---

## 🔒 HTTPS / SSL Setup (First Time on EC2)

> Run this **once** on your EC2 server after pointing your domain to EC2 IP.

### 1. Point your domain to EC2
Go to your domain registrar → Add A record:
```
Type: A
Name: @          (for example.com)
Name: www        (for www.example.com)
Value: <your-EC2-public-IP>
```

### 2. Update nginx.conf with your domain
```bash
# In nginx/nginx.conf, replace YOUR_DOMAIN with actual domain
sed -i 's/YOUR_DOMAIN/example.com/g' nginx/nginx.conf
```

### 3. Run SSL setup script on EC2
```bash
# SSH into your EC2
ssh ubuntu@<your-ec2-ip>

# Go to project folder
cd ~/devops_project

# Run setup script (replace with your domain and email)
chmod +x ssl_setup.sh
./ssl_setup.sh example.com admin@example.com
```

### 4. Verify HTTPS is working
```
✅ https://example.com        → Your app (secure)
✅ http://example.com         → Auto redirects to HTTPS
✅ SSL cert auto-renews       → Every 12h check (90 day cert)
```



---

## 🔄 CI/CD Pipeline

```
Push to main
    │
    ▼
┌─────────┐     ┌────────────────┐     ┌──────────────┐
│  TEST   │────▶│ BUILD + PUSH   │────▶│   DEPLOY     │
│         │     │                │     │              │
│ pytest  │     │ Docker build   │     │ SSH to EC2   │
│ MongoDB │     │ Push to Hub    │     │ docker pull  │
│ service │     │ backend +      │     │ docker up -d │
│         │     │ frontend       │     │              │
└─────────┘     └────────────────┘     └──────────────┘
```

---

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | ❌ | Health check |
| GET | `/api/info` | ❌ | API info |
| POST | `/api/register` | ❌ | Register user |
| POST | `/api/login` | ❌ | Login |
| GET | `/api/me` | ✅ | Current user |
| GET | `/api/tasks` | ✅ | My tasks |
| POST | `/api/tasks` | ✅ | Create task |
| PUT | `/api/tasks/{id}` | ✅ | Update task |
| DELETE | `/api/tasks/{id}` | ✅ | Delete task |
| GET | `/api/admin/tasks` | 👑 Admin | All tasks |
| GET | `/api/admin/users` | 👑 Admin | All users |

---

## 🧪 Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest test_main.py -v
```

---

## 🚀 Production Deployment (AWS EC2)

### First-time EC2 setup
```bash
# On EC2 instance
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu

# Clone repo
git clone https://github.com/<your-username>/devOps_project.git ~/devops_project
```

### Deploy manually
```bash
cd ~/devops_project
export DOCKERHUB_USERNAME=your-username
export JWT_SECRET=your-secret
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## 👥 User Roles

| Role | Permissions |
|------|-------------|
| `user` | Own tasks create/read/update/delete |
| `admin` | All users & all tasks access |

---

## 📁 Project Structure

```
devOps_project/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD Pipeline
├── backend/
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── main.py                 # FastAPI application
│   ├── requirements.txt
│   └── test_main.py
├── frontend/
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── services/
│   └── package.json
├── docker-compose.yml          # Development
├── docker-compose.prod.yml     # Production
└── README.md
```