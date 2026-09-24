#!/bin/bash
# =============================================================
# cloudwatch/create_alarms.sh
# Creates CloudWatch Alarms + SNS email notifications
# Run this from your LOCAL machine (AWS CLI must be configured)
# =============================================================
# Usage:
#   chmod +x cloudwatch/create_alarms.sh
#   ./cloudwatch/create_alarms.sh <instance-id> <email> <region>
#
# Example:
#   ./cloudwatch/create_alarms.sh i-0abc123def456 admin@example.com ap-south-1
# =============================================================

set -e

INSTANCE_ID=$1
EMAIL=$2
REGION=${3:-ap-south-1}

if [ -z "$INSTANCE_ID" ] || [ -z "$EMAIL" ]; then
    echo "❌ Usage: ./create_alarms.sh <instance-id> <email> [region]"
    echo "   Example: ./create_alarms.sh i-0abc123def456 admin@example.com ap-south-1"
    exit 1
fi

echo "🔔 Creating CloudWatch Alarms for EC2: $INSTANCE_ID"
echo "📧 Alerts will be sent to: $EMAIL"
echo "🌏 Region: $REGION"
echo ""

# ── 1. Create SNS Topic for notifications ──
echo "📢 Creating SNS topic..."
SNS_ARN=$(aws sns create-topic \
    --name devops-project-alerts \
    --region "$REGION" \
    --query 'TopicArn' \
    --output text)

# Subscribe email to topic
aws sns subscribe \
    --topic-arn "$SNS_ARN" \
    --protocol email \
    --notification-endpoint "$EMAIL" \
    --region "$REGION" > /dev/null

echo "✅ SNS Topic created: $SNS_ARN"
echo "   ⚠️  Check your email and CONFIRM the subscription!"
echo ""

# ── 2. High CPU Alarm (> 80% for 5 minutes) ──
echo "⚡ Creating CPU alarm..."
aws cloudwatch put-metric-alarm \
    --alarm-name "devops-high-cpu" \
    --alarm-description "CPU usage > 80% for 5 minutes" \
    --metric-name CPUUtilization \
    --namespace AWS/EC2 \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
    --alarm-actions "$SNS_ARN" \
    --ok-actions "$SNS_ARN" \
    --region "$REGION"
echo "✅ CPU alarm created (threshold: >80%)"

# ── 3. High Memory Alarm (> 85%) ──
echo "🧠 Creating Memory alarm..."
aws cloudwatch put-metric-alarm \
    --alarm-name "devops-high-memory" \
    --alarm-description "Memory usage > 85%" \
    --metric-name mem_used_percent \
    --namespace DevOpsProject \
    --statistic Average \
    --period 300 \
    --threshold 85 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
    --alarm-actions "$SNS_ARN" \
    --ok-actions "$SNS_ARN" \
    --region "$REGION"
echo "✅ Memory alarm created (threshold: >85%)"

# ── 4. High Disk Usage Alarm (> 80%) ──
echo "💾 Creating Disk alarm..."
aws cloudwatch put-metric-alarm \
    --alarm-name "devops-high-disk" \
    --alarm-description "Disk usage > 80%" \
    --metric-name disk_used_percent \
    --namespace DevOpsProject \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
    --alarm-actions "$SNS_ARN" \
    --region "$REGION"
echo "✅ Disk alarm created (threshold: >80%)"

# ── 5. Instance Status Check Alarm ──
echo "🖥️  Creating Status Check alarm..."
aws cloudwatch put-metric-alarm \
    --alarm-name "devops-instance-down" \
    --alarm-description "EC2 instance status check failed" \
    --metric-name StatusCheckFailed \
    --namespace AWS/EC2 \
    --statistic Maximum \
    --period 60 \
    --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --evaluation-periods 2 \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
    --alarm-actions "$SNS_ARN" \
    --region "$REGION"
echo "✅ Instance status alarm created"

# ── 6. CloudWatch Log Error Alarm ──
echo "🚨 Creating Error log alarm..."

# First create a metric filter for ERROR logs
aws logs put-metric-filter \
    --log-group-name "/devops-project/backend" \
    --filter-name "BackendErrors" \
    --filter-pattern "ERROR" \
    --metric-transformations \
        metricName=BackendErrorCount,metricNamespace=DevOpsProject,metricValue=1,defaultValue=0 \
    --region "$REGION" 2>/dev/null || echo "   (Log group may not exist yet - create it after first deploy)"

aws cloudwatch put-metric-alarm \
    --alarm-name "devops-backend-errors" \
    --alarm-description "Backend error count > 10 in 5 minutes" \
    --metric-name BackendErrorCount \
    --namespace DevOpsProject \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions "$SNS_ARN" \
    --treat-missing-data notBreaching \
    --region "$REGION"
echo "✅ Backend error alarm created (threshold: >10 errors in 5min)"

# ── Summary ──
echo ""
echo "🎉 All alarms created successfully!"
echo ""
echo "📋 Alarms created:"
echo "   1. devops-high-cpu       → Alert when CPU > 80%"
echo "   2. devops-high-memory    → Alert when Memory > 85%"
echo "   3. devops-high-disk      → Alert when Disk > 80%"
echo "   4. devops-instance-down  → Alert when EC2 is down"
echo "   5. devops-backend-errors → Alert when >10 errors in 5min"
echo ""
echo "📧 Alerts → $EMAIL (via SNS)"
echo ""
echo "🔗 View alarms: https://$REGION.console.aws.amazon.com/cloudwatch/home#alarmsV2:"
