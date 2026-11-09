"""Copy a public Google Drive folder into the video library.

Keeps the folder structure, skips Google Docs (they can't be downloaded as
files) and files already there with the same size, so it can be run again
when more files are added. Run it in a throwaway container with the app's
data volume mounted, e.g. for the live site:

    docker run --rm -v dgg-awards_awards_data:/data -v "$PWD/scripts:/s:ro" \\
      python:3.12-slim sh -c "pip install -q gdown && python -I /s/import-drive.py <folder-id> /data/library"

Uses gdown's folder parser; Drive allows at most 50 files per folder that way.
"""

import sys
import time
from pathlib import Path

import gdown
import requests
from gdown.download_folder import _download_and_parse_google_drive_link

DOC_TYPES = ("application/vnd.google-apps.",)


def files_in(folder_id: str):
    sess = requests.Session()
    sess.headers["User-Agent"] = "Mozilla/5.0"
    root = _download_and_parse_google_drive_link(
        sess=sess, folder_id=folder_id, quiet=True, verify=True, timeout=60
    )

    def walk(node, path):
        for child in node.children:
            sub = path / child.name
            if child.type == "application/vnd.google-apps.folder":
                yield from walk(child, sub)
            elif not child.type.startswith(DOC_TYPES):
                yield child.id, sub

    yield from walk(root, Path())


def main(folder_id: str, out_dir: str) -> None:
    out = Path(out_dir)
    got = skipped = failed = 0
    for file_id, rel in files_in(folder_id):
        target = out / rel
        if target.exists() and target.stat().st_size > 0:
            skipped += 1
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_name(target.name + ".part")
        # Drive refuses ("too many accesses") after a burst: pause between
        # files, and back off and retry when it does.
        for attempt in range(4):
            try:
                gdown.download(id=file_id, output=str(part), quiet=True)
                part.rename(target)
                got += 1
                print(f"got {rel} ({target.stat().st_size // 1024} kB)", flush=True)
                break
            except Exception as error:
                part.unlink(missing_ok=True)
                if attempt == 3:
                    failed += 1
                    print(f"FAILED {rel}: {str(error).splitlines()[0]}", flush=True)
                else:
                    time.sleep(30 * (attempt + 1))
        time.sleep(3)
    print(f"done: {got} downloaded, {skipped} already there, {failed} failed")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: import-drive.py <drive-folder-id> <library-dir>")
    main(sys.argv[1], sys.argv[2])
