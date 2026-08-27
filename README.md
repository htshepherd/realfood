# realfood

面向 iPhone Safari 的食物与营养知识应用。

生产环境通过 Docker Compose 运行 Next.js、PostgreSQL、私有 MinIO 与 Caddy HTTPS。部署仓库仅包含应用代码和已发布的运行资源；原始资料 `raw/` 与知识源 `knowledge/` 不进入远端仓库。

部署说明见 [docs/deployment.md](docs/deployment.md)。
