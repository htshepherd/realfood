import { cookies } from "next/headers";

import { SESSION_COOKIE, getSigningSecret, privateJson } from "@/src/server/auth";
import { query } from "@/src/server/db";
import { deleteE2ESession, e2eMode } from "@/src/server/e2e-mode";
import { hashSessionToken, verifySignedSession } from "@/src/server/session-credential.mjs";

export async function POST() {
  const store = await cookies();
  const token = verifySignedSession(store.get(SESSION_COOKIE)?.value, getSigningSecret());
  if (token && e2eMode()) deleteE2ESession(hashSessionToken(token));
  else if (token) await query("DELETE FROM trusted_devices WHERE token_hash = $1", [hashSessionToken(token)]);
  store.delete(SESSION_COOKIE);
  return privateJson({ ok: true });
}
