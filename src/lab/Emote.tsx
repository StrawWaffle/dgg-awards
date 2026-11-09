import { type CSSProperties, useEffect, useRef } from "react";

/**
 * A destiny.gg emote, drawn by destiny.gg's own emotes.css (linked in
 * lab.html), so it looks and animates exactly as in chat. `size` scales it.
 * Some emotes animate a set number of times; those are made to loop.
 * `rate` sets the animation speed (1 is normal, 0 holds still).
 */
export function Emote({
  name,
  size = 1,
  title,
  className = "",
  style,
  rate = 1,
}: {
  name: string;
  size?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
  rate?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  useEffect(() => {
    // From dgg-radio's loopRepeating: an animation meant to repeat, repeats.
    const timer = setTimeout(() => {
      for (const a of ref.current?.getAnimations({ subtree: true }) ?? []) {
        const timing = a.effect?.getTiming();
        if (timing && typeof timing.iterations === "number" && timing.iterations > 1) {
          a.effect!.updateTiming({ iterations: Infinity });
        }
        a.playbackRate = rateRef.current;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [name]);
  useEffect(() => {
    for (const a of ref.current?.getAnimations({ subtree: true }) ?? []) a.playbackRate = rate;
  }, [rate]);
  return (
    <span
      ref={ref}
      role="img"
      aria-label={title ?? name}
      title={title ?? name}
      className={`emote ${name} ${className}`}
      style={{ zoom: size, ...style }}
    />
  );
}
