export const JSON_BODY_LIMIT_BYTES = 16 * 1024;

export class JsonBodyTooLargeError extends Error {
  constructor(limit = JSON_BODY_LIMIT_BYTES) {
    super(`JSON 请求体不能超过 ${limit} 字节`);
    this.name = "JsonBodyTooLargeError";
    this.limit = limit;
  }
}

export async function readJsonBody(request, limit = JSON_BODY_LIMIT_BYTES) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new JsonBodyTooLargeError(limit);
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new JsonBodyTooLargeError(limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
