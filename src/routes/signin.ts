import { sha256hex } from "@/lib/auth";
import { insertState } from "@/lib/data/driver";
import { buildUrl, env } from "@/lib/util";

const client_id = env("DGG_CLIENT_ID");
const client_secret = env("DGG_CLIENT_SECRET");
const redirect_uri = env("DGG_REDIRECT");
const dgg_origin = env("DGG_ORIGIN", "https://www.destiny.gg");

export async function signin(req: Bun.BunRequest) {
  const state = crypto.getRandomValues(new Uint8Array(16)).toHex();
  const verifier = crypto.getRandomValues(new Uint8Array(32)).toHex();

  const secret = sha256hex(client_secret);
  const code_challenge = btoa(sha256hex(verifier + secret));

  req.cookies.set("state", state);
  await insertState({ id: state, verifier });

  const params = {
    response_type: "code",
    client_id,
    redirect_uri,
    state,
    code_challenge,
  };

  return Response.redirect(
    buildUrl(dgg_origin, "/oauth/authorize", params),
  );
}
