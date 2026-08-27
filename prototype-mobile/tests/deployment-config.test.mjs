import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

test("生产 Compose 使用可公开拉取的 MinIO Quay 固定版本", async () => {
  const compose = await readFile(path.join(projectRoot, "compose.yaml"), "utf8");
  assert.match(compose, /image: quay\.io\/minio\/minio:RELEASE\.2025-07-23T15-54-02Z/);
  assert.match(compose, /image: quay\.io\/minio\/mc:RELEASE\.2025-07-21T05-28-08Z/);
  assert.doesNotMatch(compose, /^\s*image: minio\/(?:minio|mc):/m);
});

test("生产 runner 包含账号管理脚本依赖的服务端模块", async () => {
  const dockerfile = await readFile(path.join(projectRoot, "prototype-mobile", "Dockerfile"), "utf8");
  assert.match(
    dockerfile,
    /COPY --from=builder --chown=nextjs:nodejs \/workspace\/prototype-mobile\/src\/server \.\/src\/server/,
  );
});
