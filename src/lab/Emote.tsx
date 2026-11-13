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
 * Make `wrap` (a "text" span) show `emotes`, separated by spaces: one, or a
 * group drawn together as in a chat message (side by side, so destiny.gg's
 * rules for emotes next to each other apply: GIGACHAD BLADE).
 */
export function paintEmotes(wrap: HTMLElement, emotes: string) {
  const names = emotes.split(" ");
  while (wrap.children.length > names.length) wrap.lastElementChild!.remove();
  while (wrap.children.length < names.length) wrap.append(document.createElement("span"));
  names.forEach((name, i) => paintEmote(wrap.children[i] as HTMLElement, name));
  setTimeout(() => loopRepeating(wrap), 50);
}

/**
 * An emote span for code that builds the page by hand (the big screen's cast):
 * inside a "text" span, as in a chat message, since some emotes are only drawn
 * right there. `name` may be a group, separated by spaces (see paintEmotes).
 * Returns the wrapper to append and repaint.
 */
export function emoteElement(name: string) {
  const wrap = document.createElement("span");
  wrap.className = "text";
  // A row, so a group stands side by side under one name, feet level.
  wrap.style.display = "flex";
  wrap.style.alignItems = "flex-end";
  paintEmotes(wrap, name);
  return { wrap };
}

/** One emote of a group or a message: a destiny.gg one by its class, any other by its picture. */
function Drawn({ name, size }: { name: string; size: number }) {
  const url = pictures.get(name);
  if (url) {
    const short = name.slice(name.indexOf(":") + 1);
    return <span role="img" aria-label={short} title={short} className="emote-picture" style={{ zoom: size, backgroundImage: `url("${url}")` }} />;
  }
  return <span role="img" aria-label={name} title={name} className={`emote ${name}`} style={{ zoom: size }} />;
}

/** Emote animations meant to repeat, repeating, for whatever is drawn inside `ref`. */
function useLooping(ref: React.RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const timer = setTimeout(() => ref.current && loopRepeating(ref.current), 50);
    return () => clearTimeout(timer);
  }, [key]);
}

/** Emotes side by side in one "text" span, as chat draws a message of several. */
export function EmoteRow({ names, size = 1 }: { names: string[]; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLooping(ref, names.join(" "));
  return (
    <span ref={ref} className="text">
      {names.map((name, i) => (
        <Drawn key={i} name={name} size={size} />
      ))}
    </span>
  );
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

/**
 * A chat message's words, with the words that are emotes (`emotes`: word →
 * emote name, from the relay) drawn as emotes.
 */
export function ChatText({ text, emotes, size = 0.85 }: { text: string; emotes?: Record<string, string>; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLooping(ref, text);
  if (!emotes) return <>{text}</>;
  // All in one "text" span, emotes as its own children, as chat has them, so
  // emotes beside each other are drawn together.
  return (
    <span ref={ref} className="text">
      {text.split(/(\s+)/).map((part, i) => {
        const emote = emotes[part];
        return emote ? <Drawn key={i} name={emote} size={size} /> : part;
      })}
    </span>
  );
}
