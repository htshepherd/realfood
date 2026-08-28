import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { compileKnowledgeRelease } from "./knowledge-compiler.mjs";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const candidateRoot = path.join(appRoot, ".generated", "candidate");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function filesBelow(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(fullPath));
    else files.push(fullPath);
  }
  return files;
}

await fs.rm(candidateRoot, { recursive: true, force: true });

const release = await compileKnowledgeRelease({
  knowledgeRoot: path.join(projectRoot, "knowledge"),
  rawRoot: path.join(projectRoot, "raw"),
  assetRoot: path.join(appRoot, "server-assets"),
  outputRoot: candidateRoot,
});

const pagefindBinary = path.join(appRoot, "node_modules", ".bin", "pagefind");
await execFileAsync(pagefindBinary, [
  "--site", path.join(candidateRoot, "search-corpus"),
  "--output-path", path.join(candidateRoot, "pagefind"),
  "--force-language", "zh",
  "--quiet",
]);

const pagefindRoot = path.join(candidateRoot, "pagefind");
release.manifest.search.files = await Promise.all((await filesBelow(pagefindRoot))
  .map((file) => ({ file, path: path.relative(pagefindRoot, file).replaceAll(path.sep, "/") }))
  .sort((a, b) => a.path.localeCompare(b.path))
  .map(async ({ file, path: filePath }) => {
    const bytes = await fs.readFile(file);
    return { path: filePath, bytes: bytes.length, checksum: sha256(bytes) };
  }));
const finalPayload = {
  schema: release.manifest.schema,
  searchEngine: release.manifest.search.engineVersion,
  searchDocumentSchema: release.manifest.search.documentSchema,
  searchQueryExpansions: release.manifest.search.queryExpansions,
  searchMetadata: {
    termCounts: release.manifest.search.termCounts,
    termCollisions: release.manifest.search.termCollisions,
  },
  objects: release.objects,
  explore: release.explore,
  assetFingerprint: release.manifest.assets.checksum,
  searchFiles: release.manifest.search.files,
};
release.manifest.contentChecksum = release.manifest.checksum;
release.manifest.checksum = sha256(JSON.stringify(finalPayload));
release.manifest.search.baseUrl = `/api/v1/search/${release.manifest.version}/`;

let previous = null;
try { previous = JSON.parse(await fs.readFile(path.join(appRoot, "src", "data", "release.json"), "utf8")); } catch {}
const previousById = new Map((previous?.objects ?? []).map((item) => [item.id, sha256(JSON.stringify(item))]));
const currentById = new Map(release.objects.map((item) => [item.id, sha256(JSON.stringify(item))]));
const changedObjects = [...new Set([...previousById.keys(), ...currentById.keys()])]
  .filter((id) => previousById.get(id) !== currentById.get(id)).sort();
let previousAssets = null;
try { previousAssets = JSON.parse(await fs.readFile(path.join(appRoot, ".generated", "published-assets.json"), "utf8")); } catch {}
const assetSummary = previousAssets?.checksum === release.manifest.assets.checksum
  ? "无变化"
  : `${previousAssets?.count ?? 0} → ${release.manifest.assets.count} 个资源；校验和已变化`;
await fs.writeFile(path.join(candidateRoot, "report.md"), `# 候选知识版本 ${release.manifest.version}\n\n- 总对象：${release.manifest.counts.total}\n- 普通详情对象：${release.manifest.counts.primary}\n- 发布校验和：\`${release.manifest.checksum}\`\n- Pagefind 文件：${release.manifest.search.files.length}\n- 资源变化：${assetSummary}\n- 变更对象：${changedObjects.length}\n\n${changedObjects.length ? changedObjects.map((id) => `- \`${id}\``).join("\n") : "- 无"}\n`);
await Promise.all([
  fs.writeFile(path.join(candidateRoot, "release.json"), `${JSON.stringify(release, null, 2)}\n`),
  fs.writeFile(path.join(candidateRoot, "manifest.json"), `${JSON.stringify(release.manifest, null, 2)}\n`),
]);

await fs.writeFile(
  path.join(candidateRoot, "candidate.json"),
  `${JSON.stringify({ version: release.manifest.version, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

console.log(`候选知识版本已生成：${release.manifest.version}`);
console.log(`对象：${release.manifest.counts.total}（普通详情 ${release.manifest.counts.primary}）`);
console.log("候选版本尚未发布；运行 pnpm knowledge:publish 明确切换当前版本。");
