# =========================================================
# SECURITY GROUP FOR APPLICATION SERVER
# =========================================================

resource "aws_security_group" "app_server_sg" {
  name        = "${var.project_name}-${var.environment}-sg"
  description = "Security group for DevOps Task Manager application and web traffic"
  vpc_id      = aws_vpc.main.id

  # SSH Access
  ingress {
    description = "SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # HTTP Traffic (Nginx)
  ingress {
    description = "HTTP web traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS Traffic (SSL Termination)
  ingress {
    description = "HTTPS encrypted web traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Prometheus Metrics Monitoring (Restricted or Public for scrapers)
  ingress {
    description = "Prometheus web UI & metrics scraping"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # Grafana Dashboards (Restricted or Management access)
  ingress {
    description = "Grafana monitoring dashboard UI"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # All Outbound Traffic
  egress {
    description = "Allow all outbound traffic for Docker pulls, package installation, and MongoDB Atlas"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-sg"
  }
}
