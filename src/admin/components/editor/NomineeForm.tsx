import { useRef, useState } from "react";
import { Section } from "@/admin/components/Section";
import { HistoryList } from "@/admin/components/history/HistoryList";
import { Button, ErrorText, Field, TimeInput, inputClass } from "@/admin/components/editor/fields";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type LinkType, classifyLink, linkAt, linkLabel, linkTypes } from "@/lib/links";
import {
  type AdminNominee,
  type DggProfile,
  type Issue,
  buildClip,
  deleteNominee,
  fetchDggProfile,
  pickThumbnail,
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

          <Field label="Image file" hint="A file in src/media, e.g. zee.jpg. A clip's thumbnail takes its place.">
            <input
              className={inputClass}
              value={draft.imageId}
              onChange={(e) => set("imageId", e.currentTarget.value)}
            />
          </Field>

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

function ClipSection({ nominee, unsaved }: { nominee: AdminNominee; unsaved: boolean }) {
  const refresh = useRefreshEditor();
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const run = (fn: () => Promise<void>) => fn().then(refresh);

  const build = useMutation({ mutationFn: () => run(() => buildClip(nominee.categoryId, nominee.id)) });
  const frame = useMutation({
    mutationFn: (at: number) => run(() => pickThumbnail(nominee.categoryId, nominee.id, at)),
  });
  const upload = useMutation({
    mutationFn: (file: File) => run(() => uploadThumbnail(nominee.categoryId, nominee.id, file)),
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
              {nominee.clipStatus === "processing" && "Downloading and converting…"}
              {nominee.clipStatus === "ready" && "Ready."}
              {nominee.clipStatus === "failed" && <span className="text-red-700">Failed: {nominee.clipError}</span>}
              {!nominee.clipStatus && "No clip yet. Set the start and end, save, then build."}
            </span>
            {unsaved && <span className="text-neutral-500">Save first.</span>}
          </div>
          <ErrorText>{build.error?.message}</ErrorText>

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
                  onClick={() => frame.mutate(Math.floor(video.current?.currentTime ?? 0))}
                  disabled={frame.isPending}
                >
                  Use this frame as the thumbnail
                </Button>
                <ErrorText>{frame.error?.message}</ErrorText>
              </div>
              <div className="space-y-2">
                {nominee.thumbnailUrl && (
                  <img
                    className="aspect-video w-full rounded object-cover"
                    src={nominee.thumbnailUrl}
                    alt="Current thumbnail"
                  />
                )}
                <p className="text-sm text-neutral-600">
                  {nominee.thumbnailAt != null
                    ? `Thumbnail from ${nominee.thumbnailAt}s into the clip.`
                    : "Uploaded thumbnail."}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) upload.mutate(file, { onSettled: () => fileInput.current && (fileInput.current.value = "") });
              }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : "Upload a thumbnail"}
            </Button>
            <span className="text-neutral-600">PNG, JPEG, WebP or GIF. Replaces the current thumbnail.</span>
            <ErrorText>{upload.error?.message}</ErrorText>
          </div>
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
