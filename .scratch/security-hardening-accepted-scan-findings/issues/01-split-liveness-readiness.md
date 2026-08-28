# 01 — 拆分公网存活检查与内部就绪检查

**What to build:** 让家庭成员访问的公网健康检查只证明应用进程存活，不再把匿名请求放大为 PostgreSQL 和 MinIO 工作；同时保留仅供内部部署使用的真实依赖就绪检查。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 公网健康检查不访问 PostgreSQL 或 MinIO，正常返回轻量存活状态。
- [ ] PostgreSQL 与 MinIO 就绪检查仍可从内部 Compose 网络调用。
- [ ] 公网 Caddy 路由不能访问内部就绪检查。
- [ ] 隔离生产栈测试覆盖公开与内部两条路径，并证明普通鉴权请求不受影响。
