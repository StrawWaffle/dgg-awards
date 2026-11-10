import { type ReactNode, useRef, useState } from "react";

/**
 * Where things sit on the big screen, as fractions of it (0–1), so a layout
 * fits any window size. The default copies Destiny's usual stream: chat in a
 * column on the left, his camera under it, the show on the right two thirds.
 * The bottom-right corner (his TTS icon) and the bottom middle (Discord
 * speakers) are left to the stage's characters, since his overlay goes there.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Box = "chat" | "camera" | "show";
export type Layout = Record<Box, Rect>;

const COLUMN = 1 / 3;
const CAMERA_H = 0.27;
const RIGHT: Rect = { x: COLUMN + 0.015, y: 0.15, w: 1 - COLUMN - 0.03, h: 0.69 };
export const DEFAULT_LAYOUT: Layout = {
  chat: { x: 0, y: 0, w: COLUMN, h: 1 - CAMERA_H },
  camera: { x: 0, y: 1 - CAMERA_H, w: COLUMN, h: CAMERA_H },
  // The show: the scenes (title, nominees, results, winner), and clips lowered into the same place.
  show: RIGHT,
};
/** The defaults for this chat setting: with no chat, the scenes centre, above the camera slot. */
export function defaultLayout(chatOpen: boolean): Layout {
  return chatOpen ? DEFAULT_LAYOUT : { ...DEFAULT_LAYOUT, show: { x: 0.18, y: 0.15, w: 0.64, h: 1 - CAMERA_H - 0.17 } };
}
export const BOX_LABEL: Record<Box, string> = { chat: "Chat", camera: "Camera", show: "Show: scenes, results and clips" };

const KEY = "lab.stage.layout";
/** The boxes moved in this browser; the rest follow the defaults. */
export function loadLayout(): Partial<Layout> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Layout>;
    const out: Partial<Layout> = {};
    for (const k of Object.keys(DEFAULT_LAYOUT) as Box[]) {
      const r = saved[k];
      if (r && [r.x, r.y, r.w, r.h].every((v) => typeof v === "number" && Number.isFinite(v))) out[k] = clampRect(r);
    }
    return out;
  } catch {
    return {};
  }
}
export function saveLayout(layout: Partial<Layout> | null) {
  try {
    if (layout) localStorage.setItem(KEY, JSON.stringify(layout));
    else localStorage.removeItem(KEY);
  } catch {}
}

const MIN = 0.08;
function clampRect(r: Rect): Rect {
  const w = Math.min(1, Math.max(MIN, r.w));
  const h = Math.min(1, Math.max(MIN, r.h));
  return { x: Math.min(1 - w, Math.max(0, r.x)), y: Math.min(1 - h, Math.max(0, r.y)), w, h };
}
/** Snaps to a half-percent grid, so boxes line up easily. */
const snap = (v: number) => Math.round(v * 200) / 200;

export const rectStyle = (r: Rect): React.CSSProperties => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});

/**
 * A box on the big screen. While arranging, it's outlined with its name and
 * can be dragged, or resized from its bottom-right corner; its content can't
 * be clicked then. `frame` is the big screen, for converting pixels to fractions.
 */
export function Movable({
  box,
  rect,
  arranging,
  frame,
  onChange,
  className = "",
  style,
  children,
}: {
  box: Box;
  rect: Rect;
  arranging: boolean;
  frame: React.RefObject<HTMLElement | null>;
  onChange: (r: Rect) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}) {
  const drag = useRef<{ mode: "move" | "size"; x: number; y: number; start: Rect } | null>(null);
  const [active, setActive] = useState(false);
  const begin = (mode: "move" | "size") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: rect };
    setActive(true);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const f = frame.current?.getBoundingClientRect();
    if (!d || !f) return;
    const dx = (e.clientX - d.x) / f.width;
    const dy = (e.clientY - d.y) / f.height;
    const s = d.start;
    onChange(
      clampRect(
        d.mode === "move"
          ? { ...s, x: snap(s.x + dx), y: snap(s.y + dy) }
          : { ...s, w: snap(Math.min(1 - s.x, s.w + dx)), h: snap(Math.min(1 - s.y, s.h + dy)) },
      ),
    );
  };
  const end = () => {
    drag.current = null;
    setActive(false);
  };
  return (
    <div className={`absolute ${className}`} style={{ ...style, ...rectStyle(rect) }}>
      {children}
      {arranging && (
        <div
          className="pointer-events-auto absolute inset-0 z-[500] cursor-move touch-none select-none"
          style={{
            border: "2px dashed var(--header)",
            background: active ? "color-mix(in oklab, var(--header) 18%, transparent)" : "color-mix(in oklab, var(--header) 8%, transparent)",
          }}
          onPointerDown={begin("move")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span
            className="absolute top-1.5 left-1.5 rounded-md px-2 py-0.5 text-sm font-extrabold text-white"
            style={{ background: "var(--header)" }}
          >
            {BOX_LABEL[box]}
          </span>
          <span
            aria-label={`Resize ${BOX_LABEL[box]}`}
            className="absolute right-0 bottom-0 h-5 w-5 cursor-nwse-resize"
            style={{ background: "var(--header)" }}
            onPointerDown={begin("size")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </div>
      )}
    </div>
  );
}
