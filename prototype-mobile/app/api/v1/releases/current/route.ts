import { privateJson, requireSession } from "@/src/server/auth";
import { release } from "@/src/server/release";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  return privateJson(release);
}
