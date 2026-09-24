#!/bin/bash
set -e

# Redirect output to user_data.log for debugging
exec > >(tee /var/log/user_data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "=========================================================="
echo "Starting DevOps Task Manager EC2 Server Bootstrap..."
echo "=========================================================="

# 1. Update system packages
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# 2. Install essential dependencies
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    unzip \
    jq \
    htop

# 3. Install Docker Engine & Docker Compose Plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# 4. Install AWS CLI v2
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm -rf awscliv2.zip aws

# 5. Install Amazon CloudWatch Agent
curl -s "https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb" -o "amazon-cloudwatch-agent.deb"
dpkg -i -E ./amazon-cloudwatch-agent.deb
rm -f amazon-cloudwatch-agent.deb

# 6. Create logging directory for DevOps application logs
mkdir -p /var/log/devops
mkdir -p /var/log/nginx
chmod -R 775 /var/log/devops
chown -R ubuntu:ubuntu /var/log/devops

# 7. Create application working directory
mkdir -p /home/ubuntu/devops_project
chown -R ubuntu:ubuntu /home/ubuntu/devops_project

echo "=========================================================="
echo "DevOps Task Manager Bootstrap Completed Successfully! 🚀"
echo "Docker Version: $(docker --version)"
echo "Compose Version: $(docker compose version)"
echo "AWS CLI Version: $(aws --version)"
echo "=========================================================="
