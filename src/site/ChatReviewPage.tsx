import { type ReactNode, useEffect, useRef, useState } from "react";
import { originOf, useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { Sketch } from "@/lab/sketch";
import { AddItem, AddSection, C, EmoteName, ItemTools, type Path, ReviewEditor, type ReviewDoc, T, WordList, useEditing, useReviewAt } from "@/site/ChatEdit";
import type { Me, SiteConfig } from "@/site/Site";

/** The page's data (`src/archive/chat-<year>.json`, from scripts/build-chat-review.py), served by /api/chat-review. */
export type Review = typeof import("@/archive/chat-2026.json") & { copy?: Record<string, string>; extra?: import("@/site/ChatEdit").Extra[] };
export type Card = { emote: string; big: string; title: string; text: string };
type Bar = { name: string; value: number; sub?: string; emote?: string };

export const fmt = (n: number) => n.toLocaleString("en-US");
export const day = (iso: string, year = false) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
export const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

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
 * The year in chat's data, for the story (`/chat`) and this page (`/chat/all`):
 * `null` while loading, `"locked"` until the results are out. Public once the
 * site is in reviewing mode; admins get it in the "Results out" preview.
 */
export function useReview(config: SiteConfig | null, me: Me | undefined, preview: boolean): Review | null | "missing" | "locked" {
  const published = config?.viewingMode === "reviewing";
  const [data, setData] = useState<Review | null | "missing">(null);
  useEffect(() => {
    if (!config || me === undefined || !published) return;
    fetch(`/api/chat-review${preview ? "?preview=1" : ""}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setData)
      .catch(() => setData("missing"));
  }, [config, me, published, preview]);
  if (!config || me === undefined) return null;
  return published ? data : "locked";
}

/** What the year in chat shows instead of itself: loading, not out yet, or an error. Null once there's data. */
export function ReviewNotice({ data, onHome }: { data: ReturnType<typeof useReview>; onHome: (e: React.MouseEvent) => void }) {
  if (data === null) return <div className="cozy-panel p-8">Loading…</div>;
  if (data === "missing") return <div className="cozy-panel p-8">Couldn't load the year in chat. Try reloading.</div>;
  if (data === "locked") {
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
  return null;
}

/**
 * The year in DGG chat, every number (`/chat/all`): emotes, combos, tags,
 * greentext, links and the mods, with all the cards, bars and tables. The
 * story at `/chat` shows the highlights and leads here. Click any big emote
 * for a burst of it. Admins can edit it in place (ChatEdit.tsx).
 */
export function ChatReviewPage({
  me,
  config,
  preview,
  onHome,
  storyHref,
  onStory,
}: {
  me: Me | undefined;
  config: SiteConfig | null;
  preview: boolean;
  onHome: (e: React.MouseEvent) => void;
  storyHref: string;
  onStory: (e: React.MouseEvent) => void;
}) {
  const data = useReview(config, me, preview);
  if (data === null || typeof data === "string") return <ReviewNotice data={data} onHome={onHome} />;
  return (
    <ReviewEditor data={data} admin={!!me?.admin} year={data.year}>
      {(d) => <ChatReview data={d} preview={preview} storyHref={storyHref} onStory={onStory} />}
    </ReviewEditor>
  );
}

/** The two numbers the cover quotes, if they're still there. */
export const number = (data: Review, label: string) => data.numbers.find((n) => n.label === label)?.value ?? 0;

function ChatReview({ data, preview, storyHref, onStory }: { data: ReviewDoc; preview: boolean; storyHref: string; onStory: (e: React.MouseEvent) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();
  const burst = (emote: string) => (e: React.MouseEvent) => fire(emote, ...originOf(e, box.current), 7);
  const editing = useEditing();
  const extra = data.extra ?? [];

  return (
    <div ref={box} className="relative space-y-8">
      {layer}
      {preview && (
        <div className="cozy-panel flex flex-wrap items-center gap-3 px-5 py-3" style={{ background: "var(--highlight)" }}>
          <span className="cozy-chip coral">Preview</span>
          <span className="font-semibold">The year in chat, as it'll look once the results are out.</span>
        </div>
      )}
      <a className="cozy-btn" href={storyHref} onClick={onStory}>
        ← The year as a story
      </a>

      {/* The cover. */}
      <Sketch pad={5} radius={26} strokeWidth={3} boil={!editing} roughness={1.5}>
        <header className="relative overflow-hidden rounded-[24px] px-6 py-10 text-center sm:px-10" style={{ background: "var(--panel)" }}>
          <div className="mb-4 flex flex-wrap justify-center gap-3">
            {["OMEGALUL", "MMMM", "DANKMEMES", "GIGACHAD", "CINEMA"].map((e) => (
              <button key={e} type="button" className="cozy-row rounded-xl p-1" onClick={burst(e)} aria-label={`A burst of ${e}`}>
                <Emote name={e} size={1.1} title="" />
              </button>
            ))}
          </div>
          <C k="cover.title" d={`${data.year} in DGG chat`} as="h1" className="block text-4xl font-black sm:text-5xl" />
          <C
            k="cover.subtitle"
            d={`From ${day(data.from)} to ${day(data.through, true)}: what ${fmt(number(data, "chatters"))} of you did with ${Math.round(number(data, "messages") / 1e6)} million messages.`}
            as="p"
            className="mx-auto mt-3 block max-w-2xl text-lg font-semibold"
            style={{ color: "var(--muted)" }}
          />
          <C k="cover.intro" optional as="p" className="mx-auto mt-3 block max-w-2xl text-lg font-semibold" />
          <nav aria-label="Sections" className="mt-6 flex flex-wrap justify-center gap-2">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="cozy-chip cozy-row inline-flex items-center gap-1.5">
                <Emote name={s.emote} size={0.45} title="" />
                {data.copy?.[`section.${s.id}.title`] ?? s.label}
              </a>
            ))}
            {extra.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="cozy-chip cozy-row inline-flex items-center gap-1.5">
                <Emote name={s.emote} size={0.45} title="" />
                {s.title}
              </a>
            ))}
          </nav>
        </header>
      </Sketch>

      {/* The year in numbers. */}
      <div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.numbers.map((_, i) => (
            <div key={i} className="edit-item cozy-panel relative p-4">
              <ItemTools at={["numbers"]} i={i} />
              <T at={["numbers", i, "value"]} format={fmt} className="hand block text-[1.6rem] font-bold tabular-nums sm:text-5xl" />
              <T at={["numbers", i, "label"]} className="block font-black" />
              <T at={["numbers", i, "note"]} as="p" className="mt-1 block text-sm font-semibold" style={{ color: "var(--muted)" }} />
            </div>
          ))}
        </div>
        <AddItem at={["numbers"]} label="Add a number" />
      </div>

      <Section id="emotes" title="Emotes of the year" emote="OMEGALUL" onEmote={burst}>
        <Cards at={["emotes", "cards"]} onEmote={burst} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Bars k="emotes.top" title="Most used, all chat" at={["emotes", "top"]} />
          <Bars k="emotes.users" title="Most emotes, per person" at={["emotes", "users"]} />
        </div>
      </Section>

      <Section id="combos" title="Combos" emote="DANKMEMES" onEmote={burst}>
        <Cards at={["combos", "cards"]} onEmote={burst} />
        <div>
          <C k="combos.biggest" d="The biggest" as="h3" className="mb-2 block font-black" />
          <ol className="space-y-1.5">
            {data.combos.top.map((c, i) => (
              <li
                key={i}
                className="edit-item relative grid grid-cols-[2rem_auto_1fr] items-center gap-3 rounded-2xl px-2 py-1.5"
                style={{ background: i === 0 ? "var(--highlight)" : undefined }}
              >
                <ItemTools at={["combos", "top"]} i={i} />
                <span className="hand text-xl font-bold" style={{ color: "var(--muted)" }}>
                  {i + 1}
                </span>
                <span className="flex items-center gap-2">
                  <Emote name={c.emote} size={0.6} title={c.emote} />
                  <EmoteName at={["combos", "top", i, "emote"]} />
                  <span className="hand text-2xl font-bold tabular-nums">
                    <T at={["combos", "top", i, "size"]} />×
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {editing ? <T at={["combos", "top", i, "emote"]} /> : c.emote}, <T at={["combos", "top", i, "date"]} format={day} />. Broken by{" "}
                  <b>
                    <T at={["combos", "top", i, "brokenBy"]} />
                  </b>
                  {c.breaking || editing ? (
                    <>
                      {" "}
                      with “<T at={["combos", "top", i, "breaking"]} />”
                    </>
                  ) : null}
                  .
                </span>
              </li>
            ))}
          </ol>
          <AddItem at={["combos", "top"]} label="Add a combo" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Bars k="combos.joiners" title="Joined the most combos" at={["combos", "joiners"]} />
          <Bars k="combos.breakers" title="Broke the most combos" at={["combos", "breakers"]} />
        </div>
      </Section>

      <Section id="names" title="Saying their names" emote="Stare" onEmote={burst}>
        <Cards at={["names", "cards"]} onEmote={burst} />
        <div>
          <C k="names.table" d="Who said it most, month by month" as="h3" className="mb-2 block font-black" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-separate border-spacing-1 text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--muted)" }}>
                  <th className="px-2 font-bold" />
                  {data.names.crowns.map((_, c) => (
                    <th key={c} className="px-2 font-black" style={{ color: "var(--text)" }}>
                      <T at={["names", "crowns", c, "target"]} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="px-2 text-left font-black">
                    <C k="names.year" d="The year" />
                  </th>
                  {data.names.crowns.map((row, c) => (
                    <Crown key={c} at={["names", "crowns", c, "year"]} filled={!!row.year} year />
                  ))}
                </tr>
                {data.names.months.map((_, i) => (
                  <tr key={i}>
                    <th className="px-2 text-left font-bold" style={{ color: "var(--muted)" }}>
                      <T at={["names", "months", i]} format={monthName} />
                    </th>
                    {data.names.crowns.map((row, c) => (
                      <Crown key={c} at={["names", "crowns", c, "months", i]} filled={!!row.months[i]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <C
            k="names.note"
            d={`Messages that mention the name. November runs to ${day(data.through)}.`}
            as="p"
            className="mt-2 block text-xs font-semibold"
            style={{ color: "var(--muted)" }}
          />
        </div>
      </Section>

      <Section id="tags" title="Who tagged whom" emote="DinkDonk" onEmote={burst}>
        <Cards at={["tags", "cards"]} onEmote={burst} />
        <div>
          <C k="tags.duos" d="Chat's couples" as="h3" className="mb-2 block font-black" />
          <div className="grid gap-3 sm:grid-cols-2">
            {data.tags.duos.map((d, i) => (
              <div key={i} className="edit-item relative rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
                <ItemTools at={["tags", "duos"]} i={i} />
                <div className="flex items-center justify-between gap-2 font-black">
                  <T at={["tags", "duos", i, "a"]} />
                  <Emote name="peepoHug" size={0.6} title="" />
                  <T at={["tags", "duos", i, "b"]} className="text-right" />
                </div>
                <div className="mt-2 flex h-3 overflow-hidden rounded-full">
                  <span style={{ width: `${(d.ab / Math.max(1, d.ab + d.ba)) * 100}%`, background: "var(--primary)" }} />
                  <span className="flex-1" style={{ background: "var(--coral)" }} />
                </div>
                <div className="hand mt-1 flex justify-between text-lg font-bold tabular-nums">
                  <span>
                    <T at={["tags", "duos", i, "ab"]} format={fmt} /> →
                  </span>
                  <span>
                    ← <T at={["tags", "duos", i, "ba"]} format={fmt} />
                  </span>
                </div>
                <T at={["tags", "duos", i, "note"]} optional as="p" className="block text-sm font-semibold" style={{ color: "var(--muted)" }} />
              </div>
            ))}
          </div>
          <AddItem at={["tags", "duos"]} label="Add a couple" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <C k="tags.unrequited" d="Unrequited" as="h3" className="mb-2 block font-black" />
            <ul className="space-y-1.5">
              {data.tags.unrequited.map((_, i) => (
                <li key={i} className="edit-item relative flex flex-wrap items-baseline gap-x-2 rounded-2xl px-3 py-2" style={{ background: "var(--cream)" }}>
                  <ItemTools at={["tags", "unrequited"]} i={i} />
                  <b>
                    <T at={["tags", "unrequited", i, "a"]} />
                  </b>{" "}
                  tagged{" "}
                  <b>
                    <T at={["tags", "unrequited", i, "b"]} />
                  </b>
                  <T at={["tags", "unrequited", i, "ab"]} format={fmt} className="hand text-xl font-bold tabular-nums" /> times, and got
                  <T at={["tags", "unrequited", i, "ba"]} format={fmt} className="hand text-xl font-bold tabular-nums" style={{ color: "var(--coral)" }} />
                  back.
                </li>
              ))}
            </ul>
            <AddItem at={["tags", "unrequited"]} label="Add one" />
          </div>
          <Bars k="tags.tagged" title="Most tagged" at={["tags", "tagged"]} />
        </div>
      </Section>

      <Section id="greentext" title="Greentext" emote="PepoG" onEmote={burst}>
        <Cards at={["greentext", "cards"]} onEmote={burst} />
        <div>
          <C k="greentext.quotes" d="Greentexts, framed" as="h3" className="mb-2 block font-black" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.greentext.quotes.map((q, i) => (
              <figure key={i} className="edit-item relative rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
                <ItemTools at={["greentext", "quotes"]} i={i} />
                <T at={["greentext", "quotes", i, "text"]} as="blockquote" className="chat-greentext block font-semibold break-words" />
                <figcaption className="mt-2 text-sm font-bold">
                  <T at={["greentext", "quotes", i, "who"]} />{" "}
                  <span style={{ color: "var(--muted)" }}>
                    · <T at={["greentext", "quotes", i, "note"]} />
                  </span>
                  {q.link && !editing && (
                    <>
                      {" "}
                      <a className="underline" style={{ color: "var(--muted)" }} href={q.link} target="_blank" rel="noopener noreferrer">
                        See it in chat ↗
                      </a>
                    </>
                  )}
                </figcaption>
                {editing && (
                  <p className="mt-1 text-xs font-semibold break-all" style={{ color: "var(--muted)" }}>
                    Link to it in chat (rustlesearch): <T at={["greentext", "quotes", i, "link"]} placeholder="https://rustlesearch.dev/surrounds?…" />
                  </p>
                )}
              </figure>
            ))}
          </div>
          <AddItem at={["greentext", "quotes"]} label="Add a quote" />
        </div>
        <Bars k="greentext.top" title="Most greentext" at={["greentext", "top"]} />
      </Section>

      <Section id="links" title="Links" emote="CINEMA" onEmote={burst}>
        <Cards at={["links", "cards"]} onEmote={burst} />
        <div>
          <C k="links.top" d="Links chat reacted to most" as="h3" className="mb-2 block font-black" />
          <ul className="space-y-2">
            {data.links.top.map((l, i) => (
              <li key={i} className="edit-item relative rounded-2xl border-2 p-4" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
                <ItemTools at={["links", "top"]} i={i} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cozy-chip coral">
                    #<T at={["links", "top", i, "rank"]} />
                  </span>
                  <b>
                    <T at={["links", "top", i, "who"]} />
                  </b>
                  <T at={["links", "top", i, "date"]} format={day} className="text-sm font-semibold" style={{ color: "var(--muted)" }} />
                  <span className="hand ml-auto text-xl font-bold tabular-nums">
                    <T at={["links", "top", i, "reactions"]} format={fmt} /> <C k="links.reactions" d="reactions" />
                  </span>
                </div>
                <T at={["links", "top", i, "text"]} as="p" className="mt-1 block font-semibold break-words" />
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                  <T at={["links", "top", i, "note"]} />
                  {l.link && !editing && (
                    <>
                      {" "}
                      <a className="underline" href={l.link.url} target="_blank" rel="noopener noreferrer">
                        {l.link.label} ↗
                      </a>
                    </>
                  )}
                </p>
                {l.link && editing && (
                  <p className="mt-1 text-xs font-semibold break-all" style={{ color: "var(--muted)" }}>
                    Link: <T at={["links", "top", i, "link", "label"]} placeholder="what it is" /> at{" "}
                    <T at={["links", "top", i, "link", "url"]} placeholder="https://…" />
                  </p>
                )}
              </li>
            ))}
          </ul>
          <AddItem at={["links", "top"]} label="Add a link" />
          <C
            k="links.note"
            d="Reactions are messages from other people in the minute after. Discord image links expire, so they're marked as self-destructed."
            as="p"
            className="mt-2 block text-xs font-semibold"
            style={{ color: "var(--muted)" }}
          />
        </div>
      </Section>

      <Section id="law" title="Law and order" emote="GIGACHAD" onEmote={burst}>
        <Cards at={["law", "cards"]} onEmote={burst} />
        <Bars k="law.mods" title="Mod commands, per mod" at={["law", "mods"]} />
        <div className="grid gap-6 lg:grid-cols-3">
          <Chips k="law.banReasons" title="Ban reasons we can print" at={["law", "banReasons"]} />
          <Chips k="law.nuked" title="Words nuked most" at={["law", "nuked"]} note="A nuke mutes everyone who says it." />
          <Chips k="law.linkRules" title="Link rules broken" at={["law", "linkRules"]} />
        </div>
        <div>
          <C k="law.flyers" d="Frequent flyers" as="h3" className="mb-2 block font-black" />
          <Cards at={["law", "flyers"]} onEmote={burst} />
        </div>
      </Section>

      {extra.map((s, i) => (
        <section key={s.id} id={s.id} className="edit-item cozy-panel relative scroll-mt-[calc(var(--lab-header,64px)+1rem)] space-y-6 p-6 sm:p-8">
          <ItemTools at={["extra"]} i={i} />
          <h2 className="flex flex-wrap items-center gap-3 text-3xl font-black">
            <button type="button" className="cozy-row rounded-xl p-1" onClick={burst(s.emote)} aria-label={`A burst of ${s.emote}`}>
              <Emote name={s.emote} size={1} title="" />
            </button>
            <EmoteName at={["extra", i, "emote"]} />
            <T at={["extra", i, "title"]} />
          </h2>
          <T at={["extra", i, "intro"]} optional as="p" className="block max-w-3xl text-lg font-semibold" placeholder="Add some words here, or leave it empty" />
          <Cards at={["extra", i, "cards"]} onEmote={burst} />
        </section>
      ))}
      <AddSection />

      <footer className="cozy-panel space-y-2 p-6 text-sm font-semibold" style={{ color: "var(--muted)" }}>
        <C k="footer.source" d={`From destiny.gg's chat logs, ${day(data.from)} to ${day(data.through, true)}, minus anything we wouldn't print.`} as="p" className="block" />
        <p>
          <C
            k="footer.notTags"
            d="Names that are also everyday words weren't counted as tags, so a message about chicken doesn't count as tagging chicken:"
            style={{ color: "var(--text)" }}
          />{" "}
          <WordList at={["notTags"]} />.
        </p>
      </footer>
    </div>
  );
}

/** A section: its emote, a heading and a few words of introduction, all editable. */
export function Section({ id, title, emote, onEmote, children }: { id: string; title: string; emote: string; onEmote: (e: string) => (ev: React.MouseEvent) => void; children: ReactNode }) {
  return (
    <section id={id} className="cozy-panel scroll-mt-[calc(var(--lab-header,64px)+1rem)] space-y-6 p-6 sm:p-8">
      <h2 className="flex items-center gap-3 text-3xl font-black">
        <button type="button" className="cozy-row rounded-xl p-1" onClick={onEmote(emote)} aria-label={`A burst of ${emote}`}>
          <Emote name={emote} size={1} title="" />
        </button>
        <C k={`section.${id}.title`} d={title} />
      </h2>
      <C k={`section.${id}.intro`} optional as="p" className="block max-w-3xl text-lg font-semibold" />
      {children}
    </section>
  );
}

/** One cell of the name table: who said it most, and how often. */
function Crown({ at, filled, year = false }: { at: Path; filled: boolean; year?: boolean }) {
  const editing = useEditing();
  return (
    <td className="rounded-xl px-3 py-1" style={{ background: year ? "var(--highlight)" : "var(--cream)" }}>
      {filled ? (
        <span className="flex items-baseline justify-between gap-3">
          <T at={[...at, "nick"]} className={`truncate ${year ? "font-black" : "font-bold"}`} />
          <T at={[...at, "n"]} format={fmt} className="hand shrink-0 text-base tabular-nums" style={{ color: "var(--muted)" }} />
        </span>
      ) : editing ? (
        <span style={{ color: "var(--muted)" }}>–</span>
      ) : (
        "–"
      )}
    </td>
  );
}

/** The highlights: an emote, a big number in handwriting, and the story. */
export function Cards({ at, onEmote }: { at: Path; onEmote: (e: string) => (ev: React.MouseEvent) => void }) {
  const cards = (useReviewAt(at) as Card[] | undefined) ?? [];
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, i) => (
          <div
            key={i}
            className="edit-item relative rounded-2xl border-2 p-4"
            style={{ background: "var(--cream)", borderColor: "var(--panel-border)", boxShadow: "0 4px 0 var(--cream-shadow)" }}
          >
            <ItemTools at={at} i={i} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="cozy-row rounded-xl p-1" onClick={onEmote(c.emote)} aria-label={`A burst of ${c.emote}`}>
                <Emote name={c.emote} size={0.9} title="" />
              </button>
              <T at={[...at, i, "big"]} className="hand text-4xl font-bold tabular-nums" placeholder="Big number" />
              <EmoteName at={[...at, i, "emote"]} />
            </div>
            <T at={[...at, i, "title"]} as="h3" className="mt-2 block font-black" placeholder="Title" />
            <T at={[...at, i, "text"]} as="p" className="mt-1 block text-sm font-semibold" style={{ color: "var(--muted)" }} placeholder="What it means" />
          </div>
        ))}
      </div>
      <AddItem at={at} label="Add a card" template={{ emote: "PepoG", big: "", title: "", text: "" }} />
    </div>
  );
}

/** Sorted bars from zero, labelled, growing in as they scroll into view. */
export function Bars({ k, title, at }: { k: string; title: string; at: Path }) {
  const bars = (useReviewAt(at) as Bar[] | undefined) ?? [];
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
      <C k={`${k}.title`} d={title} as="h3" className="mb-2 block font-black" />
      <ol ref={list} className="space-y-2">
        {bars.map((b, i) => (
          <li key={i} className="edit-item relative">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-bold">
                {b.emote && <Emote name={b.emote} size={0.45} title="" />}
                <T at={[...at, i, "name"]} className="truncate" />
                <ItemTools at={at} i={i} place="inline" />
              </span>
              <T at={[...at, i, "value"]} format={fmt} className="hand shrink-0 text-lg font-bold tabular-nums" />
            </div>
            <div className="mt-0.5 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--cream)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-out"
                style={{ width: seen ? `${(b.value / most) * 100}%` : 0, background: i === 0 ? "var(--coral)" : "var(--primary)", transitionDelay: `${i * 60}ms` }}
              />
            </div>
            {"sub" in b && <T at={[...at, i, "sub"]} optional as="p" className="mt-0.5 block truncate text-xs font-semibold" style={{ color: "var(--muted)" }} />}
          </li>
        ))}
      </ol>
      <AddItem at={at} label="Add a bar" template={{ name: "", value: 0 }} />
    </div>
  );
}

function Chips({ k, title, at, note }: { k: string; title: string; at: Path; note?: string }) {
  const chips = (useReviewAt(at) as { label: string; n: number }[] | undefined) ?? [];
  return (
    <div>
      <C k={`${k}.title`} d={title} as="h3" className="mb-2 block font-black" />
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((_, i) => (
          <li key={i} className="edit-item cozy-chip relative">
            <ItemTools at={at} i={i} place="above" />
            <T at={[...at, i, "label"]} />{" "}
            <span className="hand ml-1 text-base">
              ×<T at={[...at, i, "n"]} format={fmt} />
            </span>
          </li>
        ))}
      </ul>
      <AddItem at={at} label="Add one" template={{ label: "", n: 0 }} />
      {note !== undefined && <C k={`${k}.note`} d={note} optional as="p" className="mt-2 block text-xs font-semibold" style={{ color: "var(--muted)" }} />}
    </div>
  );
}
