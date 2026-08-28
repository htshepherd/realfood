import assert from "node:assert/strict";
import test from "node:test";

import { JsonBodyTooLargeError, readJsonBody } from "../src/server/request-json.mjs";

test("JSON 请求体在固定长度或分块流超过 16 KiB 时于解析前拒绝", async () => {
  const oversized = JSON.stringify({ padding: "x".repeat(16 * 1024) });
  const fixedLength = new Request("https://realfood.test/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(oversized)) },
    body: oversized,
  });
  await assert.rejects(readJsonBody(fixedLength), JsonBodyTooLargeError);

  const encoder = new TextEncoder();
  const first = encoder.encode('{"padding":"');
  const second = encoder.encode(`${"x".repeat(16 * 1024)}"}`);
  const chunked = new Request("https://realfood.test/api/v1/favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    duplex: "half",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(first);
        controller.enqueue(second);
        controller.close();
      },
    }),
  });
  await assert.rejects(readJsonBody(chunked), JsonBodyTooLargeError);
});

test("限额内的 JSON 请求体按原有对象契约解析", async () => {
  const request = new Request("https://realfood.test/api/v1/favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectId: "nutrients/vitamin-c", favorite: true }),
  });
  assert.deepEqual(await readJsonBody(request), { objectId: "nutrients/vitamin-c", favorite: true });
});
