import { useCallback, useEffect, useRef, useState } from "react";
import { GearIcon } from "@radix-ui/react-icons";
import { Emote, emoteElement, loopRepeating } from "@/lab/Emote";
import { type Clip, ClipPlayer } from "@/lab/ClipPlayer";
import { Sketch } from "@/lab/sketch";
import { type FeedStatus, liveFeed, simulatedFeed } from "@/lab/chatFeed";
import { type Levels, type Source, useFrame } from "@/lab/music";
import { useBursts } from "@/lab/Bursts";
import { type Award, Board, loadResults } from "@/lab/Results";
import { DvdMenu, type ShowAward, TitleCard, WinnerCard, loadShow } from "@/lab/Scenes";
import { loadSimulated } from "@/lab/Summary";
import type { ChatSummary } from "@/server/lab/chat-aggregator";

type Npc = {
  el: HTMLDivElement;
  emoteEl: HTMLSpanElement;
  bubble: HTMLDivElement;
  nick: string;
  emote: string;
  x: number;
  /** 0 (back) to 1 (front): lane on the floor. */
  depth: number;
  vx: number;
  hop: number;
  /** A small bounce on each beat, apart from the hop on the one. */
  bob: number;
  opacity: number;
  /** Walking in from an edge to `targetX`, then wandering. */
  entering: boolean;
  targetX: number;
  bornAt: number;
  /** Walking off; removed once it's off stage or faded out. */
  leaving: boolean;
  lastSeen: number;
  bubbleUntil: number;
  clapUntil: number;
  /** The emote to go back to after clapping. */
  restore: string;
  /** While a clip plays: the spot beside it to walk to and sit at. */
  parkX?: number;
  /** Its unscaled size, measured when needed (0: measure again). */
  w: number;
  h: number;
};

/** One line in the chat column: someone's emote, a verified message, or a combo. */
type Line =
  | { id: number; kind: "emote"; nick: string; flair: string | null; emote: string }
  | { id: number; kind: "said"; nick: string; flair: string | null; text: string }
  | { id: number; kind: "combo"; emote: string; count: number };

/** A character stays at least this long before it can be swapped out to make room. */
const MIN_STAY_MS = 12_000;

/**
 * Who's on stage, set in the gear's settings and remembered per browser:
 * - `who`: everyone who chats, or only emote-only messages
 * - `stayMin`: minutes someone stays after their last message
 * - `arrivals`: new characters a second at most, so the cast changes gradually
 * - `whenFull`: keep who's there (as dgg-radio does), or swap in newcomers
 */
const CAST_KEY = "lab.stage";
type Cast = {
  max: number;
  names: boolean;
  showSaid: boolean;
  who: "everyone" | "emotes";
  stayMin: number;
  arrivals: number;
  whenFull: "keep" | "swap";
};
const CAST_DEFAULTS: Cast = { max: 60, names: true, showSaid: true, who: "everyone", stayMin: 5, arrivals: 2, whenFull: "keep" };
function loadCast(): Cast {
  try {
    return { ...CAST_DEFAULTS, ...JSON.parse(localStorage.getItem(CAST_KEY) ?? "{}") };
  } catch {
    return CAST_DEFAULTS;
  }
}

function setEmote(npc: Npc, emote: string) {
  if (npc.emote === emote) return;
  npc.emote = emote;
  npc.w = 0;
  npc.emoteEl.className = `emote ${emote}`;
  setTimeout(() => loopRepeating(npc.emoteEl), 50);
}

/** The scenes of one award, in order; after the winner comes the next award's title. */
const SCENES = [
  { id: "title", label: "Title" },
  { id: "options", label: "Nominees" },
  { id: "results", label: "Results" },
  { id: "winner", label: "Winner" },
] as const;
type Scene = (typeof SCENES)[number]["id"];
const NEXT_LABEL: Record<Scene, string> = { title: "Nominees", options: "Results", results: "Winner", winner: "Next award" };
/** How wide each scene's box is: narrow enough to leave the cast room at the sides. */
const SCENE_WIDTH: Record<Scene, string> = {
  title: "min(900px, 92%)",
  options: "min(1000px, 66%)",
  results: "min(860px, 62%)",
  winner: "min(560px, 46%)",
};

/** A spot beside the middle box `sides`, on the left or the right. */
function sideSpot(toLeft: boolean, sides: { left: number; right: number }, width: number, size = 44) {
  const lo = toLeft ? 8 : sides.right + 14;
  const hi = toLeft ? sides.left - size - 14 : width - size - 8;
  return lo <= hi ? lo + Math.random() * (hi - lo) : toLeft ? Math.max(0, hi) : Math.min(width - 40, lo);
}

/** An element's box within `stage`, from layout offsets (transforms ignored). */
function boxIn(el: HTMLElement, stage: Element | null) {
  let left = 0;
  let top = 0;
  for (let e: HTMLElement | null = el; e && e !== stage; e = e.offsetParent as HTMLElement | null) {
    left += e.offsetLeft;
    top += e.offsetTop;
  }
  return { left, right: left + el.offsetWidth, top, bottom: top + el.offsetHeight };
}

/** The results page's simulated votes, in the shape the reveal takes (last place first). */
async function simulatedResults(): Promise<Award[]> {
  return (await loadSimulated()).map((a) => ({
    id: a.id,
    title: a.title,
    total: a.total ?? 0,
    results: [...a.standings].reverse().map((r) => ({ id: r.id, title: r.title, count: r.count ?? 0, percentage: r.percentage, isWinner: r.isWinner })),
  }));
}

const nickClass = (flair: string | null) => `nick${flair ? ` nick-${flair}` : ""}`;

/**
 * The presentation's big screen: chatters as their emotes, walking about,
 * hopping to the music, clapping when someone wins, beside a chat column.
 * Characters are plain DOM elements moved each frame, never React state, and
 * there are at most `max` of them; the busiest chat costs the same as a quiet
 * one. The chat column and the numbers update four times a second.
 */
export function Stage({ source, emotes, chatOpen }: { source: Source; emotes: string[]; chatOpen: boolean }) {
  const floor = useRef<HTMLDivElement>(null);
  const npcs = useRef(new Map<string, Npc>());
  const [feed, setFeed] = useState<"sim" | "live">("sim");
  const [rate, setRate] = useState(300);
  const [emoteShare, setEmoteShare] = useState(0.5);
  // Who's on stage, remembered per browser (the gear's settings).
  const [saved] = useState(loadCast);
  const [max, setMax] = useState(saved.max);
  const [names, setNames] = useState(saved.names);
  const [showSaid, setShowSaid] = useState(saved.showSaid);
  const [who, setWho] = useState(saved.who);
  const [stayMin, setStayMin] = useState(saved.stayMin);
  const [arrivalRate, setArrivalRate] = useState(saved.arrivals);
  const [whenFull, setWhenFull] = useState(saved.whenFull);
  useEffect(() => {
    try {
      localStorage.setItem(CAST_KEY, JSON.stringify({ max, names, showSaid, who, stayMin, arrivals: arrivalRate, whenFull }));
    } catch {}
  }, [max, names, showSaid, who, stayMin, arrivalRate, whenFull]);
  /** Who spoke lately: nick → when, their last emote, flair. Oldest first. */
  const roster = useRef(new Map<string, { at: number; emote: string | null; flair: string | null }>());
  /** What chat is spamming most: for someone who hasn't sent an emote. */
  const chatEmote = useRef("PEPE");
  const [status, setStatus] = useState<FeedStatus>({ connected: false, note: "" });
  const [stats, setStats] = useState({ fps: 0, npcs: 0, perSecond: 0, emoteOnly: 0, ingestMs: 0, chatting: 0 });
  const [winner, setWinner] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [playing, setPlaying] = useState<Clip | null>(null);
  /** The clip being raised away after it's closed. */
  const [raising, setRaising] = useState<Clip | null>(null);
  /** While a clip plays the cast holds still beside it: nobody new, no bubbles. */
  const clipOn = useRef(false);
  clipOn.current = !!playing;
  const clipBox = useRef<HTMLDivElement>(null);
  // The controls' height, so the clip and the cast stay clear of them.
  const controls = useRef<HTMLDivElement>(null);
  const controlsH = useRef(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  useEffect(() => {
    const el = controls.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      controlsH.current = el.offsetHeight;
      setControlsHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [show, setShow] = useState<ShowAward[] | null>(null);
  /** Real votes, or simulated ones (as on the results preview); simulated while there are none. */
  const [votes, setVotes] = useState<"real" | "simulated" | null>(null);
  useEffect(() => {
    loadResults()
      .then((real) => setVotes(real.some((a) => a.total > 0) ? "real" : "simulated"))
      .catch(() => setVotes("simulated"));
  }, []);
  useEffect(() => {
    if (!votes) return;
    let live = true;
    (votes === "real" ? loadResults() : simulatedResults())
      .then(loadShow)
      .then((s) => {
        if (!live) return;
        setShow(s);
        setAwardIndex((i) => Math.max(0, Math.min(i, s.length - 1)));
        setRun((r) => r + 1);
      })
      .catch(() => live && setShow([]));
    return () => {
      live = false;
    };
  }, [votes]);
  const [awardIndex, setAwardIndex] = useState(0);
  const [scene, setScene] = useState<Scene>("title");
  /** Results scene: how many rows to reveal, and a counter to start the board over. */
  const [target, setTarget] = useState(0);
  const [run, setRun] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const award = show?.[awardIndex] ?? null;
  const sceneBox = useRef<HTMLDivElement>(null);
  const sceneNow = useRef(scene);
  sceneNow.current = scene;
  const [bursts, fire] = useBursts();
  const settings = useRef({ rate, emoteShare, max, names, showSaid, who, stayMin, arrivals: arrivalRate, whenFull });
  settings.current = { rate, emoteShare, max, names, showSaid, who, stayMin, arrivals: arrivalRate, whenFull };
  const fps = useRef({ frames: 0, since: performance.now(), value: 0 });
  const clapUntil = useRef(0);
  const lineId = useRef(0);
  /** Arrival allowance, refilled over time (a token bucket). */
  const arrivals = useRef({ tokens: 4, at: performance.now() });
  /** The chat line of the combo still running, to count it up in place. */
  const liveCombo = useRef<{ id: number; emote: string } | null>(null);

  const spawn = useCallback((nick: string, emote: string, flair: string | null) => {
    const box = floor.current!;
    const el = document.createElement("div");
    el.className = "absolute left-0 top-0 flex flex-col items-center will-change-transform";
    const bubble = document.createElement("div");
    bubble.className = "cozy-panel mb-1 hidden max-w-52 px-3 py-1.5 text-xs font-bold";
    const label = document.createElement("span");
    label.className = `${nickClass(flair)} mb-0.5 whitespace-nowrap rounded-full px-1.5 text-[11px]`;
    label.style.background = "color-mix(in oklab, var(--panel) 75%, transparent)";
    label.textContent = nick;
    const { wrap, emote: emoteEl } = emoteElement(emote);
    el.append(bubble, label, wrap);
    box.append(el);
    el.style.opacity = "0";
    // In from the left or the right edge, walking onto the stage.
    const fromLeft = Math.random() < 0.5;
    const width = box.clientWidth;
    const npc: Npc = {
      el,
      emoteEl,
      bubble,
      nick,
      emote,
      x: fromLeft ? -50 : box.clientWidth + 10,
      depth: Math.random(),
      vx: (fromLeft ? 1 : -1) * (70 + Math.random() * 40),
      targetX: 40 + Math.random() * Math.max(40, width - 120),
      bornAt: performance.now(),
      hop: 0,
      bob: 0,
      opacity: 0,
      entering: true,
      leaving: false,
      lastSeen: performance.now(),
      bubbleUntil: 0,
      clapUntil: 0,
      restore: emote,
      w: 0,
      h: 0,
    };
    npcs.current.set(nick, npc);
    return npc;
  }, []);

  /** Walk off towards the nearest edge, fading; the frame loop removes it. */
  const leave = useCallback((npc: Npc) => {
    if (npc.leaving) return;
    npc.leaving = true;
    npc.entering = false;
    const width = floor.current?.clientWidth ?? 0;
    npc.vx = (npc.x < width / 2 ? -1 : 1) * 130;
    // Its nick is free again at once, so a returning chatter gets a new character.
    npcs.current.delete(npc.nick);
    leavingNpcs.current.add(npc);
  }, []);
  const leavingNpcs = useRef(new Set<Npc>());

  const onSummary = useCallback(
    (summary: ChatSummary, feedStatus: FeedStatus) => {
      setStatus(feedStatus);
      const now = performance.now();
      const all = npcs.current;
      const set = settings.current;
      const stayMs = set.stayMin * 60_000;
      const bucket = arrivals.current;
      bucket.tokens = Math.min(4, bucket.tokens + ((now - bucket.at) / 1000) * set.arrivals);
      bucket.at = now;
      if (summary.top[0]) chatEmote.current = summary.top[0][0];

      // The roster, as dgg-radio keeps it: who spoke within the last few
      // minutes, most recent last, with the last emote they used. With
      // "everyone", any message counts; otherwise only emote-only ones.
      const heard: { nick: string; emote: string | null; flair: string | null }[] =
        set.who === "everyone" ? (summary.speakers ?? []) : summary.events;
      const book = roster.current;
      for (const p of [...heard, ...summary.said.map((x) => ({ nick: x.nick, emote: null, flair: x.flair }))]) {
        const known = book.get(p.nick);
        book.delete(p.nick);
        book.set(p.nick, { at: now, emote: p.emote ?? known?.emote ?? null, flair: p.flair ?? known?.flair ?? null });
      }
      for (const [nick, r] of book) {
        if (now - r.at <= stayMs) break; // the rest are more recent
        book.delete(nick);
      }

      // Those on stage: a new emote if they sent one, a hop, and still here.
      for (const p of heard) {
        const npc = all.get(p.nick);
        if (!npc) continue;
        if (p.emote) {
          // During a winner moment everyone claps; they go back to this after.
          setEmote(npc, npc.clapUntil > now ? "Klappa" : p.emote);
          if (npc.clapUntil > now) npc.restore = p.emote;
          if (!npc.entering && !clipOn.current) npc.hop = Math.max(npc.hop, 0.6);
        }
        npc.lastSeen = now;
      }

      // Newcomers, most recent first, paced. While a clip plays, nobody new.
      // A full stage keeps who's there (dgg-radio's way: people stay until
      // they go quiet), or swaps out the quietest, if set to.
      if (!clipOn.current && bucket.tokens >= 1) {
        const waiting = [...book].reverse();
        for (const [nick, r] of waiting) {
          if (bucket.tokens < 1) break;
          if (all.has(nick)) continue;
          if (all.size >= set.max) {
            if (set.whenFull !== "swap") break;
            let quietest: Npc | null = null;
            for (const n of all.values()) {
              if (n.entering || now - n.bornAt < MIN_STAY_MS) continue;
              if (!quietest || n.lastSeen < quietest.lastSeen) quietest = n;
            }
            if (!quietest || quietest.lastSeen >= r.at) break;
            leave(quietest);
          }
          bucket.tokens -= 1;
          const npc = spawn(nick, r.emote ?? chatEmote.current, r.flair);
          npc.lastSeen = r.at;
          if (clapUntil.current > now) {
            npc.clapUntil = clapUntil.current;
            npc.restore = npc.emote;
            setEmote(npc, "Klappa");
          }
        }
      }
      const said = settings.current.showSaid ? summary.said : [];
      // No speech bubbles over a clip.
      if (!clipOn.current) for (const s of said) {
        // A verified message gets a character too, within the same limits.
        let npc = all.get(s.nick);
        if (!npc) {
          if (bucket.tokens < 1 || all.size >= set.max) continue;
          bucket.tokens -= 1;
          npc = spawn(s.nick, "PepoG", s.flair);
        }
        npc.bubble.textContent = s.text;
        npc.bubble.classList.remove("hidden");
        npc.bubbleUntil = now + 5000;
        npc.lastSeen = now;
      }
      // The chat column: a few of this window's characters, and what verified
      // people said, newest at the bottom.
      const added: Line[] = [
        ...summary.events
          .slice(0, 2)
          .map((e) => ({ id: lineId.current++, kind: "emote" as const, nick: e.nick, flair: e.flair, emote: e.emote })),
        ...said.map((s) => ({ id: lineId.current++, kind: "said" as const, nick: s.nick, flair: s.flair, text: s.text })),
      ];
      // Combos as their own lines, as chat shows them: one that's still going
      // counts up in place; one that ended in between gets its final count.
      const counts = new Map<number, number>();
      for (const e of summary.ended) {
        if (liveCombo.current?.emote === e.emote) {
          counts.set(liveCombo.current.id, e.count);
          liveCombo.current = null;
        } else added.push({ id: lineId.current++, kind: "combo", emote: e.emote, count: e.count });
      }
      if (summary.combo) {
        if (liveCombo.current?.emote === summary.combo.emote) counts.set(liveCombo.current.id, summary.combo.count);
        else {
          const id = lineId.current++;
          liveCombo.current = { id, emote: summary.combo.emote };
          added.push({ id, kind: "combo", emote: summary.combo.emote, count: summary.combo.count });
        }
      } else liveCombo.current = null;
      if (added.length > 0 || counts.size > 0) {
        setLines((l) =>
          [...l.map((line) => (line.kind === "combo" && counts.has(line.id) ? { ...line, count: counts.get(line.id)! } : line)), ...added].slice(-60),
        );
      }
      // Everyone on the combo's emote jumps with it.
      if (summary.combo && summary.combo.count >= 3 && !clipOn.current) {
        for (const n of all.values()) if (n.emote === summary.combo.emote && !n.entering) n.hop = 1.4;
      }
      // Characters walk off once they've been quiet for the stay time.
      if (!clipOn.current) for (const n of [...all.values()]) if (now - n.lastSeen > stayMs) leave(n);
      // Over the limit (it was lowered): the quietest go, a few at a time.
      if (all.size > settings.current.max && !clipOn.current) {
        const quiet = [...all.values()].filter((n) => !n.entering).sort((a, b) => a.lastSeen - b.lastSeen);
        for (const n of quiet.slice(0, Math.min(6, all.size - settings.current.max))) leave(n);
      }
      setStats((s) => ({
        fps: fps.current.value,
        npcs: all.size,
        perSecond: Math.round(s.perSecond * 0.7 + summary.messages * 4 * 0.3),
        emoteOnly: Math.round(s.emoteOnly * 0.7 + summary.emoteOnly * 4 * 0.3),
        chatting: book.size,
        ingestMs: feedStatus.ingestMs ?? 0,
      }));
    },
    [leave, spawn],
  );

  useEffect(() => {
    if (feed === "live") return liveFeed(onSummary);
    if (emotes.length === 0) return;
    return simulatedFeed(emotes, () => settings.current.rate, () => settings.current.emoteShare, onSummary);
  }, [feed, emotes, onSummary]);

  // Everyone walks off and the chat clears when switching feeds.
  useEffect(() => {
    for (const n of [...npcs.current.values()]) leave(n);
    roster.current.clear();
    setLines([]);
  }, [feed, leave]);

  // Keep the chat column scrolled to the newest line.
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight });
  }, [lines]);

  const sourceRef = useRef(source);
  sourceRef.current = source;
  const onFrame = useCallback((levels: Record<Source, Levels>, dt: number) => {
    const box = floor.current;
    if (!box) return;
    const f = fps.current;
    f.frames++;
    const now = performance.now();
    if (now - f.since > 1000) {
      f.value = Math.round((f.frames * 1000) / (now - f.since));
      f.frames = 0;
      f.since = now;
    }
    const music = levels[sourceRef.current];
    const width = box.clientWidth;
    const height = box.clientHeight;
    const showNames = settings.current.names;
    const everyone = [...npcs.current.values(), ...leavingNpcs.current];
    const still = clipOn.current;
    // The scene's box (not the title's), measured each frame so it follows its
    // size and the chat column opening or closing. Offsets ignore the
    // lowering animation's transform, so this is where it ends up.
    const middle = !still && sceneNow.current !== "title" ? sceneBox.current : null;
    const keep = middle ? boxIn(middle, box.offsetParent) : null;
    // The floor runs from the horizon to just above the controls.
    const top = height * 0.42;
    const depthRange = Math.max(40, height - controlsH.current - 70 - top);
    for (const n of everyone) {
      const ground = top + n.depth * depthRange;
      // The music: a jump on the one of each bar, a little bob on the others.
      if (!n.entering && !n.leaving && !still) {
        if (music.downbeat) n.hop = Math.max(n.hop, 0.75);
        else if (music.beat) n.bob = 1;
      }
      const was = n.x;
      n.x += n.vx * dt;
      // Behind the scene's box is out of bounds for anyone in a row it covers:
      // they roam beside it, or anywhere in the rows below it.
      // Its drawn box: scaled about its centre, and up to a hop's height above.
      if (keep && !n.w) {
        n.w = n.el.offsetWidth;
        n.h = n.el.offsetHeight;
      }
      const scale = 0.7 + n.depth * 0.6;
      const drawnTop = ground + (n.h * (1 - scale)) / 2 - 32;
      if (keep && !n.leaving && drawnTop < keep.bottom + 4) {
        const inset = (n.w * (1 - scale)) / 2;
        const band = (x: number) => x + inset + n.w * scale > keep.left - 6 && x + inset < keep.right + 6;
        if (n.entering) {
          // Newcomers stay on the side they came in from, so none crosses behind it.
          const fromLeft = n.vx > 0;
          const wrongSide = fromLeft ? n.targetX > keep.left : n.targetX < keep.right;
          if (wrongSide || band(n.targetX)) n.targetX = sideSpot(fromLeft, keep, width, n.w || 44);
        } else if (n.parkX === undefined && band(n.x)) {
          if (band(was)) {
            // Already behind it (it just arrived): walk out to the nearer side.
            n.parkX = sideSpot(n.x + 20 < (keep.left + keep.right) / 2, keep, width, n.w || 44);
            n.vx = (n.parkX >= n.x ? 1 : -1) * 150;
          } else {
            // Wandering into it: turn back.
            n.x = was;
            n.vx = -n.vx;
          }
        }
      }
      if (n.parkX !== undefined) {
        // Walking to a spot beside the clip or the scene; for a clip they sit
        // still there, otherwise they go back to wandering.
        if ((n.vx >= 0 && n.x >= n.parkX) || (n.vx <= 0 && n.x <= n.parkX)) {
          n.x = n.parkX;
          if (still) n.vx = 0;
          else {
            n.parkX = undefined;
            n.vx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 22);
          }
        }
      } else if (n.entering) {
        // Walk to their spot, then slow to a wander.
        if ((n.vx > 0 && n.x >= n.targetX) || (n.vx < 0 && n.x <= n.targetX)) {
          n.entering = false;
          n.vx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 22);
        }
      } else if (!n.leaving && (n.x < 0 || n.x > width - 40)) {
        n.vx = -n.vx;
        n.x = Math.max(0, Math.min(width - 40, n.x));
      }
      n.opacity = n.leaving ? n.opacity - dt * 1.2 : Math.min(1, n.opacity + dt * 2.5);
      if (n.leaving && (n.opacity <= 0 || n.x < -80 || n.x > width + 40)) {
        n.el.remove();
        leavingNpcs.current.delete(n);
        continue;
      }
      n.hop = Math.max(0, n.hop - dt * 2.4);
      n.bob = Math.max(0, n.bob - dt * 7);
      // On the grass: back row higher and smaller, front row lower and bigger.
      const y = ground - Math.sin(n.hop * Math.PI) * 30 * n.hop - n.bob * 5;
      // The bob squashes a little, like landing.
      n.el.style.transform = `translate3d(${n.x}px, ${y}px, 0) scale(${scale * (1 + n.bob * 0.04)}, ${scale * (1 - n.bob * 0.06)})`;
      n.el.style.opacity = String(Math.max(0, n.opacity));
      n.el.style.zIndex = String(Math.round(n.depth * 100));
      (n.el.children[1] as HTMLElement).style.display = showNames ? "" : "none";
      if (n.bubbleUntil && now > n.bubbleUntil) {
        n.bubble.classList.add("hidden");
        n.bubbleUntil = 0;
      }
      if (n.clapUntil && now > n.clapUntil) {
        n.clapUntil = 0;
        setEmote(n, n.restore);
      }
    }
  }, []);
  useFrame(onFrame);

  // A clip lowers in: everyone walks out of its way, left or right, and sits
  // still there until it's gone. (Scenes are kept clear in the frame loop.)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const box = floor.current;
      const middle = playing ? clipBox.current : null;
      if (!box || !middle) {
        for (const n of npcs.current.values()) {
          if (n.parkX === undefined) continue;
          n.parkX = undefined;
          n.vx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 22);
        }
        return;
      }
      const keep = boxIn(middle, box.offsetParent);
      for (const n of npcs.current.values()) {
        const x = sideSpot(n.x + 20 < (keep.left + keep.right) / 2, keep, box.clientWidth, n.w || 44);
        n.entering = false;
        n.parkX = x;
        n.vx = (x >= n.x ? 1 : -1) * 260;
        n.bubble.classList.add("hidden");
        n.bubbleUntil = 0;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  // Read from a ref: the end-of-clip timer may fire after it was closed by hand.
  const closeClip = () => {
    const clip = playingRef.current;
    if (!clip) return;
    playingRef.current = null;
    setRaising(clip);
    setPlaying(null);
    setTimeout(() => setRaising(null), 650);
  };
  const shownClip = playing ?? raising;

  const winnerTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Ends a cheer early: the banner goes back and everyone stops clapping. */
  const endCheer = () => {
    for (const t of winnerTimers.current) clearTimeout(t);
    winnerTimers.current = [];
    setWinner(null);
    clapUntil.current = 0;
    for (const n of npcs.current.values()) {
      if (!n.clapUntil) continue;
      n.clapUntil = 0;
      setEmote(n, n.restore);
    }
  };
  const winnerMoment = (name: string) => {
    for (const t of winnerTimers.current) clearTimeout(t);
    setWinner(name);
    const until = performance.now() + 4000;
    clapUntil.current = until;
    for (const n of npcs.current.values()) {
      if (!n.clapUntil) n.restore = n.emote;
      setEmote(n, "Klappa");
      n.clapUntil = until;
      if (!n.entering) n.hop = 1;
    }
    winnerTimers.current = [setTimeout(() => setWinner(null), 4000)];
  };
  const winnerOf = (a: ShowAward) =>
    (a.results.find((r) => r.isWinner) ?? [...a.results].sort((x, y) => y.count - x.count)[0])?.title ?? "";
  const sceneAt = SCENES.findIndex((x) => x.id === scene);

  /** Moves between scenes; past the winner is the next award's title. */
  const goTo = (index: number, next: Scene, backwards = false) => {
    if (!show?.length) return;
    const i = (index + show.length) % show.length;
    closeClip();
    endCheer();
    setAwardIndex(i);
    setScene(next);
    if (next === "results") {
      // Coming back from the winner, the board is shown finished.
      setTarget(backwards ? show[i]!.results.length : 0);
      setRevealed(backwards);
      setRun((r) => r + 1);
    }
    if (next === "winner") {
      const t = setTimeout(() => winnerMoment(winnerOf(show[i]!)), 700);
      winnerTimers.current.push(t);
    }
  };
  const step = (by: 1 | -1) => {
    const at = SCENES.findIndex((x) => x.id === scene) + by;
    if (at >= SCENES.length) goTo(awardIndex + 1, "title");
    else if (at < 0) goTo(awardIndex - 1, "winner", true);
    else goTo(awardIndex, SCENES[at]!.id, by < 0);
  };
  const cheer = (el: HTMLElement) => {
    const frame = sceneBox.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!frame) return;
    fire("CHEERSTINY", r.left - frame.left + 40, r.top - frame.top, 8);
    setTimeout(() => fire("Klappa", r.left - frame.left + 180, r.top - frame.top, 8), 200);
  };

  return (
    <div className="flex" style={{ height: "calc(100dvh - var(--lab-header, 64px))" }}>
      {/* The stage fills the window; the controls sit over its bottom edge. */}
      <div
        className="relative min-w-0 flex-1 overflow-hidden"
        style={{ background: "linear-gradient(to bottom, var(--sky-top), var(--sky-bottom))" }}
      >
        <div
          className="absolute inset-x-0 bottom-0 h-[52%]"
          style={{ background: "var(--ground)", borderTop: "6px solid var(--ground-edge)", borderRadius: "50% 50% 0 0 / 28px 28px 0 0" }}
        />
        {/* The award's name along the top, except on its own title scene. */}
        {award && (scene !== "title" || winner) && (
          <div className="absolute inset-x-0 top-[5%] z-[200] text-center">
            <Sketch className="inline-block" pad={3} radius={20} boil drawOn>
              <div
                key={winner ?? award.id}
                className="lab-pop inline-block rounded-[20px] px-7 py-3 text-2xl font-black sm:text-4xl"
                style={{ background: "var(--panel)" }}
              >
                {winner ? (
                  <span className="flex items-center gap-3">
                    <Emote name="CHEERSTINY" size={1.1} title="" /> {winner}
                  </span>
                ) : (
                  award.title
                )}
              </div>
            </Sketch>
          </div>
        )}
        {show && show.length === 0 && (
          <div className="absolute inset-x-0 top-[20%] z-[150] text-center">
            <span className="cozy-panel inline-block px-6 py-4 font-bold">No awards to present.</span>
          </div>
        )}
        {/* The scene, lowered in; out of sight while a clip plays over it. */}
        {award && (
          <div
            className="pointer-events-none absolute inset-x-4 z-[150] flex justify-center"
            style={{ top: scene === "title" ? "12%" : "calc(5% + 100px)", bottom: controlsHeight + 32 }}
          >
            <div
              key={`${scene}-${award.id}`}
              ref={sceneBox}
              className={`lab-lower pointer-events-auto relative h-fit max-h-full overflow-y-auto ${shownClip ? "invisible" : ""}`}
              style={{ width: SCENE_WIDTH[scene] }}
            >
              {scene === "title" && <TitleCard award={award} index={awardIndex} count={show!.length} />}
              {scene === "options" && <DvdMenu award={award} onPlay={setPlaying} keys={!playing} />}
              {scene === "results" && (
                <div className="cozy-panel relative overflow-hidden p-6">
                  {bursts}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="cozy-chip coral">Results</span>
                    <span className="cozy-chip green hand text-base!">{award.total.toLocaleString()} votes</span>
                  </div>
                  <Board key={`${award.id}-${run}`} award={award} target={target} onWinner={cheer} onFinished={() => setRevealed(true)} />
                </div>
              )}
              {scene === "winner" && <WinnerCard award={award} onPlay={setPlaying} onCheer={() => winnerMoment(winnerOf(award))} />}
            </div>
          </div>
        )}
        {shownClip && (
          // Lowered from the top to just above the controls, and raised away.
          <div
            className="pointer-events-none absolute inset-x-4 z-[155] flex justify-center"
            style={{ top: "calc(5% + 100px)", bottom: controlsHeight + 32 }}
          >
            <div
              key={shownClip.clipUrl ?? shownClip.embedUrl}
              ref={clipBox}
              className={`pointer-events-auto aspect-[16/10] h-full max-w-full ${playing ? "lab-lower" : "lab-raise"}`}
            >
              <ClipPlayer clip={shownClip} fill onEnded={() => setTimeout(closeClip, 1500)} />
            </div>
          </div>
        )}
        <div ref={floor} className="pointer-events-none absolute inset-0 z-[160]" />
        <div className="cozy-chip absolute top-3 left-3 z-[200] font-mono text-[11px]!">
          {stats.fps} fps · {stats.npcs} on stage
        </div>

        {/* The presenter's controls, over the bottom of the stage. */}
        <div ref={controls} className="absolute inset-x-4 bottom-4 z-[300] mx-auto max-w-4xl">
          <div className="cozy-panel space-y-3 p-4">
            {settingsOpen && (
              <div className="grid gap-3 rounded-2xl p-4 text-sm font-bold sm:grid-cols-2" style={{ background: "var(--cream)" }}>
                <label className="flex items-center gap-2">
                  Chat from
                  <select value={feed} onChange={(e) => setFeed(e.currentTarget.value as "sim" | "live")} className="cozy-input py-1!">
                    <option value="sim">Simulator</option>
                    <option value="live">Live destiny.gg chat</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Votes
                  <select value={votes ?? "real"} onChange={(e) => setVotes(e.currentTarget.value as "real" | "simulated")} className="cozy-input py-1!">
                    <option value="real">Real votes</option>
                    <option value="simulated">Simulated (made up, never saved)</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Who shows up
                  <select value={who} onChange={(e) => setWho(e.currentTarget.value as Cast["who"])} className="cozy-input py-1!">
                    <option value="everyone">Everyone who chats</option>
                    <option value="emotes">Only emote messages</option>
                  </select>
                </label>
                <label className="flex items-center gap-2" title="How long someone stays after their last message">
                  Stays for
                  <input type="range" min={1} max={30} step={1} value={stayMin} onChange={(e) => setStayMin(Number(e.currentTarget.value))} className="cozy-range" />
                  <span className="w-12 tabular-nums">{stayMin} min</span>
                </label>
                <label className="flex items-center gap-2" title="New characters a second, at most">
                  Arrivals
                  <input type="range" min={0.5} max={10} step={0.5} value={arrivalRate} onChange={(e) => setArrivalRate(Number(e.currentTarget.value))} className="cozy-range" />
                  <span className="w-12 tabular-nums">{arrivalRate}/s</span>
                </label>
                <label className="flex items-center gap-2">
                  When full
                  <select value={whenFull} onChange={(e) => setWhenFull(e.currentTarget.value as Cast["whenFull"])} className="cozy-input py-1!">
                    <option value="keep">Keep who's there</option>
                    <option value="swap">Swap in newcomers</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Characters at most
                  <input type="range" min={10} max={400} step={10} value={max} onChange={(e) => setMax(Number(e.currentTarget.value))} className="cozy-range" />
                  <span className="w-9 tabular-nums">{max}</span>
                </label>
                {feed === "sim" && (
                  <>
                    <label className="flex items-center gap-2">
                      Messages a second
                      <input type="range" min={1} max={5000} step={1} value={rate} onChange={(e) => setRate(Number(e.currentTarget.value))} className="cozy-range" />
                      <span className="w-12 tabular-nums">{rate}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      Emote-only
                      <input type="range" min={0} max={1} step={0.05} value={emoteShare} onChange={(e) => setEmoteShare(Number(e.currentTarget.value))} className="cozy-range" />
                      <span className="w-10 tabular-nums">{Math.round(emoteShare * 100)}%</span>
                    </label>
                  </>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={names} onChange={(e) => setNames(e.currentTarget.checked)} /> Names over characters
                </label>
                <label className="flex items-center gap-2" title="The Verified flair, Notable, Broadcaster and mods">
                  <input type="checkbox" checked={showSaid} onChange={(e) => setShowSaid(e.currentTarget.checked)} /> Verified messages
                </label>
                <p className="sm:col-span-2" style={{ color: "var(--muted)" }}>
                  {status.note} {stats.chatting.toLocaleString()} chatting in the last {stayMin} min.
                  {feed === "sim" &&
                    ` ${stats.emoteOnly.toLocaleString()} emote-only/s; the aggregator takes ${stats.ingestMs.toFixed(1)} ms each ¼ s.`}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="cozy-chip coral">Presenting</span>
              <select
                value={awardIndex}
                onChange={(e) => goTo(Number(e.currentTarget.value), "title")}
                className="cozy-input mr-auto max-w-80 py-1! font-extrabold"
                aria-label="Award"
              >
                {show?.map((a, i) => (
                  <option key={a.id} value={i}>
                    {i + 1}. {a.title}
                  </option>
                ))}
              </select>
              <span className="cozy-chip">{stats.perSecond.toLocaleString()} msg/s</span>
              {votes === "simulated" && <span className="cozy-chip">Simulated votes</span>}
              <span className="cozy-chip green">{feed === "live" ? "Live chat" : "Simulator"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <nav
                aria-label="Scenes"
                className="flex gap-1 rounded-full p-1"
                style={{ background: "var(--cream)", border: "2px solid var(--panel-border)" }}
              >
                {SCENES.map((x, i) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => scene !== x.id && goTo(awardIndex, x.id, i < sceneAt)}
                    aria-current={scene === x.id ? "step" : undefined}
                    className="cozy-row rounded-full px-3 py-1 text-sm font-extrabold"
                    style={scene === x.id ? { background: "var(--header)", color: "white" } : { color: "var(--muted)" }}
                  >
                    {i + 1}. {x.label}
                  </button>
                ))}
              </nav>
              {scene === "results" && award && (
                <>
                  <button
                    type="button"
                    className="cozy-btn"
                    // The last two are revealed together, so one click asks for both.
                    onClick={() => setTarget((t) => (t + 1 >= award.results.length - 1 ? award.results.length : t + 1))}
                    disabled={target >= award.results.length}
                  >
                    Reveal next
                  </button>
                  <button
                    type="button"
                    className="cozy-btn"
                    onClick={() => setTarget(award.results.length)}
                    disabled={target >= award.results.length}
                  >
                    Reveal all
                  </button>
                </>
              )}
              {playing && (
                <button type="button" className="cozy-btn" onClick={closeClip}>
                  Close the clip
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button type="button" className="cozy-btn" onClick={() => step(-1)} disabled={!show?.length}>
                  ← Back
                </button>
                <button
                  type="button"
                  className={`cozy-btn ${scene !== "results" || revealed ? "primary" : ""}`}
                  onClick={() => step(1)}
                  disabled={!show?.length}
                >
                  {NEXT_LABEL[scene]} →
                </button>
                <button
                  type="button"
                  className={`cozy-btn round h-10 w-10 ${settingsOpen ? "primary" : ""}`}
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  aria-expanded={settingsOpen}
                  aria-label="Stage settings"
                  title="Stage settings"
                >
                  <GearIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The chat column, toggled from the top bar. */}
      {chatOpen && (
        <aside
          className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l-2"
          style={{ background: "var(--panel)", borderColor: "var(--panel-border)" }}
        >
          <div className="flex items-center justify-between border-b-2 px-4 py-3" style={{ borderColor: "var(--panel-border)" }}>
            <span className="font-black">Chat</span>
            <span className={`cozy-chip ${status.connected ? "green" : ""}`}>{status.connected ? "connected" : "waiting"}</span>
          </div>
          <div ref={chat} className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
            {lines.map((l) =>
              l.kind === "combo" ? (
                // As chat shows a combo: the emote, the count, and HITS or, from 5, C-C-C-COMBO.
                <div key={l.id} className="flex items-center gap-2 px-1.5 py-1">
                  <Emote name={l.emote} size={0.95} />
                  <span className="text-sm font-black">{l.count}×</span>
                  <span key={l.count} className="lab-combo text-lg font-black italic">
                    {l.count >= 5 ? "C-C-C-COMBO" : "HITS"}
                  </span>
                </div>
              ) : (
                <div
                  key={l.id}
                  className="rounded-lg px-1.5 py-0.5"
                  style={l.kind === "said" ? { background: "var(--highlight)", borderLeft: "3px solid var(--primary-shadow)" } : undefined}
                >
                  <span className={nickClass(l.flair)}>{l.nick}</span>:{" "}
                  {l.kind === "emote" ? <Emote name={l.emote} size={0.85} /> : <span className="font-semibold">{l.text}</span>}
                </div>
              ),
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
