import releaseData from "@/src/data/release.json";

export type KnowledgeObject = (typeof releaseData.objects)[number];
export const release = releaseData;
export const primaryKnowledge = releaseData.objects.filter((item) => item.surface === "primary");

export function getKnowledgeObject(collection: string, slug: string) {
  return releaseData.objects.find((item) => item.id === `${collection}/${slug}` && item.surface === "primary") ?? null;
}
