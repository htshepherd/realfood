import { privateJson, requireSession } from "@/src/server/auth";
import { primaryKnowledge, release } from "@/src/server/release";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  if (!release.explore) {
    const topics = new Map<string, string[]>();
    for (const item of primaryKnowledge) {
      for (const tag of item.topicTags) topics.set(tag, [...(topics.get(tag) ?? []), item.id]);
    }
    return privateJson({ topics: [...topics].map(([name, objectIds]) => ({ name, count: objectIds.length, objectIds })) });
  }
  return privateJson({ version: release.manifest.version, ...release.explore });
}
