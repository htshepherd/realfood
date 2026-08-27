import { promises as fs } from "node:fs";
import path from "node:path";

import { requireSession } from "@/src/server/auth";
import { release } from "@/src/server/release";

const contentTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

export async function GET(_request: Request, context: { params: Promise<{ version: string; key: string[] }> }) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const { version, key: parts } = await context.params;
  if (version !== release.manifest.version || parts.some((part) => !part || part === "." || part === "..")) {
    return new Response("搜索版本不存在", { status: 404 });
  }
  const key = parts.join("/");
  const expected = release.manifest.search.files.find((file) => file.path === key);
  if (!expected) return new Response("搜索文件不存在", { status: 404 });

  const root = path.join(process.cwd(), "server-assets", "pagefind", version);
  const filePath = path.join(root, ...parts);
  if (!filePath.startsWith(`${root}${path.sep}`)) return new Response("无效路径", { status: 400 });
  try {
    return new Response(await fs.readFile(filePath), {
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
