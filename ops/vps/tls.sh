#!/bin/bash
set -euo pipefail
exec 9>/run/lock/woya-tls.lock
flock -n 9 || exit 0
test -f /var/lib/woya/deployed-sha || exit 0
for host in woyatablo.com www.woyatablo.com; do
  # Reject stale or mixed answers; ignore the CNAME line returned for www.
  for resolver in 1.1.1.1 8.8.8.8; do
    records=$(dig +short +time=3 +tries=1 @"$resolver" A "$host" | grep -E '^[0-9.]+$' | sort -u || true)
    [[ "$records" == 187.124.169.67 ]] || exit 0
    ipv6=$(dig +short +time=3 +tries=1 @"$resolver" AAAA "$host" | grep ':' || true)
    [[ -z "$ipv6" ]] || exit 0
  done
done
if [[ ! -f /etc/letsencrypt/live/woyatablo.com/fullchain.pem ]]; then
  certbot certonly --webroot -w /var/www/letsencrypt \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --cert-name woyatablo.com -d woyatablo.com -d www.woyatablo.com
fi
cp /etc/nginx/sites-available/woyatablo.com /etc/woya/nginx-before-tls.conf
install -m 0644 /usr/local/lib/woya/woyatablo.com.https.conf /etc/nginx/sites-available/woyatablo.com
if nginx -t; then
  systemctl reload nginx
  systemctl disable --now woya-tls.timer
else
  cp /etc/woya/nginx-before-tls.conf /etc/nginx/sites-available/woyatablo.com
  exit 1
fi
