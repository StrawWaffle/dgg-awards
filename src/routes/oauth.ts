import { createSession } from "@/lib/auth";
import {
  deleteState,
  getUser,
  getVerifier,
  insertUser,
  updateUserMakeAdmin,
} from "@/lib/data/driver";
import { buildUrl, env } from "@/lib/util";
import type {
  DggApiUserinfoResponse,
  DggOauthTokenRequest,
  DggOauthTokenResponse,
} from "@/lib/types";

function errorRedirect(message: string) {
  return new Response(null, {
    status: 302,
    headers: [
      ["Location", `/error?error=${encodeURIComponent(btoa(message))}`],
    ],
  });
}

const client_id = env("DGG_CLIENT_ID");
const redirect_uri = env("DGG_REDIRECT");
const dgg_origin = env("DGG_ORIGIN", "https://www.destiny.gg");
// Comma-separated DGG usernames that become admins when they sign in.
const adminUsernames = new Set(
  env("ADMIN_USERNAMES", "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
);

export async function oauth(req: Bun.BunRequest) {
  const cookieState = req.cookies.get("state");
  if (!cookieState) {
    return errorRedirect("State mismatch. Please try again.");
  }

  const urlParams = new URL(req.url).searchParams;
  const state = urlParams.get("state");
  const code = urlParams.get("code");
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

  if (oauthResponse.ok) {
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
      buildUrl(dgg_origin, "/api/userinfo", {
        token: oauthData.access_token,
      }),
    );

    if (userInfoResponse.ok) {
      const userInfoData: DggApiUserinfoResponse =
        await userInfoResponse.json();

      const possibleUser = await getUser(userInfoData.userId);
      if (possibleUser === undefined) {
        await insertUser({
          name: userInfoData.nick,
          uid: userInfoData.userId,
          createdDate: userInfoData.createdDate,
          admin: false,
        });
      }
      if (
        !possibleUser?.admin &&
        adminUsernames.has(userInfoData.nick.toLowerCase())
      ) {
        await updateUserMakeAdmin(userInfoData.userId);
      }

      // This uses cloudflare's ip header
      const ip = req.headers.get("CF-Connecting-IP") ?? "Unknown";
      const agent = req.headers.get("User-Agent") ?? "Unknown device";

      const session = await createSession(userInfoData.userId, ip, agent);
      req.cookies.set("session", session, {
        httpOnly: true,
        maxAge: 604800,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return new Response(null, { status: 302, headers: [["Location", "/"]] });
    } else {
      console.error(
        `Failed to fetch user info from destiny.gg: ${userInfoResponse.status} ${userInfoResponse.statusText}`,
      );
      return errorRedirect(
        "We encountered an issue while asking destiny.gg for your account information. Please try again. If this problem persists contact @defeten on Discord.",
      );
    }
  } else {
    return errorRedirect(
      "It seems your login token from destiny.gg has expired. Please try again.",
    );
  }
}
