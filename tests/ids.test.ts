import { expect, test } from "bun:test";
import { slugify, uniqueId } from "@/lib/ids";

test("slugify makes readable ids from titles", () => {
  expect(slugify("Destiny makes xQc rage quit!")).toBe("destiny_makes_xqc_rage_quit");
  expect(slugify("  Café — Ünïcode  ")).toBe("cafe_unicode");
  expect(slugify("GAGAGA")).toBe("gagaga");
  expect(slugify("🔥🔥")).toBe("item");
  expect(slugify("a".repeat(60))).toHaveLength(36);
  expect(slugify("word ".repeat(10))).not.toEndWith("_");
});

test("uniqueId adds a number when taken", () => {
  expect(uniqueId("zee", new Set())).toBe("zee");
  expect(uniqueId("zee", new Set(["zee"]))).toBe("zee_2");
  expect(uniqueId("zee", new Set(["zee", "zee_2"]))).toBe("zee_3");
});
