import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { readRegularFile, regularFiles, validatePathSegment } from "../src/server/safe-files.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ALLOWED_MEDIA = new Set(["image/png", "image/webp"]);

export function verifyAssetManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.items) || manifest.count !== manifest.items.length || sha256(JSON.stringify(manifest.items)) !== manifest.checksum) {
    throw new Error("资源清单身份校验失败");
  }
  manifestEntries(manifest.items);
  return manifest.items;
}

export function manifestEntries(items) {
  return items.flatMap((item) => [
    { key: item.key, bytes: item.bytes, checksum: item.checksum, mediaType: item.mediaType },
    { key: item.optimized.key, bytes: item.optimized.bytes, checksum: item.optimized.checksum, mediaType: item.optimized.mediaType },
  ]).map((entry) => {
    const parts = entry.key.split("/");
    if (parts.some((part) => !part)) throw new Error(`无效资源键：${entry.key}`);
    parts.forEach(validatePathSegment);
    if (!ALLOWED_MEDIA.has(entry.mediaType)) throw new Error(`不支持的资源类型：${entry.mediaType}`);
    const expectedExtension = entry.mediaType === "image/png" ? ".png" : ".webp";
    if (path.extname(entry.key).toLowerCase() !== expectedExtension) throw new Error(`资源扩展名与类型不符：${entry.key}`);
    return entry;
  });
}

export async function verifyManifestDirectory(root, items) {
  const expected = manifestEntries(items);
  const allowed = new Set(expected.map((entry) => entry.key));
  const actualFiles = await regularFiles(root);
  for (const file of actualFiles) {
    const key = path.relative(root, file).replaceAll(path.sep, "/");
    if (!allowed.has(key)) throw new Error(`未列入资源清单：${key}`);
  }
  if (actualFiles.length !== expected.length) throw new Error("资源清单与候选目录数量不一致");
  return Promise.all(expected.map(async (entry) => {
    const file = path.join(root, ...entry.key.split("/"));
    const bytes = await readRegularFile(root, file);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.checksum) throw new Error(`资源校验失败：${entry.key}`);
    return { ...entry, file, body: bytes };
  }));
}

export async function copyVerifiedAssets(sourceRoot, destinationRoot, items) {
  const verified = await verifyManifestDirectory(sourceRoot, items);
  try {
    const existing = await verifyManifestDirectory(destinationRoot, items);
    return existing;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      try { await fs.access(destinationRoot); } catch (accessError) { if (accessError?.code === "ENOENT") return stage(); }
      throw new Error(`版本化资源已存在但内容不同：${destinationRoot}`, { cause: error });
    }
  }
  return stage();

  async function stage() {
    const staging = `${destinationRoot}.next`;
    await fs.rm(staging, { recursive: true, force: true });
    for (const entry of verified) {
      const destination = path.join(staging, ...entry.key.split("/"));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, entry.body, { flag: "wx" });
    }
    await fs.mkdir(path.dirname(destinationRoot), { recursive: true });
    await fs.rename(staging, destinationRoot);
    return verified;
  }
}
