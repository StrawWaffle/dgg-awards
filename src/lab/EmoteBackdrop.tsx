import { useCallback, useEffect, useRef, useState } from "react";
import { type Levels, type Source, useFrame } from "@/lab/music";

/**
 * Well-known emotes drawn on a transparent background, so their outline is
 * the character. Photo emotes (GIGACHAD, CHEERSTINY…) would be rectangles.
 */
const SHAPES = [
  "PEPE", "YEE", "FeelsGoodMan", "PepoG", "PepoTurtle", "monkaS", "POGGERS", "widepeepoHappy", "peepoHug",
  "NODDERS", "PepeLaugh", "FeelsStrongMan", "Klappa",
];

/** A fixed pseudo-random sequence, so the backdrop starts the same each visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

type Leaf = {
  emote: string;
  x: number;
  y: number;
  /** Drift speed, px a second: mostly rightwards and a little up, like a breeze. */
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  /** Where in its sway it is. */
  phase: number;
};

const STEP = 230;
const MARGIN = 120;

/** One leaf per cell of a loose grid over the window, so they start spread out. */
function scatter(width: number, height: number): Leaf[] {
  const random = seeded(7);
  const leaves: Leaf[] = [];
  for (let row = 0; row * STEP < height + STEP; row++) {
    for (let col = 0; col * STEP < width + STEP; col++) {
      leaves.push({
        emote: SHAPES[Math.floor(random() * SHAPES.length)]!,
        x: col * STEP + (row % 2) * (STEP / 2) + (random() - 0.5) * 80 - MARGIN / 2,
        y: row * STEP + (random() - 0.5) * 80 - MARGIN / 2,
        vx: 8 + random() * 14,
        vy: -2 - random() * 5,
        rot: (random() - 0.5) * 50,
        spin: (random() - 0.5) * 8,
        size: 1.8 + random() * 0.9,
        phase: random() * Math.PI * 2,
      });
    }
  }
  return leaves;
}

/**
 * Faint emote silhouettes drifting behind the page like leaves on a breeze:
 * each floats slowly right and up, swaying and turning, and comes back round
 * when it leaves the window. The music blows through them: each beat nudges
 * them all the same way, the first beat of each bar harder.
 * Still for people who ask for less motion.
 */
export function EmoteBackdrop() {
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  const state = useRef<Leaf[]>([]);
  const time = useRef(0);
  const still = useRef(false);

  useEffect(() => {
    still.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = () => {
      const fresh = scatter(innerWidth, innerHeight);
      state.current = fresh.map((l) => ({ ...l }));
      setLeaves(fresh);
    };
    update();
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);

  /** The gust: one push shared by every leaf, in screen directions. */
  const gust = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  const place = (el: HTMLSpanElement, l: Leaf) => {
    // Each leaf's own gentle sway, then the shared gust, both in screen space:
    // the translate comes first, so neither follows the leaf's own turn.
    const swayX = Math.sin(time.current * 0.6 + l.phase) * 14;
    const swayRot = Math.sin(time.current * 0.8 + l.phase) * 8;
    const g = gust.current;
    el.style.transform = `translate3d(${l.x + swayX + g.x}px, ${l.y + g.y}px, 0) rotate(${l.rot + swayRot}deg) scale(${l.size})`;
  };

  const onFrame = useCallback((levels: Record<Source, Levels>, dt: number) => {
    const list = state.current;
    if (list.length === 0) return;
    if (still.current) {
      list.forEach((l, i) => els.current[i] && place(els.current[i]!, l));
      return;
    }
    time.current += dt;
    // The music as a breeze: every beat nudges all the leaves the same way
    // (right and a little up), the one of each bar harder; a spring brings
    // them back.
    const music = levels.map;
    const g = gust.current;
    if (music.downbeat) {
      g.vx += 70;
      g.vy -= 30;
    } else if (music.beat) {
      g.vx += 25;
      g.vy -= 10;
    }
    g.vx += (-g.x * 18 - g.vx * 5) * dt;
    g.vy += (-g.y * 18 - g.vy * 5) * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    const w = innerWidth + MARGIN;
    const h = innerHeight + MARGIN;
    list.forEach((l, i) => {
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.rot += l.spin * dt;
      // Round the edges: off the right comes back on the left, off the top at the bottom.
      if (l.x > w) l.x -= w + MARGIN;
      if (l.y < -MARGIN) l.y += h + MARGIN;
      const el = els.current[i];
      if (el) place(el, l);
    });
  }, []);
  useFrame(onFrame);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {leaves.map((l, i) => (
        <span key={i} ref={(el) => void (els.current[i] = el)} className={`lab-silhouette emote ${l.emote}`} />
      ))}
    </div>
  );
}
