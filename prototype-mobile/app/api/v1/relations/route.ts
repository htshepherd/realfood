import { privateJson, requireSession } from "@/src/server/auth";
import { primaryKnowledge, release } from "@/src/server/release";

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  const foodId = params.get("foodId");
  const knowledgeId = params.get("knowledgeId");
  const relations = primaryKnowledge
    .filter((item) => item.collection === "食物")
    .flatMap((food) => (food.food?.relations ?? []).map((relation) => {
      const target = primaryKnowledge.find((item) => item.title === relation.title);
      return { foodId: food.id, foodTitle: food.title, knowledgeId: target?.id ?? null, knowledgeTitle: relation.title };
    }))
    .filter((relation) => (!foodId || relation.foodId === foodId) && (!knowledgeId || relation.knowledgeId === knowledgeId));
  return privateJson({ version: release.manifest.version, relations });
}
