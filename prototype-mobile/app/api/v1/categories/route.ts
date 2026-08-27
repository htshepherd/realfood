import { privateJson, requireSession } from "@/src/server/auth";
import { primaryKnowledge, release } from "@/src/server/release";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const grouped = new Map<string, Map<string, number>>();
  for (const item of primaryKnowledge) {
    const categories = grouped.get(item.collection) ?? new Map<string, number>();
    categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
    grouped.set(item.collection, categories);
  }
  return privateJson({
    version: release.manifest.version,
    collections: [...grouped].map(([collection, categories]) => ({
      collection,
      categories: [...categories].map(([name, count]) => ({ name, count })),
    })),
  });
}
