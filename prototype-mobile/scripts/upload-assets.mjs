import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyManifestDirectory } from "./asset-publication.mjs";

for (const name of ["MINIO_ENDPOINT", "MINIO_BUCKET", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"]) {
  if (!process.env[name]) throw new Error(`缺少 ${name}`);
}
const client = new S3Client({ endpoint: process.env.MINIO_ENDPOINT, region: process.env.MINIO_REGION ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY } });
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = JSON.parse(await fs.readFile(path.join(appRoot, "src", "data", "release.json"), "utf8"));
const version = release.manifest.version;
const root = path.join(appRoot, "server-assets", "assets", version);
const entries = await verifyManifestDirectory(root, release.manifest.assets.items ?? []);
let count = 0;
for (const entry of entries) {
  const key = `${version}/${entry.key}`;
  try {
    const existing = await client.send(new HeadObjectCommand({ Bucket: process.env.MINIO_BUCKET, Key: key }));
    if (existing.ContentLength !== entry.bytes || existing.ContentType !== entry.mediaType || existing.Metadata?.sha256 !== entry.checksum) {
      throw new Error(`不可变资源键已存在但内容不符：${key}`);
    }
    count += 1;
    continue;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status !== 404 && error?.name !== "NotFound" && error?.Code !== "NotFound") throw error;
  }
  await client.send(new PutObjectCommand({ Bucket: process.env.MINIO_BUCKET, Key: key, Body: entry.body, ContentLength: entry.bytes, ContentType: entry.mediaType, Metadata: { sha256: entry.checksum }, IfNoneMatch: "*" }));
  count += 1;
}
console.log(`已验证并上传 ${count} 个 ${version} 版本资源到私有 MinIO。`);
