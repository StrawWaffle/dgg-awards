import { useEffect, useState } from "react";

/**
 * Well-known emotes drawn on a transparent background, so their outline is
 * the character. Photo emotes (GIGACHAD, CHEERSTINY…) would be rectangles.
 */
const SHAPES = [
  "PEPE", "YEE", "FeelsGoodMan", "PepoG", "PepoTurtle", "monkaS", "POGGERS", "widepeepoHappy", "peepoHug",
  "NODDERS", "PepeLaugh", "FeelsStrongMan", "Klappa",
];

/** A fixed pseudo-random sequence, so the backdrop is the same on every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

type Spot = { emote: string; x: number; y: number; rot: number; size: number };

function layout(width: number, height: number): Spot[] {
  const random = seeded(7);
  const step = 230;
  const spots: Spot[] = [];
  for (let row = 0; row * step < height + step; row++) {
    for (let col = 0; col * step < width + step; col++) {
      // A grid with every other row shifted and each spot nudged, so it reads
      // as scattered rather than tiled.
      spots.push({
        emote: SHAPES[Math.floor(random() * SHAPES.length)]!,
        x: col * step + (row % 2) * (step / 2) + (random() - 0.5) * 50,
        y: row * step + (random() - 0.5) * 50,
        rot: (random() - 0.5) * 40,
        size: 1.8 + random() * 0.9,
      });
    }
  }
  return spots;
}

/**
 * Faint emote silhouettes behind the page, in place of a pattern. Fixed to
 * the window; laid out again when it resizes.
 */
export function EmoteBackdrop() {
  const [spots, setSpots] = useState<Spot[]>([]);
  useEffect(() => {
    const update = () => setSpots(layout(innerWidth, innerHeight));
    update();
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {spots.map((s, i) => (
        <span
          key={i}
          className={`lab-silhouette emote ${s.emote}`}
          // `scale`, not zoom: zoom would also scale the position.
          style={{ left: s.x, top: s.y, rotate: `${s.rot}deg`, scale: String(s.size) }}
        />
      ))}
    </div>
  );
}
