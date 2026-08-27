import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

for (const name of ["MINIO_ENDPOINT", "MINIO_BUCKET", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"]) {
  if (!process.env[name]) throw new Error(`缺少 ${name}`);
}
const client = new S3Client({ endpoint: process.env.MINIO_ENDPOINT, region: process.env.MINIO_REGION ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY } });
const roots = ["food-images", "knowledge-images", "verification-images"];
async function filesBelow(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(fullPath));
    else files.push(fullPath);
  }
  return files;
}
let count = 0;
for (const root of roots) {
  const directory = path.resolve("server-assets", root);
  for (const file of await filesBelow(directory)) {
    const key = `${root}/${path.relative(directory, file).replaceAll(path.sep, "/")}`;
    const contentType = file.endsWith(".webp") ? "image/webp" : file.endsWith(".svg") ? "image/svg+xml" : "image/png";
    await client.send(new PutObjectCommand({ Bucket: process.env.MINIO_BUCKET, Key: key, Body: createReadStream(file), ContentType: contentType }));
    count += 1;
  }
}
console.log(`已上传 ${count} 个原图与同尺寸无损 WebP 到私有 MinIO。`);
