import { privateJson, requireSession } from "@/src/server/auth";
import { query } from "@/src/server/db";
import { e2eFavorites, e2eMode } from "@/src/server/e2e-mode";
import { getKnowledgeObject } from "@/src/server/release";
import { JsonBodyTooLargeError, readJsonBody } from "@/src/server/request-json.mjs";

type FavoriteRow = { objectId: string; updatedAt: string; deleted: boolean };

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  if (e2eMode()) return privateJson({ items: [...e2eFavorites(session.accountId).values()] });
  const result = await query<FavoriteRow>(`
    SELECT object_id AS "objectId", updated_at AS "updatedAt", deleted
      FROM favorites WHERE account_id = $1
  `, [session.accountId]);
  return privateJson({ items: result.rows });
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  let body: { objectId?: string; favorite?: boolean; updatedAt?: string } | null = null;
  try { body = await readJsonBody(request); }
  catch (error) {
    if (error instanceof JsonBodyTooLargeError) return privateJson({ error: "请求内容过大" }, { status: 413 });
  }
  const objectId = body?.objectId?.trim();
  const [collection, ...slugParts] = objectId?.split("/") ?? [];
  if (!objectId || !getKnowledgeObject(collection, slugParts.join("/"))) {
    return privateJson({ error: "无效的知识对象" }, { status: 400 });
  }
  const updatedAt = body?.updatedAt && !Number.isNaN(Date.parse(body.updatedAt)) ? new Date(body.updatedAt) : new Date();
  if (e2eMode()) {
    const item = { objectId, updatedAt: updatedAt.toISOString(), deleted: body?.favorite === false };
    e2eFavorites(session.accountId).set(objectId, item);
    return privateJson({ item });
  }
  const result = await query<FavoriteRow>(`
    INSERT INTO favorites (account_id, object_id, updated_at, deleted)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (account_id, object_id) DO UPDATE SET
      updated_at = CASE WHEN favorites.updated_at <= excluded.updated_at THEN excluded.updated_at ELSE favorites.updated_at END,
      deleted = CASE WHEN favorites.updated_at <= excluded.updated_at THEN excluded.deleted ELSE favorites.deleted END
    RETURNING object_id AS "objectId", updated_at AS "updatedAt", deleted
  `, [session.accountId, objectId, updatedAt, body?.favorite === false]);
  return privateJson({ item: result.rows[0] });
}
