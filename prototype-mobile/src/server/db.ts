import { Pool, type QueryResultRow } from "pg";

const globalForDatabase = globalThis as typeof globalThis & { ihealthPool?: Pool };

function pool() {
  if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL，无法访问账户数据库");
  globalForDatabase.ihealthPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  });
  return globalForDatabase.ihealthPool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return pool().query<T>(text, values);
}
