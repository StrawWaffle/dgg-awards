import { useRef, useState } from "react";
import { originOf, useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";

// Sample awards for trying the reactions; not real data.
const STEPS = [
  { title: "Cutestiny of the Year", nominees: ["Destiny Loves Us", "MrMouton Plays Chess", "Destiny Dresses Up"] },
  { title: "Omegalul of the Year", nominees: ["Destiny Makes a Joke", "AE Bullies Miles", "Unc Raiders"] },
];

/**
 * A mock of the voting flow, to try emote reactions on: Klappa when you vote,
 * Skip when you skip, PepoG taking notes on the survey question, and a
 * CHEERSTINY shower when you're done.
 */
export function VoteDemo() {
  const box = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const done = step > STEPS.length;
  const next = () => {
    setPicked(null);
    setStep((s) => s + 1);
  };

  return (
    <div ref={box} className="relative min-h-80 rounded-md bg-black/25 p-5">
      {layer}
      <p className="text-white-1/60 mb-3 text-xs">
        Step {Math.min(step + 1, STEPS.length + 1)} of {STEPS.length + 1}
      </p>

      {step < STEPS.length && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold">{STEPS[step]!.title}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {STEPS[step]!.nominees.map((n) => (
              <button
                key={n}
                type="button"
                onClick={(e) => {
                  setPicked(n);
                  fire("Klappa", ...originOf(e, box.current), 6);
                }}
                className={`rounded-md border-2 p-4 text-left transition-colors ${
                  picked === n ? "border-orange-1 bg-orange-1/10" : "border-white/15 hover:border-white/40"
                }`}
              >
                <span className="block font-bold">{n}</span>
                <span className="text-white-1/60 text-xs">{picked === n ? "Your pick" : "Pick this one"}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={(e) => {
                fire("Skip", ...originOf(e, box.current), 3);
                next();
              }}
              className="rounded border border-white/20 px-3 py-1 text-sm hover:bg-white/10"
            >
              Skip this award
            </button>
            <button
              type="button"
              disabled={!picked}
              onClick={next}
              className="bg-orange-1 text-black-1 rounded px-3 py-1 text-sm font-bold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === STEPS.length && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-3 text-xl font-bold">
            <Emote name="PepoG" size={1.2} title="Taking notes" /> A quick question
          </h3>
          <label className="block space-y-1 text-sm">
            <span>What was your favourite moment of the year?</span>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.currentTarget.value)}
              className="block w-full max-w-md rounded border border-white/20 bg-black/30 px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={(e) => {
              const [x, y] = originOf(e, box.current);
              fire("CHEERSTINY", x, y, 10);
              setTimeout(() => fire("Klappa", x + 80, y, 8), 250);
              next();
            }}
            className="bg-orange-1 text-black-1 rounded px-3 py-1 text-sm font-bold"
          >
            Finish
          </button>
        </div>
      )}

      {done && (
        <div className="space-y-3 text-center">
          <div className="flex justify-center gap-3">
            <Emote name="CHEERSTINY" size={1.5} />
            <Emote name="Klappa" size={1.5} />
            <Emote name="widepeepoHappy" size={1.5} />
          </div>
          <p className="text-lg font-bold">Thanks for voting!</p>
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setAnswer("");
            }}
            className="text-sm underline"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
