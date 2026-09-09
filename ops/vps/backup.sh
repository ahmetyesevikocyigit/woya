#!/bin/bash
set -euo pipefail
umask 077
exec 9>/run/lock/woya-backup.lock
flock -n 9 || exit 0
install -d -m 0700 /var/backups/woya
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target=/var/backups/woya/$stamp
mkdir "$target"
runuser -u postgres -- pg_dump --format=custom --dbname=woya > "$target/database.dump"
tar -czf "$target/uploads.tar.gz" -C /var/lib/woya uploads
test -s "$target/database.dump"
runuser -u postgres -- pg_restore --list < "$target/database.dump" > /dev/null
touch "$target/complete"
find /var/backups/woya -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} +
echo "WOYA backup complete: $stamp"
