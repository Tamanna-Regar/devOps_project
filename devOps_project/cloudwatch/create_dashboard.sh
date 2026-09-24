#!/bin/bash
# =============================================================
# cloudwatch/create_dashboard.sh
# Creates a CloudWatch Dashboard for the DevOps Project
# Run this from your LOCAL machine
# =============================================================
# Usage:
#   chmod +x cloudwatch/create_dashboard.sh
#   ./cloudwatch/create_dashboard.sh <instance-id> <region>
# =============================================================

set -e

INSTANCE_ID=$1
REGION=${2:-ap-south-1}

if [ -z "$INSTANCE_ID" ]; then
    echo "❌ Usage: ./create_dashboard.sh <instance-id> [region]"
    exit 1
fi

echo "📊 Creating CloudWatch Dashboard for EC2: $INSTANCE_ID in $REGION..."

# Create a dashboard JSON dynamically
cat > /tmp/dashboard.json <<EOF
{
  "widgets": [
    {
      "type": "metric",
      "x": 0,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/EC2", "CPUUtilization", "InstanceId", "$INSTANCE_ID", { "stat": "Average" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "$REGION",
        "title": "EC2 CPU Utilization"
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "DevOpsProject", "mem_used_percent", "InstanceId", "$INSTANCE_ID", { "stat": "Average" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "$REGION",
        "title": "EC2 Memory Usage %"
      }
    },
    {
      "type": "metric",
      "x": 0,
      "y": 6,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "DevOpsProject", "disk_used_percent", "InstanceId", "$INSTANCE_ID", "path", "/", { "stat": "Average" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "$REGION",
        "title": "EC2 Disk Usage %"
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 6,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "DevOpsProject", "BackendErrorCount", { "stat": "Sum" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "$REGION",
        "title": "Backend Error Count"
      }
    }
  ]
}
EOF

# Put the dashboard
aws cloudwatch put-dashboard \
    --dashboard-name "DevOpsProject-Dashboard" \
    --dashboard-body file:///tmp/dashboard.json \
    --region "$REGION"

echo "✅ Dashboard created successfully!"
echo "🔗 View it here: https://$REGION.console.aws.amazon.com/cloudwatch/home#dashboards:name=DevOpsProject-Dashboard"
