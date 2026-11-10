import { useEffect, useRef, useState } from "react";
import { useLabTheme } from "@/lab/theme";

/**
 * The show's controls, drawn in two places from the same state: inside the
 * camera slot on the big screen (the streamer's camera covers them on stream,
 * but he sees them in his own browser), or in a small window popped out
 * beside it. The two windows talk over a BroadcastChannel: same browser, same
 * site, no server. The big screen owns the show; the pop-out only sends
 * commands and draws the state it's sent.
 */
export const SCENES = [
  { id: "title", label: "Title" },
  { id: "options", label: "Nominees" },
  { id: "results", label: "Results" },
  { id: "winner", label: "Winner" },
] as const;
export type Scene = (typeof SCENES)[number]["id"];
export const NEXT_LABEL: Record<Scene, string> = { title: "Nominees", options: "Results", results: "Winner", winner: "Next award" };

export type ShowState = {
  awards: string[];
  awardIndex: number;
  scene: Scene;
  /** Results: rows revealed so far, of `rows`. */
  target: number;
  rows: number;
  revealed: boolean;
  /** A ranked award decided by a runoff: its rounds, the one shown (null: the board), and whether the board is done. */
  runoff: { rounds: number; round: number | null; ready: boolean } | null;
  /** Nominees of this award with a clip to play: their index and name. */
  clips: { i: number; title: string }[];
  playing: boolean;
  simulated: boolean;
};
export type ShowCommand =
  | { t: "goto"; index: number; scene: Scene; back?: boolean }
  | { t: "step"; by: 1 | -1 }
  | { t: "reveal"; all: boolean }
  /** Reveal everyone but the top three, from last place up. */
  | { t: "allButTop3" }
  /** Show the runoff's round (0-based), or null for the board. */
  | { t: "runoff"; round: number | null }
  | { t: "play"; i: number }
  | { t: "close" };

type Message =
  | { from: "stage"; state: ShowState }
  | { from: "remote"; hello: true }
  | { from: "remote"; ping: true }
  | { from: "remote"; bye: true }
  | { from: "remote"; cmd: ShowCommand };

const CHANNEL = "dgga-stage";
const channel = () => (typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null);

/** Opens the pop-out controls (or brings them to the front). */
export function popOutControls() {
  return window.open(`${location.pathname}?remote=stage`, "dgga-stage-remote", "popup,width=560,height=320");
}

/**
 * The big screen's side of the channel: answers commands with `run`, sends
 * `state` whenever it changes, and says whether a pop-out is open (it pings
 * every two seconds; gone after five without one).
 */
export function useStageChannel(state: ShowState, run: (c: ShowCommand) => void) {
  const ch = useRef<BroadcastChannel | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const stateRef = useRef(state);
  stateRef.current = state;
  const [seen, setSeen] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const c = channel();
    ch.current = c;
    if (!c) return;
    c.onmessage = (e: MessageEvent<Message>) => {
      const m = e.data;
      if (m.from !== "remote") return;
      if ("bye" in m) return setSeen(0);
      setSeen(Date.now());
      setNow(Date.now());
      if ("hello" in m) c.postMessage({ from: "stage", state: stateRef.current } satisfies Message);
      if ("cmd" in m) runRef.current(m.cmd);
    };
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(tick);
      c.close();
    };
  }, []);
  const json = JSON.stringify(state);
  useEffect(() => {
    ch.current?.postMessage({ from: "stage", state: stateRef.current } satisfies Message);
  }, [json]);
  return seen > 0 && now - seen < 5000;
}

/**
 * The controls: the award, its four scenes, Back and Next, and in the
 * results Reveal next, All but the top 3 and Reveal all, then the runoff a
 * round at a time; clips to play where there are any.
 */
export function ShowControls({ state, send }: { state: ShowState; send: (c: ShowCommand) => void }) {
  const at = SCENES.findIndex((x) => x.id === state.scene);
  const done = state.target >= state.rows;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <select
          value={state.awardIndex}
          onChange={(e) => send({ t: "goto", index: Number(e.currentTarget.value), scene: "title" })}
          className="cozy-input min-w-0 flex-1 py-1! font-extrabold"
          aria-label="Award"
          disabled={!state.awards.length}
        >
          {state.awards.map((a, i) => (
            <option key={a} value={i}>
              {i + 1}. {a}
            </option>
          ))}
        </select>
        {state.simulated && (
          <span className="shrink-0 font-bold" style={{ color: "var(--muted)" }} title="Made-up votes, never saved">
            Simulated votes
          </span>
        )}
      </div>
      <nav aria-label="Scenes" className="flex gap-1">
        {SCENES.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => state.scene !== x.id && send({ t: "goto", index: state.awardIndex, scene: x.id, back: i < at })}
            aria-current={state.scene === x.id ? "step" : undefined}
            className="cozy-row flex-1 rounded-lg px-2 py-1 font-extrabold"
            style={state.scene === x.id ? { background: "var(--header)", color: "white" } : { color: "var(--muted)", background: "var(--cream)" }}
          >
            {i + 1}. {x.label}
          </button>
        ))}
      </nav>
      {(state.scene === "results" || state.clips.length > 0 || state.playing) && (
        <div className="flex flex-wrap items-center gap-2">
          {state.scene === "results" && (
            <>
              <button type="button" className="cozy-btn py-1!" onClick={() => send({ t: "reveal", all: false })} disabled={done}>
                Reveal next
              </button>
              {state.rows > 3 && (
                <button type="button" className="cozy-btn py-1!" onClick={() => send({ t: "allButTop3" })} disabled={state.target >= state.rows - 3}>
                  All but the top 3
                </button>
              )}
              <button type="button" className="cozy-btn py-1!" onClick={() => send({ t: "reveal", all: true })} disabled={done}>
                Reveal all
              </button>
              {state.runoff && <RunoffControls runoff={state.runoff} send={send} />}
            </>
          )}
          {state.playing ? (
            <button type="button" className="cozy-btn py-1!" onClick={() => send({ t: "close" })}>
              Close the clip
            </button>
          ) : (
            state.scene !== "results" &&
            state.clips.length > 0 && <PlayPicker clips={state.clips} onPlay={(i) => send({ t: "play", i })} />
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" className="cozy-btn py-1!" onClick={() => send({ t: "step", by: -1 })} disabled={!state.awards.length}>
          ← Back
        </button>
        <button
          type="button"
          className={`cozy-btn ml-auto py-1! ${state.scene !== "results" || state.revealed ? "primary" : ""}`}
          onClick={() => send({ t: "step", by: 1 })}
          disabled={!state.awards.length}
        >
          {NEXT_LABEL[state.scene]} →
        </button>
      </div>
    </div>
  );
}

/** The runoff, from the controls: start it once the board is in, then round by round. */
function RunoffControls({ runoff, send }: { runoff: NonNullable<ShowState["runoff"]>; send: (c: ShowCommand) => void }) {
  const { round, rounds, ready } = runoff;
  if (round === null) {
    return (
      <button type="button" className="cozy-btn primary py-1!" onClick={() => send({ t: "runoff", round: 0 })} disabled={!ready}>
        Run the runoff →
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" className="cozy-btn py-1!" onClick={() => send({ t: "runoff", round: round > 0 ? round - 1 : null })}>
        ← Round
      </button>
      <span className="font-extrabold">
        Round {round + 1} of {rounds}
      </span>
      <button
        type="button"
        className={`cozy-btn py-1! ${round < rounds - 1 ? "primary" : ""}`}
        onClick={() => send({ t: "runoff", round: round + 1 })}
        disabled={round >= rounds - 1}
      >
        Next round →
      </button>
    </span>
  );
}

function PlayPicker({ clips, onPlay }: { clips: ShowState["clips"]; onPlay: (i: number) => void }) {
  const [pick, setPick] = useState(clips[0]!.i);
  const valid = clips.some((c) => c.i === pick) ? pick : clips[0]!.i;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <select value={valid} onChange={(e) => setPick(Number(e.currentTarget.value))} className="cozy-input min-w-0 flex-1 py-1!" aria-label="Clip to play">
        {clips.map((c) => (
          <option key={c.i} value={c.i}>
            {c.title}
          </option>
        ))}
      </select>
      <button type="button" className="cozy-btn py-1!" onClick={() => onPlay(valid)}>
        ▶ Play
      </button>
    </span>
  );
}

/**
 * The pop-out window (`?remote=stage`): only the controls, driving the big
 * screen open in another window of this browser.
 */
export function StageRemote() {
  useLabTheme();
  const [state, setState] = useState<ShowState | null>(null);
  const ch = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    document.title = "Big screen controls";
    const c = channel();
    ch.current = c;
    if (!c) return;
    c.onmessage = (e: MessageEvent<Message>) => {
      if (e.data.from === "stage") setState(e.data.state);
    };
    c.postMessage({ from: "remote", hello: true } satisfies Message);
    const ping = setInterval(() => c.postMessage({ from: "remote", ping: true } satisfies Message), 2000);
    const bye = () => c.postMessage({ from: "remote", bye: true } satisfies Message);
    addEventListener("pagehide", bye);
    return () => {
      clearInterval(ping);
      removeEventListener("pagehide", bye);
      bye();
      c.close();
    };
  }, []);
  const send = (cmd: ShowCommand) => ch.current?.postMessage({ from: "remote", cmd } satisfies Message);
  return (
    <main className="min-h-dvh p-4" style={{ background: "var(--bg)" }}>
      <div className="cozy-panel space-y-3 p-4">
        <h1 className="font-black">Big screen controls</h1>
        {!ch.current && typeof BroadcastChannel !== "function" ? (
          <p className="font-semibold">This browser can't link windows. Use the controls on the big screen.</p>
        ) : state ? (
          <ShowControls state={state} send={send} />
        ) : (
          <p className="font-semibold" style={{ color: "var(--muted)" }}>
            Waiting for the big screen. Open the lab's Big screen in this browser.
          </p>
        )}
      </div>
    </main>
  );
}
