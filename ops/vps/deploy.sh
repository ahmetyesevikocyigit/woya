#!/bin/bash
set -euo pipefail
exec 9>/run/lock/woya-deploy.lock
flock -n 9 || exit 0
test ! -e /etc/woya/deploy-paused || exit 0
source_dir=/var/www/woya-source
runuser -u woya -- git -C "$source_dir" fetch --prune origin main
sha=$(runuser -u woya -- git -C "$source_dir" rev-parse origin/main)
[[ "$sha" =~ ^[0-9a-f]{40}$ ]]
release=/var/www/woya-releases/$sha
previous=$(readlink -f /var/www/woya-current || true)
if [[ "$previous" == "$release" ]]; then exit 0; fi
# Repeated failures wait for a corrected commit or an explicit operator retry.
if [[ -f /var/lib/woya/failed-sha ]] && [[ $(cat /var/lib/woya/failed-sha) == "$sha" ]]; then exit 0; fi
switched=0
on_error() {
  echo "$sha" > /var/lib/woya/failed-sha
  systemctl stop woya-stage.service || true
  if [[ "$switched" == 1 && -n "$previous" && -d "$previous" ]]; then
    ln -sfn "$previous" /var/www/woya-current.next
    mv -Tf /var/www/woya-current.next /var/www/woya-current
    systemctl restart woya.service
    echo "Restored previous WOYA release: $previous"
  elif [[ "$switched" == 1 ]]; then
    systemctl stop woya.service || true
    rm -f /var/www/woya-current
  fi
  echo "WOYA deployment failed: $sha; inspect journalctl -u woya-deploy"
}
trap on_error ERR
install -d -o woya -g woya -m 0750 "$release"
if [[ ! -f "$release/.verified" ]]; then
  runuser -u woya -- git -C "$source_dir" archive "$sha" | runuser -u woya -- tar -x -C "$release"
  systemd-run --quiet --wait --collect --unit="woya-build-${sha:0:12}" \
    --uid=woya --property="WorkingDirectory=$release" \
    --property=MemoryMax=1600M --property=CPUQuota=100% --property=Nice=10 \
    /usr/local/lib/woya/build.sh
fi
# Database schema changes require a reviewed migration before traffic is switched.
if [[ -n "$previous" && -d "$previous/db" ]]; then
  if ! diff -qr "$previous/db" "$release/db"; then
    # Only a reviewed, already applied schema is allowed across this gate.
    actual=$(cd "$release" && find db -type f -print0 | sort -z | xargs -0 sha256sum)
    expected=$(cat /etc/woya/approved-db.sha256)
    [[ "$actual" == "$expected" ]]
  fi
fi
test -r /etc/woya/runtime.json
ln -sfn "$release" /var/www/woya-candidate
systemctl restart woya-stage.service
healthy() {
  local port=$1
  for attempt in $(seq 1 45); do
    if curl -fsS --max-time 15 "http://127.0.0.1:$port/" -o /dev/null && \
       curl -fsS --max-time 15 "http://127.0.0.1:$port/urunler" -o /dev/null && \
       curl -fsS --max-time 15 "http://127.0.0.1:$port/admin/giris" -o /dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}
healthy 3181
systemctl stop woya-stage.service
ln -sfn "$release" /var/www/woya-current.next
mv -Tf /var/www/woya-current.next /var/www/woya-current
switched=1
systemctl restart woya.service
healthy 3180
if [[ -n "$previous" && "$previous" != "$release" ]]; then
  ln -sfn "$previous" /var/www/woya-previous
fi
runuser -u woya -- git -C "$source_dir" reset --hard "$sha"
echo "$sha" > /var/lib/woya/deployed-sha
rm -f /var/lib/woya/failed-sha
echo "WOYA deployed successfully: $sha"
# Retain the newest three releases, plus current and rollback targets.
find /var/www/woya-releases -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +4 | cut -d' ' -f2- | while read -r old; do
  [[ "$old" == "$release" || "$old" == "$previous" ]] || rm -rf -- "$old"
done
