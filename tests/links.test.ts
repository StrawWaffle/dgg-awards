import { describe, expect, test } from "bun:test";
import { classifyLink, embedUrl, formatTimestamp, linkAt, linkLabel, parseTimestamp } from "@/lib/links";

describe("classifyLink", () => {
  const cases: [string, string, number?][] = [
    ["https://www.youtube.com/watch?v=abc123DEF45", "youtube-video"],
    ["https://www.youtube.com/watch?v=abc123DEF45&t=83s", "youtube-video", 83],
    ["https://youtu.be/_XyA2kGsEuI?si=0ebIcSDqf0aY_jd2&t=1h2m3s", "youtube-video", 3723],
    ["https://www.youtube.com/live/Hnzq_8r8Ubg?si=NEkaX1mE3K6uLvsp", "youtube-video"],
    ["https://www.youtube.com/clip/UgkxSomething", "youtube-clip"],
    ["https://www.youtube.com/channel/UC8DA4o0SyaGfyVaBLbF5EXg", "youtube-channel"],
    ["https://www.youtube.com/user/briantylercohen", "youtube-channel"],
    ["https://www.youtube.com/@ShortFatOtaku", "youtube-channel"],
    ["https://www.youtube.com/destiny", "youtube-channel"],
    ["https://www.twitch.tv/videos/123456?t=1h0m5s", "twitch-vod", 3605],
    ["https://www.twitch.tv/destiny/clip/FunnyClipName", "twitch-clip"],
    ["https://clips.twitch.tv/FunnyClipName", "twitch-clip"],
    ["https://www.twitch.tv/destiny", "twitch-channel"],
    ["https://kick.com/destiny/videos/abc", "kick-vod"],
    ["https://kick.com/destiny/clips/clip_abc", "kick-clip"],
    ["https://kick.com/destiny", "kick-channel"],
    ["https://streamable.com/tdnaev", "streamable"],
    ["https://www.reddit.com/r/Destiny/comments/abc/title/", "reddit-post"],
    ["https://www.reddit.com/r/Destiny/s/AbCdEf", "reddit-post"],
    ["https://www.reddit.com/r/JaydrVernandaFails/", "reddit-subreddit"],
    ["https://www.reddit.com/user/Zeraphant/", "reddit-user"],
    ["https://x.com/mrGemzar/status/123", "x-post"],
    ["https://x.com/ZeeToTheHill", "x-profile"],
    ["https://files.catbox.moe/2b1sno.mp4", "video-file"],
    ["https://i.imgur.com/x.png", "image"],
    ["https://wiki.destiny.gg/view/Ukrainian_Ana", "wiki"],
    ["https://www.destiny.gg/u/StrawWaffle", "dgg-profile"],
    ["https://www.destiny.gg/bigscreen", "web"],
    ["https://mitchdev.net/", "web"],
    ["not a url", "web"],
  ];
  for (const [url, type, start] of cases) {
    test(`${url} -> ${type}${start === undefined ? "" : ` @${start}`}`, () => {
      expect(classifyLink(url)).toEqual(start === undefined ? { type: type as never } : { type: type as never, start });
    });
  }
});

describe("timestamps", () => {
  test("parse", () => {
    expect(parseTimestamp("83")).toBe(83);
    expect(parseTimestamp("83s")).toBe(83);
    expect(parseTimestamp("1m23s")).toBe(83);
    expect(parseTimestamp("1h")).toBe(3600);
    expect(parseTimestamp("1:23")).toBe(83);
    expect(parseTimestamp("1:01:23")).toBe(3683);
    expect(parseTimestamp("")).toBeUndefined();
    expect(parseTimestamp("abc")).toBeUndefined();
  });
  test("format", () => {
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(83)).toBe("1:23");
    expect(formatTimestamp(3683)).toBe("1:01:23");
  });
});

describe("linkAt", () => {
  test("adds the start time to YouTube and Twitch links", () => {
    expect(linkAt("https://www.youtube.com/watch?v=abc", 83)).toBe(
      "https://www.youtube.com/watch?v=abc&t=83s",
    );
    expect(linkAt("https://youtu.be/abc?t=10", 83)).toBe("https://youtu.be/abc?t=83s");
    expect(linkAt("https://www.twitch.tv/videos/1", 3723)).toBe(
      "https://www.twitch.tv/videos/1?t=1h2m3s",
    );
  });
  test("leaves other links and missing starts alone", () => {
    expect(linkAt("https://x.com/a/status/1", 83)).toBe("https://x.com/a/status/1");
    expect(linkAt("https://www.youtube.com/watch?v=abc", null)).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
  });
});

test("labels say what a link is", () => {
  expect(linkLabel("reddit-post")).toBe("Reddit post");
  expect(linkLabel("youtube-video", 83)).toBe("YouTube video at 1:23");
});

describe("embedUrl", () => {
  const parent = "dgg-awards.example";
  test("YouTube starts and ends at the clip's times", () => {
    expect(embedUrl("https://www.youtube.com/watch?v=abc123&t=90", { parent, end: 120 })).toBe(
      "https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0&start=90&end=120",
    );
    expect(embedUrl("https://youtu.be/abc123", { parent, start: 5 })).toBe(
      "https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0&start=5",
    );
    expect(embedUrl("https://www.youtube.com/shorts/xyz", { parent })).toBe(
      "https://www.youtube-nocookie.com/embed/xyz?autoplay=1&rel=0",
    );
  });
  test("Twitch clips and VODs name the parent page", () => {
    expect(embedUrl("https://clips.twitch.tv/FunnyClipSlug", { parent })).toBe(
      "https://clips.twitch.tv/embed?clip=FunnyClipSlug&parent=dgg-awards.example&autoplay=true",
    );
    expect(embedUrl("https://www.twitch.tv/destiny/clip/OtherSlug-ab12", { parent })).toBe(
      "https://clips.twitch.tv/embed?clip=OtherSlug-ab12&parent=dgg-awards.example&autoplay=true",
    );
    expect(embedUrl("https://www.twitch.tv/videos/2233445566", { parent, start: 3725 })).toBe(
      "https://player.twitch.tv/?video=v2233445566&parent=dgg-awards.example&autoplay=true&time=1h2m5s",
    );
  });
  test("Streamable", () => {
    expect(embedUrl("https://streamable.com/abcd12", { parent })).toBe("https://streamable.com/e/abcd12?autoplay=1");
  });
  test("links with no player to embed", () => {
    for (const url of ["https://kick.com/destiny/clips/clip_1", "https://x.com/a/status/1", "https://www.youtube.com/clip/Ugkx", "not a url"]) {
      expect(embedUrl(url, { parent })).toBeNull();
    }
  });
});
