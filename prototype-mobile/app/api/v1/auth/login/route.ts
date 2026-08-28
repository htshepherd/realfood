import { cookies } from "next/headers";

import { SESSION_COOKIE, SESSION_DAYS, getSigningSecret, privateJson } from "@/src/server/auth";
import { query } from "@/src/server/db";
import { E2E_ACCOUNTS, e2eMode, registerE2ESession } from "@/src/server/e2e-mode";
import {
  DUMMY_PASSWORD_HASH,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  PasswordVerificationBusyError,
  SourceAttemptLimiter,
  VerificationGate,
  effectiveClientAddress,
} from "@/src/server/login-protection.mjs";
import { verifyPassword } from "@/src/server/password.mjs";
import { JsonBodyTooLargeError, readJsonBody } from "@/src/server/request-json.mjs";
import { createSessionCredential } from "@/src/server/session-credential.mjs";

type AccountRow = {
  id: string; username: string; displayName: string; passwordHash: string; passwordVersion: number; enabled: boolean;
  failedLoginCount: number; loginLockedUntil: string | null;
};
const protection = globalThis as typeof globalThis & {
  ihealthSourceLimiter?: SourceAttemptLimiter;
  ihealthVerificationGate?: VerificationGate;
};

function retryResponse() {
  return privateJson({ error: "尝试次数过多，请稍后再试" }, { status: 429, headers: { "Retry-After": "900" } });
}

async function recordAccountFailure(accountId: string) {
  await query(`
    WITH next AS (
      SELECT id,
             CASE WHEN login_locked_until IS NOT NULL AND login_locked_until <= now()
                  THEN 1 ELSE failed_login_count + 1 END AS failure_count
        FROM accounts WHERE id = $1
    )
    UPDATE accounts AS account
       SET failed_login_count = next.failure_count,
           login_locked_until = CASE WHEN next.failure_count >= $2
                                     THEN now() + ($3 * interval '1 millisecond')
                                     ELSE NULL END,
           updated_at = now()
      FROM next WHERE account.id = next.id
  `, [accountId, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS]);
}

export async function POST(request: Request) {
  let body: { username?: string; password?: string; deviceName?: string } | null = null;
  try { body = await readJsonBody(request); }
  catch (error) {
    if (error instanceof JsonBodyTooLargeError) return privateJson({ error: "请求内容过大" }, { status: 413 });
  }
  const username = body?.username?.trim();
  if (!username || !body?.password) return privateJson({ error: "请输入账号和密码" }, { status: 400 });

  if (e2eMode()) {
    const account = E2E_ACCOUNTS.find((candidate) => candidate.username === username && candidate.password === body.password);
    if (!account) return privateJson({ error: "账号或密码不正确" }, { status: 401 });
    const credential = createSessionCredential(getSigningSecret());
    registerE2ESession(credential.tokenHash, account);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    (await cookies()).set(SESSION_COOKIE, credential.cookieValue, { httpOnly: true, sameSite: "strict", secure: false, path: "/", expires: expiresAt });
    return privateJson({ account: { id: account.accountId, username: account.username, displayName: account.displayName } });
  }

  const result = await query<AccountRow>(`
    SELECT id, username, display_name AS "displayName", password_hash AS "passwordHash",
           password_version AS "passwordVersion", enabled,
           failed_login_count AS "failedLoginCount", login_locked_until AS "loginLockedUntil"
      FROM accounts WHERE lower(username) = lower($1) LIMIT 1
  `, [username]);
  const account = result.rows[0];
  const sourceKey = effectiveClientAddress(request);
  protection.ihealthSourceLimiter ??= new SourceAttemptLimiter();
  protection.ihealthVerificationGate ??= new VerificationGate(Number(process.env.PASSWORD_VERIFY_CONCURRENCY ?? 2));
  if (!protection.ihealthSourceLimiter.allowed(sourceKey)) return retryResponse();
  if (account?.loginLockedUntil && new Date(account.loginLockedUntil).getTime() > Date.now()) return retryResponse();

  let passwordMatches = false;
  try {
    passwordMatches = await protection.ihealthVerificationGate.run(() => verifyPassword(body.password!, account?.passwordHash ?? DUMMY_PASSWORD_HASH));
  } catch (error) {
    if (error instanceof PasswordVerificationBusyError) return privateJson({ error: "登录服务繁忙，请稍后再试" }, { status: 429, headers: { "Retry-After": "1" } });
    throw error;
  }
  if (!account?.enabled || !passwordMatches) {
    protection.ihealthSourceLimiter.recordFailure(sourceKey);
    if (account) await recordAccountFailure(account.id);
    return privateJson({ error: "账号或密码不正确" }, { status: 401 });
  }

  const credential = createSessionCredential(getSigningSecret());
  protection.ihealthSourceLimiter.recordSuccess(sourceKey);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query("UPDATE accounts SET failed_login_count = 0, login_locked_until = NULL, updated_at = now() WHERE id = $1", [account.id]);
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
