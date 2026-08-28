import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import path from "node:path";

import { requireSession } from "@/src/server/auth";
import { release } from "@/src/server/release";
import { readRegularFile, validatePathSegment } from "@/src/server/safe-files.mjs";

const allowedBuckets = new Set(["food-images", "knowledge-images", "verification-images"]);
type AssetEntry = { key: string; bytes: number; checksum: string; mediaType: "image/png" | "image/webp" };

function activeAssets(): AssetEntry[] {
  const items = (release as unknown as { manifest: { assets: { items?: Array<AssetEntry & { optimized: AssetEntry }> } } }).manifest.assets.items ?? [];
  return items.flatMap((item) => [
    { key: item.key, bytes: item.bytes, checksum: item.checksum, mediaType: item.mediaType },
    item.optimized,
  ]);
}

export async function GET(_request: Request, context: RouteContext<"/api/v1/assets/[bucket]/[...key]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const { bucket, key: parts } = await context.params;
  try { parts.forEach(validatePathSegment); } catch { return new Response("无效资源", { status: 400 }); }
  if (!allowedBuckets.has(bucket)) {
    return new Response("无效资源", { status: 400 });
  }
  const key = parts.join("/");
  const manifestKey = key.endsWith(".webp") ? `${bucket}/optimized/${key}` : `${bucket}/${key}`;
  const asset = activeAssets().find((entry) => entry.key === manifestKey);
  if (!asset || !["image/png", "image/webp"].includes(asset.mediaType)) return new Response("资源不存在", { status: 404 });

  if (process.env.MINIO_ENDPOINT && process.env.MINIO_BUCKET) {
    const client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT,
      region: process.env.MINIO_REGION ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
      },
    });
    try {
      const object = await client.send(new GetObjectCommand({ Bucket: process.env.MINIO_BUCKET, Key: `${release.manifest.version}/${manifestKey}` }));
      if (!object.Body || object.ContentLength !== asset.bytes || object.Metadata?.sha256 !== asset.checksum) return new Response("资源不存在", { status: 404 });
      const body = await object.Body.transformToByteArray();
      if (createHash("sha256").update(body).digest("hex") !== asset.checksum) return new Response("资源不存在", { status: 404 });
      const responseBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
      return new Response(responseBody, { headers: { "Content-Type": asset.mediaType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    } catch {
      return new Response("资源不存在", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
    }
  }

  const publicRoot = path.join(process.cwd(), "server-assets", "assets", release.manifest.version);
  const localPath = path.join(publicRoot, ...manifestKey.split("/"));
  try {
    const body = await readRegularFile(publicRoot, localPath);
    if (body.length !== asset.bytes || createHash("sha256").update(body).digest("hex") !== asset.checksum) return new Response("资源不存在", { status: 404 });
    return new Response(body, { headers: { "Content-Type": asset.mediaType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("资源不存在", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  }
}
