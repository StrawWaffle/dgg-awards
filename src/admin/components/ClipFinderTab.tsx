import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import { type ClipFinder, fetchAdminNom, fetchClipFinder, fetchConfig, uploadClipFinder } from "@/lib/queries";

// Clip candidates from the year's chat (rinlux, 2026-11-20): moments where an
// emote spikes, each linked to that moment in the VOD. dgg-scs builds them
// (tools/clip-finder, it needs the chat archive); this tab loads its
// clips.json and lets admins browse and watch them.

type Spike = ClipFinder["spikes"][number];
type Vod = ClipFinder["vods"][string];

const lists = [
  { value: "chatters", label: "Most chatters" },
  { value: "stands out", label: "Stands out most" },
] as const;

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const clock = (s: number) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function ClipFinderTab() {
  const config = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const year = Number(config.data?.awardYear) || new Date().getFullYear();
  const clips = useQuery({ queryKey: ["clip-finder", year], queryFn: () => fetchClipFinder(year), enabled: config.isSuccess });
  const awards = useQuery({ queryKey: ["admin-nominees"], queryFn: fetchAdminNom });
  const [emote, setEmote] = useState("");
  const [span, setSpan] = useState(30);
  const [list, setList] = useState<Spike["list"]>("chatters");

  if (config.isPending || clips.isPending) return <p className="text-sm">Loading…</p>;
  if (clips.isError) return <ErrorText>{clips.error.message}</ErrorText>;
  const data = clips.data;
  const awardTitle = (id: string | null) => awards.data?.find((a) => a.id === id)?.title;
  const chosen = emote || data?.emotes[0]?.emote || "";
  const shown = data?.spikes.filter((s) => s.emote === chosen && s.window === span && s.list === list) ?? [];

  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-neutral-600">
        Moments in {year}'s chat where an emote spikes, for finding clips. Each one links to the VOD a little before
        the spike, with what was on stream (from the LWOD sheets) and what chat said.
      </p>
      <Upload year={year} data={data} />
      {data && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Emote">
              <select className={`${inputClass} w-72!`} value={chosen} onChange={(e) => setEmote(e.currentTarget.value)}>
                {data.emotes.map((e) => (
                  <option key={e.emote} value={e.emote}>
                    {e.emote}
                    {awardTitle(e.award) ? ` (${awardTitle(e.award)})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Window">
              <select className={`${inputClass} w-24!`} value={span} onChange={(e) => setSpan(Number(e.currentTarget.value))}>
                {data.windows.map((w) => (
                  <option key={w} value={w}>
                    {w} s
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order">
              <select className={`${inputClass} w-44!`} value={list} onChange={(e) => setList(e.currentTarget.value as Spike["list"])}>
                {lists.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-xs text-neutral-500">
            {list === "chatters"
              ? `The ${span}-second stretches where the most chatters used ${chosen}.`
              : `Chatters using ${chosen}, scaled down when another emote had more, so moments where it's the emote of the moment come first.`}{" "}
            At least {Math.round(data.spacing / 60)} minutes apart and at most {data.perVod} per stream.
          </p>
          <section className="rounded border border-neutral-200 bg-white">
            {shown.length === 0 && <p className="p-3 text-sm">Nothing for this one.</p>}
            <ol>
              {shown.map((s) => (
                <Moment key={`${s.at}-${s.list}`} spike={s} vod={data.vods[s.vod]} lead={data.lead} />
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function Upload({ year, data }: { year: number; data: ClipFinder | null }) {
  const queryClient = useQueryClient();
  const load = useMutation({
    mutationFn: async (file: File) => {
      let doc;
      try {
        doc = JSON.parse(await file.text());
      } catch {
        throw new Error("That file isn't JSON. Pick the clips.json the clip finder wrote.");
      }
      if (doc?.year !== year) {
        throw new Error(`That file is for ${doc?.year ?? "no year"}, but the award year in Settings is ${year}.`);
      }
      await uploadClipFinder(doc);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clip-finder"] }),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {data ? (
        <span className="text-neutral-600">
          Built {dateTime.format(new Date(data.built))} from chat up to {dateTime.format(new Date(data.chatThrough))}.{" "}
          {data.vodCount} streams; {data.pinned} have their start time to the second, the rest to the minute.
        </span>
      ) : (
        <span>Nothing loaded for {year} yet.</span>
      )}
      <label className="cursor-pointer rounded border border-neutral-300 bg-white px-3 py-1 hover:bg-neutral-100">
        {load.isPending ? "Loading…" : data ? "Load a newer clips.json" : "Load clips.json"}
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          disabled={load.isPending}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) load.mutate(file);
          }}
        />
      </label>
      <ErrorText>{load.error?.message}</ErrorText>
    </div>
  );
}

function Moment({ spike: s, vod, lead }: { spike: Spike; vod: Vod | undefined; lead: number }) {
  const [playing, setPlaying] = useState(false);
  const start = Math.max(0, s.offset - lead);
  const topic = vod?.topics.filter((t) => t[0] <= s.offset).at(-1);
  const top = s.emotes[0];
  const drowned = top && top[0] !== s.emote && top[1] > s.users;
  const rustle = `https://rustlesearch.dev/surrounds?${new URLSearchParams({ channel: "Destinygg", date: s.firstTs.replace("+00:00", "Z"), username: s.firstNick })}`;
  return (
    <li className="space-y-1 border-b border-neutral-200 p-3 text-sm last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="w-6 text-right text-neutral-500">{s.rank}.</span>
        <span className="font-bold">
          {s.users} chatters{s.chatters ? `, ${Math.round((s.users / s.chatters) * 100)}% of chat` : ""}
        </span>
        <span className="text-neutral-600">{dateTime.format(new Date(s.peak))}</span>
        {drowned && (
          <span className="text-amber-700">
            {top[0]} had more ({top[1]})
          </span>
        )}
      </div>
      <div className="pl-9 text-neutral-600">
        <p>{vod?.title}</p>
        {topic && (
          <p>
            {topic[1]}: {topic[2]}
          </p>
        )}
        <p className="text-xs">
          Emotes then: {s.emotes.map(([e, n]) => `${e} ${n}`).join(", ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-9">
        <Button onClick={() => setPlaying(!playing)}>{playing ? "Close" : `Play from ${clock(start)}`}</Button>
        <a className="underline" href={`https://youtu.be/${s.vod}?t=${start}`} target="_blank" rel="noopener">
          YouTube ↗
        </a>
        <a className="underline" href={rustle} target="_blank" rel="noopener">
          Chat around it ↗
        </a>
        {vod && !vod.pinned && <span className="text-xs text-amber-700">Start time to the minute only</span>}
      </div>
      {playing && (
        <div className="pl-9">
          <iframe
            className="aspect-video w-full max-w-2xl rounded border border-neutral-200"
            src={`https://www.youtube-nocookie.com/embed/${s.vod}?start=${start}&autoplay=1`}
            title={vod?.title ?? "VOD"}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        </div>
      )}
      <details className="pl-9">
        <summary className="cursor-pointer text-xs text-neutral-500">What chat said</summary>
        <div className="mt-1 space-y-1 text-xs">
          <p className="text-neutral-500">The minute before:</p>
          <Lines lines={s.before} empty="(nothing)" />
          <p className="text-neutral-500">With {s.emote}:</p>
          <Lines lines={s.during} empty="(only the emote)" />
        </div>
      </details>
    </li>
  );
}

function Lines({ lines, empty }: { lines: [string, string][]; empty: string }) {
  if (!lines.length) return <p>{empty}</p>;
  return (
    <ul>
      {lines.map(([nick, text], i) => (
        <li key={i} className="break-words">
          <b>{nick}</b> {text}
        </li>
      ))}
    </ul>
  );
}
