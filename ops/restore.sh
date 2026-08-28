#!/bin/sh
set -eu

: "${RESTORE_SNAPSHOT:?设置要恢复的 RESTORE_SNAPSHOT}"
: "${RESTORE_CONFIRM:?恢复会覆盖数据库和 MinIO，请设置 RESTORE_CONFIRM=I_UNDERSTAND}"
: "${DATABASE_URL:?缺少 DATABASE_URL}"
: "${MINIO_ACCESS_KEY:?缺少 MINIO_ACCESS_KEY}"
: "${MINIO_SECRET_KEY:?缺少 MINIO_SECRET_KEY}"
: "${MINIO_BUCKET:?缺少 MINIO_BUCKET}"
: "${RESTIC_REPOSITORY:?缺少 RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?缺少 RESTIC_PASSWORD}"

restore_dir="$(mktemp -d /tmp/ihealth-restore.XXXXXX)"
trap 'rm -rf "$restore_dir"' EXIT
restic restore "$RESTORE_SNAPSHOT" --target "$restore_dir"
dump_file="$restore_dir/postgres.dump"
asset_dir="$restore_dir/minio"
[ -f "$dump_file" ] && [ ! -L "$dump_file" ] && [ "$(find "$dump_file" -type f -links 1 -print)" = "$dump_file" ] || { echo "固定数据库归档缺失或不安全" >&2; exit 1; }
[ -d "$asset_dir" ] && [ ! -L "$asset_dir" ] || { echo "固定 MinIO 目录缺失或不安全" >&2; exit 1; }
[ -z "$(find "$asset_dir" ! -type f ! -type d -print -quit)" ] || { echo "MinIO 备份含特殊文件" >&2; exit 1; }
[ -z "$(find "$asset_dir" -type f -links +1 -print -quit)" ] || { echo "MinIO 备份含多重硬链接" >&2; exit 1; }
pg_restore --list "$dump_file" >/dev/null
[ "$RESTORE_CONFIRM" = "I_UNDERSTAND" ] || { echo "恢复确认值不正确" >&2; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$dump_file"
mc alias set ihealth http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mirror --overwrite --remove "$asset_dir" "ihealth/$MINIO_BUCKET"
