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

const CSS_URL = "https://r2cdn.destiny.gg/emotes/emotes.css";
let combos: string[] | null = null;
let combosAt = 0;

/**
 * Emotes whose look depends on the emotes beside them in a message: destiny.gg's
 * emotes.css has rules for them next to another (`.emote.GIGACHAD + .emote.BLADE`),
 * first or last in a message, or followed by one (`:has(+ .emote)`). Worked
 * out from the stylesheet, so new ones count as they're added.
 */
export function combiningEmotes(css: string): string[] {
  const names = new Set<string>();
  for (const [, selectors] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)) {
    for (const part of selectors!.split(",")) {
      if (!part.includes("+") && !/:(first|last|nth)-(of-type|child)|:has\(/.test(part)) continue;
      for (const [, name] of part.matchAll(/\.emote\.([A-Za-z0-9_]+)/g)) names.add(name!);
    }
  }
  return [...names].sort();
}

export async function emoteCombos(): Promise<string[]> {
  if (combos && Date.now() - combosAt < TTL_MS) return combos;
  try {
    const res = await fetch(CSS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`emotes.css answered ${res.status}`);
    combos = combiningEmotes(await res.text());
    combosAt = Date.now();
  } catch (error) {
    console.warn("Couldn't read destiny.gg's emotes.css:", error);
  }
  return combos ?? [];
}
