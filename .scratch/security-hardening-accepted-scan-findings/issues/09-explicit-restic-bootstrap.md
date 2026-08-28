# 09 — 将 Restic 初始化改为显式运维动作

**What to build:** 把 Restic 仓库初始化从普通备份中移出，使备份面对仓库缺失、密码错误、网络或完整性故障时失败并保留原始错误，而不是静默建立空仓库。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 只有独立、显式的仓库初始化操作可以创建 Restic 仓库。
- [ ] 普通备份要求已有可读仓库，任何 snapshots 错误都以非零状态退出。
- [ ] 错误原因可供运维判断，不被首次初始化消息覆盖。
- [ ] 隔离临时仓库测试覆盖缺失、错误密码和正常备份。
