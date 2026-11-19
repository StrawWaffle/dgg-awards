import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import { useRefreshEditor } from "@/admin/components/editor/NomineeForm";
import { ClipPlayer, nomineeClip } from "@/lab/ClipPlayer";
import { type AdminCategory, saveCategory } from "@/lib/queries";

/**
 * An award's announcer video: someone revealing the winner. On the big screen
 * it plays when the results come up, and the results then show all at once.
 * Upload a file or paste a link; voters never see it.
 */
export function AnnouncerVideo({ category }: { category: AdminCategory }) {
  const refresh = useRefreshEditor();
  const [link, setLink] = useState(category.announcerUrl ?? "");
  const [file, setFile] = useState<File | null>(null);
  // Bumped after an upload, so the file picker starts empty again.
  const [picker, setPicker] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clip = nomineeClip({ url: category.announcerUrl, clipUrl: category.announcerFileUrl }, `Announcing ${category.title}`);

  const save = useMutation({
    mutationFn: (patch: { announcerUrl?: string | null; announcerKey?: null }) => saveCategory({ id: category.id, ...patch }),
    onSuccess: refresh,
  });

  const upload = () => {
    if (!file) return;
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.set("categoryId", category.id);
    form.set("file", file);
    // XMLHttpRequest, not fetch, for the upload's progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/announcer");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setFile(null);
        setPicker((n) => n + 1);
        refresh();
      } else {
        setError(xhr.status === 413 ? "That file is too big to upload." : xhr.responseText || `Upload failed (${xhr.status}).`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed: the connection dropped. Try again.");
    };
    xhr.send(form);
  };

  const fileName = category.announcerFileUrl?.split("/").pop();

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Someone from the community announcing the winner. On the big screen it plays when the results come up, and the
        results then show all at once instead of one by one. Without one, the drawn reveal runs as usual. Voters never see
        it.
      </p>

      {clip && (
        <div className="max-w-xl space-y-2">
          <ClipPlayer clip={clip} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-neutral-600">{fileName ? `Uploaded: ${fileName}` : "From the link below"}</span>
            {fileName && (
              <Button
                variant="danger"
                disabled={save.isPending}
                onClick={() => {
                  if (confirm("Take the uploaded announcer video off this award? (Undo in the history brings it back.)")) {
                    save.mutate({ announcerKey: null });
                  }
                }}
              >
                Remove the upload
              </Button>
            )}
          </div>
          {fileName && category.announcerUrl && (
            <p className="text-xs text-neutral-500">The upload plays; the link is kept in case you remove it.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          key={picker}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
          disabled={progress !== null}
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        />
        <Button variant="primary" disabled={!file || progress !== null} onClick={upload}>
          {progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : fileName ? "Replace with this file" : "Upload"}
        </Button>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ announcerUrl: link.trim() || null });
        }}
      >
        <div className="min-w-64 grow">
          <Field label="Or a link" hint="YouTube, Twitch, Streamable or a video file. Used when there's no upload.">
            <input className={inputClass} type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.currentTarget.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={save.isPending || link.trim() === (category.announcerUrl ?? "")}>
          {link.trim() ? "Save link" : "Remove link"}
        </Button>
      </form>
      <ErrorText>{error ?? save.error?.message}</ErrorText>
    </div>
  );
}
