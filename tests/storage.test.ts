import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localStorage, parseRange, serveFile, storageFromEnv } from "@/server/storage";

describe("parseRange", () => {
  test("whole file without a range", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull(); // multi-range: send it all
  });
  test("start and end, clamped", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual([0, 9]);
    expect(parseRange("bytes=90-", 100)).toEqual([90, 99]);
    expect(parseRange("bytes=90-500", 100)).toEqual([90, 99]);
  });
  test("suffix ranges", () => {
    expect(parseRange("bytes=-10", 100)).toEqual([90, 99]);
    expect(parseRange("bytes=-500", 100)).toEqual([0, 99]);
  });
  test("unsatisfiable", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=5-2", 100)).toBe("invalid");
    expect(parseRange("bytes=-", 100)).toBe("invalid");
  });
});

describe("local storage", () => {
  test("stores, serves ranges and deletes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "store-"));
    const s = localStorage(dir);
    await s.put("clips/cat/a.mp4", new Blob(["0123456789"]), "video/mp4");
    expect(s.url("clips/cat/a.mp4")).toBe("/files/clips/cat/a.mp4");

    const whole = await serveFile(s.localFile!("clips/cat/a.mp4")!, null);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(await whole.text()).toBe("0123456789");

    const part = await serveFile(s.localFile!("clips/cat/a.mp4")!, "bytes=2-4");
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await part.text()).toBe("234");

    expect((await serveFile(s.localFile!("clips/cat/a.mp4")!, "bytes=20-")).status).toBe(416);

    await s.delete("clips/cat/a.mp4");
    expect((await serveFile(s.localFile!("clips/cat/a.mp4")!, null)).status).toBe(404);
  });

  test("refuses keys that leave the media folder", async () => {
    const s = localStorage(await mkdtemp(join(tmpdir(), "store-")));
    for (const key of ["../x", "a/../../x", "/etc/passwd", "a//b", ".hidden", "a/..", ""]) {
      expect(s.localFile!(key)).toBeNull();
      await expect(s.put(key, new Blob(["x"]), "text/plain")).rejects.toThrow("Bad media key");
    }
  });
});

describe("storageFromEnv", () => {
  test("local unless every R2 setting is present", () => {
    expect(storageFromEnv({ MEDIA_DIR: "/m", R2_BUCKET: "b" }).url("k")).toBe("/files/k");
    const r2 = storageFromEnv({
      R2_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
      R2_BUCKET: "clips",
      R2_ACCESS_KEY_ID: "id",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_PUBLIC_URL: "https://media.example.com/",
    });
    expect(r2.url("clips/a.mp4")).toBe("https://media.example.com/clips/a.mp4");
    expect(r2.localFile).toBeUndefined();
  });
});
