import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { verifyAdminSession, verifySession } from "@/lib/auth";
import type { Session } from "@/lib/types";

export { zValidator } from "@hono/zod-validator";

export const SESSION_COOKIE = "session";

export type SessionEnv = { Variables: { session: Session } };

/** 401 with no body unless the request has a valid session. */
export const requireSession = createMiddleware<SessionEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return c.body(null, 401);
  }
  c.set("session", session);
  await next();
});

/** 401 with no body unless the request has a valid admin session. */
export const requireAdmin = createMiddleware<SessionEnv>(async (c, next) => {
  const session = await verifyAdminSession(getCookie(c, SESSION_COOKIE));
  if (!session) {
    return c.body(null, 401);
  }
  c.set("session", session);
  await next();
});

/**
 * zValidator hook: invalid input gets a 400 with no body, the same answer the
 * hand-written checks gave. Pass as the third argument.
 */
export function rejectInvalid(result: { success: boolean }, c: Context) {
  if (!result.success) {
    return c.body(null, 400);
  }
}
