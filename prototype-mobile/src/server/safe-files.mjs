import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\/]/u;

export function validatePathSegment(name) {
  if (!name || name !== name.normalize("NFC") || name === "." || name === ".." || UNSAFE_NAME.test(name)) {
    throw new Error(`不安全的文件名：${JSON.stringify(name)}`);
  }
}

function beneath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function canonicalDirectoryRoot(root) {
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`授权根必须是真实目录：${root}`);
  return fs.realpath(root);
}

export async function readRegularFile(root, filePath, { authorizationRoot = root } = {}) {
  const [canonicalAuthorizationRoot, canonicalRoot, stat] = await Promise.all([
    canonicalDirectoryRoot(authorizationRoot), canonicalDirectoryRoot(root), fs.lstat(filePath),
  ]);
  if (!beneath(canonicalAuthorizationRoot, canonicalRoot)) throw new Error(`读取根越过授权目录：${root}`);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`只允许普通文件：${filePath}`);
  if (stat.nlink > 1) throw new Error(`拒绝多重硬链接文件：${filePath}`);
  const canonicalFile = await fs.realpath(filePath);
  if (!beneath(canonicalRoot, canonicalFile)) throw new Error(`文件越过授权目录：${filePath}`);
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await fs.open(filePath, flags);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error(`文件在读取前发生变化：${filePath}`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export async function regularFiles(root, { skipTopLevel = [], authorizationRoot = root } = {}) {
  const [canonicalAuthorizationRoot, canonicalRoot] = await Promise.all([
    canonicalDirectoryRoot(authorizationRoot), canonicalDirectoryRoot(root),
  ]);
  if (!beneath(canonicalAuthorizationRoot, canonicalRoot)) throw new Error(`遍历根越过授权目录：${root}`);
  const result = [];
  async function visit(directory, depth) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      validatePathSegment(entry.name);
      const fullPath = path.join(directory, entry.name);
      const stat = await fs.lstat(fullPath);
      if (stat.isSymbolicLink()) throw new Error(`拒绝符号链接：${fullPath}`);
      const canonical = await fs.realpath(fullPath);
      if (!beneath(canonicalRoot, canonical)) throw new Error(`路径越过授权目录：${fullPath}`);
      if (depth === 0 && skipTopLevel.includes(entry.name)) {
        if (!stat.isDirectory()) throw new Error(`保留路径必须是目录：${fullPath}`);
        continue;
      }
      if (stat.isDirectory()) await visit(fullPath, depth + 1);
      else if (stat.isFile()) {
        if (stat.nlink > 1) throw new Error(`拒绝多重硬链接文件：${fullPath}`);
        result.push(fullPath);
      } else throw new Error(`拒绝特殊文件：${fullPath}`);
    }
  }
  await visit(root, 0);
  return result;
}

export function safeReportCode(value) {
  validatePathSegment(path.basename(value));
  const text = String(value);
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  return `${fence} ${text} ${fence}`;
}
