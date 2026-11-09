// The destiny.gg emote catalogue, for telling emotes from words in chat. Read
// from the CDN (the same one the page's emotes.css comes from), refreshed every
// 12 hours. If it can't be read, nothing counts as an emote until it can.
// After dgg-radio's src/server/dgg-emotes.ts.
import { z } from "zod";

const MANIFEST_URL = "https://r2cdn.destiny.gg/emotes/emotes.json";
const TTL_MS = 12 * 60 * 60 * 1000;

const manifestSchema = z.array(
  z.object({
    prefix: z.string().min(1),
    twitch: z.boolean().default(false),
    minimumSubTier: z.number().int().default(0),
  }),
);

/** Emote name to the sub tier it needs. */
export type EmoteCatalogue = Map<string, number>;

export function buildCatalogue(manifest: unknown): EmoteCatalogue {
  return new Map(
    manifestSchema
      .parse(manifest)
      .filter((e) => !e.twitch)
      .map((e) => [e.prefix, e.minimumSubTier]),
  );
}

let catalogue: EmoteCatalogue | null = null;
let loadedAt = 0;

export async function emoteCatalogue(): Promise<EmoteCatalogue | null> {
  if (catalogue && Date.now() - loadedAt < TTL_MS) return catalogue;
  try {
    const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`emotes.json answered ${res.status}`);
    catalogue = buildCatalogue(await res.json());
    loadedAt = Date.now();
  } catch (error) {
    console.warn("Couldn't read the destiny.gg emote list:", error);
  }
  return catalogue;
}
