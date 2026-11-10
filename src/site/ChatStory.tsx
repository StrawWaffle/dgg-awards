import { useEffect, useRef, useState } from "react";
import { originOf, useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { type Review, ReviewNotice, day, fmt, useReview } from "@/site/ChatReviewPage";
import type { Me, SiteConfig } from "@/site/Site";

type Slide = {
  key: string;
  section: string;
  emote: string;
  big?: string;
  greentext?: string;
  title: string;
  text?: string;
};

const SECTION_BG: Record<string, string> = {
  "The year": "var(--panel)",
  Emotes: "var(--highlight)",
  Combos: "var(--cream)",
  "Their names": "var(--panel)",
  "Who tagged whom": "var(--highlight)",
  Greentext: "var(--cream)",
  Links: "var(--panel)",
  "Law and order": "var(--highlight)",
};

/** The year as a run of slides: the numbers, then each section's highlights, a few quotes, and the way out. */
function slidesOf(d: Review): Slide[] {
  const s: Slide[] = [];
  const num = (label: string, emote: string) => {
    const n = d.numbers.find((x) => x.label === label)!;
    s.push({ key: `n-${label}`, section: "The year", emote, big: fmt(n.value), title: label, text: n.note });
  };
  num("messages", "OMEGALUL");
  num("chatters", "Klappa");
  num("emotes", "PepoG");
  num("punishments", "GIGACHAD");
  const cards = (section: string, list: { emote: string; big: string; title: string; text: string }[]) =>
    list.forEach((c) => s.push({ key: `${section}-${c.title}`, section, ...c }));
  cards("Emotes", d.emotes.cards.slice(0, 4));
  cards("Combos", [d.combos.cards[2]!, d.combos.cards[0]!, d.combos.cards[1]!, d.combos.cards[3]!, d.combos.cards[4]!]);
  cards("Their names", d.names.cards);
  cards("Who tagged whom", d.tags.cards);
  const duo = d.tags.duos.find((x) => x.a === "aus_bits") ?? d.tags.duos[0]!;
  s.push({ key: "duo", section: "Who tagged whom", emote: "peepoHug", big: `${fmt(duo.ab)} ⇄ ${fmt(duo.ba)}`, title: `${duo.a} and ${duo.b}`, text: duo.note ?? "" });
  cards("Greentext", d.greentext.cards);
  for (const who of ["yusuf", "Clanker", "Torrniquet"]) {
    const q = d.greentext.quotes.find((x) => x.who === who);
    if (q) s.push({ key: `q-${who}`, section: "Greentext", emote: "PepoG", greentext: q.text, title: q.who, text: q.note });
  }
  cards("Links", d.links.cards.slice(0, 2));
  cards("Law and order", [...d.law.cards.slice(0, 3), d.law.flyers[0]!]);
  return s;
}

type Links = { allHref: string; onAll: (e: React.MouseEvent) => void };

/**
 * The year in DGG chat (`/chat`), as a story (rinlux: easier to focus on one
 * thing). One highlight per screen, snapping from one to the next as you
 * scroll (or with the arrow keys), with dots to jump about, and every number
 * at `/chat/all` (ChatReviewPage). Shown with the results, like the tally;
 * admins see it in the "Results out" preview.
 */
export function ChatStoryPage({
  me,
  config,
  preview,
  onHome,
  ...links
}: { me: Me | undefined; config: SiteConfig | null; preview: boolean; onHome: (e: React.MouseEvent) => void } & Links) {
  const data = useReview(config, me, preview);
  if (data === null || typeof data === "string") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <ReviewNotice data={data} onHome={onHome} />
      </main>
    );
  }
  return <ChatStory data={data} preview={preview} {...links} />;
}

function ChatStory({ data, preview, allHref, onAll }: { data: Review; preview: boolean } & Links) {
  const outer = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();
  const [at, setAt] = useState(0);
  const slides = slidesOf(data);

  // Which slide is on screen, for the dots and the fade-in.
  useEffect(() => {
    const el = scroller.current;
    if (!el || slides.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setAt(Number((e.target as HTMLElement).dataset.i));
      },
      { root: el, threshold: 0.6 },
    );
    el.querySelectorAll("[data-i]").forEach((s) => observer.observe(s));
    el.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, [slides.length]);

  const go = (i: number) => scroller.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ behavior: "smooth" });
  const total = slides.length + 2;

  return (
    <div ref={outer} className="relative">
      {layer}
      {preview && <span className="cozy-chip coral absolute top-3 left-3 z-30">Preview: as it'll look once the results are out</span>}
      <div
        ref={scroller}
        tabIndex={0}
        className="h-[calc(100svh-var(--lab-header,64px))] snap-y snap-mandatory overflow-y-auto outline-none"
        aria-label="The year in chat, one screen at a time"
      >
        <Screen i={0} at={at} bg="var(--panel)">
          <Emote name="DANKMEMES" size={2.5} title="" />
          <h1 className="mt-6 text-5xl font-black sm:text-7xl">{data.year} in DGG chat</h1>
          <p className="mt-4 text-xl font-semibold" style={{ color: "var(--muted)" }}>
            {day(data.from)} to {day(data.through, true)}
          </p>
          <p className="mt-16 text-sm font-bold" style={{ color: "var(--muted)" }}>
            Scroll, or use the arrow keys ↓
          </p>
          <a className="mt-3 text-sm font-bold underline" style={{ color: "var(--muted)" }} href={allHref} onClick={onAll}>
            or see every number at once
          </a>
        </Screen>
        {slides.map((s, i) => (
          <Screen key={s.key} i={i + 1} at={at} bg={SECTION_BG[s.section] ?? "var(--panel)"}>
            <span className="cozy-chip">{s.section}</span>
            <button
              type="button"
              className="cozy-row mt-6 rounded-2xl p-2"
              onClick={(e) => fire(s.emote, ...originOf(e, outer.current), 8)}
              aria-label={`A burst of ${s.emote}`}
            >
              <Emote name={s.emote} size={2.5} title="" />
            </button>
            {s.big && <div className="hand mt-4 text-7xl font-bold tabular-nums sm:text-9xl">{s.big}</div>}
            {s.greentext && <blockquote className="chat-greentext mt-4 max-w-2xl text-xl font-semibold sm:text-2xl">{s.greentext}</blockquote>}
            <h2 className="mt-4 text-3xl font-black sm:text-4xl">{s.title}</h2>
            {s.text && (
              <p className="mt-3 max-w-xl text-lg font-semibold sm:text-xl" style={{ color: "var(--muted)" }}>
                {s.text}
              </p>
            )}
          </Screen>
        ))}
        <Screen i={slides.length + 1} at={at} bg="var(--panel)">
          <div className="flex gap-3">
            <Emote name="Klappa" size={2} title="" />
            <Emote name="CHEERSTINY" size={2} title="" />
          </div>
          <h2 className="mt-6 text-4xl font-black">That was the year.</h2>
          <p className="mt-3 max-w-xl text-lg font-semibold" style={{ color: "var(--muted)" }}>
            Every number, chart and table is on one page as well.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a className="cozy-btn primary" href={allHref} onClick={onAll}>
              See all the numbers
            </a>
            <button type="button" className="cozy-btn" onClick={() => go(0)}>
              Back to the start
            </button>
          </div>
          <p className="mx-auto mt-10 max-w-2xl text-xs font-semibold" style={{ color: "var(--muted)" }}>
            Names that are also everyday words weren't counted as tags: {data.notTags.join(", ")}.
          </p>
        </Screen>
      </div>

      {/* Where you are, and a way to jump. */}
      <nav aria-label="Slides" className="absolute top-1/2 right-3 z-30 hidden -translate-y-1/2 flex-col gap-1.5 sm:flex">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Slide ${i + 1}`}
            aria-current={at === i ? "step" : undefined}
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: at === i ? "var(--coral)" : "var(--panel-border)" }}
          />
        ))}
      </nav>
    </div>
  );
}

function Screen({ i, at, bg, children }: { i: number; at: number; bg: string; children: React.ReactNode }) {
  return (
    <section
      data-i={i}
      className="flex min-h-full snap-start flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: bg }}
    >
      <div className={`flex flex-col items-center transition-opacity duration-500 ${at === i ? "opacity-100" : "opacity-0"}`}>{children}</div>
    </section>
  );
}
