import { verifySession } from "@/lib/auth";
import { getUser } from "@/lib/data/driver";
import type { API } from "@/lib/types";

export async function me(req: Bun.BunRequest) {
  const token = req.cookies.get("session");
  if (!token) {
    return new Response(null, { status: 401 });
  }

  const session = await verifySession(token);
  if (session === null) {
    return new Response(null, { status: 401 });
  }

  const user = await getUser(session.uid);
  if (!user) {
    return new Response(null, { status: 400 });
  }
  return Response.json({ ...session, name: user.name } satisfies API.GET_Me);
}
