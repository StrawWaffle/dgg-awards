// Characterization tests: they record how the HTTP API behaves today, so a
// refactor or upgrade can prove it changed nothing. Bugs are recorded as they
// are ("KNOWN BUG") and should only change on purpose.
//
// Runs against a live server with a freshly seeded database:
//   BASE_URL   the app, e.g. http://dgga-base:3000
//   MOCK_URL   the dev/dgg-oauth stand-in, e.g. http://dgga-mock:8789
// The server must have ADMIN_USERNAMES=Tester and be seeded with
// `bun scripts/seed.ts --mode voting --fake-votes 500`. See tests/run.sh.
import { describe, expect, test } from "bun:test";
import { encryptBackup } from "@/lib/backup-crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const MOCK = process.env.MOCK_URL ?? "http://localhost:8790";

type Jar = Map<string, string>;

function store(jar: Jar, res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    jar.set(pair!.slice(0, i), pair!.slice(i + 1));
  }
}

async function req(path: string, init: RequestInit = {}, jar?: Jar) {
  const headers = new Headers(init.headers);
  if (jar?.size) {
    headers.set(
      "cookie",
      [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    );
  }
  const url = path.startsWith("http") ? path : BASE + path;
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  if (jar) store(jar, res);
  return res;
}

/** Same path and query, on BASE instead of whatever origin the app sent. */
const onBase = (url: string) => {
  const u = new URL(url);
  return BASE + u.pathname + u.search;
};

async function signIn(username: string, next?: string): Promise<Jar & { landed?: string }> {
  const jar: Jar & { landed?: string } = new Map();
  const start = await req(next === undefined ? "/signin" : `/signin?next=${encodeURIComponent(next)}`, {}, jar);
  const authorize = new URL(start.headers.get("location")!);
  const body = new URLSearchParams(authorize.search);
  body.set("username", username);
  body.set("roles", "USER");
  const granted = await fetch(`${MOCK}/oauth/authorize`, {
    method: "POST",
    body,
    redirect: "manual",
  });
  const callback = granted.headers.get("location")!;
  const done = await req(onBase(callback), {}, jar);
  expect(done.status).toBe(302);
  jar.landed = done.headers.get("location")!;
  if (next === undefined) expect(jar.landed).toBe("/");
  return jar;
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function setMode(admin: Jar, mode: string) {
  const now = Math.floor(Date.now() / 1000);
  const res = await req(
    "/api/admin/config",
    {
      method: "POST",
      body: form({
        starting_time: String(now - 86400),
        ending_time: String(now + 86400),
        viewing_config: mode,
      }),
    },
    admin,
  );
  expect(res.status).toBe(302);
}

describe("static and public routes", () => {
  test("pages are served with robots meta: the front page, 2025's results and the voting page", async () => {
    for (const [path, title] of [
      ["/", "DGG Awards"],
      ["/2025", "DGG Awards"],
      ["/vote", "Destiny Awards 2025"],
    ] as const) {
      const res = await req(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain(`<title>${title}</title>`);
      expect(html).toContain('<meta name="robots" content="noindex');
    }
  });

  test("robots.txt disallows everyone", async () => {
    const res = await req("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain("User-agent: *\nDisallow: /");
  });

  test("local media is served, unknown media redirects to MEDIA_URL", async () => {
    const hit = await req("/Media/zee.jpg");
    expect(hit.status).toBe(200);
    expect(hit.headers.get("content-type")).toContain("image/jpeg");
    expect(hit.headers.get("x-robots-tag")).toContain("noindex");
    const miss = await req("/Media/does-not-exist.png");
    expect(miss.status).toBe(302);
    expect(miss.headers.get("location")).toEndWith("/does-not-exist.png");
  });

  test("error page renders the base64 message", async () => {
    const res = await req(`/error?error=${encodeURIComponent(btoa("Boom happened"))}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Boom happened");
  });

  test("config has the seeded mode", async () => {
    const res = await req("/api/config");
    expect(res.status).toBe(200);
    const cfg = await res.json();
    expect(Object.keys(cfg).sort()).toEqual(["awardYear", "endTime", "startTime", "viewingMode"]);
    expect(cfg.viewingMode).toBe("voting");
    expect(cfg.awardYear).toBe("2025");
    expect(typeof cfg.startTime).toBe("string");
  });

  test("nominees match the seed exactly", async () => {
    const res = await req("/api/nominees");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(22);
    expect(data.flatMap((c: any) => c.options)).toHaveLength(174);
    expect(data).toMatchSnapshot();
  });
});

describe("sign-in", () => {
  test("signin redirects to authorize with destiny.gg params", async () => {
    const res = await req("/signin");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/oauth/authorize");
    expect(loc.searchParams.get("response_type")).toBe("code");
    expect(loc.searchParams.get("client_id")).toBe("dev-client");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("code_challenge")).toBeTruthy();
    expect(loc.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers.getSetCookie().join()).toContain("state=");
  });

  test("oauth callback without state cookie goes to the error page", async () => {
    const res = await req("/oauth?code=x&state=y");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toStartWith("/error?error=");
  });

  test("me is 401 when signed out", async () => {
    expect((await req("/api/me")).status).toBe(401);
  });

  test("full sign-in creates a session", async () => {
    const jar = await signIn("Alice");
    const cookie = jar.get("session");
    expect(cookie).toBeTruthy();
    const me = await req("/api/me", {}, jar);
    expect(me.status).toBe(200);
    const body = await me.json();
    expect(body.name).toBe("Alice");
    expect(body.admin).toBe(false);
    expect(Object.keys(body).sort()).toEqual(
      // No IP address is kept.
      ["admin", "agent", "createdAt", "expiresAt", "id", "name", "uid"].sort(),
    );
  });

  test("tampered session is rejected", async () => {
    const jar = await signIn("Mallory");
    const [msg] = decodeURIComponent(jar.get("session")!).split(".");
    jar.set("session", encodeURIComponent(`${msg}.AAAA`));
    expect((await req("/api/me", {}, jar)).status).toBe(401);
  });

  test("signout clears the cookie and ends the session", async () => {
    const jar = await signIn("Bob");
    const old = new Map(jar);
    const res = await req("/signout", { method: "POST" }, jar);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.getSetCookie().join()).toMatch(/session=;.*Max-Age=0/i);
    expect((await req("/api/me", {}, old)).status).toBe(401);
  });
});

describe("voting", () => {
  const vote = (jar: Jar | undefined, body: unknown) =>
    req(
      "/api/vote",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      jar,
    );

  test("voting requires sign-in", async () => {
    expect((await vote(undefined, { category_id: "ally", nominee_id: "zee" })).status).toBe(401);
    expect((await req("/api/vote")).status).toBe(401);
  });

  test("a vote is stored once per category", async () => {
    const jar = await signIn("Voter1");
    expect((await vote(jar, { category_id: "ally", nominee_id: "zee" })).status).toBe(200);
    const again = await vote(jar, { category_id: "ally", nominee_id: "foodshops" });
    expect(again.status).toBe(400);
    expect(await again.text()).toBe("You have already voted for this category.");
    const mine = await req("/api/vote", {}, jar);
    expect(await mine.json()).toEqual({ ally: "zee" });
  });

  test("missing fields are rejected", async () => {
    const jar = await signIn("Voter2");
    expect((await vote(jar, { category_id: "ally" })).status).toBe(400);
  });

  test("results are closed while voting", async () => {
    expect((await req("/api/vote/results")).status).toBe(401);
  });
});

describe("admin", () => {
  let admin: Jar;
  let user: Jar;

  test("allowlisted user becomes admin, others do not", async () => {
    admin = await signIn("Tester");
    user = await signIn("NotAdmin");
    // The page itself is public (it checks /api/me); the API is what's protected.
    expect((await req("/api/me", {}, admin).then((r) => r.json())).admin).toBe(true);
    expect((await req("/api/me", {}, user).then((r) => r.json())).admin).toBe(false);
    const page = await req("/admin", {}, user);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    // Old /admin/<code> bookmarks land on /admin.
    const old = await req("/admin/0123abcd", {}, admin);
    expect(old.status).toBe(302);
    expect(old.headers.get("location")).toBe("/admin");
  });

  test("admin API is closed to non-admins", async () => {
    for (const path of ["/api/admin/users", "/api/admin/votes", "/api/admin/nominees"]) {
      expect((await req(path, {}, user)).status).toBe(401);
    }
    expect(
      (await req("/api/admin/config", { method: "POST", body: form({}) }, user)).status,
    ).toBe(401);
  });

  test("users list has the admins, or name matches with ?q=", async () => {
    const res = await req("/api/admin/users", {}, admin);
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(users.map((u: any) => u.name)).toEqual(["Tester"]);
    expect(users[0]).toMatchObject({ admin: true, fromEnv: true });
    expect(Object.keys(users[0]).sort()).toEqual(["admin", "createdDate", "fromEnv", "name", "uid"]);
    const found = await (await req("/api/admin/users?q=OTADM", {}, admin)).json();
    expect(found.map((u: any) => [u.name, u.admin, u.fromEnv])).toEqual([["NotAdmin", false, false]]);
    // LIKE wildcards are matched literally.
    expect(await (await req("/api/admin/users?q=%25", {}, admin)).json()).toEqual([]);
  });

  test("votes list pages by 100, with names and titles, and filters", async () => {
    const all = await (await req("/api/admin/votes", {}, admin)).json();
    expect(all).toHaveLength(100);
    expect(Object.keys(all[0]).sort()).toEqual(
      ["at", "categoryId", "categoryTitle", "name", "optionId", "optionTitle", "rank", "uid"].sort(),
    );
    expect(all.every((v: any) => v.name && v.categoryTitle && v.optionTitle)).toBe(true);
    const byUid = await (await req("/api/admin/votes?filter_uid=-1", {}, admin)).json();
    expect(byUid.every((v: any) => v.uid === -1)).toBe(true);
    expect(byUid.length).toBeGreaterThan(0);
    const name = byUid[0].name;
    const byName = await (await req(`/api/admin/votes?filter_name=${name.toUpperCase()}`, {}, admin)).json();
    expect(byName).toEqual(byUid);
    expect((await req("/api/admin/votes?filter_uid=abc", {}, admin)).status).toBe(400);
  });

  test("vote stats add up", async () => {
    const res = await req("/api/admin/stats", {}, admin);
    expect(res.status).toBe(200);
    const stats = await res.json();
    // The 500 seeded voters, plus the one from the voting tests.
    expect(stats.voters).toBe(501);
    expect(stats.categories.reduce((n: number, c: any) => n + c.ballots, 0)).toBe(stats.ballots);
    expect(stats.days.reduce((n: number, d: any) => n + d.ballots, 0)).toBe(stats.ballots);
    expect(stats.sharedIps).toBeUndefined();
    expect((await req("/api/admin/stats", {}, user)).status).toBe(401);
  });

  test("votes page by page number", async () => {
    const first = await (await req("/api/admin/votes", {}, admin)).json();
    const page0 = await (await req("/api/admin/votes?page=0", {}, admin)).json();
    const page1 = await (await req("/api/admin/votes?page=1", {}, admin)).json();
    expect(page0).toEqual(first);
    expect(page1).toHaveLength(100);
    expect(page1).not.toEqual(first);
  });

  test("category add, update, delete", async () => {
    const add = await req(
      "/api/admin/category",
      {
        method: "POST",
        body: form({
          category_id: "testcat",
          category_title: "Test Cat",
          category_description: "desc",
        }),
      },
      admin,
    );
    expect(add.status).toBe(302);
    expect(add.headers.get("location")).toBe("/admin");
    const bad = await req(
      "/api/admin/category",
      { method: "POST", body: form({ category_id: "x" }) },
      admin,
    );
    expect(bad.status).toBe(400);

    const patch = await req(
      "/api/admin/category",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "testcat", title: "Renamed" }),
      },
      admin,
    );
    expect(patch.status).toBe(200);
    const noms = await (await req("/api/admin/nominees", {}, admin)).json();
    expect(noms.find((c: any) => c.id === "testcat").title).toBe("Renamed");

    const del = await req("/api/admin/category?id=testcat", { method: "DELETE" }, admin);
    expect(del.status).toBe(200);
    expect(del.headers.get("content-type")).toContain("application/json");
    expect((await req("/api/admin/category", { method: "DELETE" }, admin)).status).toBe(400);
  });

  test("nominee add, update, delete", async () => {
    const add = await req(
      "/api/admin/nominee",
      {
        method: "POST",
        body: form({
          nominee_id: "testnom",
          category_id: "ally",
          nominee_title: "Test Nom",
          nominee_description: "d",
          url: "https://example.com",
        }),
      },
      admin,
    );
    expect(add.status).toBe(302);
    const missingUrl = await req(
      "/api/admin/nominee",
      {
        method: "POST",
        body: form({
          nominee_id: "n2",
          category_id: "ally",
          nominee_title: "t",
          nominee_description: "d",
        }),
      },
      admin,
    );
    expect(missingUrl.status).toBe(400);

    const patch = await req(
      "/api/admin/nominee",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "testnom", categoryId: "ally", title: "Edited" }),
      },
      admin,
    );
    expect(patch.status).toBe(200);
    const ally = (await (await req("/api/nominees")).json()).find((c: any) => c.id === "ally");
    const nom = ally.options.find((o: any) => o.id === "testnom");
    expect(nom.title).toBe("Edited");
    expect(nom.imageId).toBeNull();
    expect(nom.renderType).toBe("default");

    const del = await req(
      "/api/admin/nominee?categoryId=ally&id=testnom",
      { method: "DELETE" },
      admin,
    );
    expect(del.status).toBe(200);
    expect((await req("/api/admin/nominee?id=x", { method: "DELETE" }, admin)).status).toBe(400);
  });

  test("nominee details: date, link type and clip range", async () => {
    const nominee = async () =>
      (await (await req("/api/nominees")).json())
        .find((c: any) => c.id === "ally")
        .options.find((o: any) => o.id === "detailnom");
    const post = (extra: Record<string, string>) =>
      req(
        "/api/admin/nominee",
        {
          method: "POST",
          body: form({
            nominee_id: "detailnom",
            category_id: "ally",
            nominee_title: "Detail Nom",
            nominee_description: "d",
            url: "https://www.youtube.com/watch?v=abc",
            ...extra,
          }),
        },
        admin,
      );

    // Shape is validated: bad date, unknown type, negative seconds.
    expect((await post({ date: "June 2025" })).status).toBe(400);
    expect((await post({ link_type: "myspace" })).status).toBe(400);
    expect((await post({ clip_start: "-5" })).status).toBe(400);

    // Blank form fields mean "not given".
    const add = await post({ date: "2025-06-01", link_type: "", clip_start: "83", clip_end: "120" });
    expect(add.status).toBe(302);
    expect(await nominee()).toMatchObject({
      date: "2025-06-01",
      linkType: null,
      clipStart: 83,
      clipEnd: 120,
    });

    const patch = await req(
      "/api/admin/nominee",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "detailnom", categoryId: "ally", linkType: "youtube-video", clipEnd: null }),
      },
      admin,
    );
    expect(patch.status).toBe(200);
    expect(await nominee()).toMatchObject({ linkType: "youtube-video", clipStart: 83, clipEnd: null });

    const badPatch = await req(
      "/api/admin/nominee",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "detailnom", categoryId: "ally", clipStart: 1.5 }),
      },
      admin,
    );
    expect(badPatch.status).toBe(400);

    await req("/api/admin/nominee?categoryId=ally&id=detailnom", { method: "DELETE" }, admin);
  });

  test("checks list every problem with the nominees", async () => {
    expect((await req("/api/admin/checks", {}, user)).status).toBe(401);
    const res = await req("/api/admin/checks", {}, admin);
    expect(res.status).toBe(200);
    const issues = await res.json();
    expect(Object.keys(issues[0]).sort()).toEqual(
      ["categoryId", "code", "message", "nomineeId", "severity"],
    );
    const count = (code: string) => issues.filter((i: any) => i.code === code).length;
    // The seeded 2025 data, as scored by scripts/check-nominees.ts.
    expect(count("bare-link")).toBe(15);
    expect(count("missing-media")).toBe(10);
    expect(count("duplicate-title")).toBe(2);
  });

  test("DGG profile lookup is admin-only and checks the name", async () => {
    expect((await req("/api/admin/dgg-profile/StrawWaffle", {}, user)).status).toBe(401);
    expect((await req("/api/admin/dgg-profile/bad%20name!", {}, admin)).status).toBe(400);
  });

  test("admins can preview results before the reveal; nobody else can", async () => {
    // The site is in voting mode here.
    expect((await req("/api/me", {}, admin)).ok).toBe(true);
    expect((await (await req("/api/me", {}, admin)).json()).admin).toBe(true);
    expect((await req("/api/vote/results?preview=1")).status).toBe(401);
    expect((await req("/api/vote/results?preview=1", {}, user)).status).toBe(401);
    expect((await req("/api/vote/results", {}, admin)).status).toBe(401);
    const preview = await req("/api/vote/results?preview=1", {}, admin);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toHaveLength(22);
    expect((await req("/api/vote/results?preview=yes", {}, admin)).status).toBe(400);
  });

  test("editor creates categories and nominees from a title", async () => {
    const post = (path: string, body: unknown, jar: Jar = admin) =>
      req(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, jar);

    expect((await post("/api/admin/categories", { title: "Clip of the Year" }, user)).status).toBe(401);
    const cat = await post("/api/admin/categories", { title: "Clip of the Year!", votingStyle: "ranked" });
    expect(cat.status).toBe(201);
    expect(await cat.json()).toEqual({ id: "clip_of_the_year" });
    const again = await post("/api/admin/categories", { title: "Clip of the Year" });
    expect(await again.json()).toEqual({ id: "clip_of_the_year_2" });
    expect((await post("/api/admin/categories", { id: "ally", title: "Dup" })).status).toBe(409);
    expect((await post("/api/admin/categories", { title: "  " })).status).toBe(400);

    const nom = await post("/api/admin/nominees", {
      categoryId: "clip_of_the_year",
      title: "Destiny makes xQc rage quit",
      url: "https://www.youtube.com/watch?v=abc",
    });
    expect(nom.status).toBe(201);
    expect(await nom.json()).toEqual({ id: "destiny_makes_xqc_rage_quit", categoryId: "clip_of_the_year" });
    const second = await post("/api/admin/nominees", { categoryId: "clip_of_the_year", title: "Destiny makes xQc rage quit" });
    expect((await second.json()).id).toBe("destiny_makes_xqc_rage_quit_2");
    expect((await post("/api/admin/nominees", { categoryId: "nope", title: "x" })).status).toBe(404);
    expect((await post("/api/admin/nominees", { categoryId: "clip_of_the_year", title: "x", url: "not a url" })).status).toBe(400);

    const created = (await (await req("/api/admin/nominees", {}, admin)).json()).find(
      (c: any) => c.id === "clip_of_the_year",
    );
    expect(created).toMatchObject({ title: "Clip of the Year!", description: "", votingStyle: "ranked", usesDefaultStyle: false });
    expect(created.options.map((o: any) => [o.id, o.description, o.url])).toEqual([
      ["destiny_makes_xqc_rage_quit", "", "https://www.youtube.com/watch?v=abc"],
      ["destiny_makes_xqc_rage_quit_2", "", null],
    ]);

    for (const id of ["clip_of_the_year", "clip_of_the_year_2"]) {
      await req(`/api/admin/category?id=${id}`, { method: "DELETE" }, admin);
    }
  });

  test("categories and nominees reorder; new ones go last", async () => {
    const put = (path: string, body: unknown, jar = admin) =>
      req(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, jar);
    const order = async () => {
      const data = await (await req("/api/nominees")).json();
      return { cats: data.map((c: any) => c.id), ally: data.find((c: any) => c.id === "ally").options.map((o: any) => o.id) };
    };
    const before = await order();
    expect((await put("/api/admin/categories/order", { ids: [...before.cats].reverse() }, user)).status).toBe(401);

    expect((await put("/api/admin/categories/order", { ids: [...before.cats].reverse() })).status).toBe(200);
    expect((await put("/api/admin/nominees/order", { categoryId: "ally", ids: [...before.ally].reverse() })).status).toBe(200);
    const reversed = await order();
    expect(reversed.cats).toEqual([...before.cats].reverse());
    expect(reversed.ally).toEqual([...before.ally].reverse());
    // The admin editor and the results follow the same order.
    const adminCats = (await (await req("/api/admin/nominees", {}, admin)).json()).map((c: any) => c.id);
    expect(adminCats).toEqual(reversed.cats);

    const created = await req(
      "/api/admin/categories",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Last One" }) },
      admin,
    );
    expect(created.status).toBe(201);
    expect((await order()).cats.at(-1)).toBe("last_one");
    await req("/api/admin/category?id=last_one", { method: "DELETE" }, admin);

    await put("/api/admin/categories/order", { ids: before.cats });
    await put("/api/admin/nominees/order", { categoryId: "ally", ids: before.ally });
    expect(await order()).toEqual(before);
    expect((await put("/api/admin/categories/order", { ids: [] })).status).toBe(400);
  });

  test("edit history records changes and undoes them", async () => {
    const json = (method: string, body: unknown) => ({
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const history = async (query: string) => (await req(`/api/admin/history?${query}`, {}, admin)).json();
    const undo = (id: number, force = false) => req(`/api/admin/history/${id}/undo`, json("POST", { force }), admin);
    const zee = async () =>
      (await (await req("/api/nominees")).json()).find((c: any) => c.id === "ally").options.find((o: any) => o.id === "zee");
    const original = await zee();
    expect((await req("/api/admin/history", {}, user)).status).toBe(401);

    // An edit is recorded with only what changed, and by whom.
    await req("/api/admin/nominee", json("PATCH", { categoryId: "ally", id: "zee", title: "Zee 2" }), admin);
    const [edit] = await history("categoryId=ally&nomineeId=zee");
    expect(edit).toMatchObject({
      kind: "nominee",
      action: "update",
      name: "Tester",
      label: "Zee 2 · Ally of the Year",
      before: { title: original.title },
      after: { title: "Zee 2" },
      undoneBy: null,
    });

    // Undo puts it back, records itself, and can't be repeated.
    expect((await undo(edit.id)).status).toBe(200);
    expect((await zee()).title).toBe(original.title);
    const [undid] = await history("categoryId=ally&nomineeId=zee");
    expect(undid).toMatchObject({ revertOf: edit.id, before: { title: "Zee 2" }, after: { title: original.title } });
    expect((await history("categoryId=ally&nomineeId=zee"))[1].undoneBy).toBe(undid.id);
    expect((await undo(edit.id)).status).toBe(409);

    // Edited again since: refused with the field, unless forced.
    await req("/api/admin/nominee", json("PATCH", { categoryId: "ally", id: "zee", title: "A" }), admin);
    const [first] = await history("categoryId=ally&nomineeId=zee");
    await req("/api/admin/nominee", json("PATCH", { categoryId: "ally", id: "zee", title: "B" }), admin);
    const refused = await undo(first.id);
    expect(refused.status).toBe(409);
    expect((await refused.json()).fields).toEqual(["title"]);
    expect((await undo(first.id, true)).status).toBe(200);
    expect((await zee()).title).toBe(original.title);

    // A deleted nominee comes back where it was. (Zee has votes, which
    // can't be deleted, so a fresh one.)
    const ally = async () => (await (await req("/api/nominees")).json()).find((c: any) => c.id === "ally").options;
    await req("/api/admin/nominees", json("POST", { categoryId: "ally", id: "gone", title: "Gone" }), admin);
    await req("/api/admin/nominee", json("PATCH", { categoryId: "ally", id: "gone", description: "Back again" }), admin);
    const before = await ally();
    await req("/api/admin/nominee?categoryId=ally&id=gone", { method: "DELETE" }, admin);
    expect((await ally()).map((o: any) => o.id)).not.toContain("gone");
    const [deleted, edited, created] = await history("categoryId=ally&nomineeId=gone");
    expect([deleted.action, edited.action, created.action]).toEqual(["delete", "update", "create"]);
    expect(deleted.after).toBeNull();
    expect((await undo(deleted.id)).status).toBe(200);
    expect(await ally()).toEqual(before);
    // Undoing the create removes it again.
    expect((await undo(created.id)).status).toBe(200);
    expect((await ally()).map((o: any) => o.id)).not.toContain("gone");
    expect(await zee()).toEqual(original);

    // Settings, and the kind filter.
    const year = (await (await req("/api/config")).json()).awardYear;
    await req("/api/admin/settings", json("PATCH", { awardYear: 2031 }), admin);
    const [setting] = await history("kind=settings");
    expect(setting).toMatchObject({ before: { awardYear: year }, after: { awardYear: "2031" } });
    expect((await undo(setting.id)).status).toBe(200);
    expect((await (await req("/api/config")).json()).awardYear).toBe(year);
    expect((await history("kind=settings")).every((e: any) => e.kind === "settings")).toBe(true);
  });

  test("categories with votes are hidden, not deleted", async () => {
    const json = (method: string, body: unknown) => ({
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const publicIds = async () => (await (await req("/api/nominees")).json()).map((c: any) => c.id);
    const adminAlly = async () =>
      (await (await req("/api/admin/nominees", {}, admin)).json()).find((c: any) => c.id === "ally");

    expect(await adminAlly()).toMatchObject({ hidden: false, hasVotes: true });
    const refused = await req("/api/admin/category?id=ally", { method: "DELETE" }, admin);
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain("Hide it instead");
    expect((await req("/api/admin/nominee?categoryId=ally&id=zee", { method: "DELETE" }, admin)).status).toBe(409);

    expect((await req("/api/admin/category", json("PATCH", { id: "ally", hidden: true }), admin)).status).toBe(200);
    expect(await publicIds()).not.toContain("ally");
    expect(await adminAlly()).toMatchObject({ hidden: true, hasVotes: true });
    const preview = await (await req("/api/vote/results?preview=1", {}, admin)).json();
    expect(preview.map((c: any) => c.categoryId)).not.toContain("ally");
    // Votes for it are refused while it's hidden.
    const voter = await signIn("HiddenVoter");
    expect((await req("/api/vote", json("POST", { category_id: "ally", nominee_id: "zee" }), voter)).status).toBe(400);
    const [hid] = await (await req("/api/admin/history?kind=category&categoryId=ally", {}, admin)).json();
    expect(hid).toMatchObject({ action: "update", before: { hidden: false }, after: { hidden: true } });

    expect((await req("/api/admin/category", json("PATCH", { id: "ally", hidden: false }), admin)).status).toBe(200);
    expect(await publicIds()).toContain("ally");
  });

  test("export, then import a copy, undo it and redo it", async () => {
    const res = await req("/api/admin/export", {}, admin);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="dgg-awards-nominees-\d{4}-\d{2}-\d{2}\.json"/);
    const data = await res.json();
    const ally = data.find((c: any) => c.id === "ally");
    expect(ally.options.map((o: any) => o.id)).toContain("zee");
    expect(Object.keys(ally).sort()).toEqual(["description", "hidden", "id", "options", "title", "votingStyle"]);

    const importIt = (cats: unknown) => req("/api/admin/import", { method: "POST", body: form({ data: JSON.stringify(cats) }) }, admin);
    // Existing ids are refused up front.
    const clash = await importIt([ally]);
    expect(clash.status).toBe(409);
    expect(await clash.text()).toContain("ally");

    const copy = { ...ally, id: "ally_copy", title: "Ally copy" };
    expect((await importIt([copy])).status).toBe(302);
    const ids = async () => (await (await req("/api/nominees")).json()).map((c: any) => c.id);
    expect(await ids()).toContain("ally_copy");
    const copied = (await (await req("/api/nominees")).json()).find((c: any) => c.id === "ally_copy");
    expect(copied.options.map((o: any) => o.id)).toEqual(ally.options.map((o: any) => o.id));

    const [imported] = await (await req("/api/admin/history?kind=import", {}, admin)).json();
    expect(imported).toMatchObject({ action: "create", after: { categories: ["ally_copy"] } });
    const undo = (id: number) =>
      req(`/api/admin/history/${id}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, admin);
    expect((await undo(imported.id)).status).toBe(200);
    expect(await ids()).not.toContain("ally_copy");
    const [removed] = await (await req("/api/admin/history?kind=import", {}, admin)).json();
    expect((await undo(removed.id)).status).toBe(200);
    expect(await ids()).toContain("ally_copy");
    await req("/api/admin/category?id=ally_copy", { method: "DELETE" }, admin);
  });

  test("signing in returns to the page you came from, never off the site", async () => {
    expect((await signIn("Tester", "/admin")).landed).toBe("/admin");
    expect((await signIn("Tester", "/lab#stage")).landed).toBe("/lab#stage");
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example", "evil"]) {
      expect((await signIn("Tester", evil)).landed).toBe("/");
    }
  });

  test("make admin by uid", async () => {
    const other = await signIn("Promoted");
    const uid = (await (await req("/api/me", {}, other)).json()).uid;
    const res = await req(
      "/api/admin/user",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(uid),
      },
      admin,
    );
    expect(res.status).toBe(200);
    expect((await req("/api/admin/users", {}, other)).status).toBe(200);

    const set = (body: unknown) =>
      req(
        "/api/admin/user",
        { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        admin,
      );
    const testerUid = (await (await req("/api/me", {}, admin)).json()).uid;
    // Yourself, and anyone in ADMIN_USERNAMES, can't be removed here.
    expect((await set({ uid: testerUid, admin: false })).status).toBe(400);
    expect((await set({ uid: uid, admin: false })).status).toBe(200);
    expect((await req("/api/admin/users", {}, other)).status).toBe(401);
  });

  test("config rejects bad input", async () => {
    const res = await req(
      "/api/admin/config",
      {
        method: "POST",
        body: form({ starting_time: "1", ending_time: "2", viewing_config: "party" }),
      },
      admin,
    );
    expect(res.status).toBe(400);
  });

  test("settings set the voting window and mode", async () => {
    const patch = (body: unknown) =>
      req(
        "/api/admin/settings",
        { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        admin,
      );
    const before = await (await req("/api/config")).json();
    expect((await patch({ startTime: 2000, endTime: 1000 })).status).toBe(400);
    expect((await patch({ viewingMode: "party" })).status).toBe(400);
    const res = await patch({ startTime: 1000, endTime: 2000, viewingMode: "idle" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ startTime: "1000", endTime: "2000", viewingMode: "idle" });
    await patch({
      startTime: Number(before.startTime),
      endTime: Number(before.endTime),
      viewingMode: before.viewingMode,
    });
    expect(await (await req("/api/config")).json()).toEqual(before);
  });

  test("data import requires admin", async () => {
    const body = () => form({ data: "[]" });
    expect((await req("/api/admin/import", { method: "POST", body: body() })).status).toBe(401);
    expect(
      (await req("/api/admin/import", { method: "POST", body: body() }, user)).status,
    ).toBe(401);
    const ok = await req("/api/admin/import", { method: "POST", body: body() }, admin);
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/admin");
    const bad = await req("/api/admin/import", { method: "POST", body: form({ data: "{" }) }, admin);
    expect(bad.status).toBe(400);
  });

  test("ranked voting: ballots, style lock, settings and instant runoff", async () => {
    const json = (method: string, body: unknown) => ({
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const post = (path: string, fields: Record<string, string>) =>
      req(path, { method: "POST", body: form(fields) }, admin);

    // A ranked category with three nominees, and an empty one.
    expect(
      (await post("/api/admin/category", {
        category_id: "rankedcat",
        category_title: "Ranked Cat",
        category_description: "d",
        voting_style: "ranked",
      })).status,
    ).toBe(302);
    expect(
      (await post("/api/admin/category", {
        category_id: "emptycat",
        category_title: "Empty Cat",
        category_description: "d",
      })).status,
    ).toBe(302);
    for (const id of ["a", "b", "c"]) {
      await post("/api/admin/nominee", {
        nominee_id: id,
        category_id: "rankedcat",
        nominee_title: id.toUpperCase(),
        nominee_description: "d",
        url: "https://example.com",
      });
    }
    const styles = Object.fromEntries(
      (await (await req("/api/nominees")).json()).map((c: any) => [
        c.id,
        [c.votingStyle, c.usesDefaultStyle],
      ]),
    );
    expect(styles.rankedcat).toEqual(["ranked", false]);
    // Antagonist has only seed votes, so nothing has pinned its style yet.
    // (Ally was pinned to single by the API vote in an earlier test.)
    expect(styles.antagonist).toEqual(["single", true]);
    expect(styles.ally).toEqual(["single", false]);

    // Ballots must match the style and the category's nominees.
    const v1 = await signIn("Ranker1");
    const ballot = (jar: Jar, body: unknown) => req("/api/vote", json("POST", body), jar);
    expect((await ballot(v1, { category_id: "rankedcat", nominee_id: "a" })).status).toBe(400);
    expect((await ballot(v1, { category_id: "rankedcat", ranking: ["a", "a"] })).status).toBe(400);
    expect((await ballot(v1, { category_id: "rankedcat", ranking: ["a", "zee"] })).status).toBe(400);
    expect((await ballot(v1, { category_id: "ally", ranking: ["zee"] })).status).toBe(400);
    expect((await ballot(v1, { category_id: "nope", nominee_id: "a" })).status).toBe(400);

    // Round 1: a 2, b 2, c 1, no majority, so c is out and its ballot moves
    // to b. Round 2: b 3, a 2, so b wins.
    const ballots = [["a", "b"], ["a", "b"], ["b", "c"], ["b", "c"], ["c", "b"]];
    for (const [i, ranking] of ballots.entries()) {
      const jar = i === 0 ? v1 : await signIn(`Ranker${i + 1}`);
      expect((await ballot(jar, { category_id: "rankedcat", ranking })).status).toBe(200);
    }
    const again = await ballot(v1, { category_id: "rankedcat", ranking: ["c"] });
    expect(again.status).toBe(400);
    expect(await (await req("/api/vote/ballots", {}, v1)).json()).toEqual({ rankedcat: ["a", "b"] });
    expect(await (await req("/api/vote", {}, v1)).json()).toEqual({ rankedcat: "a" });

    // A voted category's style is locked; an empty one can still change.
    const lock = await req("/api/admin/category", json("PATCH", { id: "rankedcat", votingStyle: "single" }), admin);
    expect(lock.status).toBe(409);
    expect(
      (await req("/api/admin/category", json("PATCH", { id: "emptycat", votingStyle: "ranked" }), admin)).status,
    ).toBe(200);

    // Changing the default keeps voted categories as they were.
    const settings = await req("/api/admin/settings", json("PATCH", { defaultVotingStyle: "ranked", awardYear: 2026 }), admin);
    expect(settings.status).toBe(200);
    expect(await settings.json()).toMatchObject({ defaultVotingStyle: "ranked", awardYear: "2026" });
    const after = Object.fromEntries(
      (await (await req("/api/nominees")).json()).map((c: any) => [c.id, c.votingStyle]),
    );
    expect(after.antagonist).toBe("single"); // had votes: pinned before the switch
    expect(after.emptycat).toBe("ranked");
    expect(
      (await req("/api/admin/settings", json("PATCH", { defaultVotingStyle: "single", awardYear: 2025 }), admin)).status,
    ).toBe(200);
    expect((await req("/api/admin/settings", json("PATCH", { awardYear: 1999 }), admin)).status).toBe(400);

    // Results: the runoff decides the winner and the reveal order.
    await setMode(admin, "reviewing");
    const result = (await (await req("/api/vote/results")).json()).find(
      (c: any) => c.categoryId === "rankedcat",
    );
    expect(result.votingStyle).toBe("ranked");
    expect(result.totalVotes).toBe(5);
    expect(result.runoff).toEqual({
      rounds: [
        { counts: { a: 2, b: 2, c: 1 }, exhausted: 0, eliminated: ["c"] },
        { counts: { a: 2, b: 3 }, exhausted: 0, eliminated: [] },
      ],
      winners: ["b"],
    });
    expect(result.options.map((o: any) => [o.id, o.count, o.isWinner])).toEqual([
      ["c", 1, false],
      ["a", 2, false],
      ["b", 2, true],
    ]);
    await setMode(admin, "voting");

    // The empty one can go; the voted one can only be hidden.
    expect((await req("/api/admin/category?id=emptycat", { method: "DELETE" }, admin)).status).toBe(200);
    expect((await req("/api/admin/category?id=rankedcat", { method: "DELETE" }, admin)).status).toBe(409);
    await req("/api/admin/category", json("PATCH", { id: "rankedcat", hidden: true }), admin);
  });

  // Needs the dgga-files container serving tests/fixtures (see tests/run.sh).
  test(
    "clips: build in the background, serve with ranges, pick thumbnails",
    async () => {
      const FILES = process.env.FILES_URL ?? "http://dgga-files";
      const json = (method: string, body: unknown) => ({
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const addNominee = (id: string, fields: Record<string, string>) =>
        req(
          "/api/admin/nominee",
          {
            method: "POST",
            body: form({
              nominee_id: id,
              category_id: "ally",
              nominee_title: id,
              nominee_description: "d",
              ...fields,
            }),
          },
          admin,
        );
      const nominee = async (id: string) =>
        (await (await req("/api/admin/nominees", {}, admin)).json())
          .find((c: any) => c.id === "ally")
          .options.find((o: any) => o.id === id);
      const waitForClip = async (id: string) => {
        for (let i = 0; i < 120; i++) {
          const n = await nominee(id);
          if (n.clipStatus === "ready" || n.clipStatus === "failed") return n;
          await Bun.sleep(500);
        }
        throw new Error(`clip ${id} never finished`);
      };

      // Refused: no range, unknown nominee, not an admin.
      await addNominee("clipnorange", { url: `${FILES}/sample.mp4` });
      const noRange = await req("/api/admin/clip", json("POST", { categoryId: "ally", id: "clipnorange" }), admin);
      expect(noRange.status).toBe(400);
      expect(await noRange.text()).toBe("Set the clip's start and end first.");
      expect((await req("/api/admin/clip", json("POST", { categoryId: "ally", id: "nope" }), admin)).status).toBe(404);
      expect((await req("/api/admin/clip", json("POST", { categoryId: "ally", id: "clipnorange" }), user)).status).toBe(401);

      // Build a 1–4 s clip from the 6 s fixture.
      await addNominee("clipok", { url: `${FILES}/sample.mp4`, link_type: "video-file", clip_start: "1", clip_end: "4" });
      const started = await req("/api/admin/clip", json("POST", { categoryId: "ally", id: "clipok" }), admin);
      expect(started.status).toBe(202);
      const ready = await waitForClip("clipok");
      expect(ready.clipError).toBeNull();
      expect(ready.clipStatus).toBe("ready");
      expect(ready.clipUrl).toMatch(/^\/files\/clips\/ally\/clipok-[0-9a-f]{10}\.mp4$/);
      expect(ready.thumbnailUrl).toMatch(/^\/files\/thumbs\/ally\/clipok-1s-[0-9a-f]{10}\.jpg$/);
      expect(ready.thumbnailAt).toBe(1);

      // Served with byte ranges, and public.
      const video = await req(ready.clipUrl);
      expect(video.status).toBe(200);
      expect(video.headers.get("content-type")).toContain("video/mp4");
      expect(video.headers.get("accept-ranges")).toBe("bytes");
      const size = (await video.arrayBuffer()).byteLength;
      expect(size).toBeGreaterThan(5000);
      const part = await req(ready.clipUrl, { headers: { Range: "bytes=0-99" } });
      expect(part.status).toBe(206);
      expect(part.headers.get("content-range")).toBe(`bytes 0-99/${size}`);
      expect((await part.arrayBuffer()).byteLength).toBe(100);
      const thumb = await req(ready.thumbnailUrl);
      expect(thumb.headers.get("content-type")).toContain("image/jpeg");
      const pub = (await (await req("/api/nominees")).json())
        .find((c: any) => c.id === "ally")
        .options.find((o: any) => o.id === "clipok");
      expect(pub.clipUrl).toBe(ready.clipUrl);
      expect((await req("/files/../data/sqlite.db")).status).toBe(404);

      // Re-pick the thumbnail frame. The old file stays, for the edit history.
      const picked = await req("/api/admin/thumbnail", json("POST", { categoryId: "ally", id: "clipok", at: 2 }), admin);
      expect(picked.status).toBe(200);
      const { thumbnailUrl } = await picked.json();
      expect(thumbnailUrl).toMatch(/clipok-2s-/);
      expect((await req(ready.thumbnailUrl)).status).toBe(200);
      // Undoing the pick brings the old thumbnail back.
      const [pick] = await (await req("/api/admin/history?categoryId=ally&nomineeId=clipok", {}, admin)).json();
      expect(pick.after).toMatchObject({ thumbnailAt: 2 });
      const undone = await req(`/api/admin/history/${pick.id}/undo`, json("POST", {}), admin);
      expect(undone.status).toBe(200);
      const back = (await (await req("/api/admin/nominees", {}, admin)).json())
        .find((c: any) => c.id === "ally")
        .options.find((o: any) => o.id === "clipok");
      expect(back.thumbnailUrl).toBe(ready.thumbnailUrl);
      const tooLate = await req("/api/admin/thumbnail", json("POST", { categoryId: "ally", id: "clipok", at: 99 }), admin);
      expect(tooLate.status).toBe(400);

      // Upload a picture: stills re-saved without metadata; junk is refused.
      const png = Uint8Array.from(
        atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
        (ch) => ch.charCodeAt(0),
      );
      const upload = (file: File) => {
        const f = form({ categoryId: "ally", id: "clipok" });
        f.set("file", file);
        return req("/api/admin/thumbnail/upload", { method: "POST", body: f }, admin);
      };
      const uploaded = await upload(new File([png], "t.png", { type: "image/png" }));
      expect(uploaded.status).toBe(200);
      // A still PNG is re-saved as PNG (lossless, metadata dropped).
      expect((await uploaded.json()).thumbnailUrl).toMatch(/clipok-upload-[0-9a-f]{10}\.png$/);
      expect((await nominee("clipok")).thumbnailAt).toBeNull();
      const junk = await upload(new File(["not an image"], "x.png", { type: "image/png" }));
      expect(junk.status).toBe(400);
      expect((await upload(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }))).status).toBe(400);
      // A PNG header with junk behind it is refused too: ffprobe has to read it.
      const fakePng = new Uint8Array([...png.subarray(0, 16), ...new TextEncoder().encode("junk junk junk")]);
      expect((await upload(new File([fakePng], "f.png", { type: "image/png" }))).status).toBe(400);
      // GIFs are kept byte for byte, whatever the browser called them.
      const gif = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (ch) => ch.charCodeAt(0));
      const gifUp = await upload(new File([gif], "e.gif", { type: "application/octet-stream" }));
      expect(gifUp.status).toBe(200);
      const gifUrl = (await gifUp.json()).thumbnailUrl;
      expect(gifUrl).toMatch(/clipok-upload-[0-9a-f]{10}\.gif$/);
      const served = await req(gifUrl);
      expect(served.headers.get("content-type")).toContain("image/gif");
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(gif);
      // Removing the picture is recorded, and can be undone.
      expect((await req("/api/admin/thumbnail?categoryId=ally&id=clipok", { method: "DELETE" }, admin)).status).toBe(200);
      expect((await nominee("clipok")).thumbnailUrl).toBeNull();
      const [removed] = await (await req("/api/admin/history?categoryId=ally&nomineeId=clipok", {}, admin)).json();
      expect(removed).toMatchObject({ action: "update", after: { thumbnailKey: null } });
      expect((await req(`/api/admin/history/${removed.id}/undo`, json("POST", {}), admin)).status).toBe(200);
      expect((await nominee("clipok")).thumbnailUrl).toBe(gifUrl);

      // A source that can't be downloaded ends as "failed" with a reason.
      await addNominee("clipbad", { url: `${FILES}/missing.mp4`, link_type: "video-file", clip_start: "0", clip_end: "2" });
      await req("/api/admin/clip", json("POST", { categoryId: "ally", id: "clipbad" }), admin);
      const failed = await waitForClip("clipbad");
      expect(failed.clipStatus).toBe("failed");
      expect(failed.clipError).toContain("yt-dlp");
      expect(failed.clipUrl).toBeNull();

      // Deleting a nominee keeps its files, so undoing the delete restores them.
      const final = await nominee("clipok");
      for (const id of ["clipok", "clipbad", "clipnorange"]) {
        await req(`/api/admin/nominee?categoryId=ally&id=${id}`, { method: "DELETE" }, admin);
      }
      expect((await req(final.clipUrl)).status).toBe(200);
      expect((await req(final.thumbnailUrl)).status).toBe(200);
    },
    120_000,
  );

  test(
    "clips: upload a video, cut to the marked part",
    async () => {
      const upload = (id: string, fields: Record<string, string>, file: Blob, name: string, as: Jar = admin) => {
        const f = new FormData();
        f.set("categoryId", "ally");
        f.set("id", id);
        for (const [k, v] of Object.entries(fields)) f.set(k, v);
        f.set("file", file, name);
        return req("/api/admin/clip/upload", { method: "POST", body: f }, as);
      };
      const nominee = async (id: string) =>
        (await (await req("/api/admin/nominees", {}, admin)).json())
          .find((c: any) => c.id === "ally")
          .options.find((o: any) => o.id === id);
      const waitForClip = async (id: string) => {
        for (let i = 0; i < 120; i++) {
          const n = await nominee(id);
          if (n.clipStatus === "ready" || n.clipStatus === "failed") return n;
          await Bun.sleep(500);
        }
        throw new Error(`clip ${id} never finished`);
      };
      const sample = Bun.file("tests/fixtures/sample.mp4");
      const id = "zee"; // any nominee; uploads don't need a source link

      // Refused: not a video, end before start, unknown nominee, not an admin.
      const text = await upload(id, {}, new Blob(["hello"], { type: "text/plain" }), "notes.txt");
      expect(text.status).toBe(400);
      expect(await text.text()).toBe("That isn't a video file (MP4, MOV, MKV or WebM).");
      const backwards = await upload(id, { start: "3", end: "1" }, sample, "sample.mp4");
      expect(backwards.status).toBe(400);
      expect((await upload("nope", {}, sample, "sample.mp4")).status).toBe(404);
      expect((await upload(id, {}, sample, "sample.mp4", user)).status).toBe(401);

      // The whole 6 s video, then just 1–3 s of it.
      expect((await upload(id, {}, sample, "sample.mp4")).status).toBe(202);
      const whole = await waitForClip(id);
      expect(whole.clipError).toBeNull();
      expect(whole.clipStatus).toBe("ready");
      expect(whole.thumbnailAt).toBe(2); // a third of 6 s
      const wholeSize = (await (await req(whole.clipUrl)).arrayBuffer()).byteLength;

      expect((await upload(id, { start: "1", end: "3" }, sample, "sample.mp4")).status).toBe(202);
      const cut = await waitForClip(id);
      expect(cut.clipError).toBeNull();
      expect(cut.clipUrl).not.toBe(whole.clipUrl);
      expect(cut.thumbnailAt).toBe(0); // a third of 2 s
      const cutSize = (await (await req(cut.clipUrl)).arrayBuffer()).byteLength;
      expect(cutSize).toBeLessThan(wholeSize);

      // Marking past the end of the video fails, with a reason, and the
      // working clip stays in use.
      expect((await upload(id, { start: "10", end: "12" }, sample, "sample.mp4")).status).toBe(202);
      const late = await waitForClip(id);
      expect(late.clipStatus).toBe("ready");
      expect(late.clipError).toBe("The start is past the end of the video.");
      expect(late.clipUrl).toBe(cut.clipUrl);
    },
    60_000,
  );

  test(
    "clips: cut from a video in the library, which keeps it",
    async () => {
      const json = (body: unknown) => ({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const items = await (await req("/api/admin/library", {}, admin)).json();
      const item = items.find((i: any) => i.path === "Ally of the Year/sample.mp4");
      expect(item).toEqual({ path: "Ally of the Year/sample.mp4", folder: "Ally of the Year", name: "sample.mp4", kind: "video", size: expect.any(Number) });
      expect((await req("/api/admin/library", {}, user)).status).toBe(401);

      // Watched while marking: with byte ranges, never cached publicly.
      const url = `/api/admin/library/file?path=${encodeURIComponent(item.path)}`;
      const part = await req(url, { headers: { Range: "bytes=0-99" } }, admin);
      expect(part.status).toBe(206);
      expect(part.headers.get("cache-control")).toBe("private, max-age=3600");
      expect((await req(url, {}, user)).status).toBe(401);
      for (const evil of ["../sqlite.db", "/data/sqlite.db", "Ally of the Year/../../sqlite.db"]) {
        expect((await req(`/api/admin/library/file?path=${encodeURIComponent(evil)}`, {}, admin)).status).toBe(404);
      }

      const started = await req("/api/admin/clip/library", json({ categoryId: "ally", id: "adam_mockler", path: item.path, start: 1, end: 3 }), admin);
      expect(started.status).toBe(202);
      expect((await req("/api/admin/clip/library", json({ categoryId: "ally", id: "adam_mockler", path: "nope.mp4" }), admin)).status).toBe(404);
      let n: any;
      for (let i = 0; i < 120; i++) {
        n = (await (await req("/api/admin/nominees", {}, admin)).json())
          .find((c: any) => c.id === "ally")
          .options.find((o: any) => o.id === "adam_mockler");
        if (n.clipStatus === "ready" || n.clipStatus === "failed") break;
        await Bun.sleep(500);
      }
      expect(n.clipError).toBeNull();
      expect(n.clipStatus).toBe("ready");
      expect(n.thumbnailAt).toBe(0); // a third of 2 s
      // The library file is still there.
      const after = await (await req("/api/admin/library", {}, admin)).json();
      expect(after.some((i: any) => i.path === item.path)).toBe(true);
    },
    60_000,
  );

  test("full backups: download, restore (plain and encrypted), refusals", async () => {
    const restore = (file: Blob, name: string, password?: string, as: Jar = admin) => {
      const f = new FormData();
      f.set("file", file, name);
      if (password) f.set("password", password);
      return req("/api/admin/backup/restore", { method: "POST", body: f }, as);
    };
    const allyTitle = async () =>
      (await (await req("/api/admin/nominees", {}, admin)).json()).find((c: any) => c.id === "ally").title;
    const rename = (title: string) =>
      req("/api/admin/category", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "ally", title }) }, admin);

    // Download: the whole database, without sessions. Admins only.
    expect((await req("/api/admin/backup", {}, user)).status).toBe(401);
    const res = await req("/api/admin/backup", {}, admin);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="dgg-awards-.*\.db"$/);
    const backup = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(backup.subarray(0, 15))).toBe("SQLite format 3");
    const original = await allyTitle();

    // Change something, restore, and it's back; the admin is still signed in.
    await rename("Changed for the restore test");
    const restored = await restore(new Blob([backup]), "backup.db");
    expect(restored.status).toBe(200);
    const { counts } = await restored.json();
    expect(counts.categories).toBeGreaterThan(0);
    expect(counts.votes).toBeGreaterThan(0);
    expect(counts.sessions).toBeUndefined();
    expect(await allyTitle()).toBe(original);

    // Encrypted, as on Google Drive: needs the right password.
    await rename("Changed again");
    const sealed = new Uint8Array(await encryptBackup(backup, "test password"));
    const wrong = await restore(new Blob([sealed]), "backup.db.enc", "nope");
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain("wrong password");
    expect(await allyTitle()).toBe("Changed again");
    expect((await restore(new Blob([sealed]), "backup.db.enc", "test password")).status).toBe(200);
    expect(await allyTitle()).toBe(original);

    // Not a backup, or not an admin.
    const junk = await restore(new Blob(["hello"]), "notes.txt");
    expect(junk.status).toBe(400);
    expect(await junk.text()).toBe("That isn't a backup: choose a .db or .db.enc file.");
    expect((await restore(new Blob([backup]), "backup.db", undefined, user)).status).toBe(401);

    // Off-site backups aren't set up on the test server.
    const status = await (await req("/api/admin/backup/status", {}, admin)).json();
    expect(status.enabled).toBe(false);
    expect((await req("/api/admin/backup/now", { method: "POST" }, admin)).status).toBe(400);
  });

  test("locked mode hides nominees", async () => {
    await setMode(admin, "locked");
    const res = await req("/api/nominees");
    expect(await res.text()).toBe("locked");
  });

  test("voting is refused outside voting mode", async () => {
    await setMode(admin, "idle");
    const res = await req(
      "/api/vote",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category_id: "dgger", nominee_id: "x" }),
      },
      admin,
    );
    expect(res.status).toBe(401);
  });

  test("results in reviewing mode add up and are sorted", async () => {
    await setMode(admin, "reviewing");
    const res = await req("/api/vote/results");
    expect(res.status).toBe(200);
    const results = await res.json();
    expect(results).toHaveLength(22);
    for (const cat of results) {
      const counts = cat.options.map((o: any) => o.count);
      expect(counts.reduce((a: number, b: number) => a + b, 0)).toBe(cat.totalVotes);
      expect([...counts].sort((a, b) => a - b)).toEqual(counts);
      const max = Math.max(...counts);
      for (const o of cat.options) {
        expect(o.isWinner).toBe(o.count === max && o.count > 0);
        const pct = cat.totalVotes ? Number(((o.count / cat.totalVotes) * 100).toFixed(1)) : 0;
        expect(o.percentage).toBe(pct);
        expect(o.payload.id).toBe(o.id);
        expect(o.payload).not.toHaveProperty("votes");
      }
    }
    expect(
      results.map((c: any) => ({
        c: c.categoryId,
        t: c.totalVotes,
        o: c.options.map((o: any) => [o.id, o.count]),
      })),
    ).toMatchSnapshot();
    await setMode(admin, "voting");
  });
});
