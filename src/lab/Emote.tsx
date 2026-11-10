import { type CSSProperties, useEffect, useRef } from "react";

/** From dgg-radio's loopRepeating: an emote animation meant to repeat, repeats forever. */
export function loopRepeating(el: Element) {
  for (const a of el.getAnimations({ subtree: true })) {
    const timing = a.effect?.getTiming();
    if (timing && typeof timing.iterations === "number" && timing.iterations > 1) {
      a.effect!.updateTiming({ iterations: Infinity });
    }
  }
}

/**
 * An emote span for code that builds the page by hand (the big screen's cast):
 * inside a "text" span, as in a chat message, since some emotes are only drawn
 * right there. Returns the wrapper to append and the emote to restyle.
 */
export function emoteElement(name: string) {
  const wrap = document.createElement("span");
  wrap.className = "text";
  wrap.style.display = "contents";
  const emote = document.createElement("span");
  emote.className = `emote ${name}`;
  wrap.append(emote);
  setTimeout(() => loopRepeating(emote), 50);
  return { wrap, emote };
}

/**
 * A destiny.gg emote, drawn by destiny.gg's own emotes.css (linked in
 * site.html), so it looks and animates exactly as in chat. `size` scales it.
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
    const timer = setTimeout(() => {
      if (!ref.current) return;
      loopRepeating(ref.current);
      for (const a of ref.current.getAnimations({ subtree: true })) a.playbackRate = rateRef.current;
    }, 50);
    return () => clearTimeout(timer);
  }, [name]);
  useEffect(() => {
    for (const a of ref.current?.getAnimations({ subtree: true }) ?? []) a.playbackRate = rate;
  }, [rate]);
  // Inside a "text" span, as in a chat message: some emotes are only drawn
  // right there (Chatting is a strip of all its frames anywhere else).
  return (
    <span className="text" style={{ display: "contents" }}>
      <span
        ref={ref}
        role="img"
        aria-label={title ?? name}
        title={title ?? name}
        className={`emote ${name} ${className}`}
        style={{ zoom: size, ...style }}
      />
    </span>
  );
}
