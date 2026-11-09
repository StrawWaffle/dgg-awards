import { verifySession } from "@/lib/auth";
import { deleteSession } from "@/lib/data/driver";

export async function signout(req: Bun.BunRequest) {
  const token = req.cookies.get("session");

  if (token) {
    const session = await verifySession(token);
    if (session) {
      await deleteSession(session.id);
    }
  }

  // Clear the session cookie
  req.cookies.set("session", "", {
    httpOnly: true,
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return new Response(null, { status: 302, headers: [["Location", "/"]] });
}

