// Ids for new categories and nominees, made from their titles. Shared so the
// editor can show the id a title will get.

/** "Destiny makes xQc rage quit!" -> "destiny_makes_xqc_rage_quit". */
export function slugify(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36)
    .replace(/_+$/, "");
  return slug || "item";
}

/** `base`, or `base_2`, `base_3`… if taken. */
export function uniqueId(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}
