// Full-page screenshots of every page and mode, for before/after comparison.
//   node capture.mjs <base-url> <mock-url> <out-dir>
// The app must be freshly seeded (voting mode, 500 fake votes) with
// ADMIN_USERNAMES=Tester. Run through tests/visual/run.sh.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [BASE, MOCK, OUT] = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

async function session(username) {
  const jar = new Map();
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const start = await fetch(`${BASE}/signin`, { redirect: "manual" });
  keep(start);
  const body = new URLSearchParams(new URL(start.headers.get("location")).search);
  body.set("username", username);
  const granted = await fetch(`${MOCK}/oauth/authorize`, { method: "POST", body, redirect: "manual" });
  const cb = new URL(granted.headers.get("location"));
  keep(await fetch(BASE + cb.pathname + cb.search, { headers: { cookie: cookie() }, redirect: "manual" }));
  return jar.get("session");
}

// Fixed dates so countdowns and the config tab render the same every run.
// The browser clock is frozen at FROZEN, inside the voting window.
const START = 1767225600; // 2026-01-01
const END = 4102444800; // 2100-01-01
const FROZEN = new Date("2026-06-01T12:00:00Z");

async function setMode(token, mode) {
  const f = new FormData();
  f.set("starting_time", String(START));
  f.set("ending_time", String(END));
  f.set("viewing_config", mode);
  await fetch(`${BASE}/api/admin/config`, {
    method: "POST",
    body: f,
    headers: { cookie: `session=${token}` },
    redirect: "manual",
  });
}

const admin = await session("Tester");
await setMode(admin, "voting");
const voter = await session("Voter");
// A still image stands in for every animated GIF, which would otherwise be
// caught on a different frame each run.
const still = Buffer.from(await (await fetch(`${BASE}/Media/coggers.png`)).arrayBuffer());
await fetch(`${BASE}/api/vote`, {
  method: "POST",
  headers: { cookie: `session=${voter}`, "content-type": "application/json" },
  body: JSON.stringify({ category_id: "ally", nominee_id: "zee" }),
});

// The browser reaches every app under one name, so pages that print their own
// address (the vote summary share text) render the same for any container.
const PAGE = "http://app.test:3000";
const browser = await chromium.launch({
  args: [`--host-resolver-rules=MAP app.test ${new URL(BASE).hostname}`],
});

async function shot(name, { path = "/vote", token, viewport = { width: 1440, height: 900 }, before } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (token) {
    await context.addCookies([{ name: "session", value: token, url: PAGE }]);
  }
  const page = await context.newPage();
  await page.clock.setFixedTime(FROZEN);
  // Keep the outside world out so only our code affects the pixels: YouTube
  // and Streamable lookups get a fixed answer, other external requests fail.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (/\.gif($|\?)/i.test(url)) {
      return route.fulfill({ body: still, contentType: "image/png" });
    }
    if (url.startsWith(`${PAGE}/Media/`)) {
      // Animated PNG (acTL chunk) and WebP (ANIM chunk) files get the still too.
      // route.fetch runs in Node, which doesn't know the app.test alias.
      return route.fetch({ url: BASE + url.slice(PAGE.length), maxRedirects: 0 }).then(async (res) => {
        // Not stored locally: the app redirects to the dead CDN. Fail at once
        // so the broken image renders the same way every run.
        if (res.status() !== 200) return route.fulfill({ status: 404, body: "" });
        const body = await res.body().catch(() => Buffer.alloc(0));
        const head = body.subarray(0, 4096).toString("latin1");
        if (head.includes("acTL") || head.includes("ANIM")) {
          return route.fulfill({ body: still, contentType: "image/png" });
        }
        return route.fulfill({ response: res, body });
      });
    }
    if (url.startsWith(PAGE)) return route.continue();
    const fake = { title: "Video", thumbnail_url: `${PAGE}/Media/coggers.png`, html: "<div></div>" };
    if (url.includes("youtube.com/oembed") || url.includes("api.streamable.com")) {
      return route.fulfill({ json: fake });
    }
    return route.abort();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error" || /401|ERR_FAILED/.test(t)) return;
    errors.push(t);
  });
  await page.goto(PAGE + path, { waitUntil: "networkidle" });
  // Load lazy images and anything that appears on scroll.
  await page.evaluate(async () => {
    document.querySelectorAll("img[loading=lazy]").forEach((img) => (img.loading = "eager"));
    for (let y = 0; y < document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  if (before) await before(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, animations: "disabled", caret: "hide" });
  console.log(`${name}${errors.length ? `  console errors: ${errors.join(" | ")}` : ""}`);
  await context.close();
}

const mobile = { width: 390, height: 844 };

// The public site (one page since 2026-11-09): the front page, voting, results.
await shot("home", { path: "/" });
await shot("voting-signed-out");
await shot("voting-signed-in", { token: voter });
await shot("voting-mobile", { viewport: mobile, token: voter });

await setMode(admin, "reviewing");
await shot("results", { path: "/results" });
await shot("results-mobile", { path: "/results", viewport: mobile });

await setMode(admin, "locked");
await shot("locked", { path: "/" });
await setMode(admin, "voting");

for (const tab of ["Nominees", "Settings", "Admins", "Votes"]) {
  await shot(`admin-${tab.toLowerCase()}`, {
    path: "/admin",
    token: admin,
    before: async (p) => {
      const t = p.getByRole("tab", { name: tab });
      if (await t.count()) await t.first().click();
      await p.waitForTimeout(300);
    },
  });
}

await browser.close();
