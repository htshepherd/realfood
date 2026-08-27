import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";

import { requireSession } from "@/src/server/auth";

const allowedBuckets = new Set(["food-images", "knowledge-images", "verification-images"]);

export async function GET(_request: Request, context: RouteContext<"/api/v1/assets/[bucket]/[...key]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const { bucket, key: parts } = await context.params;
  if (!allowedBuckets.has(bucket) || parts.some((part) => !part || part === "." || part === "..")) {
    return new Response("无效资源", { status: 400 });
  }
  const key = parts.join("/");

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
    const objectKey = key.endsWith(".webp") ? `${bucket}/optimized/${key}` : `${bucket}/${key}`;
    const object = await client.send(new GetObjectCommand({
      Bucket: process.env.MINIO_BUCKET,
      Key: objectKey,
    }));
    if (!object.Body) return new Response("资源不存在", { status: 404 });
    return new Response(object.Body.transformToWebStream(), {
      headers: {
        "Content-Type": object.ContentType ?? "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const localParts = key.endsWith(".webp") ? ["optimized", ...parts] : parts;
  const localPath = path.join(process.cwd(), "server-assets", bucket, ...localParts);
  const publicRoot = path.join(process.cwd(), "server-assets", bucket);
  if (!localPath.startsWith(`${publicRoot}${path.sep}`)) return new Response("无效资源", { status: 400 });
  try {
    const body = await fs.readFile(localPath);
    return new Response(body, {
      headers: {
        "Content-Type": key.endsWith(".webp") ? "image/webp" : key.endsWith(".svg") ? "image/svg+xml" : "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("资源不存在", { status: 404 });
  }
}
