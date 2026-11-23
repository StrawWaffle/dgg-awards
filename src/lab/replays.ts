// Real destiny.gg chat from its busiest moments, for the big screen's
// simulator: three minutes each (the busiest minute of a year, with a minute
// either side), from dgg-scs data/chat-peaks (its README has the numbers).
// Served to admins only by /api/lab/replay/:id; the messages name real people.
export const REPLAYS = [
  { id: "2016-11-06_0408", label: "2016: sharpest burst", about: "295 messages in one second" },
  { id: "2020-03-21_0511", label: "2020: busiest minute", about: "4,430 messages in a minute, a chat poll" },
  { id: "2022-08-12_2248", label: "2022: busiest 10 s", about: "1,657 messages in 10 seconds, a chat poll" },
  { id: "2023-02-03_0605", label: "2023: long and busy", about: "8,324 messages in 3 minutes" },
  { id: "2026-11-03_2225_election-night", label: "2026: election night", about: "264 messages in one second" },
] as const;
export type ReplayId = (typeof REPLAYS)[number]["id"];
export const isReplay = (id: string): id is ReplayId => REPLAYS.some((r) => r.id === id);
