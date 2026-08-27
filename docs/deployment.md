# realfood V1 部署

对公网只开放 Caddy 的 80/443。PostgreSQL、MinIO API 与 MinIO 管理端均只在 Compose 内网可达。

1. 复制 `.env.example` 为 `.env`，填写公网域名和随机密钥；域名 A/AAAA 记录指向 ECS。
2. 把私有运行时包保存在 Git 工作区之外，或放入已忽略的 `private-deploy/`，在 `.env` 设置其目录 `RUNTIME_BUNDLE_CONTEXT`、文件名 `RUNTIME_BUNDLE_FILENAME` 和校验值 `RUNTIME_BUNDLE_SHA256`。BuildKit 以独立只读命名上下文挂载该目录，不会把压缩包加入 Git 或普通源码构建上下文。
3. 运行 `docker compose up -d --build`。如果工作区已经包含经校验的活动运行时文件，构建会直接使用；干净检出则从只读命名上下文校验并解压。Caddy 会为公网域名自动申请和续期 HTTPS 证书。
4. 首次配置固定家庭账号：临时设置 `SEED_ACCOUNTS_JSON`，运行 `docker compose run --rm app node scripts/seed-accounts.mjs`，完成后立即删除该变量。
5. Compose 的 `assets` 一次性服务会在应用启动前上传原图与无损 WebP；需要单独重传时运行 `docker compose run --rm assets`。MinIO 桶始终保持私有。
6. 每次知识更新先执行 `pnpm knowledge:build` 检查候选版本；确认报告后执行 `pnpm knowledge:publish`，再构建并部署同一版本镜像。Compose 会在应用启动前把原图与同像素无损 WebP 上传到私有 MinIO。
7. `public/` 只放 PWA 图标和 Service Worker；知识 JSON、Pagefind 与业务图片位于服务端目录或私有 MinIO，必须通过登录后的 `/api/v1` 读取。

中国大陆服务器无法稳定访问官方镜像源时，只在服务器 `.env` 中设置 `NODE_IMAGE`、`POSTGRES_IMAGE`、`MINIO_IMAGE`、`MINIO_MC_IMAGE` 和 `CADDY_IMAGE`。不要直接替换 `compose.yaml` 或 Dockerfile 中的镜像地址，否则后续更新会产生工作区冲突。示例值见 `.env.example`。

PostgreSQL、MinIO 和 Caddy 卷使用显式稳定名称，不再跟随 Compose 项目名变化。当前 `realfood` 部署默认继续使用 `realfood_postgres-data`、`realfood_minio-data`、`realfood_caddy-data` 和 `realfood_caddy-config`。从旧 `ihealth` 部署升级时，先用 `docker volume ls` 核对原卷，再在 `.env` 设置四个 `*_VOLUME_NAME` 变量指向原有 `ihealth_*` 卷；不要复制空卷覆盖旧卷。

固定账号通过 `SEED_ACCOUNTS_JSON` 配置；停用、启用或轮换密码使用 `pnpm db:account -- disable <账号>`、`enable <账号>`、`rotate <账号>`。轮换时只通过环境变量 `ACCOUNT_PASSWORD` 传入新密码，旧可信设备会在下次联网检查时失效。

部署到隔离测试栈后，配置 `STACK_BASE_URL`、`STACK_ACCOUNT_A_JSON`、`STACK_ACCOUNT_B_JSON` 和 `DATABASE_URL`，运行 `pnpm test:stack`。它会验证真实登录、两个账号的收藏隔离与幂等、账号停用、私有 MinIO 图片读取和公开路径阻断；测试结束会重新启用测试账号 A。

生产备份必须写到 ECS 以外的 S3 兼容存储。配置 Restic 变量后，由系统定时器每天运行 `docker compose --profile ops run --rm backup`；脚本会导出 PostgreSQL、镜像 MinIO 私有桶、加密上传，并保留 7 个日备份、4 个周备份和 6 个每月备份。

恢复演练使用同一镜像，但显式改为 `/usr/local/bin/restore.sh`，同时传入 `RESTORE_SNAPSHOT` 和 `RESTORE_CONFIRM=I_UNDERSTAND`。恢复会覆盖目标数据库和 MinIO 桶，只应在隔离环境或明确停机窗口执行。至少每季度演练一次。本仓库不保存任何生产密码、账号明文或备份凭据。
