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
 * Emotes from other platforms (Kick, YouTube), named "<platform>:<name>",
 * which destiny.gg's emotes.css can't draw: their pictures, as omnichat sent
 * them (only plain https addresses get this far, see chat-aggregator.ts).
 */
const pictures = new Map<string, string>();
export function addEmotePictures(found: Record<string, string> | undefined) {
  if (found) for (const [name, url] of Object.entries(found)) pictures.set(name, url);
}

/** Make `el` show the emote `name`: a destiny.gg emote by its class, any other by its picture. */
export function paintEmote(el: HTMLElement, name: string) {
  const url = pictures.get(name);
  if (url) {
    el.className = "emote-picture";
    el.style.backgroundImage = `url("${url}")`;
  } else {
    el.className = `emote ${name}`;
    el.style.backgroundImage = "";
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
  paintEmote(emote, name);
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
  const url = pictures.get(name);
  if (url) {
    return (
      <span
        ref={ref}
        role="img"
        aria-label={title ?? name}
        title={title ?? name.slice(name.indexOf(":") + 1)}
        className={`emote-picture ${className}`}
        style={{ zoom: size, backgroundImage: `url("${url}")`, ...style }}
      />
    );
  }
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
