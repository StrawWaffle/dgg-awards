import { useEffect, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useQuery } from "@tanstack/react-query";
import { fetchAuthSession, fetchConfig } from "@/lib/queries";

const formatTimeDelta = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (h > 24) {
    const d = Math.floor(h / 24);
    const remH = h % 24;
    return `${d}d ${pad(remH)}h ${pad(m)}m ${pad(s)}s`;
  }

  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export function Status() {
  const [timeLeftStart, setTimeLeftStart] = useState(0);
  const [timeLeftEnd, setTimeLeftEnd] = useState(0);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchAuthSession });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: fetchConfig });

  useEffect(() => {
    if (configQuery.data === undefined) {
      return;
    }

    const calculateTimeLeft = () => {
      // Number(undefined) is NaN: no countdown when the time isn't set, as before.
      const target = new Date(Number(configQuery.data.startTime) * 1000).getTime();
      const now = Date.now();
      const difference = Math.max(0, Math.floor((target - now) / 1000));

      setTimeLeftStart(difference);
    };

    calculateTimeLeft();

    const intervalId = setInterval(() => {
      calculateTimeLeft();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [configQuery.data]);

  useEffect(() => {
    if (configQuery.data === undefined) {
      return;
    }

    const calculateTimeLeft = () => {
      const target = new Date(Number(configQuery.data.endTime) * 1000).getTime();
      const now = Date.now();
      const difference = Math.max(0, Math.floor((target - now) / 1000));

      setTimeLeftEnd(difference);
    };

    calculateTimeLeft();

    const intervalId = setInterval(() => {
      calculateTimeLeft();
    }, 1000);

    return () => clearInterval(intervalId);
  });

  if (!configQuery.data?.startTime) return null;

  const targetDate = new Date(configQuery.data.startTime * 1000);

  if (timeLeftStart <= 0) {
    if (timeLeftEnd <= 0) {
      return null;
    }
    
    if (meQuery.data) {
      return (
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div
                className="inline-flex cursor-default items-center gap-3 rounded-md border p-2 shadow-sm"
                role="timer"
                aria-live="polite"
              >
                <div className="flex flex-col items-center justify-center">
                  <span className="mb-1 text-[10px] leading-none font-medium tracking-wider uppercase opacity-70">
                    Voting ends in
                  </span>
                  <span className="font-mono text-xl leading-none font-bold tracking-tight tabular-nums">
                    {formatTimeDelta(timeLeftEnd)}
                  </span>
                </div>
              </div>
            </Tooltip.Trigger>

            <Tooltip.Portal>
              <Tooltip.Content
                className="bg-white-1 z-50 overflow-hidden rounded-md border border-slate-200 px-3 py-1.5 text-sm text-neutral-700 shadow-md"
                sideOffset={5}
                side="bottom"
              >
                <div className="flex items-center gap-2">
                  <span>{targetDate.toLocaleString()}</span>
                </div>
                <Tooltip.Arrow className="fill-white-1" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      );
    } else {
      return (
        <p className="text-red-400">
          You may vote on each category below after{" "}
          <a href="/signin" className="text-blue-1">
            signing in
          </a>{" "}
          with your{" "}
          <a className="text-blue-1" href="https://destiny.gg/" target="_blank">
            Destiny.gg
          </a>{" "}
          account.
        </p>
      );
    }
  } else
    return (
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div
              className="inline-flex cursor-default items-center gap-3 rounded-md border p-2 shadow-sm"
              role="timer"
              aria-live="polite"
            >
              <div className="flex flex-col items-center justify-center">
                <span className="mb-1 text-[10px] leading-none font-medium tracking-wider uppercase opacity-70">
                  Voting starts in
                </span>
                <span className="font-mono text-xl leading-none font-bold tracking-tight tabular-nums">
                  {formatTimeDelta(timeLeftStart)}
                </span>
              </div>
            </div>
          </Tooltip.Trigger>

          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-white-1 z-50 overflow-hidden rounded-md border border-slate-200 px-3 py-1.5 text-sm text-neutral-700 shadow-md"
              sideOffset={5}
              side="bottom"
            >
              <div className="flex items-center gap-2">
                <span>{targetDate.toLocaleString()}</span>
              </div>
              <Tooltip.Arrow className="fill-white-1" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
}
