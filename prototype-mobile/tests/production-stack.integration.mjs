import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(import.meta.dirname, "..");

for (const name of ["STACK_BASE_URL", "STACK_ACCOUNT_A_JSON", "STACK_ACCOUNT_B_JSON", "DATABASE_URL"]) {
  if (!process.env[name]) throw new Error(`缺少 ${name}；此验收只针对隔离的 PostgreSQL + MinIO 测试栈`);
}
const baseUrl = process.env.STACK_BASE_URL.replace(/\/$/, "");
const accountA = JSON.parse(process.env.STACK_ACCOUNT_A_JSON);
const accountB = JSON.parse(process.env.STACK_ACCOUNT_B_JSON);

async function signIn(account) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: account.username, password: account.password, deviceName: "stack-acceptance" }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function request(pathname, cookie, init = {}) {
  return fetch(`${baseUrl}${pathname}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookie, ...init.headers } });
}

const cookieA = await signIn(accountA);
const cookieB = await signIn(accountB);
assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
assert.equal((await fetch(`${baseUrl}/api/internal/readiness`)).status, 404);
const oversized = JSON.stringify({ username: accountA.username, password: "x".repeat(17_000) });
assert.equal((await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: oversized })).status, 413);
const chunkedBody = new ReadableStream({
  start(controller) {
    const bytes = new TextEncoder().encode(oversized);
    for (let offset = 0; offset < bytes.length; offset += 1_024) controller.enqueue(bytes.slice(offset, offset + 1_024));
    controller.close();
  },
});
assert.equal((await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: chunkedBody, duplex: "half" })).status, 413);
const releaseResponse = await request("/api/v1/releases/current", cookieA);
assert.equal(releaseResponse.status, 200);
const release = await releaseResponse.json();
assert.equal(release.manifest.counts.primary, 190);

const objectId = "nutrients/vitamin-c";
const operation = { objectId, favorite: true, updatedAt: new Date().toISOString() };
assert.equal((await request("/api/v1/favorites", cookieA, { method: "PUT", body: JSON.stringify({ ...operation, padding: "x".repeat(17_000) }) })).status, 413);
for (let index = 0; index < 2; index += 1) {
  assert.equal((await request("/api/v1/favorites", cookieA, { method: "PUT", body: JSON.stringify(operation) })).status, 200);
}
assert.ok((await (await request("/api/v1/favorites", cookieA)).json()).items.some((item) => item.objectId === objectId && !item.deleted));
assert.ok(!(await (await request("/api/v1/favorites", cookieB)).json()).items.some((item) => item.objectId === objectId && !item.deleted));

const imagePath = release.objects.find((item) => item.id === objectId).image;
const image = await request(imagePath, cookieA);
assert.equal(image.status, 200);
assert.match(image.headers.get("content-type") ?? "", /^image\/webp/);
assert.equal((await fetch(`${baseUrl}/knowledge-images/vitamin-c.png`)).status, 404);

const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
try {
  const accountRow = await database.query("SELECT id FROM accounts WHERE lower(username) = lower($1)", [accountA.username]);
  assert.equal(accountRow.rowCount, 1);
  const rows = await database.query("SELECT count(*)::int AS count FROM favorites WHERE account_id = $1 AND object_id = $2", [accountRow.rows[0].id, objectId]);
  assert.equal(rows.rows[0].count, 1);
  await execFileAsync(process.execPath, ["scripts/manage-account.mjs", "disable", accountA.username], { cwd: appRoot, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL } });
  assert.equal((await request("/api/v1/auth/me", cookieA)).status, 401);
} finally {
  await execFileAsync(process.execPath, ["scripts/manage-account.mjs", "enable", accountA.username], { cwd: appRoot, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL } });
  await database.end();
}

assert.equal((await request("/api/v1/auth/me", cookieA)).status, 401, "重新启用不能恢复停用前的会话");
assert.ok(await signIn(accountA), "重新启用后允许签发新会话");

console.log("真实 PostgreSQL、会话隔离、停用账号、收藏幂等与私有 MinIO 验收通过。");
