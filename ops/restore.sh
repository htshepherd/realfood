#!/bin/sh
set -eu

: "${RESTORE_SNAPSHOT:?设置要恢复的 RESTORE_SNAPSHOT}"
: "${RESTORE_CONFIRM:?恢复会覆盖数据库和 MinIO，请设置 RESTORE_CONFIRM=I_UNDERSTAND}"
[ "$RESTORE_CONFIRM" = "I_UNDERSTAND" ] || { echo "恢复确认值不正确" >&2; exit 1; }
: "${DATABASE_URL:?缺少 DATABASE_URL}"
: "${MINIO_ACCESS_KEY:?缺少 MINIO_ACCESS_KEY}"
: "${MINIO_SECRET_KEY:?缺少 MINIO_SECRET_KEY}"
: "${MINIO_BUCKET:?缺少 MINIO_BUCKET}"
: "${RESTIC_REPOSITORY:?缺少 RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?缺少 RESTIC_PASSWORD}"

restore_dir="$(mktemp -d /tmp/ihealth-restore.XXXXXX)"
trap 'rm -rf "$restore_dir"' EXIT
restic restore "$RESTORE_SNAPSHOT" --target "$restore_dir"
dump_file="$(find "$restore_dir" -name postgres.dump -type f | head -n 1)"
asset_dir="$(find "$restore_dir" -name minio -type d | head -n 1)"
[ -n "$dump_file" ] && [ -n "$asset_dir" ] || { echo "备份内容不完整" >&2; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$dump_file"
mc alias set ihealth http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mirror --overwrite --remove "$asset_dir" "ihealth/$MINIO_BUCKET"
