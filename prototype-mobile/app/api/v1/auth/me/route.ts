import { currentSession, privateJson } from "@/src/server/auth";

export async function GET() {
  const session = await currentSession();
  return session
    ? privateJson({ account: { id: session.accountId, username: session.username, displayName: session.displayName } })
    : privateJson({ error: "需要登录" }, { status: 401 });
}
