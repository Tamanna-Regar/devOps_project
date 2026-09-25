# ☸️ Kubernetes (K8s) Orchestration — DevOps Task Manager

This directory contains production-ready Kubernetes manifests to run the **DevOps Task Manager** in a high-availability, auto-scaling Kubernetes cluster (Minikube, K3s, Kind, or AWS EKS).

---

## 📐 Architecture in Kubernetes

```
                  Internet Traffic (HTTPS)
                             │
                             ▼
                ┌─────────────────────────┐
                │      Ingress Controller │
                │      (TLS Termination)  │
                └────────────┬────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
     /api, /health, /metrics                  │ / (Root UI)
            │                                 │
            ▼                                 ▼
   ┌──────────────────┐              ┌──────────────────┐
   │ backend-service  │              │ frontend-service │
   │ (Port 8000)      │              │ (Port 80)        │
   └────────┬─────────┘              └────────┬─────────┘
            │                                 │
            ▼                                 ▼
   ┌──────────────────┐              ┌──────────────────┐
   │ backend-pods     │              │ frontend-pods    │
   │ (Auto-Scales 2-10│              │ (2 Replicas)     │
   │  via HPA)        │              └──────────────────┘
   └──────────────────┘
```

---

## 📁 Manifests Included

| File | Purpose |
| :--- | :--- |
| `namespace.yaml` | Creates an isolated `devops-taskmanager` namespace. |
| `configmap.yaml` | Configures non-sensitive environment variables (Region, URLs, CORS). |
| `secret.yaml.example` | Template for sensitive secrets (`MONGO_URL`, `JWT_SECRET`, AWS keys). |
| `backend-deployment.yaml` | 2 replicas, rolling updates, CPU/RAM limits, and `/health/live` & `/health/ready` probes. |
| `backend-service.yaml` | Internal ClusterIP service exposing port 8000. |
| `frontend-deployment.yaml` | 2 replicas of the React Nginx frontend. |
| `frontend-service.yaml` | Internal ClusterIP service exposing port 80. |
| `ingress.yaml` | Unified routing rules with TLS certificate support. |
| `hpa.yaml` | Horizontal Pod Autoscaler scaling backend from 2 to 10 pods based on CPU/RAM usage. |

---

## 🚀 Deployment Steps

### 1. Create Secrets File
```bash
cp k8s/secret.yaml.example k8s/secret.yaml
# Edit k8s/secret.yaml with your MongoDB Atlas URI and JWT Secret
```

### 2. Apply Manifests
Deploy all resources to your cluster in order:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/backend-service.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```
*Or deploy everything at once:*
```bash
kubectl apply -f k8s/
```

### 3. Verify Pods & Services
```bash
# Check running pods
kubectl get pods -n devops-taskmanager

# Check services
kubectl get svc -n devops-taskmanager

# Check Ingress & Autoscaler
kubectl get ingress,hpa -n devops-taskmanager
```

### 4. Test Auto-Scaling (HPA)
Generate simulated traffic to test the Horizontal Pod Autoscaler:
```bash
kubectl run -i --tty load-generator --rm --image=busybox:1.28 --restart=Never -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://backend-service.devops-taskmanager.svc.cluster.local:8000/health; done"
```
Observe the pods scaling up:
```bash
kubectl get hpa -n devops-taskmanager --watch
```
