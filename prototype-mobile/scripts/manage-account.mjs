import pg from "pg";

import { hashPassword } from "../src/server/password.mjs";

if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");
const [action, username] = process.argv.slice(2);
if (!action || !username || !["disable", "enable", "rotate"].includes(action)) {
  throw new Error("用法：node scripts/manage-account.mjs <disable|enable|rotate> <username>");
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (action === "rotate") {
    if (!process.env.ACCOUNT_PASSWORD) throw new Error("rotate 需要通过 ACCOUNT_PASSWORD 提供新密码");
    const passwordHash = await hashPassword(process.env.ACCOUNT_PASSWORD);
    const result = await client.query(`
      UPDATE accounts
         SET password_hash = $2, password_version = password_version + 1,
             enabled = true, updated_at = now()
       WHERE lower(username) = lower($1)
       RETURNING username
    `, [username, passwordHash]);
    if (!result.rowCount) throw new Error(`账号不存在：${username}`);
  } else {
    const result = await client.query(`
      UPDATE accounts SET enabled = $2, updated_at = now()
       WHERE lower(username) = lower($1) RETURNING username
    `, [username, action === "enable"]);
    if (!result.rowCount) throw new Error(`账号不存在：${username}`);
  }
  console.log(`账号 ${username} 已${action === "disable" ? "停用" : action === "enable" ? "启用" : "轮换密码并启用"}。`);
} finally {
  await client.end();
}
