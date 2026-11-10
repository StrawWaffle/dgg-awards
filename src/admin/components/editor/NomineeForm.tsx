import { useRef, useState } from "react";
import { Section } from "@/admin/components/Section";
import { PictureCropper } from "@/admin/components/editor/PictureCropper";
import { ClipPreview } from "@/admin/components/editor/ClipPreview";
import { ClipUpload } from "@/admin/components/editor/ClipUpload";
import { libraryUrl, useLibrary } from "@/admin/components/editor/library";
import { HistoryList } from "@/admin/components/history/HistoryList";
import { Button, ErrorText, Field, TimeInput, inputClass } from "@/admin/components/editor/fields";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Emote } from "@/lab/Emote";
import { type LinkType, classifyLink, driveFileId, linkAt, linkLabel, linkTypes } from "@/lib/links";
import {
  type AdminNominee,
  type DggProfile,
  type Issue,
  buildClip,
  deleteNominee,
  fetchClipFrame,
  fetchDggProfile,
  removeThumbnail,
  saveNominee,
  uploadThumbnail,
} from "@/lib/queries";

type Draft = {
  title: string;
  description: string;
  date: string;
  url: string;
  linkType: LinkType | "";
  clipStart: number | null;
  clipEnd: number | null;
  imageId: string;
  emote: string;
  renderType: "default" | "compact";
};

const draftOf = (n: AdminNominee): Draft => ({
  title: n.title,
  description: n.description,
  date: n.date ?? "",
  url: n.url ?? "",
  linkType: n.linkType ?? "",
  clipStart: n.clipStart,
  clipEnd: n.clipEnd,
  imageId: n.imageId ?? "",
  emote: n.emote ?? "",
  renderType: n.renderType ?? "default",
});

/** Invalidate everything the editor shows, after any change. */
export function useRefreshEditor() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] }),
      queryClient.invalidateQueries({ queryKey: ["checks"] }),
    ]);
}

export function NomineeForm({ nominee, issues }: { nominee: AdminNominee; issues: Issue[] }) {
  const refresh = useRefreshEditor();
  const [draft, setDraft] = useState(() => draftOf(nominee));
  const [timesValid, setTimesValid] = useState({ start: true, end: true });
  const saved = draftOf(nominee);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const detected = draft.url ? classifyLink(draft.url) : null;
  const type = (draft.linkType || detected?.type) ?? null;

  const save = useMutation({
    mutationFn: () =>
      saveNominee({
        id: nominee.id,
        categoryId: nominee.categoryId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        date: draft.date || null,
        url: draft.url.trim() || null,
        linkType: draft.linkType || null,
        clipStart: draft.clipStart,
        clipEnd: draft.clipEnd,
        imageId: draft.imageId.trim() || null,
        emote: draft.emote.trim() || null,
        renderType: draft.renderType,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteNominee(nominee.categoryId, nominee.id),
    onSuccess: refresh,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {issues.length > 0 && (
        <ul className="space-y-1 rounded border border-neutral-200 bg-neutral-50 p-2 text-sm">
          {issues.map((issue) => (
            <li
              key={issue.code + issue.message}
              className={issue.severity === "error" ? "text-red-700" : "text-amber-800"}
            >
              {issue.severity === "error" ? "Error" : "Warning"}: {issue.message}
            </li>
          ))}
        </ul>
      )}

      <Section id="nominee-details" title="Details" boxed={false}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <input
                className={inputClass}
                value={draft.title}
                required
                onChange={(e) => set("title", e.currentTarget.value)}
              />
            </Field>
            <Field label="Date" hint="When it happened. Checked against the award year.">
              <input
                type="date"
                className={inputClass}
                value={draft.date}
                onChange={(e) => set("date", e.currentTarget.value)}
              />
            </Field>
          </div>

          <Field label="Description" hint="What this is and why it's nominated.">
            <textarea
              className={inputClass}
              rows={3}
              value={draft.description}
              onChange={(e) => set("description", e.currentTarget.value)}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <Field
              label="Source link"
              hint={
                detected
                  ? `Detected: ${linkLabel(detected.type, detected.start)}`
                  : "Link to the moment itself, not a channel or profile."
              }
            >
              <input
                className={inputClass}
                type="url"
                value={draft.url}
                placeholder="https://"
                onChange={(e) => set("url", e.currentTarget.value)}
              />
            </Field>
            <Field label="Link type">
              <select
                className={inputClass}
                value={draft.linkType}
                onChange={(e) => set("linkType", e.currentTarget.value as LinkType | "")}
              >
                <option value="">Detect from the link</option>
                {linkTypes.map((t) => (
                  <option key={t} value={t}>
                    {linkLabel(t)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Clip start" hint="m:ss into the source">
              <TimeInput
                value={draft.clipStart}
                onChange={(s, valid) => {
                  set("clipStart", s);
                  setTimesValid((v) => ({ ...v, start: valid }));
                }}
              />
            </Field>
            <Field label="Clip end">
              <TimeInput
                value={draft.clipEnd}
                onChange={(s, valid) => {
                  set("clipEnd", s);
                  setTimesValid((v) => ({ ...v, end: valid }));
                }}
              />
            </Field>
            <Field label="Layout">
              <select
                className={inputClass}
                value={draft.renderType}
                onChange={(e) => set("renderType", e.currentTarget.value as Draft["renderType"])}
              >
                <option value="default">Default</option>
                <option value="compact">Compact (emotes)</option>
              </select>
            </Field>
          </div>

          <ClipPreview url={draft.url} type={type} start={draft.clipStart} end={draft.clipEnd} />

          {draft.url && type && draft.clipStart != null && (
            <p className="text-sm text-neutral-600">
              Viewers get:{" "}
              <a
                className="text-emerald-800 underline"
                href={linkAt(draft.url, draft.clipStart)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {linkLabel(type, draft.clipStart)}
              </a>
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={!dirty || save.isPending || !timesValid.start || !timesValid.end}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            {dirty && (
              <Button onClick={() => setDraft(saved)} disabled={save.isPending}>
                Discard changes
              </Button>
            )}
            {!dirty && save.isSuccess && <span className="text-sm text-neutral-600">Saved.</span>}
            <ErrorText>{save.error?.message ?? remove.error?.message}</ErrorText>
            <span className="grow" />
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Delete "${nominee.title}"?`)) remove.mutate();
              }}
            >
              Delete nominee
            </Button>
          </div>
        </div>
      </Section>

      <PictureSection
        nominee={nominee}
        imageId={draft.imageId}
        setImageId={(v) => set("imageId", v)}
        emote={draft.emote}
        setEmote={(v) => set("emote", v)}
      />
      <ClipSection nominee={nominee} unsaved={dirty} />
      {type === "dgg-profile" && draft.url && (
        <ProfileSection url={draft.url} onUseBio={(bio) => set("description", bio)} />
      )}
      <Section id="nominee-history" title="History" defaultOpen={false} boxed={false}>
        <div className="rounded border border-neutral-200 bg-white">
          <HistoryList filter={{ categoryId: nominee.categoryId, nomineeId: nominee.id }} showLabel={false} />
        </div>
      </Section>
    </form>
  );
}

/** Whether an image file is animated, from its first bytes. */
async function isAnimated(file: File) {
  if (file.type === "image/gif") return true;
  const head = new TextDecoder("latin1").decode(await file.slice(0, 64 * 1024).arrayBuffer());
  return (file.type === "image/png" && head.includes("acTL")) || (file.type === "image/webp" && head.includes("ANIM"));
}

/**
 * The nominee's picture: shown on its card, and as its clip's thumbnail.
 * Upload one (stills can be cropped and sized first; animated images go up as
 * they are), take a frame from the clip (in the Clip section), or remove it.
 * Older nominees can name an image file from the code instead, which shows
 * when there's no picture.
 */
function PictureSection({
  nominee,
  imageId,
  setImageId,
  emote,
  setEmote,
}: {
  nominee: AdminNominee;
  imageId: string;
  setImageId: (value: string) => void;
  emote: string;
  setEmote: (value: string) => void;
}) {
  const refresh = useRefreshEditor();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadThumbnail(nominee.categoryId, nominee.id, file).then(refresh),
  });
  const { items: pictures, folders } = useLibrary("image", nominee.categoryId);
  /** Animated pictures go up as they are (if they fit); stills open in the cropper. */
  const take = async (file: File) => {
    if ((await isAnimated(file)) && file.size <= 5 * 1024 * 1024) upload.mutate(file);
    else setCropping(file);
  };
  const fromLibrary = useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch(libraryUrl(path));
      if (!res.ok) throw new Error("Couldn't load that picture from the library.");
      const blob = await res.blob();
      await take(new File([blob], path.split("/").pop()!, { type: blob.type }));
    },
  });
  const remove = useMutation({
    mutationFn: () => removeThumbnail(nominee.categoryId, nominee.id).then(refresh),
  });
  const shown = nominee.thumbnailUrl ?? (imageId ? `/Media/${imageId}` : null);
  const from = nominee.thumbnailUrl
    ? nominee.thumbnailAt != null
      ? `A frame from the clip, ${nominee.thumbnailAt}s in.`
      : "An uploaded picture."
    : imageId
      ? "The image file from the code."
      : emote
        ? "No picture: the emote shows in its place."
        : "No picture yet.";

  return (
    <div>
      <Section id="nominee-picture" title="Picture" aside={nominee.thumbnailUrl || imageId ? "set" : emote ? "emote" : "none"} boxed={false}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded border border-neutral-200 bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
            {shown ? (
              <img src={shown} alt="" className="max-h-full max-w-full object-contain" />
            ) : emote ? (
              <Emote name={emote.trim()} size={2} />
            ) : (
              <span className="text-xs text-neutral-500">none</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3 text-sm">
            <p className="text-neutral-700">{from}</p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (!file) return;
                  await take(file);
                }}
              />
              <Button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? "Uploading…" : nominee.thumbnailUrl ? "Upload a new picture" : "Upload a picture"}
              </Button>
              {pictures.length > 0 && (
                <select
                  className={`${inputClass} w-auto max-w-xs`}
                  value=""
                  disabled={upload.isPending || fromLibrary.isPending}
                  onChange={(e) => e.currentTarget.value && fromLibrary.mutate(e.currentTarget.value)}
                  aria-label="Picture from the library"
                >
                  <option value="">{fromLibrary.isPending ? "Loading…" : "From the library…"}</option>
                  {folders.map((g) => (
                    <optgroup key={g.folder} label={`${g.folder || "Top level"}${g.mine ? " (this award)" : ""}`}>
                      {g.items.map((i) => (
                        <option key={i.path} value={i.path}>
                          {i.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {nominee.thumbnailUrl && (
                <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  Remove picture
                </Button>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              PNG, JPEG, WebP or GIF, up to 5 MB, kept at full size unless you shrink it. Stills can be cropped
              first; animated GIFs and WebPs go up as they are, so emotes keep moving.
            </p>
            <ErrorText>{upload.error?.message ?? remove.error?.message ?? fromLibrary.error?.message}</ErrorText>
            <Field label="Image file from the code (older nominees)" hint="A file in src/media, e.g. zee.jpg. Shows when there's no picture. Saved with Save above.">
              <input className={inputClass} value={imageId} onChange={(e) => setImageId(e.currentTarget.value)} />
            </Field>
            <Field label="Emote" hint="A destiny.gg emote, spelt as in chat (e.g. PepoTurtle). Shows, moving, in place of the picture while there's none. Saved with Save above.">
              <input className={inputClass} value={emote} onChange={(e) => setEmote(e.currentTarget.value)} />
            </Field>
          </div>
        </div>
      </Section>
      {cropping && (
        <PictureCropper
          file={cropping}
          onCancel={() => setCropping(null)}
          onDone={(file) => {
            setCropping(null);
            upload.mutate(file);
          }}
        />
      )}
    </div>
  );
}

function ClipSection({ nominee, unsaved }: { nominee: AdminNominee; unsaved: boolean }) {
  const refresh = useRefreshEditor();
  const video = useRef<HTMLVideoElement>(null);
  const run = (fn: () => Promise<void>) => fn().then(refresh);

  const build = useMutation({ mutationFn: () => run(() => buildClip(nominee.categoryId, nominee.id)) });
  // The frame at full size opens in the cropper; the cropped picture is
  // uploaded, remembering which frame it came from.
  const [cropFrame, setCropFrame] = useState<{ file: File; at: number } | null>(null);
  const frame = useMutation({
    mutationFn: async (at: number) => setCropFrame({ file: await fetchClipFrame(nominee.categoryId, nominee.id, at), at }),
  });
  const saveFrame = useMutation({
    mutationFn: ({ file, at }: { file: File; at: number }) => run(() => uploadThumbnail(nominee.categoryId, nominee.id, file, at)),
  });
  const working = nominee.clipStatus === "pending" || nominee.clipStatus === "processing";

  return (
    <div>
      <Section id="nominee-clip" title="Clip" aside={nominee.clipStatus ?? "none"} boxed={false}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Button
              onClick={() => build.mutate()}
              disabled={unsaved || working || build.isPending}
              title={unsaved ? "Save the clip start and end first" : undefined}
            >
              {nominee.clipStatus === "ready" ? "Rebuild clip" : "Build clip"}
            </Button>
            <span className="text-neutral-700">
              {nominee.clipStatus === "pending" && "Waiting to download…"}
              {nominee.clipStatus === "processing" && "Making the clip…"}
              {nominee.clipStatus === "ready" &&
                (nominee.clipError ? (
                  <span className="text-red-700">
                    The new clip failed: {nominee.clipError} The previous clip is still in use.
                  </span>
                ) : (
                  "Ready."
                ))}
              {nominee.clipStatus === "failed" && <span className="text-red-700">Failed: {nominee.clipError}</span>}
              {!nominee.clipStatus &&
                (driveFileId(nominee.url)
                  ? "No clip yet: the site plays the whole video from Google Drive. Mark the part to keep below (it's the library's copy) and make the clip."
                  : "No clip yet. Set the start and end above, save, then build; or upload a video below.")}
            </span>
            {unsaved && <span className="text-neutral-500">Save first.</span>}
          </div>
          <ErrorText>{build.error?.message}</ErrorText>
          <ClipUpload categoryId={nominee.categoryId} id={nominee.id} busy={working} onStarted={refresh} driveId={driveFileId(nominee.url)} />

          {nominee.clipUrl && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <video
                  ref={video}
                  className="aspect-video w-full rounded bg-black"
                  src={nominee.clipUrl}
                  controls
                  preload="metadata"
                />
                <Button
                  onClick={() => frame.mutate(Math.round((video.current?.currentTime ?? 0) * 100) / 100)}
                  disabled={frame.isPending || saveFrame.isPending}
                >
                  {frame.isPending ? "Getting the frame…" : saveFrame.isPending ? "Saving…" : "Use this frame as the picture…"}
                </Button>
                <ErrorText>{frame.error?.message ?? saveFrame.error?.message}</ErrorText>
                {cropFrame && (
                  <PictureCropper
                    file={cropFrame.file}
                    onCancel={() => setCropFrame(null)}
                    onDone={(file) => {
                      saveFrame.mutate({ file, at: cropFrame.at });
                      setCropFrame(null);
                    }}
                  />
                )}
              </div>
              <div className="space-y-2">
                {nominee.thumbnailUrl && (
                  <img
                    className="aspect-video w-full rounded object-cover"
                    src={nominee.thumbnailUrl}
                    alt="Current picture"
                  />
                )}
                <p className="text-sm text-neutral-600">
                  {nominee.thumbnailAt != null
                    ? `The picture is the frame ${nominee.thumbnailAt}s into the clip.`
                    : nominee.thumbnailUrl
                      ? "The picture is an uploaded one."
                      : "No picture yet."}
                </p>
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function ProfileSection({ url, onUseBio }: { url: string; onUseBio: (bio: string) => void }) {
  const name = new URL(url).pathname.split("/")[2] ?? "";
  const [profile, setProfile] = useState<DggProfile | undefined>();
  const load = useMutation({
    mutationFn: () => fetchDggProfile(decodeURIComponent(name)),
    onSuccess: setProfile,
  });

  return (
    <div>
      <Section id="nominee-profile" title="destiny.gg profile" boxed={false}>
        <div className="space-y-3">
          <Button onClick={() => load.mutate()} disabled={load.isPending || !name}>
            {load.isPending ? "Loading…" : `Load ${name}'s card`}
          </Button>
          <ErrorText>{load.error?.message}</ErrorText>
          {profile === null && <p className="text-sm text-neutral-600">No destiny.gg user with that name.</p>}
          {profile && (
            <div className="flex gap-4 rounded border border-neutral-200 bg-white p-3 text-sm">
              {profile.photoUrl && <img src={profile.photoUrl} alt="" className="h-20 w-20 rounded" />}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-bold">{profile.name}</p>
                <p className="text-neutral-600">
                  {[profile.tier, profile.team, profile.memberSince && `member since ${profile.memberSince}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {profile.bio && <p>{profile.bio}</p>}
                {profile.signatureSvg && (
                  // Rebuilt server-side from path data only (src/server/dgg-profile.ts).
                  <div
                    className="h-12 max-w-xs text-neutral-900 [&>svg]:h-full [&>svg]:w-full"
                    aria-label="Signature"
                    dangerouslySetInnerHTML={{ __html: profile.signatureSvg }}
                  />
                )}
                {profile.bio && <Button onClick={() => onUseBio(profile.bio!)}>Use bio as the description</Button>}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
