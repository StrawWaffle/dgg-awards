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

async function signIn(username: string): Promise<Jar> {
  const jar: Jar = new Map();
  const start = await req("/signin", {}, jar);
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
  expect(done.headers.get("location")).toBe("/");
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
  test("index page is served with robots meta", async () => {
    const res = await req("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<title>Destiny Awards 2025</title>");
    expect(html).toContain('<meta name="robots" content="noindex');
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
    expect(Object.keys(body).sort()).toEqual(
      ["agent", "createdAt", "expiresAt", "id", "ip", "name", "uid"].sort(),
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
    expect((await req("/admin", {}, user)).status).toBe(401);
    const res = await req("/admin", {}, admin);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^\/admin\/[0-9a-f]{128}$/);
    const page = await req(loc, {}, admin);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
  });

  test("admin API is closed to non-admins", async () => {
    for (const path of ["/api/admin/users", "/api/admin/votes", "/api/admin/nominees"]) {
      expect((await req(path, {}, user)).status).toBe(401);
    }
    expect(
      (await req("/api/admin/config", { method: "POST", body: form({}) }, user)).status,
    ).toBe(401);
  });

  test("users list", async () => {
    const res = await req("/api/admin/users", {}, admin);
    expect(res.status).toBe(200);
    const users = await res.json();
    const tester = users.find((u: any) => u.name === "Tester");
    expect(tester.admin).toBe(true);
    expect(Object.keys(tester).sort()).toEqual(["admin", "createdDate", "name", "uid"]);
  });

  test("votes list pages by 100 and filters", async () => {
    const all = await (await req("/api/admin/votes", {}, admin)).json();
    expect(all).toHaveLength(100);
    expect(Object.keys(all[0]).sort()).toEqual(
      ["at", "categoryId", "optionId", "rank", "sessionSnapshot", "uid"].sort(),
    );
    const byIp = await (await req("/api/admin/votes?filter_ip=seed", {}, admin)).json();
    expect(byIp).toHaveLength(100);
    const byUid = await (await req("/api/admin/votes?filter_uid=-1", {}, admin)).json();
    expect(byUid.every((v: any) => v.uid === -1)).toBe(true);
    expect(byUid.length).toBeGreaterThan(0);
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
    expect((await req("/admin", {}, other)).status).toBe(302);
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

    for (const id of ["rankedcat", "emptycat"]) {
      await req(`/api/admin/category?id=${id}`, { method: "DELETE" }, admin);
    }
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
