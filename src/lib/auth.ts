import { CryptoHasher } from "bun";
import { getSession, getUser, insertSession } from "./data/driver";
import { env } from "@/lib/util";
import type { PublicSession, Session, User } from "@/lib/types";

const auth_secret = env("AUTH_SECRET");

export function sha256hex(s: string) {
  const hasher = new CryptoHasher("sha256");
  hasher.update(s);
  return hasher.digest("hex");
}

export async function createSession(
  uid: User["uid"],
  agent: string,
) {
  const now = new Date();
  const id = Bun.randomUUIDv7();

  const expiresAt = new Date(now.getTime() + 6.048e8); /** one week later */
  const session: Session = {
    id,
    createdAt: now,
    expiresAt,
    uid,
    agent,
  };
  const message = btoa(
    JSON.stringify({
      id: session.id,
      uid: session.uid,
    } satisfies PublicSession),
  );

  await insertSession(session);

  const hasher = new Bun.CryptoHasher("sha256", auth_secret);
  hasher.update(message);
  const signature = hasher.digest("base64");

  return `${message}.${signature}`;
}

export async function verifySession(token: string) {
  const now = new Date();
  const [messageFromToken, signatureFromToken] = decodeURIComponent(
    token,
  ).split(".", 2);

  if (!messageFromToken || !signatureFromToken) {
    return null;
  }

  try {
    const parsedMessageFromToken: PublicSession = JSON.parse(
      atob(messageFromToken),
    );

    const session = await getSession(parsedMessageFromToken.id);
    if (!session) {
      return null;
    }

    const hasher = new Bun.CryptoHasher("sha256", auth_secret);
    hasher.update(messageFromToken);
    const signature = hasher.digest("base64");

    const sigBuffer = Buffer.from(signature);
    const tokenSigBuffer = Buffer.from(signatureFromToken);
    if (
      sigBuffer.length !== tokenSigBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, tokenSigBuffer)
    ) {
      return null;
    }

    if (now > session.expiresAt) {
      return null;
    }

    return session;
  } catch (error) {
    return null;
  }
}

/** The session for a token, but only if its user is an admin. */
export async function verifyAdminSession(token: string | undefined) {
  if (!token) {
    return null;
  }

  const session = await verifySession(token);
  if (!session) {
    return null;
  }

  const user = await getUser(session.uid);
  if (!user?.admin) {
    return null;
  }

  return session;
}
