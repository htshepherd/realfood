import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { prepareRuntimeBundle, validateRuntimeEntries } from "../scripts/prepare-runtime-bundle.mjs";

const execFileAsync = promisify(execFile);

test("仅允许运行时目录内的 macOS 元数据条目", () => {
  assert.doesNotThrow(() => validateRuntimeEntries([
    "prototype-mobile/src/data/release.json",
    "prototype-mobile/src/data/._release.json",
    "prototype-mobile/server-assets/pagefind/test/pagefind.js",
    "prototype-mobile/server-assets/pagefind/test/._pagefind.js",
  ].join("\n")));
  assert.throws(() => validateRuntimeEntries([
    "prototype-mobile/src/data/release.json",
    "prototype-mobile/server-assets/pagefind/test/pagefind.js",
    "prototype-mobile/._Dockerfile",
  ].join("\n")), /非运行时文件/);
});

test("私有运行时包经过 SHA256 校验后可注入干净检出", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "realfood-runtime-test-"));
  try {
    const sourceRoot = path.join(temporaryRoot, "source");
    const targetRoot = path.join(temporaryRoot, "target");
    const releasePath = path.join(sourceRoot, "prototype-mobile", "src", "data", "release.json");
    const searchPath = path.join(sourceRoot, "prototype-mobile", "server-assets", "pagefind", "test", "pagefind.js");
    await mkdir(path.dirname(releasePath), { recursive: true });
    await mkdir(path.dirname(searchPath), { recursive: true });
    await mkdir(targetRoot, { recursive: true });
    await writeFile(releasePath, '{"manifest":{"version":"test"}}\n');
    await writeFile(path.join(path.dirname(releasePath), "._release.json"), "macOS metadata\n");
    await writeFile(searchPath, "export {};\n");

    const bundlePath = path.join(temporaryRoot, "runtime.tar.gz");
    await execFileAsync("tar", ["-czf", bundlePath, "-C", sourceRoot, "prototype-mobile"]);
    const checksum = createHash("sha256").update(await readFile(bundlePath)).digest("hex");
    const result = await prepareRuntimeBundle({ repositoryRoot: targetRoot, bundlePath, expectedChecksum: checksum });

    assert.deepEqual(result, { installed: true });
    assert.match(await readFile(path.join(targetRoot, "prototype-mobile", "src", "data", "release.json"), "utf8"), /test/);
    assert.match(await readFile(path.join(targetRoot, "prototype-mobile", "server-assets", "pagefind", "test", "pagefind.js"), "utf8"), /export/);
    await assert.rejects(readFile(path.join(targetRoot, "prototype-mobile", "src", "data", "._release.json")), /ENOENT/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
