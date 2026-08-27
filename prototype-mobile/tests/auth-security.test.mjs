import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../src/server/password.mjs";
import { createSessionCredential, verifySignedSession } from "../src/server/session-credential.mjs";

test("密码仅以带盐摘要验证", async () => {
  const encoded = await hashPassword("family-secret-42");
  assert.doesNotMatch(encoded, /family-secret-42/);
  assert.equal(await verifyPassword("family-secret-42", encoded), true);
  assert.equal(await verifyPassword("wrong-secret", encoded), false);
});

test("可信设备凭据可验签且篡改后失效", () => {
  const session = createSessionCredential("test-signing-secret");
  assert.equal(verifySignedSession(session.cookieValue, "test-signing-secret"), session.token);
  assert.equal(verifySignedSession(`${session.cookieValue}x`, "test-signing-secret"), null);
  assert.equal(session.tokenHash.length, 64);
});
