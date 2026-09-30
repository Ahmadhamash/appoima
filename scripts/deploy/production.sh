#!/usr/bin/env bash
set -Eeuo pipefail

# Runs only on the trusted production self-hosted runner after CI succeeds.
source_root="${GITHUB_WORKSPACE:?Run from a checked-out GitHub Actions workspace}"
app_root=/opt/jormall-clinic
service=jormall-clinic.service
health_url=http://127.0.0.1:5000/api/healthz
release_id="${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"
backup="$app_root/backups/cicd-$release_id"
api_dist="$app_root/artifacts/api-server/dist"
web_dist="$app_root/artifacts/jormall/dist/public"

test -d "$app_root" || { echo 'Application directory is missing' >&2; exit 1; }
test -f /etc/jormall-clinic.env || { echo 'Server environment file is missing' >&2; exit 1; }
test -f "$source_root/artifacts/api-server/dist/index.mjs" || { echo 'Built API artifact is missing' >&2; exit 1; }
test -f "$source_root/artifacts/jormall/dist/public/index.html" || { echo 'Built web artifact is missing' >&2; exit 1; }
command -v rsync >/dev/null
command -v pg_dump >/dev/null
command -v pnpm >/dev/null
sudo -n systemctl status "$service" >/dev/null

mkdir -p "$backup"
chmod 700 "$backup"
set -a
# Kept on the server. Never copy this file into GitHub or the build artifact.
source /etc/jormall-clinic.env
set +a
test -n "${DATABASE_URL:-}" || { echo 'DATABASE_URL is missing on the server' >&2; exit 1; }
PGDATABASE="$DATABASE_URL" pg_dump --format=custom --file="$backup/database.dump"
test -s "$backup/database.dump"

if test -d "$api_dist"; then cp -a "$api_dist" "$backup/api-dist"; fi
if test -d "$web_dist"; then cp -a "$web_dist" "$backup/web-dist"; fi

rollback() {
  code=$?
  trap - ERR
  if test -d "$backup/api-dist"; then
    rm -rf -- "$api_dist"
    cp -a "$backup/api-dist" "$api_dist"
  fi
  if test -d "$backup/web-dist"; then
    rm -rf -- "$web_dist"
    mkdir -p "$(dirname "$web_dist")"
    cp -a "$backup/web-dist" "$web_dist"
  fi
  sudo -n systemctl restart "$service" || true
  echo "Deployment failed; previous application bundles restored. Database backup: $backup/database.dump" >&2
  exit "$code"
}
trap rollback ERR

# Sync source and migrations, preserving server configuration and uploaded data.
rsync -a --exclude='/.git/' --exclude='/.env*' --exclude='/node_modules/' \
  --exclude='**/node_modules/' --exclude='**/dist/' --exclude='/verification/' \
  --exclude='/exports/' --exclude='/backups/' --exclude='*.log' \
  "$source_root/" "$app_root/"

cd "$app_root"
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate
sudo -n systemctl stop "$service"
mkdir -p "$api_dist" "$web_dist"
rsync -a --delete "$source_root/artifacts/api-server/dist/" "$api_dist/"
rsync -a --delete "$source_root/artifacts/jormall/dist/public/" "$web_dist/"
sudo -n systemctl restart "$service"

ready=0
for attempt in $(seq 1 30); do
  if curl -fsS "$health_url" >/dev/null; then ready=1; break; fi
  sleep 2
done
test "$ready" = 1 || { echo 'Application health check failed' >&2; exit 1; }
trap - ERR
echo "Deployed $GITHUB_SHA with a healthy API. Backup: $backup"
