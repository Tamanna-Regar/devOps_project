#!/bin/bash
# =============================================================
# cloudwatch/setup_cloudwatch.sh
# Run this ONCE on your EC2 instance to install & configure
# the CloudWatch agent for metrics + log collection.
# =============================================================
# Usage:
#   chmod +x cloudwatch/setup_cloudwatch.sh
#   ./cloudwatch/setup_cloudwatch.sh
# =============================================================

set -e

echo "🔧 Installing CloudWatch Agent..."

# ── 1. Download & install CloudWatch agent ──
cd /tmp
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb
rm -f ./amazon-cloudwatch-agent.deb
echo "✅ CloudWatch Agent installed"

# ── 2. Create log directory for app ──
sudo mkdir -p /var/log/devops
sudo chmod 777 /var/log/devops
echo "✅ Log directory created: /var/log/devops"

# ── 3. Copy config file ──
sudo cp ~/devops_project/cloudwatch/cloudwatch-config.json \
    /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
echo "✅ Config file copied"

# ── 4. Start the agent ──
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
    -s
echo "✅ CloudWatch Agent started"

# ── 5. Enable on boot ──
sudo systemctl enable amazon-cloudwatch-agent
echo "✅ CloudWatch Agent enabled on boot"

# ── 6. Verify status ──
echo ""
echo "📊 Agent Status:"
sudo systemctl status amazon-cloudwatch-agent --no-pager

echo ""
echo "🎉 CloudWatch setup complete!"
echo "   Metrics will appear in AWS Console → CloudWatch → Metrics → DevOpsProject"
echo "   Logs will appear in AWS Console → CloudWatch → Log Groups → /devops-project/"
