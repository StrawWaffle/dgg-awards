// The destiny.gg profile parser, against a made-up page with the same
// structure as destiny.gg/u/<name> (no real profile is stored here).
import { describe, expect, test } from "bun:test";
import { parseDggProfile, rebuildSignature } from "@/server/dgg-profile";

const card = (signature: string) => `
<main class="wrapper public-profile">
 <div class="id-card"><div class="id-card__inner">
  <div class="id-card__face id-card__face--front">
   <div class="id-card__header">
    <span class="badge badge--primary id-card__tier"><span class="badge__text">Tier 2 Subscriber </span></span>
   </div>
   <div class="id-card__body">
    <div class="id-card__photo-column">
     <img class="id-card__photo id-card__view" src="https://cdn.destiny.gg/img/profile-photo-alien.abc.png" alt="Profile photo" />
     <div class="id-card__team id-card__view"><span class="badge badge--success"><span class="badge__text">Team PEPE</span></span></div>
    </div>
    <div class="id-card__details">
     <span class="id-card__label">Name</span>
     <div class="id-card__name id-card__view">TestChatter</div>
     <div class="id-card__since">Member since March 3, 2019</div>
     <div class="id-card__field"><span class="id-card__label">Gender</span><span class="id-card__value">Private stuff</span></div>
    </div>
   </div>
   <div class="id-card__bio"><p class="id-card__bio-text id-card__view">Posts &quot;bangers&quot; &amp; emotes, it&#039;s true.</p></div>
  </div>
  <div class="id-card__face id-card__face--back">
   <div class="id-card__signature id-card__view">${signature}</div>
  </div>
 </div></div>
</main>`;

const goodSignature = `<svg class="id-card__signature-image" viewBox="0 0 5907 1000" role="img">
  <path d="M78 15L15 78L15 985" vector-effect="non-scaling-stroke" />
  <path d="M100 200 C 1.5 2e3, 3 4, 5 6Z" /></svg>`;

describe("parseDggProfile", () => {
  test("reads the card fields", async () => {
    const p = await parseDggProfile(card(goodSignature), "https://www.destiny.gg/u/TestChatter");
    expect(p).toEqual({
      name: "TestChatter",
      url: "https://www.destiny.gg/u/TestChatter",
      photoUrl: "https://cdn.destiny.gg/img/profile-photo-alien.abc.png",
      tier: "Tier 2 Subscriber",
      team: "Team PEPE",
      memberSince: "March 3, 2019",
      bio: `Posts "bangers" & emotes, it's true.`,
      signatureSvg: expect.stringContaining('viewBox="0 0 5907 1000"'),
    });
  });

  test("doesn't read private fields", async () => {
    const p = await parseDggProfile(card(goodSignature), "u");
    expect(JSON.stringify(p)).not.toContain("Private stuff");
  });

  test("a page without a card is not a profile", async () => {
    expect(await parseDggProfile("<html><body>Not found</body></html>", "u")).toBeNull();
  });

  test("works without a signature", async () => {
    const p = await parseDggProfile(card(""), "u");
    expect(p?.signatureSvg).toBeNull();
  });
});

describe("rebuildSignature", () => {
  test("keeps only the path data, in an SVG of our own", () => {
    const svg = rebuildSignature(card(goodSignature))!;
    expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5907 1000"');
    expect(svg).toContain('<path d="M78 15L15 78L15 985"');
    expect(svg).toContain('<path d="M100 200 C 1.5 2e3, 3 4, 5 6Z"');
    expect(svg).not.toContain("role=");
  });

  test("drops anything that isn't plain path data", () => {
    const evil = `<svg class="id-card__signature-image" viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(1)</script>
      <path d="M1 1&quot; onmouseover=&quot;alert(1)" />
      <path d="javascript:alert(1)" />
      <foreignObject><div onclick="alert(1)">x</div></foreignObject>
      <path d="M1 1L2 2" /></svg>`;
    const svg = rebuildSignature(card(evil))!;
    expect(svg).not.toMatch(/script|alert|onload|onmouseover|onclick|foreignObject|&quot;/);
    expect(svg).toContain('<path d="M1 1L2 2"');
  });

  test("no usable paths means no signature", () => {
    const svg = `<svg class="id-card__signature-image" viewBox="0 0 10 10"><path d="javascript:x" /></svg>`;
    expect(rebuildSignature(card(svg))).toBeNull();
  });
});
