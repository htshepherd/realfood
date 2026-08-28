import { promises as fs } from "node:fs";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const databaseDirectory = path.resolve("db");
  const migrations = (await fs.readdir(databaseDirectory))
    .filter((name) => /^\d{3}-.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    const sql = await fs.readFile(path.join(databaseDirectory, migration), "utf8");
    await client.query(sql);
  }
  console.log("数据库结构已就绪");
} finally {
  await client.end();
}
