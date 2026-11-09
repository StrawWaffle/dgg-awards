import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Button } from "@/admin/components/editor/fields";

const SHAPES = [
  { id: "square", label: "Square (site cards)", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "none", label: "No crop", ratio: 0 },
] as const;
const SIZES = [
  { id: "full", label: "Full size", max: Infinity },
  { id: "1200", label: "1200 px", max: 1200 },
  { id: "800", label: "800 px", max: 800 },
  { id: "400", label: "400 px", max: 400 },
] as const;
const FRAME_W = 440;
/** The server's limit for pictures. */
const MAX_BYTES = 5 * 1024 * 1024;
/** What the server takes as it is; anything else (AVIF) has to be converted here. */
const AS_IS_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Crop and shrink a still image in the browser before it's uploaded: pick a
 * shape, drag the picture into place, zoom, and pick a size. "Upload as it
 * is" skips all of it, when the server can take the file unchanged (not for
 * AVIF, or over 5 MB). JPEGs and AVIFs come out as JPEG; anything else as
 * PNG, so transparency survives.
 */
export function PictureCropper({
  file,
  onDone,
  onCancel,
}: {
  file: File;
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const asIs = AS_IS_TYPES.includes(file.type) && file.size <= MAX_BYTES;
  const [shape, setShape] = useState<(typeof SHAPES)[number]["id"]>("square");
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("full");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    // createImageBitmap applies a photo's EXIF rotation, as browsers show it.
    createImageBitmap(file).then(setBitmap, () => setFailed(true));
  }, [file]);

  const ratio = SHAPES.find((s) => s.id === shape)!.ratio;
  const iw = bitmap?.width ?? 1;
  const ih = bitmap?.height ?? 1;
  const frameH = ratio ? FRAME_W / ratio : (FRAME_W * ih) / iw;
  // Cover the frame at zoom 1; the offset is the image's top-left in the frame.
  const scale = ratio ? Math.max(FRAME_W / iw, frameH / ih) * zoom : FRAME_W / iw;
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(FRAME_W - iw * scale, o.x)),
    y: Math.min(0, Math.max(frameH - ih * scale, o.y)),
  });
  const pos = clamp(offset);

  // A new shape starts unzoomed with the picture centred in the frame.
  useEffect(() => {
    if (!bitmap) return;
    const h = ratio ? FRAME_W / ratio : (FRAME_W * bitmap.height) / bitmap.width;
    const s = ratio ? Math.max(FRAME_W / bitmap.width, h / bitmap.height) : FRAME_W / bitmap.width;
    setZoom(1);
    setOffset({ x: (FRAME_W - bitmap.width * s) / 2, y: (h - bitmap.height * s) / 2 });
  }, [ratio, bitmap]);

  // Draw the preview.
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas || !bitmap) return;
    canvas.width = FRAME_W;
    canvas.height = frameH;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, FRAME_W, frameH);
    ctx.drawImage(bitmap, pos.x, pos.y, iw * scale, ih * scale);
  }, [bitmap, pos.x, pos.y, scale, frameH, iw, ih]);

  /** The crop in the original's pixels, scaled to the chosen size. */
  const output = () => {
    const sx = ratio ? -pos.x / scale : 0;
    const sy = ratio ? -pos.y / scale : 0;
    const sw = ratio ? FRAME_W / scale : iw;
    const sh = ratio ? frameH / scale : ih;
    const max = SIZES.find((s) => s.id === size)!.max;
    const factor = Math.min(1, max / Math.max(sw, sh));
    return { sx, sy, sw, sh, w: Math.round(sw * factor), h: Math.round(sh * factor) };
  };
  const out = bitmap ? output() : null;

  const confirm = async () => {
    if (!bitmap || !out) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, out.sx, out.sy, out.sw, out.sh, 0, 0, out.w, out.h);
    const jpeg = file.type === "image/jpeg" || file.type === "image/avif";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, jpeg ? "image/jpeg" : "image/png", jpeg ? 0.92 : undefined),
    );
    setBusy(false);
    if (!blob) return setFailed(true);
    if (blob.size > MAX_BYTES) {
      return setTooBig(`That comes out at ${Math.round(blob.size / 1024 / 1024)} MB; the limit is 5 MB. Pick a smaller size.`);
    }
    setTooBig(null);
    const name = file.name.replace(/\.\w+$/, "") + (jpeg ? ".jpg" : ".png");
    onDone(new File([blob], name, { type: blob.type }));
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[92vh] w-[min(520px,94vw)] -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded border border-neutral-200 bg-white p-5 font-mono text-sm text-neutral-900 shadow-lg">
          <Dialog.Title className="font-bold">Crop and size the picture</Dialog.Title>
          <Dialog.Description className="text-neutral-600">
            Drag the picture to position it. Or upload it as it is.
          </Dialog.Description>
          {failed && <p className="text-red-700">This image couldn't be opened here. Upload it as it is instead.</p>}
          {bitmap && (
            <>
              <div className="flex flex-wrap gap-2">
                {SHAPES.map((s) => (
                  <Button key={s.id} variant={shape === s.id ? "primary" : "default"} onClick={() => setShape(s.id)}>
                    {s.label}
                  </Button>
                ))}
              </div>
              <canvas
                ref={preview}
                className="mx-auto block max-w-full touch-none rounded bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
                style={{ cursor: ratio ? "grab" : "default", aspectRatio: `${FRAME_W} / ${frameH}` }}
                onPointerDown={(e) => {
                  if (!ratio) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  // The canvas may be drawn smaller than its pixels on narrow screens.
                  const k = FRAME_W / e.currentTarget.getBoundingClientRect().width;
                  setOffset({ x: d.ox + (e.clientX - d.x) * k, y: d.oy + (e.clientY - d.y) * k });
                }}
                onPointerUp={() => (drag.current = null)}
              />
              {ratio > 0 && (
                <label className="flex items-center gap-3">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => {
                      // Zoom around the middle of the frame.
                      const next = Number(e.currentTarget.value);
                      const k = next / zoom;
                      setOffset({ x: FRAME_W / 2 - (FRAME_W / 2 - pos.x) * k, y: frameH / 2 - (frameH / 2 - pos.y) * k });
                      setZoom(next);
                    }}
                    className="flex-1"
                  />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span>Size</span>
                {SIZES.map((s) => (
                  <Button key={s.id} variant={size === s.id ? "primary" : "default"} onClick={() => setSize(s.id)}>
                    {s.label}
                  </Button>
                ))}
              </div>
              {out && (
                <p className="text-neutral-600">
                  Comes out at {out.w} × {out.h} px, from an original of {iw} × {ih}.
                </p>
              )}
            </>
          )}
          {tooBig && <p className="text-sm text-red-700">{tooBig}</p>}
          <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
            <Button variant="primary" onClick={confirm} disabled={!bitmap || busy}>
              {busy ? "Preparing…" : "Upload this"}
            </Button>
            {asIs ? (
              <Button onClick={() => onDone(file)}>Upload as it is</Button>
            ) : (
              <span className="self-center text-xs text-neutral-500">
                {AS_IS_TYPES.includes(file.type) ? "Over 5 MB, so it's converted" : "An AVIF, so it's converted to JPEG"}.
              </span>
            )}
            <span className="grow" />
            <Button onClick={onCancel}>Cancel</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
