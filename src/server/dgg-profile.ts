// Reads a public destiny.gg profile ("membership card", destiny.gg/u/<name>)
// for chatter nominees. There's no API, so this parses the page by its
// id-card__* class names; if destiny.gg redesigns the card, parsing fails
// cleanly (null fields) instead of breaking the site.
//
// Only what a nominee card needs is kept: name, photo, sub tier, team, member
// since, bio and the hand-drawn signature. Nationality, gender and age are on
// the page too and deliberately not read.

export type DggProfile = {
  name: string;
  url: string;
  /** One of DGG's preset photos, on their CDN. */
  photoUrl: string | null;
  tier: string | null;
  team: string | null;
  /** As shown, e.g. "November 10, 2020". */
  memberSince: string | null;
  bio: string | null;
  /** The signature rebuilt as a standalone SVG from its stroke paths only. */
  signatureSvg: string | null;
};

export const DGG_NAME = /^[A-Za-z0-9_]{1,30}$/;

export function profileUrl(name: string, origin = "https://www.destiny.gg") {
  return `${origin}/u/${encodeURIComponent(name)}`;
}

/** Fetch and parse a profile. null when the user doesn't exist. */
export async function fetchDggProfile(
  name: string,
  origin = "https://www.destiny.gg",
): Promise<DggProfile | null> {
  if (!DGG_NAME.test(name)) return null;
  const url = profileUrl(name, origin);
  const res = await fetch(url, { headers: { "User-Agent": "dgg-awards" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`destiny.gg answered ${res.status} for ${url}`);
  return parseDggProfile(await res.text(), url);
}

/** Parse the profile page HTML. Exported for tests. */
export async function parseDggProfile(html: string, url: string): Promise<DggProfile | null> {
  const text: Record<string, string> = {};
  let photoUrl: string | null = null;
  const collect = (key: string) => ({
    text(chunk: { text: string }) {
      text[key] = (text[key] ?? "") + chunk.text;
    },
  });

  await new HTMLRewriter()
    .on("img.id-card__photo", {
      element(el) {
        photoUrl ??= el.getAttribute("src");
      },
    })
    .on(".id-card__name", collect("name"))
    .on(".id-card__tier .badge__text", collect("tier"))
    .on(".id-card__team .badge__text", collect("team"))
    .on(".id-card__since", collect("since"))
    .on(".id-card__bio-text", collect("bio"))
    .transform(new Response(html))
    .text();

  const clean = (s: string | undefined) => {
    const v = s?.replace(/\s+/g, " ").trim();
    return v ? decodeEntities(v) : null;
  };
  const name = clean(text.name);
  if (!name) return null; // not a profile page (or the layout changed)

  return {
    name,
    url,
    photoUrl: photoUrl && /^https:\/\/cdn\.destiny\.gg\//.test(photoUrl) ? photoUrl : null,
    tier: clean(text.tier),
    team: clean(text.team),
    memberSince: clean(text.since)?.replace(/^Member since\s*/i, "") ?? null,
    bio: clean(text.bio),
    signatureSvg: rebuildSignature(html),
  };
}

function decodeEntities(s: string) {
  return s
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The signature SVG comes from another site, and SVG can carry scripts, so
 * nothing of it is copied as-is: only the viewBox numbers and the path data
 * (checked to be plain path commands) go into a new SVG of our own.
 */
export function rebuildSignature(html: string): string | null {
  const svg = html.match(/<svg[^>]*class="id-card__signature-image"[^>]*>([\s\S]*?)<\/svg>/);
  if (!svg) return null;
  const viewBox = svg[0].match(/viewBox="(\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?)"/)?.[1];
  const paths = [...svg[1]!.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)]
    .map((m) => m[1]!)
    .filter((d) => /^[MLHVCSQTAZmlhvcsqtaz0-9 .,eE-]+$/.test(d));
  if (!viewBox || paths.length === 0) return null;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" ` +
    `stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">` +
    paths.map((d) => `<path d="${d}" vector-effect="non-scaling-stroke"/>`).join("") +
    `</svg>`
  );
}
