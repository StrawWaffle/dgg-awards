import { useEffect, useRef, useState } from "react";
import { originOf, useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { C, EmoteName, type Path, ReviewEditor, T, WordList, getIn, useReviewAt } from "@/site/ChatEdit";
import { type Review, ReviewNotice, day, fmt, useReview } from "@/site/ChatReviewPage";
import type { Me, SiteConfig } from "@/site/Site";

/**
 * One screen of the story. Each points at what it shows in the data (`at`),
 * so editing a slide edits that card, number or quote everywhere.
 */
type Slide = { key: string; section: string; kind: "number" | "card" | "quote" | "duo"; at: Path };

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
  const num = (label: string) => {
    const i = d.numbers.findIndex((x) => x.label === label);
    if (i >= 0) s.push({ key: `n-${i}`, section: "The year", kind: "number", at: ["numbers", i] });
  };
  num("messages");
  num("chatters");
  num("emotes");
  num("punishments");
  const cards = (section: string, list: Path, picks: number[]) => {
    const all = (getIn(d, list) as unknown[] | undefined) ?? [];
    for (const i of picks) if (i < all.length) s.push({ key: `${list.join(".")}-${i}`, section, kind: "card", at: [...list, i] });
  };
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  cards("Emotes", ["emotes", "cards"], range(4));
  cards("Combos", ["combos", "cards"], [2, 0, 1, 3, 4]);
  cards("Their names", ["names", "cards"], range(d.names.cards.length));
  cards("Who tagged whom", ["tags", "cards"], range(d.tags.cards.length));
  const duo = Math.max(0, d.tags.duos.findIndex((x) => x.a === "aus_bits"));
  if (d.tags.duos[duo]) s.push({ key: "duo", section: "Who tagged whom", kind: "duo", at: ["tags", "duos", duo] });
  cards("Greentext", ["greentext", "cards"], range(d.greentext.cards.length));
  for (const who of ["yusuf", "Clanker", "Torrniquet"]) {
    const i = d.greentext.quotes.findIndex((x) => x.who === who);
    if (i >= 0) s.push({ key: `q-${i}`, section: "Greentext", kind: "quote", at: ["greentext", "quotes", i] });
  }
  cards("Links", ["links", "cards"], range(2));
  cards("Law and order", ["law", "cards"], range(3));
  cards("Law and order", ["law", "flyers"], [0]);
  // Sections added on the page: every card.
  (d.extra ?? []).forEach((x, e) => cards(x.title, ["extra", e, "cards"], range(x.cards.length)));
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
  return (
    <ReviewEditor data={data} admin={!!me?.admin} year={data.year} floating>
      {(d) => <ChatStory data={d} preview={preview} {...links} />}
    </ReviewEditor>
  );
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
          <C k="story.title" d={`${data.year} in DGG chat`} as="h1" className="mt-6 block text-5xl font-black sm:text-7xl" />
          <C k="story.dates" d={`${day(data.from)} to ${day(data.through, true)}`} as="p" className="mt-4 block text-xl font-semibold" style={{ color: "var(--muted)" }} />
          <C k="story.intro" optional as="p" className="mt-6 block max-w-2xl text-xl font-semibold" />
          <C k="story.scroll" d="Scroll, or use the arrow keys ↓" as="p" className="mt-16 block text-sm font-bold" style={{ color: "var(--muted)" }} />
          <a className="mt-3 text-sm font-bold underline" style={{ color: "var(--muted)" }} href={allHref} onClick={onAll}>
            <C k="story.all" d="or see every number at once" />
          </a>
        </Screen>
        {slides.map((s, i) => (
          <Screen key={s.key} i={i + 1} at={at} bg={SECTION_BG[s.section] ?? "var(--panel)"}>
            <SlideBody slide={s} onEmote={(e, emote) => fire(emote, ...originOf(e, outer.current), 8)} />
          </Screen>
        ))}
        <Screen i={slides.length + 1} at={at} bg="var(--panel)">
          <div className="flex gap-3">
            <Emote name="Klappa" size={2} title="" />
            <Emote name="CHEERSTINY" size={2} title="" />
          </div>
          <C k="story.end" d="That was the year." as="h2" className="mt-6 block text-4xl font-black" />
          <C k="story.endNote" d="Every number, chart and table is on one page as well." as="p" className="mt-3 block max-w-xl text-lg font-semibold" style={{ color: "var(--muted)" }} />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a className="cozy-btn primary" href={allHref} onClick={onAll}>
              <C k="story.allButton" d="See all the numbers" />
            </a>
            <button type="button" className="cozy-btn" onClick={() => go(0)}>
              Back to the start
            </button>
          </div>
          <p className="mx-auto mt-10 max-w-2xl text-xs font-semibold" style={{ color: "var(--muted)" }}>
            <C k="story.notTags" d="Names that are also everyday words weren't counted as tags:" /> <WordList at={["notTags"]} />.
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

const NUMBER_EMOTE: Record<string, string> = { messages: "OMEGALUL", chatters: "Klappa", emotes: "PepoG", punishments: "GIGACHAD" };

/** What a slide shows, every bit of it editable. */
function SlideBody({ slide: s, onEmote }: { slide: Slide; onEmote: (e: React.MouseEvent, emote: string) => void }) {
  const item = useReviewAt(s.at) as Record<string, unknown> | undefined;
  if (!item) return null;
  const emote =
    s.kind === "card" ? String(item.emote) : s.kind === "number" ? (NUMBER_EMOTE[String(item.label)] ?? "PepoG") : s.kind === "duo" ? "peepoHug" : "PepoG";
  const muted = { color: "var(--muted)" };
  return (
    <>
      <C k={`story.section.${s.section}`} d={s.section} className="cozy-chip" />
      <button type="button" className="cozy-row mt-6 rounded-2xl p-2" onClick={(e) => onEmote(e, emote)} aria-label={`A burst of ${emote}`}>
        <Emote name={emote} size={2.5} title="" />
      </button>
      {s.kind === "card" && <EmoteName at={[...s.at, "emote"]} />}
      {(s.kind === "card" || s.kind === "number") && (
        <T at={[...s.at, s.kind === "card" ? "big" : "value"]} format={s.kind === "number" ? fmt : undefined} className="hand mt-4 block text-7xl font-bold tabular-nums sm:text-9xl" />
      )}
      {s.kind === "duo" && (
        <div className="hand mt-4 text-7xl font-bold tabular-nums sm:text-9xl">
          <T at={[...s.at, "ab"]} format={fmt} /> ⇄ <T at={[...s.at, "ba"]} format={fmt} />
        </div>
      )}
      {s.kind === "quote" && <T at={[...s.at, "text"]} as="blockquote" className="chat-greentext mt-4 block max-w-2xl text-xl font-semibold sm:text-2xl" />}
      <h2 className="mt-4 text-3xl font-black sm:text-4xl">
        {s.kind === "duo" ? (
          <>
            <T at={[...s.at, "a"]} /> and <T at={[...s.at, "b"]} />
          </>
        ) : (
          <T at={[...s.at, s.kind === "card" ? "title" : s.kind === "number" ? "label" : "who"]} />
        )}
      </h2>
      <T at={[...s.at, s.kind === "card" ? "text" : "note"]} optional as="p" className="mt-3 block max-w-xl text-lg font-semibold sm:text-xl" style={muted} />
      {s.kind === "quote" && typeof item.link === "string" && item.link && (
        <a className="mt-3 text-sm font-bold underline" style={muted} href={item.link} target="_blank" rel="noopener noreferrer">
          <C k="story.quoteLink" d="See it in chat on rustlesearch ↗" />
        </a>
      )}
    </>
  );
}
