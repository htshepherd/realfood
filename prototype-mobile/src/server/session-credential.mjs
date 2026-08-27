import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const encode = (value) => Buffer.from(value).toString("base64url");

export function createSessionCredential(secret) {
  const token = encode(randomBytes(32));
  const signature = createHmac("sha256", secret).update(token).digest("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    cookieValue: `${token}.${signature}`,
  };
}

export function verifySignedSession(value, secret) {
  const [token, signature, extra] = String(value ?? "").split(".");
  if (!token || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(token).digest();
  let actual;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? token : null;
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
