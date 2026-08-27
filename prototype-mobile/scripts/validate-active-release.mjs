import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildAssetManifest } from "./knowledge-compiler.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = JSON.parse(await fs.readFile(path.join(appRoot, "src", "data", "release.json"), "utf8"));
const assets = await buildAssetManifest(path.join(appRoot, "server-assets"), true);
if (assets.checksum !== release.manifest.assets.checksum || assets.count !== release.manifest.assets.count) {
  throw new Error("已发布版本的图片资源与资源清单不一致；请重新生成候选并发布");
}
const searchRoot = path.join(appRoot, "server-assets", "pagefind", release.manifest.version);
for (const file of release.manifest.search.files) {
  const bytes = await fs.readFile(path.join(searchRoot, ...file.path.split("/")));
  if (bytes.length !== file.bytes || sha256(bytes) !== file.checksum) {
    throw new Error(`已发布 Pagefind 文件校验失败：${file.path}`);
  }
}
const payload = {
  schema: release.manifest.schema,
  searchEngine: release.manifest.search.engineVersion,
  searchDocumentSchema: release.manifest.search.documentSchema,
  objects: release.objects,
  assetFingerprint: release.manifest.assets.checksum,
  searchFiles: release.manifest.search.files,
};
if (sha256(JSON.stringify(payload)) !== release.manifest.checksum) throw new Error("已发布知识版本校验和不一致");
console.log(`已验证发布版本 ${release.manifest.version}、${release.manifest.search.files.length} 个搜索文件和 ${assets.count} 张原图。`);
