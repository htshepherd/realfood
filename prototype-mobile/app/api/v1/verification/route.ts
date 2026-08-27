import { privateJson, requireSession } from "@/src/server/auth";
import { release } from "@/src/server/release";

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  return privateJson({
    references: release.objects.filter((item) => item.surface === "capability-only"),
    marks: release.objects.find((item) => item.title === "第三方验证标志")?.verificationMarks ?? [],
  });
}
