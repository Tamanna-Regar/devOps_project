<#
.SYNOPSIS
  DevOps Task Manager — Windows Automation Helper Script
.EXAMPLE
  .\run.ps1 up
  .\run.ps1 test
  .\run.ps1 monitor
#>

param (
    [Parameter(Position=0)]
    [ValidateSet("up", "down", "restart", "logs", "build", "test", "lint", "monitor", "monitor-down", "help")]
    [string]$Command = "help"
)

switch ($Command) {
    "up" {
        Write-Host "🚀 Starting DevOps Task Manager containers..." -ForegroundColor Green
        docker compose up -d
    }
    "down" {
        Write-Host "🛑 Stopping containers..." -ForegroundColor Yellow
        docker compose down
    }
    "restart" {
        Write-Host "🔄 Restarting containers..." -ForegroundColor Cyan
        docker compose restart
    }
    "logs" {
        docker compose logs -f
    }
    "build" {
        Write-Host "🔨 Building Docker images..." -ForegroundColor Blue
        docker compose build
    }
    "test" {
        Write-Host "🧪 Running Backend Pytest..." -ForegroundColor Cyan
        Set-Location backend
        python -m pytest test_main.py -v
        Set-Location ..

        Write-Host "✨ Running Frontend Lint & Build..." -ForegroundColor Cyan
        Set-Location frontend
        npm run lint
        npm run build
        Set-Location ..
        Write-Host "✅ All tests passed successfully!" -ForegroundColor Green
    }
    "lint" {
        Set-Location frontend
        npm run lint
        Set-Location ..
    }
    "monitor" {
        Write-Host "📊 Starting Prometheus & Grafana stack..." -ForegroundColor Magenta
        docker compose -f monitoring/docker-compose.monitoring.yml up -d
        Write-Host "Prometheus: http://localhost:9090" -ForegroundColor White
        Write-Host "Grafana:    http://localhost:3000 (Login: admin / admin)" -ForegroundColor White
    }
    "monitor-down" {
        Write-Host "🛑 Stopping monitoring stack..." -ForegroundColor Yellow
        docker compose -f monitoring/docker-compose.monitoring.yml down
    }
    Default {
        Write-Host "DevOps Task Manager — Commands:" -ForegroundColor Cyan
        Write-Host "  .\run.ps1 up           : Start application containers"
        Write-Host "  .\run.ps1 down         : Stop containers"
        Write-Host "  .\run.ps1 test         : Run tests & lint"
        Write-Host "  .\run.ps1 build        : Build Docker images"
        Write-Host "  .\run.ps1 monitor      : Start Prometheus & Grafana"
        Write-Host "  .\run.ps1 monitor-down : Stop Prometheus & Grafana"
    }
}
