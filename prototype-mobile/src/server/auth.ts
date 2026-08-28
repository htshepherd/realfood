import { cookies } from "next/headers";

import { query } from "./db";
import { e2eMode, e2eSession } from "./e2e-mode";
import { hashSessionToken, verifySignedSession } from "./session-credential.mjs";

export const SESSION_COOKIE = "ihealth_session";
export const SESSION_DAYS = 180;

export type AccountSession = { accountId: string; username: string; displayName: string; deviceId: string };

function signingSecret() {
  const value = process.env.SESSION_SIGNING_SECRET;
  if (!value || value.length < 24) throw new Error("SESSION_SIGNING_SECRET 至少需要 24 个字符");
  return value;
}

export function getSigningSecret() { return signingSecret(); }

export async function currentSession(): Promise<AccountSession | null> {
  const credential = (await cookies()).get(SESSION_COOKIE)?.value;
  const token = verifySignedSession(credential, signingSecret());
  if (!token) return null;
  if (e2eMode()) {
    const session = e2eSession(hashSessionToken(token));
    return session ? { ...session, deviceId: "e2e-device" } : null;
  }
  const result = await query<AccountSession & { enabled: boolean }>(`
    SELECT a.id AS "accountId", a.username, a.display_name AS "displayName",
           d.id AS "deviceId", a.enabled
      FROM trusted_devices d
      JOIN accounts a ON a.id = d.account_id
     WHERE d.token_hash = $1
       AND d.expires_at > now()
       AND d.password_version = a.password_version
     LIMIT 1
  `, [hashSessionToken(token)]);
  const session = result.rows[0];
  if (!session?.enabled) return null;
  await query("UPDATE trusted_devices SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'", [session.deviceId]);
  return session;
}

export async function requireSession() {
  const session = await currentSession();
  return session ?? privateJson({ error: "需要登录" }, { status: 401 });
}

export function privateJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(data, { ...init, headers });
}
