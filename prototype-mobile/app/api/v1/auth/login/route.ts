import { cookies } from "next/headers";

import { SESSION_COOKIE, SESSION_DAYS, getSigningSecret, privateJson } from "@/src/server/auth";
import { query } from "@/src/server/db";
import { e2eMode } from "@/src/server/e2e-mode";
import { verifyPassword } from "@/src/server/password.mjs";
import { createSessionCredential } from "@/src/server/session-credential.mjs";

type AccountRow = { id: string; username: string; displayName: string; passwordHash: string; passwordVersion: number; enabled: boolean };
const attempts = globalThis as typeof globalThis & { ihealthLoginAttempts?: Map<string, { count: number; resetAt: number }> };

function allowAttempt(request: Request) {
  attempts.ihealthLoginAttempts ??= new Map();
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const state = attempts.ihealthLoginAttempts.get(key);
  if (!state || state.resetAt <= now) { attempts.ihealthLoginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 }); return { allowed: true, key }; }
  state.count += 1;
  return { allowed: state.count <= 10, key };
}

export async function POST(request: Request) {
  const rateLimit = allowAttempt(request);
  if (!rateLimit.allowed) return privateJson({ error: "尝试次数过多，请稍后再试" }, { status: 429, headers: { "Retry-After": "900" } });
  const body = await request.json().catch(() => null) as { username?: string; password?: string; deviceName?: string } | null;
  const username = body?.username?.trim();
  if (!username || !body?.password) return privateJson({ error: "请输入账号和密码" }, { status: 400 });

  if (e2eMode()) {
    if (username !== "admin" || body.password !== "999999") return privateJson({ error: "账号或密码不正确" }, { status: 401 });
    attempts.ihealthLoginAttempts?.delete(rateLimit.key);
    const credential = createSessionCredential(getSigningSecret());
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    (await cookies()).set(SESSION_COOKIE, credential.cookieValue, { httpOnly: true, sameSite: "strict", secure: false, path: "/", expires: expiresAt });
    return privateJson({ account: { id: "00000000-0000-0000-0000-000000000001", username: "admin", displayName: "管理员" } });
  }

  const result = await query<AccountRow>(`
    SELECT id, username, display_name AS "displayName", password_hash AS "passwordHash",
           password_version AS "passwordVersion", enabled
      FROM accounts WHERE lower(username) = lower($1) LIMIT 1
  `, [username]);
  const account = result.rows[0];
  if (!account?.enabled || !(await verifyPassword(body.password, account.passwordHash))) {
    return privateJson({ error: "账号或密码不正确" }, { status: 401 });
  }

  const credential = createSessionCredential(getSigningSecret());
  attempts.ihealthLoginAttempts?.delete(rateLimit.key);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(`
    INSERT INTO trusted_devices (account_id, token_hash, password_version, device_name, expires_at)
    VALUES ($1, $2, $3, $4, $5)
  `, [account.id, credential.tokenHash, account.passwordVersion, body.deviceName?.slice(0, 120) || "iPhone Safari", expiresAt]);

  (await cookies()).set(SESSION_COOKIE, credential.cookieValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  return privateJson({ account: { id: account.id, username: account.username, displayName: account.displayName } });
}
