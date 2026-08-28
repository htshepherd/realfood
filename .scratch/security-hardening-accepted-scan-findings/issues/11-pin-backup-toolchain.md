# 11 — 固定备份恢复工具供应链

**What to build:** 让持有 PostgreSQL、MinIO 和 Restic 凭据的运维容器只运行固定、可校验的基础镜像和 MinIO 工具，避免构建时下载的可变内容获得生产权限。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 特权备份/恢复基础镜像由不可变摘要固定。
- [ ] MinIO 工具固定到明确版本并提供受支持架构的 SHA-256。
- [ ] 下载后在授予执行权限前验证摘要，错误摘要使构建失败。
- [ ] 部署配置测试覆盖镜像摘要、工具版本和校验失败行为。
