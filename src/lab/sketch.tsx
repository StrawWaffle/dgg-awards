// Hand-drawn details for the lab, on Rough.js (roughjs.com): wobbly frames
// around things, strokes that draw themselves in, and an optional "boil"
// (the frame redrawn with a slightly different wobble on each beat of the
// music, the way hand-drawn animation jitters; still when the music is off). All strokes use currentColor, so CSS
// colours them per theme.
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Levels, type Source, useFrame } from "@/lab/music";
import rough from "roughjs";

// ---- Drawing helpers.

/**
 * A theme colour's current value. Rough Notation writes colours into SVG
 * attributes, where var() doesn't work, so it gets the resolved colour.
 */
export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "currentColor";
}

/** A rounded rectangle as an SVG path, for Rough.js to draw shakily. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
}

/** Make every stroke in `el` draw itself in over `ms`, after `delay`. */
export function drawIn(el: SVGElement, ms = 600, delay = 0) {
  const paths = el.querySelectorAll("path");
  paths.forEach((path) => {
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: ms,
      delay,
      easing: "ease-out",
      fill: "backwards",
    });
  });
}

/** Cycle through a few seeds while `on`, one step per beat, for the boil. */
function useBoil(on: boolean) {
  const [seed, setSeed] = useState(1);
  const live = useRef(on);
  live.current = on && !reducedMotion();
  // On each beat of the music (from the beat map), the next wobble; still
  // between beats, and when the music is off.
  const onFrame = useCallback((levels: Record<Source, Levels>) => {
    if (live.current && levels.map.beat) setSeed((s) => (s % 3) + 1);
  }, []);
  useFrame(onFrame);
  return seed;
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The size of an element, kept up to date. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * A hand-drawn frame around `children`: a wobbly rounded outline (doubled,
 * like a pen going round twice), optionally boiling, optionally drawn in when
 * it appears.
 */
export function Sketch({
  children,
  className = "",
  pad = 6,
  radius = 22,
  roughness = 1.4,
  strokeWidth = 2.4,
  color = "var(--text)",
  fill,
  boil = false,
  drawOn = false,
}: {
  children: ReactNode;
  className?: string;
  /** How far outside the content the line runs. */
  pad?: number;
  radius?: number;
  roughness?: number;
  strokeWidth?: number;
  color?: string;
  /** A hachure fill colour behind the content, if any. */
  fill?: string;
  boil?: boolean;
  drawOn?: boolean;
}) {
  const [box, size] = useSize<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const seed = useBoil(boil);
  const drawnOnce = useRef(false);

  useEffect(() => {
    const el = svg.current;
    if (!el || size.w === 0) return;
    el.replaceChildren();
    const rc = rough.svg(el);
    const d = roundedRect(strokeWidth, strokeWidth, size.w + pad * 2 - strokeWidth * 2, size.h + pad * 2 - strokeWidth * 2, radius);
    const options = { roughness, strokeWidth, stroke: "currentColor", bowing: 1.5, preserveVertices: false };
    const add = (node: SVGGElement, colour: string) => {
      node.style.color = colour;
      el.appendChild(node);
    };
    if (fill) {
      add(rc.path(d, { ...options, stroke: "none", fill: "currentColor", fillStyle: "hachure", hachureGap: 7, fillWeight: 1, seed }), fill);
    }
    add(rc.path(d, { ...options, seed }), color);
    add(rc.path(d, { ...options, strokeWidth: strokeWidth * 0.6, seed: seed + 10 }), color);
    if (drawOn && !drawnOnce.current) {
      drawnOnce.current = true;
      drawIn(el, 900);
    }
  }, [size.w, size.h, seed, pad, radius, roughness, strokeWidth, fill, color, drawOn]);

  return (
    <div ref={box} className={`relative ${className}`}>
      <svg
        ref={svg}
        aria-hidden
        className="pointer-events-none absolute overflow-visible"
        style={{ left: -pad, top: -pad, width: size.w + pad * 2, height: size.h + pad * 2, zIndex: 1 }}
      />
      {children}
    </div>
  );
}
