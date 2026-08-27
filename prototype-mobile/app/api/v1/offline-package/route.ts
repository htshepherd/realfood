import { privateJson, requireSession } from "@/src/server/auth";
import { release } from "@/src/server/release";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  return privateJson({
    contract: "ihealth/offline-package@1",
    release,
    strategy: { knowledge: "indexeddb", search: "cache-storage", images: "on-demand" },
  });
}
