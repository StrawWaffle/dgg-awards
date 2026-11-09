import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createSession, sha256hex, verifySession } from "@/lib/auth";
import {
  deleteSession,
  deleteState,
  getUser,
  getVerifier,
  insertState,
  insertUser,
  setUserAdmin,
  getConfig,
} from "@/lib/data/driver";
import { buildUrl, env } from "@/lib/util";
import type {
  DggApiUserinfoResponse,
  DggOauthTokenRequest,
  DggOauthTokenResponse,
} from "@/lib/types";
import { SESSION_COOKIE, requireSession } from "@/server/middleware";
import { type DggProfile, fetchDggProfile } from "@/server/dgg-profile";

/** Signed-in people's own destiny.gg profiles, kept 10 minutes. */
const profiles = new Map<string, { at: number; profile: DggProfile | null }>();

const client_id = env("DGG_CLIENT_ID");
const client_secret = env("DGG_CLIENT_SECRET");
const redirect_uri = env("DGG_REDIRECT");
const dgg_origin = env("DGG_ORIGIN", "https://www.destiny.gg");
// Where the browser is sent to sign in. Differs from DGG_ORIGIN only when the
// server reaches the provider at another address, e.g. the dev/dgg-oauth
// stand-in inside Docker.
const authorize_origin = env("DGG_AUTHORIZE_ORIGIN", dgg_origin);
// Comma-separated DGG usernames that become admins when they sign in.
export const adminUsernames = new Set(
  env("ADMIN_USERNAMES", "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
);

const sessionCookie = {
  httpOnly: true,
  path: "/",
  sameSite: "Lax",
  secure: process.env.NODE_ENV === "production",
} as const;

function errorRedirect(message: string) {
  return new Response(null, {
    status: 302,
    headers: [["Location", `/error?error=${encodeURIComponent(btoa(message))}`]],
  });
}

/**
 * Where to go after signing in: a path on this site, or the front page.
 * Anything that could leave the site ("//evil.example", "https://…", "/\\…")
 * is refused, so the parameter can't be used for an open redirect.
 */
export function safeNext(next: string | undefined | null): string {
  if (!next || next.length > 512) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\\]/.test(next)) return "/";
  return next;
}
const NEXT_COOKIE = "next";

export const authRoutes = new Hono()
  .get("/signin", async (c) => {
    const state = crypto.getRandomValues(new Uint8Array(16)).toHex();
    const verifier = crypto.getRandomValues(new Uint8Array(32)).toHex();

    // destiny.gg's challenge is not PKCE: base64(sha256hex(verifier + sha256hex(secret))).
    const secret = sha256hex(client_secret);
    const code_challenge = btoa(sha256hex(verifier + secret));

    setCookie(c, "state", state, { path: "/", sameSite: "Lax" });
    // Back to the page that sent you here (?next=/admin), once signed in.
    setCookie(c, NEXT_COOKIE, safeNext(c.req.query("next")), { path: "/", sameSite: "Lax", httpOnly: true, maxAge: 600 });
    await insertState({ id: state, verifier });

    return c.redirect(
      buildUrl(authorize_origin, "/oauth/authorize", {
        response_type: "code",
        client_id,
        redirect_uri,
        state,
        code_challenge,
        code_challenge_method: "S256",
      }),
      302,
    );
  })

  .get("/oauth", async (c) => {
    const cookieState = getCookie(c, "state");
    if (!cookieState) {
      return errorRedirect("State mismatch. Please try again.");
    }

    const state = c.req.query("state");
    const code = c.req.query("code");
    if (!state || !code) {
      return errorRedirect("You canceled the oauth flow.");
    }
    if (cookieState !== state) {
      return errorRedirect("State mismatch. Please try again.");
    }

    const verifier = await getVerifier(cookieState);
    if (!verifier) {
      return errorRedirect("State mismatch. Please try again.");
    }

    const oauthParams: DggOauthTokenRequest = {
      grant_type: "authorization_code",
      code,
      client_id,
      redirect_uri,
      code_verifier: verifier,
    };
    const oauthResponse = await fetch(
      buildUrl(dgg_origin, "/oauth/token", oauthParams),
    );
    if (!oauthResponse.ok) {
      return errorRedirect(
        "It seems your login token from destiny.gg has expired. Please try again.",
      );
    }

    await deleteState(state);
    const oauthData: DggOauthTokenResponse = await oauthResponse.json();
    if ("error" in oauthData) {
      console.error(
        `OAuth error: destiny.gg returned error in token response: ${JSON.stringify(oauthData)}`,
      );
      return errorRedirect(
        "We encountered an issue while asking destiny.gg for your login information. Please try again. If this problem persists contact @defeten on Discord.",
      );
    }

    const userInfoResponse = await fetch(
      buildUrl(dgg_origin, "/api/userinfo", { token: oauthData.access_token }),
    );
    if (!userInfoResponse.ok) {
      console.error(
        `Failed to fetch user info from destiny.gg: ${userInfoResponse.status} ${userInfoResponse.statusText}`,
      );
      return errorRedirect(
        "We encountered an issue while asking destiny.gg for your account information. Please try again. If this problem persists contact @defeten on Discord.",
      );
    }

    const userInfo: DggApiUserinfoResponse = await userInfoResponse.json();
    const existing = await getUser(userInfo.userId);
    if (existing === undefined) {
      await insertUser({
        name: userInfo.nick,
        uid: userInfo.userId,
        createdDate: userInfo.createdDate,
        admin: false,
      });
    }
    if (!existing?.admin && adminUsernames.has(userInfo.nick.toLowerCase())) {
      await setUserAdmin(userInfo.userId, true);
    }

    // Kept only when switched on in Settings (both off since 2026-11-09).
    // The address is Cloudflare's header; "Unknown" when not behind the tunnel.
    const { recordIp, recordAgent } = await getConfig();
    const ip = recordIp === "on" ? (c.req.header("CF-Connecting-IP") ?? "Unknown") : null;
    const agent = recordAgent === "on" ? (c.req.header("User-Agent") ?? "Unknown device") : "";

    const session = await createSession(userInfo.userId, ip, agent);
    setCookie(c, SESSION_COOKIE, session, { ...sessionCookie, maxAge: 604800 });
    const next = safeNext(getCookie(c, NEXT_COOKIE));
    deleteCookie(c, NEXT_COOKIE, { path: "/" });
    return c.redirect(next, 302);
  })

  .post("/signout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const session = await verifySession(token);
      if (session) {
        await deleteSession(session.id);
      }
    }
    deleteCookie(c, SESSION_COOKIE, sessionCookie);
    return c.redirect("/", 302);
  })

  .get("/api/me", requireSession, async (c) => {
    const session = c.get("session");
    const user = await getUser(session.uid);
    if (!user) {
      return c.body(null, 400);
    }
    return c.json({ ...session, name: user.name, admin: user.admin }, 200);
  })

  /**
   * Your own destiny.gg profile (the public profile page: picture, subscriber
   * tier, team, member since), for the site's header. Null if destiny.gg has
   * none or can't be reached.
   */
  .get("/api/me/profile", requireSession, async (c) => {
    const user = await getUser(c.get("session").uid);
    if (!user) return c.body(null, 400);
    const cached = profiles.get(user.name);
    if (cached && Date.now() - cached.at < 10 * 60_000) return c.json({ profile: cached.profile }, 200);
    let profile: DggProfile | null = null;
    try {
      profile = await fetchDggProfile(user.name);
    } catch (error) {
      console.error("destiny.gg profile:", (error as Error).message);
    }
    profiles.set(user.name, { at: Date.now(), profile });
    return c.json({ profile }, 200);
  });
