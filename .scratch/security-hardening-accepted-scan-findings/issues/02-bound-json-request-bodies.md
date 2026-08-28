# 02 — 限制登录与收藏 JSON 请求体

**What to build:** 在反向代理和应用边界共同限制登录与收藏写请求，使固定长度和分块传输的超大 JSON 都在解析及访问下游依赖前被拒绝。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 登录与收藏写请求的 JSON 上限为 16 KiB。
- [ ] 超大固定长度和 chunked 请求均返回 413，且不会创建会话或修改收藏。
- [ ] 应用层不只依赖 Content-Length，并在调用 JSON 解析前完成字节限制。
- [ ] 正常登录、收藏和后续健康请求继续通过生产栈验收。
