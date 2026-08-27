import pg from "pg";

import { hashPassword } from "../src/server/password.mjs";

if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");
const accounts = JSON.parse(process.env.SEED_ACCOUNTS_JSON ?? "[]");
if (!Array.isArray(accounts) || accounts.length === 0) {
  throw new Error('SEED_ACCOUNTS_JSON 应为非空数组，例如 [{"username":"admin","displayName":"管理员","password":"999999"}]');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const account of accounts) {
    if (!account.username || !account.displayName || !account.password) throw new Error("每个固定账号都需要 username、displayName、password");
    const passwordHash = await hashPassword(account.password);
    await client.query(`
      INSERT INTO accounts (username, display_name, password_hash)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO UPDATE SET
        display_name = excluded.display_name,
        password_hash = excluded.password_hash,
        password_version = accounts.password_version + 1,
        enabled = true,
        updated_at = now()
    `, [account.username, account.displayName, passwordHash]);
  }
  console.log(`已配置 ${accounts.length} 个固定账号；旧设备凭据将在下次联网时失效。`);
} finally {
  await client.end();
}
