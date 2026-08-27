#!/bin/sh
set -eu

: "${DATABASE_URL:?缺少 DATABASE_URL}"
: "${MINIO_ACCESS_KEY:?缺少 MINIO_ACCESS_KEY}"
: "${MINIO_SECRET_KEY:?缺少 MINIO_SECRET_KEY}"
: "${MINIO_BUCKET:?缺少 MINIO_BUCKET}"
: "${RESTIC_REPOSITORY:?缺少 ECS 外 RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?缺少 RESTIC_PASSWORD}"

backup_dir="$(mktemp -d /tmp/ihealth-backup.XXXXXX)"
trap 'rm -rf "$backup_dir"' EXIT
pg_dump "$DATABASE_URL" --format=custom --file="$backup_dir/postgres.dump"
mc alias set ihealth http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mirror --quiet "ihealth/$MINIO_BUCKET" "$backup_dir/minio"
restic snapshots >/dev/null 2>&1 || restic init
restic backup "$backup_dir" --tag ihealth
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
