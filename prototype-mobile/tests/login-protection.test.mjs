import assert from "node:assert/strict";
import test from "node:test";

import {
  PasswordVerificationBusyError,
  SourceAttemptLimiter,
  VerificationGate,
  effectiveClientAddress,
} from "../src/server/login-protection.mjs";

test("来源失败记录不会被成功登录清除，并在窗口结束后失效", () => {
  const limiter = new SourceAttemptLimiter({ maxAttempts: 2, windowMs: 1_000, maxKeys: 10 });
  limiter.recordFailure("203.0.113.9", 100);
  assert.equal(limiter.allowed("203.0.113.9", 200), true);
  limiter.recordFailure("203.0.113.9", 300);
  assert.equal(limiter.allowed("203.0.113.9", 400), false);
  limiter.recordSuccess("203.0.113.9", 500);
  assert.equal(limiter.allowed("203.0.113.9", 600), false);
  assert.equal(limiter.allowed("203.0.113.9", 1_301), true);
});

test("来源限制器清理过期记录并限制地址键数量", () => {
  const limiter = new SourceAttemptLimiter({ maxAttempts: 10, windowMs: 100, maxKeys: 2 });
  limiter.recordFailure("198.51.100.1", 0);
  limiter.recordFailure("198.51.100.2", 1);
  limiter.recordFailure("198.51.100.3", 2);
  assert.equal(limiter.size, 2);
  limiter.recordFailure("198.51.100.4", 200);
  assert.equal(limiter.size, 1);
});

test("只信任反向代理建立的客户端地址头", () => {
  const request = new Request("https://realfood.test/api/v1/auth/login", {
    headers: {
      "X-Forwarded-For": "attacker.example, 192.0.2.8",
      "X-Realfood-Client-IP": "192.0.2.8",
    },
  });
  assert.equal(effectiveClientAddress(request), "192.0.2.8");
});

test("密码验证并发达到上限时快速拒绝额外工作", async () => {
  const gate = new VerificationGate(1);
  let release;
  const pending = gate.run(() => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(gate.run(async () => true), PasswordVerificationBusyError);
  release(true);
  assert.equal(await pending, true);
  assert.equal(await gate.run(async () => "next"), "next");
});
