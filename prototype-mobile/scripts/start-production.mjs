const required = ["DATABASE_URL", "SESSION_SIGNING_SECRET", "MINIO_ENDPOINT", "MINIO_BUCKET", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`生产配置不完整：${missing.join(", ")}`);
if (process.env.SESSION_SIGNING_SECRET.length < 24) throw new Error("SESSION_SIGNING_SECRET 至少需要 24 个字符");
await import("../server.js");
