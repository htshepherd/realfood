import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

import { query } from "@/src/server/db";

export async function GET() {
  try {
    await query("SELECT 1");
    const client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT,
      region: process.env.MINIO_REGION ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
      },
    });
    await client.send(new HeadBucketCommand({ Bucket: process.env.MINIO_BUCKET }));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
