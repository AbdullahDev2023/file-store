# VPS Deployment Guide
# Domain: store.visioncoachinginstitute.online
# App Port: 1919

# ─────────────────────────────────────────────
# 1. SSH INTO YOUR VPS
# ─────────────────────────────────────────────
ssh root@YOUR_VPS_IP


# ─────────────────────────────────────────────
# 2. INSTALL NODE.JS (if not already installed)
# ─────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs


# ─────────────────────────────────────────────
# 3. INSTALL PM2 (process manager)
# ─────────────────────────────────────────────
npm install -g pm2


# ─────────────────────────────────────────────
# 4. INSTALL NGINX
# ─────────────────────────────────────────────
sudo apt update
sudo apt install -y nginx


# ─────────────────────────────────────────────
# 5. CLONE THE REPO
# ─────────────────────────────────────────────
cd /var/www
git clone https://github.com/AbdullahDev2023/file-store.git
cd file-store
npm install


# ─────────────────────────────────────────────
# 6. START APP WITH PM2
# ─────────────────────────────────────────────
pm2 start server.js --name file-store
pm2 save
pm2 startup    # Run the command it outputs to auto-start on reboot


# ─────────────────────────────────────────────
# 7. NGINX REVERSE PROXY CONFIG
# ─────────────────────────────────────────────
sudo nano /etc/nginx/sites-available/file-store

# ── Paste this block ──────────────────────────
server {
    listen 80;
    server_name store.visioncoachinginstitute.online;

    client_max_body_size 100M;

    location / {
        proxy_pass         http://localhost:1919;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
# ── End of block ─────────────────────────────


# ─────────────────────────────────────────────
# 8. ENABLE THE SITE
# ─────────────────────────────────────────────
sudo ln -s /etc/nginx/sites-available/file-store /etc/nginx/sites-enabled/
sudo nginx -t          # Should say: syntax is ok
sudo systemctl reload nginx


# ─────────────────────────────────────────────
# 9. DNS — Point your domain to VPS IP
# ─────────────────────────────────────────────
# In your domain registrar / DNS panel:
#   Type  : A
#   Name  : store
#   Value : YOUR_VPS_IP
#   TTL   : 300 (or Auto)


# ─────────────────────────────────────────────
# 10. FREE SSL WITH CERTBOT (HTTPS)
# ─────────────────────────────────────────────
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d store.visioncoachinginstitute.online
# Follow prompts — Certbot auto-configures HTTPS and sets up auto-renewal


# ─────────────────────────────────────────────
# 11. OPEN FIREWALL PORTS (if UFW is enabled)
# ─────────────────────────────────────────────
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow OpenSSH


# ─────────────────────────────────────────────
# 12. VERIFY EVERYTHING IS RUNNING
# ─────────────────────────────────────────────
pm2 status
curl http://localhost:1919
# Then visit: https://store.visioncoachinginstitute.online


# ─────────────────────────────────────────────
# USEFUL PM2 COMMANDS
# ─────────────────────────────────────────────
pm2 logs file-store          # View live logs
pm2 restart file-store       # Restart app
pm2 stop file-store          # Stop app


# ─────────────────────────────────────────────
# TO PULL LATEST CODE FROM GITHUB
# ─────────────────────────────────────────────
cd /var/www/file-store
git pull origin master
npm install
pm2 restart file-store


# ─────────────────────────────────────────────
# POWERSHELL UPLOAD TO LIVE SERVER
# ─────────────────────────────────────────────
Invoke-RestMethod -Uri "https://store.visioncoachinginstitute.online/upload" `
  -Method Post `
  -Form @{ files = Get-Item "C:\path\to\yourfile.txt" }
