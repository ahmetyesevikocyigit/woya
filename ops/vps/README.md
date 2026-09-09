# WOYA VPS deployment

Target: `woyatablo.com`, VPS `187.124.169.67`, Node.js 24, system PostgreSQL 16.

Production source: `https://github.com/ahmetyesevikocyigit/woya.git`, branch `main`.
The source was copied from `ahmetagsakalli/woya` through commit `f87cb9c` on
9 September 2026. Future pushes to the original repository do not deploy here;
bring any desired upstream changes into this repository's `main` explicitly.

## Layout

- `/var/www/woya-source`: dedicated Git checkout tracking GitHub `main`; do not edit on the server.
- `/var/www/woya-releases/<commit>`: independently built and tested releases.
- `/var/www/woya-current`: running release, bound to `127.0.0.1:3180`.
- `/var/www/woya-previous`: rollback release.
- `/var/lib/woya/uploads`: persistent media, independent of Git/release changes.
- PostgreSQL database/role `woya`: independent of Git/release changes.
- `/etc/woya/runtime.json`: root-only configuration, delivered through systemd `LoadCredential`.
- `/usr/local/lib/woya`: reviewed deployment tools. Updating this directory requires reinstalling the reviewed infrastructure files; pushes cannot replace root-executed scripts automatically.

## Automatic updates

`woya-deploy.timer` checks GitHub every minute, plus up to 10 seconds jitter. A new `main` commit triggers locked dependency installation, TypeScript checks, admin/pricing/artwork/crop unit suites, production build, and the isolated admin HTTP suite. Payment, legal, customer and email unit suites and payment/customer HTTP suites also run when present. The candidate is started on loopback port 3181 and checked before the running service switches. A failed activation restores the previous release. A successful restart may cause a short interruption of a few seconds.

Builds run as the dedicated `woya` user with 1600 MB memory and one CPU quota, protecting other sites on this shared VPS. Build/test processes do not receive production credentials. Production receives its credentials only through systemd. Builds use `NEXT_PUBLIC_SITE_URL=https://woyatablo.com`.

The wrapper limits the Node heap to 768 MB and TypeScript 7's native Go runtime to a 384 MiB memory target with one worker (`GOMEMLIMIT`, `GOMAXPROCS`). VPS builds use Next's webpack build worker to avoid retaining Turbopack compilation memory during the additional type check. The cgroup still limits total memory to 1600 MB; all type checks and tests remain enabled.

Push directly to `main`, or merge a feature branch/PR into `main`, to publish. Other branches do not deploy. Failed commits remain skipped until another commit arrives or `/var/lib/woya/failed-sha` is removed for an explicit retry. Failures are recorded in systemd; no email/Slack notification is configured.

Changes under `db/` deliberately stop automatic activation. Review and back up the database, restore the backup to a disposable database, test the compatible migration there, and apply it to production before approving the exact schema manifest. After migration, generate `/etc/woya/approved-db.sha256` as root from the reviewed release with `(cd /var/www/woya-releases/REVIEWED_COMMIT && find db -type f -print0 | sort -z | xargs -0 sha256sum) > /etc/woya/approved-db.sha256`. Set its mode to 0600. The gate compares the entire manifest, including filenames, so a subsequent unreviewed schema change still stops deployment. No migration runs automatically. Regular content and code updates do not need a manual merge beyond getting onto `main`.

The Linux embedded PostgreSQL postinstall script restores packaged symlinks for the isolated customer tests. It is explicitly approved in `pnpm-workspace.yaml`. The VPS build wrapper also handles the missing approval in older upstream commits, restricted to the reviewed `embedded-postgres` version `18.4.0-beta.17`; other native versions require review.

PayTR and customer email credentials are separate runtime configuration. Deploying the code does not enable online payment or verification email: configure the documented PayTR and Resend settings before using those features.

```sh
systemctl list-timers 'woya-*'
journalctl -u woya-deploy -n 100 --no-pager
cat /var/lib/woya/deployed-sha
systemctl start woya-deploy.service
```

## First installation

Clone the repository to `/var/www/woya-source`, owned by `woya`. Run `ops/vps/install.sh` as root from a reviewed checkout. Provision the dedicated database and `/etc/woya/runtime.json` (mode 0600) separately. Required keys: `DATABASE_URL`, `ADMIN_SESSION_SECRET`, initial `ADMIN_PASSWORD_HASH`, `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `STORAGE_DRIVER=local`, `UPLOAD_DIR=/var/lib/woya/uploads`.

Run `scripts/admin-setup.ts` once under the application user with systemd credentials. Initial provisioning uses the repository catalog; existing Vercel/Neon data is not automatically imported, and existing remote resources are not deleted. Migration from that environment requires its owner to provide access or an export. Never overwrite an existing populated database with seed data.

After successful deployment, enable `woya-deploy.timer`, `woya-tls.timer`, and `woya-backup.timer` with `systemctl enable --now`. The daily backup includes a PostgreSQL custom-format dump and uploaded images under `/var/backups/woya`; 14 days are retained on this VPS. Configure a separate off-server backup destination when available.

## DNS and HTTPS

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 187.124.169.67 |
| CNAME | www | woyatablo.com |

Replace the previous Shopify root A and www CNAME records. Remove stale root/www AAAA records. Keep nameservers and mail records unchanged. TTL 300 seconds is suitable for the switch.

`woya-tls.timer` checks both hosts against two public DNS resolvers every five minutes. Once both point only to this VPS, it obtains a Let's Encrypt certificate using webroot validation, installs the HTTPS configuration, and stops the initial-setup timer. Existing certbot renewal handles renewal; a scoped deploy hook reloads nginx. HTTP and www redirect to `https://woyatablo.com` after HTTPS activates.

## Rollback

Pause polling before rollback so GitHub main does not immediately deploy again:

```sh
touch /etc/woya/deploy-paused
systemctl stop woya-deploy.timer
# Wait for any active deployment to finish before changing the symlink.
flock /run/lock/woya-deploy.lock bash -c '
  test -d /var/www/woya-previous || exit 1
  ln -sfn "$(readlink -f /var/www/woya-previous)" /var/www/woya-current.next
  mv -Tf /var/www/woya-current.next /var/www/woya-current
  systemctl restart woya.service
'
curl --fail http://127.0.0.1:3180/
```

This rolls back code, not database edits or uploaded images. After fixing/reverting `main`, remove `/etc/woya/deploy-paused` and restart the deployment timer.


### CMS settings

`/admin` links to product/pricing, site content, media, store settings, orders and notifications. `/admin/magaza` saves partial configuration with version conflict protection. Shipping amounts are stored in kuruş. `totalDeliveryDays` is the complete production-plus-carrier promise; old settings without it continue using `productionDays + deliveryDays`. The homepage announcement and checkout use this same setting. Unconfigured shipping fees continue blocking checkout.

The CMS release adds an optional JSON settings field, without changing tables or historical orders. Before setting it in production, keep a protected copy of the existing store settings. If manually rolling back to a release predating this field, remove only `totalDeliveryDays` from the current store-settings JSON (the old parser rejects unknown keys), preserving other operator edits; restore the captured legacy durations if needed. Do not rewrite order snapshots. The previous release used the existing legacy duration fields.
