"""
Builds the "year in DGG chat" page's data from dgg-scs's year-in-review report.

    python scripts/build-chat-review.py <yir-YYYY.json> src/archive/chat-YYYY.json

The report's numbers come through as they are; what's shown, and the captions,
are picked here by hand. Left out on purpose:
- raw messages that are NSFW, NSFL, about real-world harm, or slurs (several
  "longest greentexts", combo-breaking messages and ban reasons)
- links to Discord uploads (they expire), NSFW links, and most other links
- artefacts: "@moderation" tagging "muted", and "Emote" as a tagged nick
Captions are for this year's numbers: rewrite them for the next report.
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from urllib.parse import urlencode, urlparse

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding="utf-8"))
s = d["summary"][0]
first = datetime.fromisoformat(s["first_message"]).date()
last = datetime.fromisoformat(s["last_message"]).date()
days = (last - first).days + 1
fmt = lambda n: f"{n:,}"

def by(rows, key, value):
    return next(r for r in rows if r[key] == value)

# ---- The year in numbers
numbers = [
    {"label": "messages", "value": s["messages"], "note": f"About {round(s['messages'] / days / 1000)}k a day: one every {days * 86400 / s['messages']:.2f} seconds, for {days} days."},
    {"label": "chatters", "value": s["chatters"], "note": "Every one of them right, according to themselves."},
    {"label": "emotes", "value": s["emotes_used"], "note": f"{s['distinct_emotes_used']} different ones. Close to one per message: words are optional."},
    {"label": "combos", "value": s["combos"], "note": f"The biggest had {s['biggest_combo']} people in it."},
    {"label": "links", "value": s["links_posted"], "note": "Most of them now lead nowhere."},
    {"label": "greentexts", "value": s["greentexts"], "note": "> be chat > quote everything"},
    {"label": "punishments", "value": s["punishments_by_mods"] + s["punishments_auto"], "note": f"The bot handed out {round(s['punishments_auto'] / (s['punishments_by_mods'] + s['punishments_auto']) * 100)}% of them and asked for nothing in return."},
    {"label": "duels", "value": s["duels"], "note": "Settled like adults."},
]

# ---- Emotes
emotes = d["emote_top"]
top = emotes[0]
next3 = sum(e["uses"] for e in emotes[1:4])
crowns = Counter(e["top_user"] for e in emotes)
mmmm = by(emotes, "emote", "MMMM")
verypog = by(emotes, "emote", "VeryPog")
triple = [n for n, c in crowns.most_common() if c >= 3]
emote_cards = [
    {"emote": top["emote"], "big": fmt(top["uses"]), "title": f"{top['emote']} of the year",
     "text": f"More than the next three ({', '.join(e['emote'] for e in emotes[1:4])}) put together ({fmt(next3)}). Chat laughed {fmt(round(top['uses'] / days))} times a day, at {fmt(top['people'])} people's hands. {top['top_user']} alone did {fmt(top['top_user_uses'])}."},
    {"emote": "MMMM", "big": fmt(mmmm["top_user_uses"]), "title": f"{mmmm['top_user']} and MMMM",
     "text": f"One in every {round(mmmm['uses'] / mmmm['top_user_uses'])} MMMMs in chat this year came from {mmmm['top_user']}. Mmmm."},
    {"emote": "VeryPog", "big": fmt(verypog["top_user_uses"]), "title": f"{verypog['top_user']} and VeryPog",
     "text": f"About one in {round(verypog['uses'] / verypog['top_user_uses'])} of all VeryPogs. Very pog, very consistent."},
]
for n in triple:
    owned = [e["emote"] for e in emotes if e["top_user"] == n]
    emote_cards.append({"emote": owned[0], "big": str(len(owned)), "title": f"{n}'s emote crowns",
                        "text": f"The top user of {', '.join(owned[:-1])} and {owned[-1]}. A dynasty."})

emote_bars = [{"name": e["emote"], "emote": e["emote"], "value": e["uses"], "sub": f"{fmt(e['people'])} people · most by {e['top_user']} ({fmt(e['top_user_uses'])})"} for e in emotes[:15]]
power_users = [{"name": u["nick"], "emote": u["favourite"], "value": u["emotes"], "sub": f"favourite: {u['favourite']}"} for u in d["emote_users"][:10]]

# ---- Combos
combos = d["top_combos"]
SAFE_BREAKS = {"ChibiDesti", "DANKMEMES LOAD", "m", "LifeIsGreat LifeIsGreat", "YEE", "MMMM", "no", "MMMM reloading", "ARRIVE",
               "he knew it chat", "LifeIsGreat load", "coMMMMfy", "WWWWaiting", "ShrimpleAs", "Abathur LOADED", "Cabge", "bi"}
combo_list = []
for c in combos[:12]:
    when = datetime.fromisoformat(c["started"])
    combo_list.append({
        "emote": c["emote"], "size": c["size"], "people": c["people"], "date": when.date().isoformat(),
        "brokenBy": c["broken_by"], "breaking": c["breaking_message"] if c["breaking_message"] in SAFE_BREAKS else None,
    })
night = [c for c in combos if c["started"].startswith("2026-07-26")]
joe = next(c for c in combos if c["breaking_message"] == "m")
joiners = d["combo_participants"]
breakers = d["combo_breakers"]
combo_cards = [
    {"emote": combos[0]["emote"], "big": str(combos[0]["size"]), "title": "The biggest combo",
     "text": f"{combos[0]['size']} people, {combos[0]['emote']}, on {datetime.fromisoformat(combos[0]['started']).day} {datetime.fromisoformat(combos[0]['started']):%B}. Then {combos[0]['broken_by']} typed \"{combos[0]['breaking_message']}\"."},
    {"emote": "DANKMEMES", "big": str(len(night)), "title": "The night of 26 July",
     "text": f"{len(night)} of the year's top {len(combos)} combos happened on that one night, {fmt(sum(c['size'] for c in night))} combo messages between them. Whatever happened that night, chat had a lot to say about it."},
    {"emote": joe["emote"], "big": "m", "title": f"{joe['broken_by']}'s masterpiece",
     "text": f"A {joe['size']}-strong {joe['emote']} combo, ended with a single letter: m."},
    {"emote": "Klappa", "big": str(joiners[0]["combos_joined"]), "title": f"{joiners[0]['nick']}, team player",
     "text": f"Joined {joiners[0]['combos_joined']} combos and typed only {joiners[0]['combo_messages'] - joiners[0]['combos_joined']} extra messages in them. Never the hero, never the villain."},
    {"emote": "REE", "big": str(breakers[0]["combos_broken"]), "title": f"{breakers[0]['nick']}, the Grinch",
     "text": f"Broke {breakers[0]['combos_broken']} combos, more than anyone. {breakers[1]['nick']} was one behind on {breakers[1]['combos_broken']}."},
]
rin = next((b for b in breakers if b["nick"] == "RiN_LuX"), None)
if rin:
    combo_cards.append({"emote": "PepoG", "big": str(rin["combos_broken"]), "title": "Even the organisers",
                        "text": f"RiN_LuX, who helps run these awards, broke {rin['combos_broken']} combos. We're not above the law either."})
joiner_bars = [{"name": j["nick"], "value": j["combos_joined"]} for j in joiners[:10]]
breaker_bars = [{"name": b["nick"], "value": b["combos_broken"], "sub": f"biggest broken: {b['biggest_broken']} {b['biggest_broken_emote']}", "emote": b["biggest_broken_emote"]} for b in breakers[:10]]

# ---- Saying the streamers' names
sm = d["streamer_mentions"]
TARGETS = {"destiny": "Destiny", "mrmouton": "MrMouton", "dan": "dan / dancantstream"}
months = sorted({r["month"] for r in sm if r["month"] != "year"})
crown_rows = []
for t, label in TARGETS.items():
    year_top = next(r for r in sm if r["target"] == t and r["month"] == "year" and r["rank"] == 1)
    per = {r["month"]: {"nick": r["nick"], "n": r["messages"]} for r in sm if r["target"] == t and r["rank"] == 1 and r["month"] != "year"}
    crown_rows.append({"target": label, "year": {"nick": year_top["nick"], "n": year_top["messages"]}, "months": [per.get(m) for m in months]})
pairs = d["tag_pairs"]
tri_d = next(p for p in pairs if p["from_nick"] == "Trius" and p["to_nick"] == "Destiny")
tri_m = next(p for p in pairs if p["from_nick"] == "Trius" and p["to_nick"] == "MrMouton")
destiny_oct = next(r for r in sm if r["target"] == "destiny" and r["month"] == "2026-10" and r["rank"] == 1)
dan_oct = next(r for r in sm if r["target"] == "dan" and r["month"] == "2026-10" and r["rank"] == 1)
# Trius's crowns for the year, and how close the miss was where someone else took one.
tri_crowns = [r["target"] for r in crown_rows if r["year"]["nick"] == "Trius"]
tri_missed = [(r, next(x for x in sm if x["target"] == t and x["month"] == "year" and x["nick"] == "Trius"))
              for t, r in zip(TARGETS, crown_rows) if r["year"]["nick"] != "Trius"]
said = {"Destiny": "Destiny's", "MrMouton": "MrMouton's", "dan / dancantstream": "dan's"}
said_names = [said[t] for t in tri_crowns]
said_list = ", ".join(said_names[:-1]) + " and " + said_names[-1] if len(said_names) > 1 else said_names[0]
tri_lead = f"Said {said_list} names more than anyone this year"
if tri_missed:
    r, mine = tri_missed[0]
    gap = r["year"]["n"] - mine["messages"]
    tri_lead += f", and came {gap} short of {r['year']['nick']} on {said[r['target']]}"
names_cards = [
    {"emote": "Stare", "big": f"{len(tri_crowns)}/{len(crown_rows)}", "title": "Trius, everywhere",
     "text": f"{tri_lead}. Tagged Destiny {fmt(tri_d['tags'])} times and got {tri_d['tags_back']} back: {round(tri_d['tags'] / max(1, tri_d['tags_back']))} to 1. MrMouton answered {tri_m['tags_back']} of {fmt(tri_m['tags'])}."},
    {"emote": "PepoG", "big": fmt(destiny_oct["messages"]), "title": f"{destiny_oct['nick']}'s October",
     "text": f"Took the Destiny crown off Trius for a month with {fmt(destiny_oct['messages'])} mentions. Trius held every other month from February to September."},
    {"emote": "WWWWaiting", "big": fmt(dan_oct["messages"]), "title": f"{dan_oct['nick']} and dan",
     "text": f"{fmt(dan_oct['messages'])} dan mentions in October alone, the most in any month for anyone. dan, please stream."},
]

# ---- Who tagged whom
SKIP = {"@moderation", "Emote", "muted"}
seen = set()
duos = []
for p in pairs:
    key = frozenset((p["from_nick"], p["to_nick"]))
    if p["from_nick"] in SKIP or p["to_nick"] in SKIP or key in seen:
        continue
    seen.add(key)
    if p["tags_back"] >= p["tags"] * 0.4:
        duos.append({"a": p["from_nick"], "b": p["to_nick"], "ab": p["tags"], "ba": p["tags_back"]})
unrequited = [{"a": p["from_nick"], "b": p["to_nick"], "ab": p["tags"], "ba": p["tags_back"]}
              for p in pairs if p["tags_back"] < p["tags"] * 0.05 and p["from_nick"] not in SKIP][:6]
DUO_NOTES = {
    ("MisterBhole", "Aristortle"): "Chat's loudest relationship, one way more than the other.",
    ("aus_bits", "LysergicAcid"): "The most balanced relationship in chat: within 500 tags of each other all year.",
    ("Proteus", "ShawarmaFury"): "Nearly even. Healthy, by DGG standards.",
    ("theGOOSE", "kristoffaro"): "A quiet, steady thing.",
    ("Mexiijo", "Aristortle"): "The other side of chat's love triangle: MisterBhole tags Mexiijo too.",
}
for x in duos:
    x["note"] = DUO_NOTES.get((x["a"], x["b"]))
tagged = [{"name": t["nick"], "value": t["tagged"], "sub": f"by {fmt(t['by_people'])} people"} for t in d["most_tagged"] if t["nick"] not in SKIP][:12]
dest = by(d["most_tagged"], "nick", "Destiny")
tag_cards = [
    {"emote": "DinkDonk", "big": fmt(dest["tagged"]), "title": "Destiny, tagged",
     "text": f"{fmt(round(dest['tagged'] / days))} times a day, by {fmt(dest['by_people'])} different people. He saw some of them."},
]

# ---- Greentext
gt = d["greentext"]
# Who, why, and when they said it: the time is rustlesearch's, to the millisecond, so the quote
# links to the chat around it. Found with https://api-v2.rustlesearch.dev/anon/search (username,
# start_date, end_date, text); the report has no times. yusuf posted his three times; this is the first.
QUOTES = {
    "yusuf": ("A formal statement on dan's verbal malfunctions.", "2026-03-20T19:13:00.094Z"),
    "Clanker": ("A history lesson, in uwu.", "2026-06-06T05:28:40.533Z"),
    "Torrniquet": ("A business plan.", "2026-07-09T06:00:23.256Z"),
    "Vandriel": ("Unsolicited Star Wars rewrite, part one of many.", "2026-01-09T08:55:19.698Z"),
    "Doomah": ("The longest Doomah got, out of 101,017 messages.", "2026-07-31T03:18:39.097Z"),
    "dannysartproject": ("Said three times, for emphasis.", "2026-05-21T20:04:11.246Z"),
}


def surrounds(nick, ts):
    return "https://rustlesearch.dev/surrounds?" + urlencode({"channel": "Destinygg", "date": ts, "username": nick})


quotes = []
for nick, (note, ts) in QUOTES.items():
    g = by(gt, "nick", nick)
    text = g["longest"].strip()
    if nick == "dannysartproject":
        text = text.split(" >HOW")[0]  # the same line three times; once is enough
    quotes.append({"who": nick, "text": text, "note": note, "link": surrounds(nick, ts)})
greentext_bars = [{"name": g["nick"], "value": g["greentexts"], "sub": f"{g['pct']}% of their messages"} for g in gt[:10]]
aph = gt[0]
greentext_cards = [
    {"emote": "PepoG", "big": f"{aph['pct']}%", "title": f"{aph['nick']}, quoted",
     "text": f"More than half of everything {aph['nick']} said started with >. {fmt(aph['greentexts'])} greentexts out of {fmt(aph['messages'])} messages."},
]

# ---- Links
lp = d["link_posters"]
dl = by(lp, "nick", "Destiny")
most_links = max(lp, key=lambda r: r["links"])
best_ratio = max((r for r in lp if r["nick"] not in ("Destiny", "MrMouton", "dancantstream")), key=lambda r: r["extra_per_link"])
link_cards = [
    {"emote": "CINEMA", "big": f"{dl['extra_per_link']:.1f}", "title": "Destiny's links",
     "text": f"Each one drew about {dl['extra_per_link']:.0f} extra reactions. Being the streamer helps."},
    {"emote": "WWWWaiting", "big": fmt(most_links["links"]), "title": f"{most_links['nick']}, prolific",
     "text": f"Posted {fmt(most_links['links'])} links, the most of anyone, at {most_links['extra_per_link']:.2f} extra reactions each. Quantity is a quality of its own."},
    {"emote": "OMEGALUL", "big": f"{best_ratio['extra_per_link']:.1f}", "title": f"{best_ratio['nick']}, chat's curator",
     "text": f"The best reactions per link of any chatter: {fmt(best_ratio['links'])} links, {fmt(best_ratio['reactions'])} reactions. Mostly Discord images, so you'll have to take our word for it."},
]
def label_for(url):
    host = urlparse(url).netloc.lower().removeprefix("www.").removeprefix("i.").removeprefix("media.")
    if "discordapp" in host or "discord" in host:
        return None
    return {"imgur.com": "an imgur image", "streamable.com": "a Streamable clip", "youtu.be": "a YouTube video",
            "youtube.com": "a YouTube video", "x.com": "a post on X", "reddit.com": "a Reddit post"}.get(host, host)
PICKED = {
    1: "A Discord image. It self-destructed within a day, but 108 people saw it and none of them will say what it was.",
    4: "Destiny, laughing at a screenshot that has since self-destructed. Chat laughed with him, 79 times.",
    14: "A UK visa application form. No further comment from chat, just 55 reactions.",
    17: "Four letters, spaced out. The clip has since been taken down.",
    24: "Destiny shares his own ban appeal from a year ago.",
    3: "Relayed from DimitriMG1, who was too scared to send it to Tiny themselves.",
    7: "A timestamped Bulwark episode. Chat, briefly, listened to a podcast.",
}
# Links checked by hand (2026-11-20) and found gone: they get a note instead.
DEAD = {"https://streamable.com/xu64u0": "[deleted Streamable clip]"}
top_links = []
for r in d["link_reactions"]:
    if r["rank"] not in PICKED:
        continue
    words, kept, link = [], None, None
    for w in r["message"].split():
        if w in DEAD:
            words.append(DEAD[w])
        elif w.startswith("http"):
            lab = label_for(w)
            if lab and link is None:
                link = {"url": w, "label": lab}
            # As sent, link and all (rinlux); only Discord images, which expire, get a note.
            words.append(w if lab else "[self-destructed Discord image]")
        else:
            words.append(w)
    text = " ".join(words)
    if len(text) > 300:
        text = text[:297] + "…"
    top_links.append({"rank": r["rank"], "who": r["nick"], "reactions": r["reactions"], "people": r["people"],
                      "date": r["ts"][:10], "text": text, "link": link, "note": PICKED[r["rank"]]})

# ---- Law and order
mods = d["mods_overview"]
mod = {m["nick"]: m for m in mods}
cmds = defaultdict(dict)
for c in d["mod_commands"]:
    cmds[c["nick"]]["!" + c["command"].lstrip("!")] = c["uses"]
mod_bars = sorted(({"name": m["nick"], "value": m["commands"], "sub": m["top_commands"] or "no commands at all"} for m in mods), key=lambda b: -b["value"])
quiet = next(m for m in mods if m["commands"] == 0)
law_cards = [
    {"emote": "GIGACHAD", "big": fmt(cmds["Destiny"].get("!ipban", 0)), "title": "Destiny's justice",
     "text": f"{fmt(cmds['Destiny'].get('!ipban', 0))} IP bans, {cmds['Destiny'].get('!meganuke', 0)} meganukes, and not a single mute. Destiny doesn't mute."},
    {"emote": "MMMM", "big": fmt(mod["Bing"]["mutes"]), "title": "Bing's mute button",
     "text": f"{fmt(mod['Bing']['mutes'])} mutes, the most of any mod, and worn smooth."},
    {"emote": "peepoHug", "big": fmt(cmds["RiN_LuX"].get("!unban", 0)), "title": "RiN_LuX giveth",
     "text": f"The busiest mod ({fmt(mod['RiN_LuX']['commands'])} commands), and {cmds['RiN_LuX'].get('!unban', 0)} of them were unbans. Also started {mod['RiN_LuX']['vote_bans_started']} vote bans and sent {mod['RiN_LuX']['gulag_bans']} people to the gulag, so it evens out."},
    {"emote": "PepoTurtle", "big": "0", "title": f"{quiet['nick']}, at peace",
     "text": f"{fmt(quiet['messages'])} messages, zero mod commands. The calmest mod in chat."},
    {"emote": "Abathur", "big": str(cmds["Lemmiwinks"].get("!duel", 0)), "title": "Lemmiwinks' favourite power",
     "text": f"Lemmiwinks' most used mod command is !duel ({cmds['Lemmiwinks'].get('!duel', 0)} times). Some mods moderate. Some mods fight."},
]
reasons = d["punishment_reasons"]
FUNNY_BANS = ["TIE GATE 2026", "unban = lose mod", "MMMM", "dinkdonk vote cheating", "Unban on April 1st, maybe", "epic", "LULW",
              "KEK", "reduced sentence", "SALUTE", "cool", "ACKSHUALLY", "FeelsWeirdMan", "peepoHug uhhh maybe dont say this/agree with it"]
ban_reasons = [{"label": r["reason"], "n": r["n"]} for name in FUNNY_BANS for r in reasons if r["kind"] == "ban reason" and r["reason"] == name]
nuked = [{"label": r["reason"].strip("/i").replace("\\b", ""), "n": r["n"]} for r in reasons if r["kind"] == "nuked phrase"][:6]
link_rules = [{"label": r["reason"], "n": r["n"]} for r in reasons if r["kind"] == "link rule"]
pm = {p["nick"].lower(): p for p in d["punished_by_mods"]}
pa = d["punished_auto"]
throttle = pa[0]
duelist = max(pa, key=lambda r: r["duels_lost"])
flyers = [
    {"emote": "Stare", "big": str(pm["rin_lux"]["mutes"]), "title": "Nobody is safe",
     "text": f"RiN_LuX, a mod, was muted {pm['rin_lux']['mutes']} times this year, mostly by {pm['rin_lux']['mostly_by']}."},
    {"emote": "Stare", "big": str(pm["jaydrvernanda"]["mutes"]), "title": "Nobody, really",
     "text": f"JaydrVernanda, also a mod: muted {pm['jaydrvernanda']['mutes']} times, mostly by {pm['jaydrvernanda']['mostly_by']}."},
    {"emote": "WWWWaiting", "big": str(throttle["spam"]), "title": f"{throttle['nick']}, too fast",
     "text": f"Typed faster than the chat allows {throttle['spam']} times. The bot's most regular customer."},
    {"emote": "PepeHands", "big": str(duelist["duels_lost"]), "title": f"{duelist['nick']}, bruised",
     "text": f"Lost {duelist['duels_lost']} duels and kept accepting them."},
]

data = {
    "year": d["meta"]["year"],
    "from": first.isoformat(),
    "through": last.isoformat(),
    "days": days,
    "numbers": numbers,
    "emotes": {"cards": emote_cards, "top": emote_bars, "users": power_users},
    "combos": {"cards": combo_cards, "top": combo_list, "joiners": joiner_bars, "breakers": breaker_bars},
    "names": {"cards": names_cards, "months": months, "crowns": crown_rows},
    "tags": {"cards": tag_cards, "duos": duos[:4], "unrequited": unrequited, "tagged": tagged},
    "greentext": {"cards": greentext_cards, "top": greentext_bars, "quotes": quotes},
    "links": {"cards": link_cards, "top": sorted(top_links, key=lambda x: x["rank"])},
    "law": {"cards": law_cards, "mods": mod_bars, "banReasons": ban_reasons, "nuked": nuked, "linkRules": link_rules, "flyers": flyers},
    "notTags": [n for n in d["meta"]["nicks_not_counted_as_tags"] if not n.startswith("@")],
}
json.dump(data, open(out, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
print("wrote", out)
