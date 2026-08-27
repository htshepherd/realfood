import { cookies } from "next/headers";

import { SESSION_COOKIE, getSigningSecret, privateJson } from "@/src/server/auth";
import { query } from "@/src/server/db";
import { e2eMode } from "@/src/server/e2e-mode";
import { hashSessionToken, verifySignedSession } from "@/src/server/session-credential.mjs";

export async function POST() {
  const store = await cookies();
  const token = verifySignedSession(store.get(SESSION_COOKIE)?.value, getSigningSecret());
  if (token && !e2eMode()) await query("DELETE FROM trusted_devices WHERE token_hash = $1", [hashSessionToken(token)]);
  store.delete(SESSION_COOKIE);
  return privateJson({ ok: true });
}
