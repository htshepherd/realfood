import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const releaseEntry = "prototype-mobile/src/data/release.json";
const assetsPrefix = "prototype-mobile/server-assets/";

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function runtimeIsComplete(releasePath, assetsPath) {
  if (!await exists(releasePath) || !await exists(assetsPath)) return false;
  try {
    const release = JSON.parse(await fs.readFile(releasePath, "utf8"));
    const version = release?.manifest?.version;
    const searchFiles = release?.manifest?.search?.files;
    if (!version || !Array.isArray(searchFiles) || searchFiles.length === 0) return false;
    const pagefindRoot = path.join(assetsPath, "pagefind", version);
    if (!await exists(pagefindRoot)) return false;
    for (const file of searchFiles) {
      const parts = typeof file?.path === "string" ? file.path.split("/") : [];
      if (parts.length === 0 || parts.some((part) => !part || part === "." || part === "..")) return false;
      if (!await exists(path.join(pagefindRoot, ...parts))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function validateRuntimeEntries(entries) {
  const paths = entries.split("\n").map((entry) => entry.trim()).filter(Boolean);
  const allowedDirectories = new Set([
    "prototype-mobile/",
    "prototype-mobile/src/",
    "prototype-mobile/src/data/",
    assetsPrefix,
  ]);
  if (!paths.includes(releaseEntry)) throw new Error(`运行时包缺少 ${releaseEntry}`);
  if (!paths.some((entry) => entry.startsWith(`${assetsPrefix}pagefind/`))) {
    throw new Error("运行时包缺少 Pagefind 文件");
  }
  for (const entry of paths) {
    if (path.posix.isAbsolute(entry) || entry.split("/").includes("..")) {
      throw new Error(`运行时包包含不安全路径：${entry}`);
    }
    const basename = path.posix.basename(entry);
    const metadata = basename === ".DS_Store" || basename.startsWith("._");
    const metadataInRuntime = metadata && (entry.startsWith("prototype-mobile/src/data/") || entry.startsWith(assetsPrefix));
    if (metadataInRuntime) continue;
    if (entry !== releaseEntry && !allowedDirectories.has(entry) && !entry.startsWith(assetsPrefix)) {
      throw new Error(`运行时包包含非运行时文件：${entry}`);
    }
  }
}

async function removeMacMetadata(root) {
  if (!await exists(root)) return;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) {
      await fs.rm(target, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeMacMetadata(target);
    }
  }
}

export async function prepareRuntimeBundle({ repositoryRoot, bundlePath, expectedChecksum }) {
  const releasePath = path.join(repositoryRoot, ...releaseEntry.split("/"));
  const assetsPath = path.join(repositoryRoot, ...assetsPrefix.split("/").filter(Boolean));
  if (await runtimeIsComplete(releasePath, assetsPath)) return { installed: false };

  const bundle = bundlePath ? path.resolve(bundlePath) : "";
  if (!bundle || !await exists(bundle) || (await fs.stat(bundle)).size === 0) {
    throw new Error("缺少私有运行时包。请设置 RUNTIME_BUNDLE_CONTEXT、RUNTIME_BUNDLE_FILENAME 和 RUNTIME_BUNDLE_SHA256 后重新构建");
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedChecksum ?? "")) {
    throw new Error("从私有运行时包构建时必须提供 64 位 RUNTIME_BUNDLE_SHA256");
  }
  const actualChecksum = await sha256File(bundle);
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error(`私有运行时包 SHA256 不匹配：实际为 ${actualChecksum}`);
  }

  const { stdout } = await execFileAsync("tar", ["-tzf", bundle], { maxBuffer: 16 * 1024 * 1024 });
  validateRuntimeEntries(stdout);
  await execFileAsync("tar", ["-xzf", bundle, "-C", repositoryRoot]);
  await Promise.all([
    removeMacMetadata(path.join(repositoryRoot, "prototype-mobile", "src", "data")),
    removeMacMetadata(assetsPath),
  ]);
  if (!await runtimeIsComplete(releasePath, assetsPath)) throw new Error("私有运行时包解压后仍缺少发布文件或对应的 Pagefind 索引");
  return { installed: true };
}

async function main() {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await prepareRuntimeBundle({
    repositoryRoot: path.dirname(appRoot),
    bundlePath: process.argv[2],
    expectedChecksum: process.env.REALFOOD_RUNTIME_BUNDLE_SHA256?.trim(),
  });
  console.log(result.installed ? "已校验并载入私有运行时包。" : "已检测到完整运行时目录。" );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
