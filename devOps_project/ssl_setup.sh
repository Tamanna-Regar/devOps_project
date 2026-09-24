#!/bin/bash
# =============================================================
# ssl_setup.sh - Run this ONCE on your EC2 server to get SSL
# =============================================================
# Usage:
#   chmod +x ssl_setup.sh
#   ./ssl_setup.sh yourdomain.com your@email.com
# =============================================================

set -e

DOMAIN=$1
EMAIL=$2

# ── Validate arguments ──
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "❌ Usage: ./ssl_setup.sh <domain> <email>"
    echo "   Example: ./ssl_setup.sh example.com admin@example.com"
    exit 1
fi

echo "🔧 Setting up SSL for domain: $DOMAIN"
echo "📧 Using email: $EMAIL"
echo ""

# ── Step 1: Start with HTTP-only Nginx config (for ACME challenge) ──
echo "📋 Step 1: Switching to HTTP-only Nginx config..."
cp ./nginx/nginx.http.conf ./nginx/nginx.conf.backup 2>/dev/null || true
docker compose -f docker-compose.prod.yml down nginx 2>/dev/null || true

# Use HTTP config first
cp ./nginx/nginx.http.conf /tmp/nginx_temp.conf
docker run --rm \
    -v $(pwd)/nginx/nginx.http.conf:/etc/nginx/conf.d/default.conf:ro \
    -v certbot_www:/var/www/certbot \
    -v certbot_conf:/etc/letsencrypt \
    -p 80:80 \
    --network devops-net \
    --name temp-nginx \
    -d nginx:alpine

echo "✅ Temporary HTTP Nginx started"
sleep 3

# ── Step 2: Get SSL Certificate from Let's Encrypt ──
echo ""
echo "🔐 Step 2: Requesting SSL certificate from Let's Encrypt..."
docker run --rm \
    -v certbot_www:/var/www/certbot \
    -v certbot_conf:/etc/letsencrypt \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

echo "✅ SSL Certificate obtained!"

# ── Step 3: Update nginx.conf with actual domain ──
echo ""
echo "📝 Step 3: Updating nginx.conf with your domain..."
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" ./nginx/nginx.conf
echo "✅ nginx.conf updated for: $DOMAIN"

# ── Step 4: Stop temp nginx, start full stack ──
echo ""
echo "🐳 Step 4: Starting full production stack with HTTPS..."
docker stop temp-nginx 2>/dev/null || true
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "🎉 SSL Setup Complete!"
echo "   Your app is now available at:"
echo "   ✅ https://$DOMAIN"
echo "   ✅ https://www.$DOMAIN"
echo ""
echo "   SSL certificate auto-renews every 12 hours check (expires in 90 days)"
