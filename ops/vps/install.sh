#!/bin/bash
# Run as root from a reviewed copy of ops/vps. Runtime credentials are provisioned separately.
set -euo pipefail
cd "$(dirname "$0")"
id woya >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/woya --shell /usr/sbin/nologin woya
install -d -o woya -g woya -m 0750 /var/lib/woya/uploads /var/www/woya-releases
install -d -m 0700 /etc/woya /var/backups/woya
install -d -m 0755 /usr/local/lib/woya /var/www/letsencrypt/.well-known/acme-challenge
install -m 0755 build.sh deploy.sh tls.sh backup.sh /usr/local/lib/woya/
install -m 0644 run.mjs woyatablo.com.https.conf /usr/local/lib/woya/
install -m 0644 woya*.service woya*.timer /etc/systemd/system/
if [[ ! -e /etc/nginx/sites-available/woyatablo.com ]]; then
  install -m 0644 woyatablo.com.http.conf /etc/nginx/sites-available/woyatablo.com
fi
ln -sfn /etc/nginx/sites-available/woyatablo.com /etc/nginx/sites-enabled/woyatablo.com
nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable woya.service
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/woya-nginx <<'EOF'
#!/bin/sh
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/woyatablo.com ]; then
  /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
fi
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/woya-nginx
