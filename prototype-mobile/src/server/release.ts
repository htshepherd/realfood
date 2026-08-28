import { readFileSync } from "node:fs";
import path from "node:path";

import activeRelease from "@/src/data/release.json";
import { e2eMode } from "@/src/server/e2e-mode";

type ExploreProjection = {
  defaultGroup: string;
  defaultTopic: string;
  groups: { name: string; topics: { name: string; count: number; objectIds: string[] }[] }[];
};
type ReleaseData = typeof activeRelease & { explore?: ExploreProjection };

const releaseData = (e2eMode()
  ? JSON.parse(readFileSync(path.join(process.cwd(), ".generated", "candidate", "release.json"), "utf8"))
  : activeRelease) as unknown as ReleaseData;

export type KnowledgeObject = (typeof releaseData.objects)[number];
export const release = releaseData;
export const primaryKnowledge = releaseData.objects.filter((item) => item.surface === "primary");

export function getKnowledgeObject(collection: string, slug: string) {
  return releaseData.objects.find((item) => item.id === `${collection}/${slug}` && item.surface === "primary") ?? null;
}
