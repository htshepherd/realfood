import { privateJson, requireSession } from "@/src/server/auth";
import { release } from "@/src/server/release";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  return privateJson({
    api: "realfood Knowledge API",
    version: "v1",
    knowledgeVersion: release.manifest.version,
    endpoints: {
      release: "/api/v1/releases/current",
      list: "/api/v1/knowledge?collection=食物&category=鱼、贝类及其制品",
      detail: "/api/v1/knowledge/{collection}/{slug}",
      categories: "/api/v1/categories",
      topics: "/api/v1/topics",
      relations: "/api/v1/relations?foodId=foods/三文鱼",
      offlinePackage: "/api/v1/offline-package",
      verification: "/api/v1/verification",
      favorites: "/api/v1/favorites",
    },
  });
}
