import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const execFileAsync = promisify(execFile);

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
  assert.doesNotMatch(
    dockerfile,
    /^# syntax=docker\/dockerfile:/m,
    "显式 Dockerfile frontend 会绕过 NODE_IMAGE 镜像配置并访问 Docker Hub",
  );
  assert.match(dockerfile, /^ARG NODE_IMAGE=node:24-alpine$/m);
  assert.equal(dockerfile.match(/^FROM \$\{NODE_IMAGE\} AS /gm)?.length, 3);
});

test("生产数据卷名称不再随 Compose 项目名变化", async () => {
  const compose = await readFile(path.join(projectRoot, "compose.yaml"), "utf8");
  assert.match(compose, /postgres-data:\n\s+name: \$\{POSTGRES_VOLUME_NAME:-realfood_postgres-data\}/);
  assert.match(compose, /minio-data:\n\s+name: \$\{MINIO_VOLUME_NAME:-realfood_minio-data\}/);
  assert.match(compose, /caddy-data:\n\s+name: \$\{CADDY_DATA_VOLUME_NAME:-realfood_caddy-data\}/);
  assert.match(compose, /caddy-config:\n\s+name: \$\{CADDY_CONFIG_VOLUME_NAME:-realfood_caddy-config\}/);
});

test("干净检出可通过 BuildKit 命名上下文注入私有运行时包", async () => {
  const [compose, dockerfile, dockerignore, prepareScript, emptyContextMarker] = await Promise.all([
    readFile(path.join(projectRoot, "compose.yaml"), "utf8"),
    readFile(path.join(projectRoot, "prototype-mobile", "Dockerfile"), "utf8"),
    readFile(path.join(projectRoot, ".dockerignore"), "utf8"),
    readFile(path.join(projectRoot, "prototype-mobile", "scripts", "prepare-runtime-bundle.mjs"), "utf8"),
    readFile(path.join(projectRoot, "prototype-mobile", "runtime-empty", ".gitkeep"), "utf8"),
  ]);
  assert.match(compose, /additional_contexts:\n\s+runtime_bundle: \$\{RUNTIME_BUNDLE_CONTEXT:-\.\/prototype-mobile\/runtime-empty\}/);
  assert.match(compose, /RUNTIME_BUNDLE_FILENAME: \$\{RUNTIME_BUNDLE_FILENAME:-runtime\.tar\.gz\}/);
  assert.match(compose, /RUNTIME_BUNDLE_SHA256: \$\{RUNTIME_BUNDLE_SHA256:-\}/);
  assert.match(dockerfile, /--mount=type=bind,from=runtime_bundle,source=\.,target=\/run\/runtime-bundle,ro/);
  assert.match(dockerfile, /node scripts\/prepare-runtime-bundle\.mjs "\/run\/runtime-bundle\/\$\{RUNTIME_BUNDLE_FILENAME\}"/);
  assert.match(dockerignore, /^private-deploy$/m);
  assert.match(prepareScript, /prototype-mobile\/src\/data\/release\.json/);
  assert.match(prepareScript, /prototype-mobile\/server-assets\//);
  assert.equal(emptyContextMarker, "");
});

test("生产 runner 包含账号管理脚本依赖的服务端模块", async () => {
  const dockerfile = await readFile(path.join(projectRoot, "prototype-mobile", "Dockerfile"), "utf8");
  assert.match(
    dockerfile,
    /COPY --from=builder --chown=nextjs:nodejs \/workspace\/prototype-mobile\/src\/server \.\/src\/server/,
  );
});

test("生产构建与搜索测试依赖的辅助文件都纳入版本控制", async () => {
  const expected = [
    "prototype-mobile/runtime-empty/.gitkeep",
    "prototype-mobile/scripts/prepare-runtime-bundle.mjs",
    "prototype-mobile/tests/search-candidate-queries.json",
    "prototype-mobile/tests/search-golden-queries.json",
  ];
  const { stdout } = await execFileAsync("git", ["ls-files", "--", ...expected], { cwd: projectRoot });
  assert.deepEqual(stdout.trim().split("\n").sort(), expected);
});
