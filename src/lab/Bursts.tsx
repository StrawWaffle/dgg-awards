import { type ReactNode, useCallback, useRef, useState } from "react";
import { Emote } from "@/lab/Emote";

type Burst = { id: number; emote: string; x: number; y: number; dx: number; rot: number; delay: number; size: number };

/**
 * Emotes that pop up from a point, rise and fade: the reaction to doing
 * something. Returns the layer to render (inside a `relative` box) and a
 * function to fire a burst at coordinates within it.
 */
export function useBursts(): [ReactNode, (emote: string, x: number, y: number, count?: number) => void] {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);
  const fire = useCallback((emote: string, x: number, y: number, count = 5) => {
    const added = Array.from({ length: count }, (_, i) => ({
      id: nextId.current++,
      emote,
      x: x + (Math.random() - 0.5) * 40,
      y,
      dx: (Math.random() - 0.5) * 160,
      rot: (Math.random() - 0.5) * 40,
      delay: i * 70,
      size: 0.9 + Math.random() * 0.6,
    }));
    setBursts((b) => [...b.slice(-60), ...added]);
    setTimeout(() => setBursts((b) => b.filter((x) => !added.includes(x))), 2000 + count * 70);
  }, []);
  const layer = (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bursts.map((b) => (
        <div
          key={b.id}
          className="lab-burst"
          style={
            {
              left: b.x,
              top: b.y,
              animationDelay: `${b.delay}ms`,
              "--dx": `${b.dx}px`,
              "--rot": `${b.rot}deg`,
            } as React.CSSProperties
          }
        >
          <Emote name={b.emote} size={b.size} title="" />
        </div>
      ))}
    </div>
  );
  return [layer, fire];
}

/** Where to fire from: the centre-top of the clicked element, within `box`. */
export function originOf(event: React.MouseEvent, box: HTMLElement | null) {
  const target = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const frame = box?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return [target.left - frame.left + target.width / 2 - 20, target.top - frame.top] as const;
}
