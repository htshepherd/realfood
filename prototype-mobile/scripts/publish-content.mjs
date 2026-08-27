import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const candidateRoot = path.join(appRoot, ".generated", "candidate");
const releaseSource = path.join(candidateRoot, "release.json");

await fs.access(releaseSource);
console.log(await fs.readFile(path.join(candidateRoot, "report.md"), "utf8"));

if (!process.argv.includes("--confirm")) {
  throw new Error("发布会切换当前知识版本；请使用 --confirm 明确确认发布。");
}

const release = JSON.parse(await fs.readFile(releaseSource, "utf8"));
const activeDataRoot = path.join(appRoot, "src", "data");
const privatePagefindRoot = path.join(appRoot, "server-assets", "pagefind", release.manifest.version);
const releaseHistoryRoot = path.join(appRoot, "server-assets", "releases");

await Promise.all([fs.mkdir(activeDataRoot, { recursive: true }), fs.mkdir(releaseHistoryRoot, { recursive: true })]);
try {
  const existing = JSON.parse(await fs.readFile(path.join(releaseHistoryRoot, `${release.manifest.version}.json`), "utf8"));
  if (existing.manifest.checksum !== release.manifest.checksum) {
    throw new Error(`版本 ${release.manifest.version} 已存在但内容不同；必须改变知识内容或构建架构版本，不能覆盖不可变版本`);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const stagingPagefind = `${privatePagefindRoot}.next`;
await fs.rm(stagingPagefind, { recursive: true, force: true });
await fs.cp(path.join(candidateRoot, "pagefind"), stagingPagefind, { recursive: true });
const pagefindVersionsRoot = path.dirname(privatePagefindRoot);
await fs.mkdir(pagefindVersionsRoot, { recursive: true });
await fs.rm(privatePagefindRoot, { recursive: true, force: true });
await fs.rename(stagingPagefind, privatePagefindRoot);

const versions = await Promise.all((await fs.readdir(pagefindVersionsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.endsWith(".next"))
  .map(async (entry) => ({ name: entry.name, mtime: (await fs.stat(path.join(pagefindVersionsRoot, entry.name))).mtimeMs })));
for (const old of versions.sort((a, b) => b.mtime - a.mtime).slice(2)) {
  await fs.rm(path.join(pagefindVersionsRoot, old.name), { recursive: true, force: true });
}

const activeStaging = path.join(activeDataRoot, "release.json.next");
await fs.copyFile(releaseSource, activeStaging);
await fs.rename(activeStaging, path.join(activeDataRoot, "release.json"));
await fs.copyFile(releaseSource, path.join(releaseHistoryRoot, `${release.manifest.version}.json`));
const releases = await Promise.all((await fs.readdir(releaseHistoryRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map(async (entry) => ({ name: entry.name, mtime: (await fs.stat(path.join(releaseHistoryRoot, entry.name))).mtimeMs })));
for (const old of releases.sort((a, b) => b.mtime - a.mtime).slice(2)) await fs.rm(path.join(releaseHistoryRoot, old.name));
await fs.copyFile(path.join(candidateRoot, "assets.json"), path.join(appRoot, ".generated", "published-assets.json"));
await fs.appendFile(path.join(appRoot, ".generated", "publish-log.ndjson"), `${JSON.stringify({ version: release.manifest.version, publishedAt: new Date().toISOString() })}\n`);

console.log(`知识版本已发布：${release.manifest.version}`);
