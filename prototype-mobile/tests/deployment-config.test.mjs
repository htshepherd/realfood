import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

test("生产 Compose 默认使用固定镜像，并允许通过环境变量切换镜像源", async () => {
  const compose = await readFile(path.join(projectRoot, "compose.yaml"), "utf8");
  assert.match(compose, /image: "\$\{POSTGRES_IMAGE:-postgres:16-alpine\}"/);
  assert.match(
    compose,
    /image: "\$\{MINIO_IMAGE:-quay\.io\/minio\/minio:RELEASE\.2025-07-23T15-54-02Z\}"/,
  );
  assert.match(
    compose,
    /image: "\$\{MINIO_MC_IMAGE:-quay\.io\/minio\/mc:RELEASE\.2025-07-21T05-28-08Z\}"/,
  );
  assert.match(compose, /image: "\$\{CADDY_IMAGE:-caddy:2\.10-alpine\}"/);
  assert.match(compose, /NODE_IMAGE: \$\{NODE_IMAGE:-node:24-alpine\}/);
  assert.doesNotMatch(compose, /^\s*image: minio\/(?:minio|mc):/m);
});

test("应用镜像的三个构建阶段共享可覆盖的 Node 基础镜像", async () => {
  const dockerfile = await readFile(path.join(projectRoot, "prototype-mobile", "Dockerfile"), "utf8");
  assert.match(dockerfile, /^ARG NODE_IMAGE=node:24-alpine$/m);
  assert.equal(dockerfile.match(/^FROM \$\{NODE_IMAGE\} AS /gm)?.length, 3);
});

test("生产 runner 包含账号管理脚本依赖的服务端模块", async () => {
  const dockerfile = await readFile(path.join(projectRoot, "prototype-mobile", "Dockerfile"), "utf8");
  assert.match(
    dockerfile,
    /COPY --from=builder --chown=nextjs:nodejs \/workspace\/prototype-mobile\/src\/server \.\/src\/server/,
  );
});
