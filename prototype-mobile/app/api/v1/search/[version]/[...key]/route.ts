import { createHash } from "node:crypto";
import path from "node:path";

import { requireSession } from "@/src/server/auth";
import { e2eMode } from "@/src/server/e2e-mode";
import { release } from "@/src/server/release";
import { readRegularFile, validatePathSegment } from "@/src/server/safe-files.mjs";

const contentTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

export async function GET(_request: Request, context: { params: Promise<{ version: string; key: string[] }> }) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const { version, key: parts } = await context.params;
  try { parts.forEach(validatePathSegment); } catch { return new Response("搜索版本不存在", { status: 404 }); }
  if (version !== release.manifest.version) {
    return new Response("搜索版本不存在", { status: 404 });
  }
  const key = parts.join("/");
  const expected = release.manifest.search.files.find((file) => file.path === key);
  if (!expected) return new Response("搜索文件不存在", { status: 404 });

  const root = e2eMode()
    ? path.join(process.cwd(), ".generated", "candidate", "pagefind")
    : path.join(process.cwd(), "server-assets", "pagefind", version);
  const filePath = path.join(root, ...parts);
  try {
    const body = await readRegularFile(root, filePath);
    if (body.length !== expected.bytes || createHash("sha256").update(body).digest("hex") !== expected.checksum) return new Response("搜索文件不存在", { status: 404 });
    return new Response(body, {
      headers: {
        "Content-Type": contentTypes[path.extname(key)] ?? "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-SHA256": expected.checksum,
      },
    });
  } catch {
    return new Response("搜索文件不存在", { status: 404 });
  }
}
