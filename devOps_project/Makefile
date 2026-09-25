.PHONY: help up down restart logs build test lint monitor clean backup

help:
	@echo "DevOps Task Manager — Automation Commands"
	@echo "-----------------------------------------"
	@echo "  make up        : Start all application containers (Backend, Frontend, Mongo)"
	@echo "  make down      : Stop all application containers"
	@echo "  make restart   : Restart application containers"
	@echo "  make logs      : View and follow application logs"
	@echo "  make build     : Build local Docker images"
	@echo "  make test      : Run Pytest suite & Frontend build checks"
	@echo "  make lint      : Run ESLint on frontend code"
	@echo "  make monitor   : Start Prometheus & Grafana observability stack"
	@echo "  make backup    : Execute MongoDB backup to S3"
	@echo "  make clean     : Prune dangling docker resources"

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

build:
	docker compose build

test:
	@echo "Running backend tests..."
	cd backend && python -m pytest test_main.py -v
	@echo "Running frontend lint & build..."
	cd frontend && npm run lint && npm run build

lint:
	cd frontend && npm run lint

monitor:
	docker compose -f monitoring/docker-compose.monitoring.yml up -d
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana:    http://localhost:3000 (admin/admin)"

monitor-down:
	docker compose -f monitoring/docker-compose.monitoring.yml down

backup:
	bash scripts/backup_mongodb.sh

clean:
	docker system prune -f
