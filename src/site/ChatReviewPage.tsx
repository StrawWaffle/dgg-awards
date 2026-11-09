import { type ReactNode, useEffect, useRef, useState } from "react";
import { originOf, useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { Sketch } from "@/lab/sketch";
import type { Me, SiteConfig } from "@/site/Site";

/** The page's data (`src/archive/chat-<year>.json`, from scripts/build-chat-review.py), served by /api/chat-review. */
type Review = typeof import("@/archive/chat-2026.json");
type Card = { emote: string; big: string; title: string; text: string };
type Bar = { name: string; value: number; sub?: string; emote?: string };

const fmt = (n: number) => n.toLocaleString("en-US");
const day = (iso: string, year = false) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

const SECTIONS = [
  { id: "emotes", label: "Emotes", emote: "OMEGALUL" },
  { id: "combos", label: "Combos", emote: "DANKMEMES" },
  { id: "names", label: "Their names", emote: "Stare" },
  { id: "tags", label: "Who tagged whom", emote: "DinkDonk" },
  { id: "greentext", label: "Greentext", emote: "PepoG" },
  { id: "links", label: "Links", emote: "CINEMA" },
  { id: "law", label: "Law and order", emote: "GIGACHAD" },
] as const;

/**
 * The year in DGG chat: a look back at the chat's year (emotes, combos, tags,
 * greentext, links and the mods), shown with the results. Public once the
 * site is in reviewing mode; admins see it in the "Results out" preview.
 * Click any big emote for a burst of it.
 */
export function ChatReviewPage({
  me,
  config,
  preview,
  onHome,
}: {
  me: Me | undefined;
  config: SiteConfig | null;
  preview: boolean;
  onHome: (e: React.MouseEvent) => void;
}) {
  const published = config?.viewingMode === "reviewing";
  const [data, setData] = useState<Review | null | "missing">(null);
  useEffect(() => {
    if (!config || me === undefined || !published) return;
    fetch(`/api/chat-review${preview ? "?preview=1" : ""}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setData)
      .catch(() => setData("missing"));
  }, [config, me, published, preview]);

  if (!config || me === undefined) return <div className="cozy-panel p-8">Loading…</div>;
  if (!published) {
    return (
      <div className="cozy-panel mx-auto max-w-2xl space-y-4 p-8 text-center">
        <Emote name="WWWWaiting" size={1.6} title="" />
        <p className="text-2xl font-black">The year in chat comes out with the results.</p>
        <a className="cozy-btn primary" href="/" onClick={onHome}>
          Back to the front page
        </a>
      </div>
    );
  }
  if (data === null) return <div className="cozy-panel p-8">Loading…</div>;
  if (data === "missing") return <div className="cozy-panel p-8">Couldn't load the year in chat. Try reloading.</div>;
  return <ChatReview data={data} preview={preview} />;
}

function ChatReview({ data, preview }: { data: Review; preview: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();
  const burst = (emote: string) => (e: React.MouseEvent) => fire(emote, ...originOf(e, box.current), 7);

  return (
    <div ref={box} className="relative space-y-8">
      {layer}
      {preview && (
        <div className="cozy-panel flex flex-wrap items-center gap-3 px-5 py-3" style={{ background: "var(--highlight)" }}>
          <span className="cozy-chip coral">Preview</span>
          <span className="font-semibold">The year in chat, as it'll look once the results are out.</span>
        </div>
      )}

      {/* The cover. */}
      <Sketch pad={5} radius={26} strokeWidth={3} boil roughness={1.5}>
        <header className="relative overflow-hidden rounded-[24px] px-6 py-10 text-center sm:px-10" style={{ background: "var(--panel)" }}>
          <div className="mb-4 flex justify-center gap-3">
            {["OMEGALUL", "MMMM", "DANKMEMES", "GIGACHAD", "CINEMA"].map((e) => (
              <button key={e} type="button" className="cozy-row rounded-xl p-1" onClick={burst(e)} aria-label={`A burst of ${e}`}>
                <Emote name={e} size={1.1} title="" />
              </button>
            ))}
          </div>
          <h1 className="text-4xl font-black sm:text-5xl">{data.year} in DGG chat</h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg font-semibold" style={{ color: "var(--muted)" }}>
            From {day(data.from)} to {day(data.through, true)}: what {fmt(data.numbers.find((n) => n.label === "chatters")!.value)} of you did with{" "}
            {Math.round(data.numbers.find((n) => n.label === "messages")!.value / 1e6)} million messages.
          </p>
          <nav aria-label="Sections" className="mt-6 flex flex-wrap justify-center gap-2">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="cozy-chip cozy-row inline-flex items-center gap-1.5">
                <Emote name={s.emote} size={0.45} title="" />
                {s.label}
              </a>
            ))}
          </nav>
        </header>
      </Sketch>

      {/* The year in numbers. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.numbers.map((n) => (
          <div key={n.label} className="cozy-panel p-4">
            <div className="hand text-4xl font-bold tabular-nums sm:text-5xl">{fmt(n.value)}</div>
            <div className="font-black">{n.label}</div>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--muted)" }}>
              {n.note}
            </p>
          </div>
        ))}
      </div>

      <Section id="emotes" title="Emotes of the year" emote="OMEGALUL" onEmote={burst}>
        <Cards cards={data.emotes.cards} onEmote={burst} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Bars title="Most used, all chat" bars={data.emotes.top} />
          <Bars title="Most emotes, per person" bars={data.emotes.users} />
        </div>
      </Section>

      <Section id="combos" title="Combos" emote="DANKMEMES" onEmote={burst}>
        <Cards cards={data.combos.cards} onEmote={burst} />
        <div>
          <h3 className="mb-2 font-black">The biggest</h3>
          <ol className="space-y-1.5">
            {data.combos.top.map((c, i) => (
              <li key={i} className="grid grid-cols-[2rem_auto_1fr] items-center gap-3 rounded-2xl px-2 py-1.5" style={{ background: i === 0 ? "var(--highlight)" : undefined }}>
                <span className="hand text-xl font-bold" style={{ color: "var(--muted)" }}>
                  {i + 1}
                </span>
                <span className="flex items-center gap-2">
                  <Emote name={c.emote} size={0.6} title={c.emote} />
                  <span className="hand text-2xl font-bold tabular-nums">{c.size}×</span>
                </span>
                <span className="text-sm font-semibold">
                  {c.emote}, {day(c.date)}. Broken by <b>{c.brokenBy}</b>
                  {c.breaking ? <> with “{c.breaking}”</> : null}.
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Bars title="Joined the most combos" bars={data.combos.joiners} />
          <Bars title="Broke the most combos" bars={data.combos.breakers} />
        </div>
      </Section>

      <Section id="names" title="Saying their names" emote="Stare" onEmote={burst}>
        <Cards cards={data.names.cards} onEmote={burst} />
        <div>
          <h3 className="mb-2 font-black">Who said it most, month by month</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-separate border-spacing-1 text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--muted)" }}>
                  <th className="px-2 font-bold" />
                  {data.names.crowns.map((row) => (
                    <th key={row.target} className="px-2 font-black" style={{ color: "var(--text)" }}>
                      {row.target}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="px-2 text-left font-black">The year</th>
                  {data.names.crowns.map((row) => (
                    <Crown key={row.target} cell={row.year} year />
                  ))}
                </tr>
                {data.names.months.map((m, i) => (
                  <tr key={m}>
                    <th className="px-2 text-left font-bold" style={{ color: "var(--muted)" }}>
                      {monthName(m)}
                    </th>
                    {data.names.crowns.map((row) => (
                      <Crown key={row.target} cell={row.months[i] ?? null} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
            Messages that mention the name. November runs to {day(data.through)}.
          </p>
        </div>
      </Section>

      <Section id="tags" title="Who tagged whom" emote="DinkDonk" onEmote={burst}>
        <Cards cards={data.tags.cards} onEmote={burst} />
        <div>
          <h3 className="mb-2 font-black">Chat's couples</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.tags.duos.map((d) => (
              <div key={d.a + d.b} className="rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
                <div className="flex items-center justify-between gap-2 font-black">
                  <span>{d.a}</span>
                  <Emote name="peepoHug" size={0.6} title="" />
                  <span className="text-right">{d.b}</span>
                </div>
                <div className="mt-2 flex h-3 overflow-hidden rounded-full">
                  <span style={{ width: `${(d.ab / (d.ab + d.ba)) * 100}%`, background: "var(--primary)" }} />
                  <span className="flex-1" style={{ background: "var(--coral)" }} />
                </div>
                <div className="hand mt-1 flex justify-between text-lg font-bold tabular-nums">
                  <span>{fmt(d.ab)} →</span>
                  <span>← {fmt(d.ba)}</span>
                </div>
                {d.note && (
                  <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                    {d.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-black">Unrequited</h3>
            <ul className="space-y-1.5">
              {data.tags.unrequited.map((u) => (
                <li key={u.a + u.b} className="flex flex-wrap items-baseline gap-x-2 rounded-2xl px-3 py-2" style={{ background: "var(--cream)" }}>
                  <b>{u.a}</b> tagged <b>{u.b}</b>
                  <span className="hand text-xl font-bold tabular-nums">{fmt(u.ab)}</span> times, and got
                  <span className="hand text-xl font-bold tabular-nums" style={{ color: "var(--coral)" }}>
                    {fmt(u.ba)}
                  </span>
                  back.
                </li>
              ))}
            </ul>
          </div>
          <Bars title="Most tagged" bars={data.tags.tagged} />
        </div>
      </Section>

      <Section id="greentext" title="Greentext" emote="PepoG" onEmote={burst}>
        <Cards cards={data.greentext.cards} onEmote={burst} />
        <div>
          <h3 className="mb-2 font-black">Greentexts, framed</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {data.greentext.quotes.map((q) => (
              <figure key={q.who} className="rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
                <blockquote className="chat-greentext font-semibold break-words">{q.text}</blockquote>
                <figcaption className="mt-2 text-sm font-bold">
                  {q.who} <span style={{ color: "var(--muted)" }}>· {q.note}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <Bars title="Most greentext" bars={data.greentext.top} />
      </Section>

      <Section id="links" title="Links" emote="CINEMA" onEmote={burst}>
        <Cards cards={data.links.cards} onEmote={burst} />
        <div>
          <h3 className="mb-2 font-black">Links chat reacted to most</h3>
          <ul className="space-y-2">
            {data.links.top.map((l) => (
              <li key={l.rank} className="rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cozy-chip coral">#{l.rank}</span>
                  <b>{l.who}</b>
                  <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                    {day(l.date)}
                  </span>
                  <span className="hand ml-auto text-xl font-bold tabular-nums">{fmt(l.reactions)} reactions</span>
                </div>
                <p className="mt-1 font-semibold break-words">{l.text}</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                  {l.note}
                  {l.link && (
                    <>
                      {" "}
                      <a className="underline" href={l.link.url} target="_blank" rel="noopener noreferrer">
                        {l.link.label} ↗
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
            Reactions are messages from other people in the minute after. Discord image links expire, so they're marked as self-destructed.
          </p>
        </div>
      </Section>

      <Section id="law" title="Law and order" emote="GIGACHAD" onEmote={burst}>
        <Cards cards={data.law.cards} onEmote={burst} />
        <Bars title="Mod commands, per mod" bars={data.law.mods} />
        <div className="grid gap-6 lg:grid-cols-3">
          <Chips title="Ban reasons we can print" chips={data.law.banReasons} />
          <Chips title="Words nuked most" chips={data.law.nuked} note="A nuke mutes everyone who says it." />
          <Chips title="Link rules broken" chips={data.law.linkRules} />
        </div>
        <div>
          <h3 className="mb-2 font-black">Frequent flyers</h3>
          <Cards cards={data.law.flyers} onEmote={burst} />
        </div>
      </Section>

      <footer className="cozy-panel space-y-2 p-6 text-sm font-semibold" style={{ color: "var(--muted)" }}>
        <p>
          From destiny.gg's chat logs, {day(data.from)} to {day(data.through, true)}, minus anything we wouldn't print.
        </p>
        <p>
          <b style={{ color: "var(--text)" }}>Names that are also everyday words</b> weren't counted as tags, so a message about chicken
          doesn't count as tagging chicken: {data.notTags.join(", ")}.
        </p>
      </footer>
    </div>
  );
}

function Section({ id, title, emote, onEmote, children }: { id: string; title: string; emote: string; onEmote: (e: string) => (ev: React.MouseEvent) => void; children: ReactNode }) {
  return (
    <section id={id} className="cozy-panel scroll-mt-[calc(var(--lab-header,64px)+1rem)] space-y-6 p-6 sm:p-8">
      <h2 className="flex items-center gap-3 text-3xl font-black">
        <button type="button" className="cozy-row rounded-xl p-1" onClick={onEmote(emote)} aria-label={`A burst of ${emote}`}>
          <Emote name={emote} size={1} title="" />
        </button>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One cell of the name table: who said it most, and how often. */
function Crown({ cell, year = false }: { cell: { nick: string; n: number } | null; year?: boolean }) {
  return (
    <td className="rounded-xl px-3 py-1" style={{ background: year ? "var(--highlight)" : "var(--cream)" }}>
      {cell ? (
        <span className="flex items-baseline justify-between gap-3">
          <span className={`truncate ${year ? "font-black" : "font-bold"}`}>{cell.nick}</span>
          <span className="hand shrink-0 text-base tabular-nums" style={{ color: "var(--muted)" }}>
            {fmt(cell.n)}
          </span>
        </span>
      ) : (
        "–"
      )}
    </td>
  );
}

/** The highlights: an emote, a big number in handwriting, and the story. */
function Cards({ cards, onEmote }: { cards: Card[]; onEmote: (e: string) => (ev: React.MouseEvent) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <div key={c.title} className="rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)", boxShadow: "0 4px 0 var(--cream-shadow)" }}>
          <div className="flex items-center gap-3">
            <button type="button" className="cozy-row rounded-xl p-1" onClick={onEmote(c.emote)} aria-label={`A burst of ${c.emote}`}>
              <Emote name={c.emote} size={0.9} title="" />
            </button>
            <span className="hand text-4xl font-bold tabular-nums">{c.big}</span>
          </div>
          <h3 className="mt-2 font-black">{c.title}</h3>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--muted)" }}>
            {c.text}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Sorted bars from zero, labelled, growing in as they scroll into view. */
function Bars({ title, bars }: { title: string; bars: Bar[] }) {
  const list = useRef<HTMLOListElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => e?.isIntersecting && (setSeen(true), observer.disconnect()), { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const most = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div>
      <h3 className="mb-2 font-black">{title}</h3>
      <ol ref={list} className="space-y-2">
        {bars.map((b, i) => (
          <li key={b.name + i}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-bold">
                {b.emote && <Emote name={b.emote} size={0.45} title="" />}
                <span className="truncate">{b.name}</span>
              </span>
              <span className="hand shrink-0 text-lg font-bold tabular-nums">{fmt(b.value)}</span>
            </div>
            <div className="mt-0.5 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--cream)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-out"
                style={{ width: seen ? `${(b.value / most) * 100}%` : 0, background: i === 0 ? "var(--coral)" : "var(--primary)", transitionDelay: `${i * 60}ms` }}
              />
            </div>
            {b.sub && (
              <p className="mt-0.5 truncate text-xs font-semibold" style={{ color: "var(--muted)" }} title={b.sub}>
                {b.sub}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chips({ title, chips, note }: { title: string; chips: { label: string; n: number }[]; note?: string }) {
  return (
    <div>
      <h3 className="mb-2 font-black">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <li key={c.label} className="cozy-chip">
            {c.label} <span className="hand ml-1 text-base">×{fmt(c.n)}</span>
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          {note}
        </p>
      )}
    </div>
  );
}
