// The checks, against the problems seen on the 2025 awards stream.
import { describe, expect, test } from "bun:test";
import {
  type NomineeInput,
  checkAwards,
  checkNominee,
} from "@/lib/nominee-checks";

const good: NomineeInput = {
  id: "n",
  title: "Destiny makes xQc rage quit",
  description: "He left mid-debate.",
  url: "https://www.youtube.com/watch?v=abc&t=83s",
  imageId: "thumb.jpg",
  videoId: null,
  date: "2025-06-01",
  linkType: null,
  clipStart: null,
  clipEnd: null,
};

const codes = (n: Partial<NomineeInput>, year = 2025) =>
  checkNominee({ id: "c" }, { ...good, ...n }, year).map((i) => i.code);

describe("checkNominee", () => {
  test("a complete nominee has no issues", () => {
    expect(codes({})).toEqual([]);
  });

  test("a Google Drive video counts as media, but untrimmed until a clip is built", () => {
    const drive = { url: "https://drive.google.com/file/d/abc/view", imageId: null };
    expect(codes(drive)).toEqual(["untrimmed-drive"]);
    expect(codes({ ...drive, clipKey: "clips/x.mp4" })).toEqual([]);
    // A built clip or a picture is media too.
    expect(codes({ imageId: null, thumbnailKey: "thumbs/x.png" })).toEqual([]);
  });

  test("15:41 / 18:48: a whole 3-hour video with no timestamp", () => {
    expect(codes({ url: "https://www.youtube.com/watch?v=abc" })).toEqual(["whole-video"]);
  });

  test("a clip start time counts as the timestamp", () => {
    expect(codes({ url: "https://www.youtube.com/watch?v=abc", clipStart: 10, clipEnd: 40 })).toEqual([]);
  });

  test("22:04: a subreddit instead of the post", () => {
    expect(codes({ url: "https://www.reddit.com/r/Destiny/" })).toEqual(["bare-link"]);
  });

  test("40:06 / 41:46: a Reddit account or YouTube channel", () => {
    expect(codes({ url: "https://www.reddit.com/user/someone/" })).toEqual(["bare-link"]);
    expect(codes({ url: "https://www.youtube.com/@destiny" })).toEqual(["bare-link"]);
  });

  test("a destiny.gg profile is fine for a chatter", () => {
    expect(codes({ url: "https://www.destiny.gg/u/StrawWaffle" })).toEqual([]);
  });

  test("1:53:07: an entry from the previous year", () => {
    expect(codes({ date: "2024-03-01" })).toEqual(["wrong-year"]);
  });

  test("dates must exist and be YYYY-MM-DD", () => {
    expect(codes({ date: null })).toEqual(["missing-date"]);
    expect(codes({ date: "June 2025" })).toEqual(["invalid-date"]);
  });

  test("29:53 / 56:25: no video or image", () => {
    expect(codes({ imageId: null })).toEqual(["missing-media"]);
  });

  test("12:29: long clips are flagged", () => {
    expect(codes({ clipStart: 0, clipEnd: 90 })).toEqual(["long-clip"]);
  });

  test("clip ranges must make sense", () => {
    expect(codes({ clipStart: 50, clipEnd: 40 })).toEqual(["clip-range"]);
    expect(codes({ clipStart: 50 })).toEqual(["clip-without-end"]);
    expect(codes({ url: "https://www.reddit.com/user/x/", clipStart: 1, clipEnd: 5 })).toEqual([
      "bare-link",
      "clip-not-video",
    ]);
  });

  test("1:50:51: nominees need an explanation", () => {
    expect(codes({ description: " " })).toEqual(["missing-description"]);
  });

  test("unrecognized links are flagged, an explicit type clears it", () => {
    expect(codes({ url: "https://example.com/page" })).toEqual(["unrecognized-link"]);
  });

  test("an admin-set link type overrides the guess", () => {
    expect(codes({ url: "https://example.com/post", linkType: "x-post" })).toEqual([]);
    expect(codes({ url: "https://example.com/v", linkType: "youtube-video" })).toEqual(["whole-video"]);
  });
});

test("1:35:04: near-identical titles across categories", () => {
  const issues = checkAwards(
    [
      { id: "a", title: "Moment", options: [{ ...good, id: "x", title: "Destiny uses premonition" }] },
      { id: "b", title: "Clip", options: [{ ...good, id: "y", title: "Destiny uses his premonition powers" }] },
      { id: "c", title: "Other", options: [{ ...good, id: "z", title: "Something unrelated" }] },
      { id: "d", title: "People", options: [{ ...good, id: "zee", title: "Zee" }, { ...good, id: "zc", title: "Zee Cohen" }] },
    ],
    2025,
  );
  expect(issues.map((i) => `${i.code}:${i.categoryId}/${i.nomineeId}`).sort()).toEqual([
    "duplicate-title:a/x",
    "duplicate-title:b/y",
  ]);
});
