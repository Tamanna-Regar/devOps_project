# 📊 Observability Stack (Prometheus + Grafana + Node Exporter)

This directory contains the production-grade monitoring stack for **DevOps Task Manager**. It scrapes real-time application metrics from FastAPI (`/metrics`) and system metrics from the host, displaying them in a pre-configured Grafana dashboard.

---

## 🏗️ Architecture

```
 ┌──────────────────────┐         ┌──────────────────────┐
 │ FastAPI Application  │         │ Node Exporter        │
 │ (/metrics endpoint)  │         │ (Host CPU/RAM/Disk)  │
 └──────────┬───────────┘         └──────────┬───────────┘
            │                                │
            │ Scrape (15s interval)          │ Scrape (10s interval)
            ▼                                ▼
       ┌──────────────────────────────────────────┐
       │         Prometheus (Port 9090)           │
       │         Time-Series Database             │
       └────────────────────┬─────────────────────┘
                            │ Query / PromQL
                            ▼
       ┌──────────────────────────────────────────┐
       │          Grafana (Port 3000)             │
       │    Interactive Visual Dashboards         │
       └──────────────────────────────────────────┘
```

---

## 📁 Directory Structure

| Path | Purpose |
| :--- | :--- |
| `docker-compose.monitoring.yml` | Multi-container setup for Prometheus, Grafana, and Node Exporter. |
| `prometheus/prometheus.yml` | Scrape target configurations (FastAPI backend, Prometheus, Node Exporter). |
| `grafana/provisioning/datasources/datasource.yml` | Automatically connects Grafana to Prometheus. |
| `grafana/provisioning/dashboards/dashboard.yml` | Auto-registers the dashboard provider. |
| `grafana/dashboards/devops_taskmanager_dashboard.json` | Pre-built dashboard showing RPS, Latency (P50/P95/P99), Error Rates, and CPU/RAM. |

---

## 🚀 Quick Start Guide

### 1. Start the Monitoring Stack
From the `monitoring` directory:
```bash
docker compose -f docker-compose.monitoring.yml up -d
```

### 2. Access the UIs
* **Grafana Dashboards:** [http://localhost:3000](http://localhost:3000)
  * **Username:** `admin`
  * **Password:** `admin`
* **Prometheus Targets & Query Console:** [http://localhost:9090](http://localhost:9090)
* **Node Exporter Raw Metrics:** [http://localhost:9100/metrics](http://localhost:9100/metrics)

---

## 📈 Dashboard Panels Included

1. **Total HTTP Requests:** Cumulative count of all API requests processed.
2. **Requests / Second (RPS):** Current traffic throughput rate.
3. **P95 Latency (ms):** 95th percentile response latency in milliseconds.
4. **5xx Server Errors:** Alert counter for unhandled exceptions or downtime.
5. **Throughput by Endpoint:** Per-route breakdown (e.g. `POST /api/login`, `GET /api/tasks`).
6. **Latency Percentiles (P50, P90, P99):** Real-time latency distribution curves.
7. **HTTP Status Code Distribution:** Donut chart of 2xx, 4xx, and 5xx responses.
8. **Top Requested Endpoints:** Bar chart of highest volume routes.
9. **Host CPU & Memory Utilization:** Server load graphs from Node Exporter.

---

## 🛑 Stop the Monitoring Stack
```bash
docker compose -f docker-compose.monitoring.yml down
```
*(Data is persisted in Docker named volumes `prometheus_data` and `grafana_data`)*
