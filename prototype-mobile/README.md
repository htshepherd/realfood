# realfood 食物与营养指南

面向 iPhone Safari 的 Next.js 食物与营养指南。产品内容只从 `../knowledge/*.md` 生成，当前发布 196 个知识对象，其中 190 个可浏览对象。

## 启动

```bash
pnpm install
pnpm demo
```

本地开发需要数据库和登录配置；完整环境使用仓库根目录的 Docker Compose。打开 `http://localhost:3000/`。

首页以搜索为唯一主要操作，右上“探索”进入按标签浏览。食物、营养素和补充剂使用图片图鉴，搜索位于页面顶部，分类选择位于导航中间；营养素保持 raw 顺序。左侧折叠菜单还可进入验证标志和收藏。收藏与数据库账号绑定，并支持离线操作后联网同步。

知识更新使用 `pnpm knowledge:build` 生成候选报告，审核后用 `pnpm knowledge:publish` 切换版本。运行时只读取已发布 JSON 和 Pagefind，不读取 Markdown。

## 添加到手机桌面

部署到 HTTPS 地址后：

- iPhone Safari：分享 → 添加到主屏幕
工程已包含 Web App Manifest、图标、独立显示模式、离线文字与 Pagefind 搜索；图片从私有 MinIO 按需加载。它仍是浏览器 Web 应用，不是原生 App。V1 验收范围仅为 iPhone Safari。
