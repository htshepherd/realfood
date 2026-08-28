#!/bin/sh
set -eu

: "${RESTIC_REPOSITORY:?缺少 ECS 外 RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?缺少 RESTIC_PASSWORD}"

restic init
restic cat config >/dev/null
echo "Restic 仓库已显式初始化。"
