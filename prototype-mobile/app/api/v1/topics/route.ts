import { privateJson, requireSession } from "@/src/server/auth";
import { primaryKnowledge } from "@/src/server/release";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const map = new Map<string, string[]>();
  for (const item of primaryKnowledge) {
    for (const tag of item.topicTags) map.set(tag, [...(map.get(tag) ?? []), item.id]);
  }
  return privateJson({ topics: [...map].map(([name, objectIds]) => ({ name, count: objectIds.length, objectIds })) });
}
