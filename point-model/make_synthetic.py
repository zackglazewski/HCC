"""
Synthetic "tricky" validation cards, labeled by LLM consensus (NOT ground truth).

Step 1 (--generate): Claude designs cards for hard categories - strong stats with crippling
        drawbacks, weak stats with game-warping auras, matched pairs differing in one stat or
        one d20 threshold, alternate forms, bonding enablers, glass cannons, tanks, squads.
        Points are NOT generated here.
Step 2 (--label):    each card is priced independently K times by Claude with a cached rules +
        reference-card context (real official cards from dataset.csv). Label = median, spread kept.
Output: synthetic_cards.csv (same columns as dataset.csv + label_spread, category, provenance).

Usage:
  uv run python make_synthetic.py --generate --per-category 6
  uv run python make_synthetic.py --label -k 3
"""
import argparse, csv, json, os, random, statistics, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import anthropic

HERE = os.path.dirname(os.path.abspath(__file__)); MODEL = "claude-opus-5"
GEN_PATH = os.path.join(HERE, "synthetic_generated.json"); OUT = os.path.join(HERE, "synthetic_cards.csv")

CATEGORIES = {
    "strong_stats_crippling_drawback": "Heroes with excellent base stats (life 5-7, attack 4-5, defense 4-5) but a severe drawback in the powers: e.g. must attack the nearest figure, may be taken over by the opponent on a d20 roll, cannot move after attacking, takes a wound each round, loses attack dice when engaged. The drawback must materially reduce the value.",
    "weak_stats_game_warping_support": "Figures with weak combat stats (attack 1-2, life 2-4) whose powers are strong army-wide support: defense/attack auras for a faction, order-marker manipulation, healing every round, initiative control, movement boosts for squads. Cheap statline, expensive power.",
    "matched_pair_one_stat": "PAIRS of nearly identical heroes where the second differs from the first by exactly one base stat (+1 attack, or +1 defense, or +1 life, or +2 move, or range 1 -> range 6). Same powers and flavor. Name them 'X' and 'X (variant)'. Generate the pairs together.",
    "matched_pair_d20_threshold": "PAIRS of identical figures whose single d20-gated power differs only in the threshold: one triggers on 11+ and its twin on 16+ (or 6+ vs 14+). Name them 'X' and 'X (variant)'.",
    "alternate_form_addon": "Cards that do not start the game on the battlefield and swap in for another named card (transformations, summoned forms, vehicles). Their point cost is an add-on paid on top of the base card.",
    "bonding_and_squad_synergy": "Common squads and the heroes that bond with them: squads with 3-4 figures per card whose powers reference a bonding hero or faction; heroes whose main value is taking a turn with a squad after their own. Include the figure count in the squad's powers text where natural.",
    "glass_cannon": "Cheap figures with life 1-2 and high offense (attack 5-6, or a special attack with range 6+ and 4+ dice) and poor defense. Also a couple with stealth or first-strike type protection.",
    "tank_and_huge": "Large or huge figures with life 7-12, defense 5-8, low move, sometimes attack 3 with area effects or trample; include one with no ranged option and one with a devastating but d20-gated special attack.",
    "ordinary_midrange": "Perfectly ordinary mid-range unique heroes and common squads with 1-2 standard powers (Flying, Disengage, Climb x2, a 3-dice special attack). These are the calibration anchors: nothing exotic.",
}

CATEGORIES_V3 = {
    "drawback_twins_severe": "PAIRS: a solid unique hero (life 5-7, attack 4-5, defense 3-5, 1-2 normal powers) and its twin with ONE added severe drawback power: on a d20 roll of 15+ an opponent controls it this turn; or it must always attack the nearest figure, friend or foe; or it takes a wound at the end of every round; or it cannot move and attack in the same turn. Name them 'X' and 'X (variant)'.",
    "drawback_twins_mild": "PAIRS: a hero or squad and its twin with ONE added mild-to-moderate drawback: cannot be healed; -1 defense when engaged with 2+ figures; may not use glyphs; must end its move adjacent to a friendly figure if possible; loses Flying when wounded. Name them 'X' and 'X (variant)'.",
    "drawback_only_official_style": "Single cards in the style of official drawback units (Marcu Esenwein, Isamu, Deadeye Dan): strong offense or mobility with a built-in liability (control loss on d20, vanishes on a roll, forced targeting, self-wounding). Include both heroes and one common squad.",
    "aura_twins": "PAIRS: an ordinary hero and its twin with ONE added faction aura (all friendly figures within 4 clear sight spaces add 1 defense die / attack die / move 1 extra). Name them 'X' and 'X (variant)'.",
    "d20_threshold_twins": "PAIRS identical except the single d20 threshold on their signature power: 8+ vs 15+ (or 11+ vs 17+). Name them 'X' and 'X (variant)'.",
    "tank_and_huge": "Large/huge figures with life 7-12, defense 5-8, move 4-5; some with trample/area special attacks, some pure walls with no ranged option, one with a devastating d20-gated attack.",
    "alternate_form_addon": "Cards that do not start on the battlefield and swap in for a named base card; priced as an add-on.",
    "glass_cannon": "Life 1-2 figures with attack 5-6 or a ranged special attack of 4+ dice, defense 1-2.",
    "ordinary_anchors": "Perfectly ordinary heroes and common squads with standard powers (Flying, Disengage, Climb x2, a 3-dice special attack). Calibration anchors, nothing exotic.",
}

CATEGORIES_V4 = {k: CATEGORIES_V3[k] for k in ["drawback_twins_severe", "drawback_twins_mild", "aura_twins", "d20_threshold_twins"]}
CATEGORIES_V4["drawback_twins_squad"] = "PAIRS: a common or unique squad and its twin with ONE added drawback (squad figures must move toward the nearest enemy; the squad cannot be bonded with; each figure that attacks takes a wound on a d20 roll of 1-5). Name them 'X' and 'X (variant)'."
CATEGORIES_V4["drawback_removal_twins"] = "PAIRS: an official-style card that HAS a severe built-in drawback power (control loss on a d20 roll, vanishes on a roll, forced targeting) and its twin with that drawback power removed and nothing added. Name the drawback version 'X' and the clean version 'X (variant)'."

RULES = """You are pricing army cards for classic Heroscape (Rise of the Valkyrie through Age of Annihilation era community balance).
Key facts:
- Attack dice hit on skulls (3 of 6 faces = 50%); defense dice block on shields (2 of 6 faces = 33%). Expected damage per attack roughly 0.5*attack minus 0.33*defense of the target, floored at 0.
- Heroes: points scale steeply with life, then attack, then defense; move above 5 and range above 1 add value; height matters for line of sight. Unique heroes cost more than commons with equal stats only if their powers justify it; common heroes are usually cheap (20-70).
- Squads: the point value is for the whole card (3-4 figures for commons, 2-4 for uniques). Squad figures have life 1. Squads with range 6+ and attack 3 are worth ~90-130; melee squads with attack 2-3 defense 2-3 are worth ~40-80. Bonding raises value.
- Powers are the largest source of deviation: auras that buff a faction, d20 powers (value scales with success chance: 11+ is 50%, 16+ is 25%), double attack, special attacks with more dice or range than the base, healing, order-marker tricks, stealth flying. Drawbacks (forced targeting, control loss, wounding yourself, cannot move and attack) reduce value sharply.
- Cards that do not start on the battlefield are priced as an add-on to their base card (typically 20-80).
- Values are multiples of 5. Practically all cards land between 20 and 250; only monsters and dragons exceed 250.
Reference official cards (stats and points are correct):
"""

def refs(n=40, seed=0):
    rows = [r for r in csv.DictReader(open(os.path.join(HERE, "dataset.csv"))) if r["source_group"] == "official" and r["split"] == "train"]
    random.Random(seed).shuffle(rows); out = []
    for r in rows[:n]:
        ab = "; ".join(f"{r[f'ability_{i}_title']}: {r[f'ability_{i}_desc'][:220]}" for i in range(1, 5) if r[f"ability_{i}_title"].strip())
        out.append(f"- {r['name']} | {r['figure_type']} {r['entity_type']} {r['occupation']} | {r['size']} {r['height']} | L{r['life']} M{r['move']} R{r['range']} A{r['attack']} D{r['defense']} | {ab} => {int(float(r['points']))} pts")
    return "\n".join(out)

CARD_SCHEMA = {"type": "object", "properties": {"cards": {"type": "array", "items": {"type": "object", "properties": {
    "name": {"type": "string"}, "general": {"type": "string"}, "entity_type": {"type": "string"}, "figure_type": {"type": "string", "enum": ["Unique Hero", "Common Hero", "Uncommon Hero", "Unique Squad", "Common Squad"]},
    "occupation": {"type": "string"}, "personality": {"type": "string"}, "size": {"type": "string", "enum": ["Small", "Medium", "Large", "Huge"]}, "height": {"type": "integer"},
    "life": {"type": "integer"}, "move": {"type": "integer"}, "range": {"type": "integer"}, "attack": {"type": "integer"}, "defense": {"type": "integer"},
    "abilities": {"type": "array", "items": {"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}}, "required": ["title", "description"], "additionalProperties": False}},
    "design_note": {"type": "string", "description": "one sentence on why this card is tricky to price"}},
    "required": ["name", "general", "entity_type", "figure_type", "occupation", "personality", "size", "height", "life", "move", "range", "attack", "defense", "abilities", "design_note"], "additionalProperties": False}}},
    "required": ["cards"], "additionalProperties": False}
LABEL_SCHEMA = {"type": "object", "properties": {"reasoning": {"type": "string", "description": "3-5 sentences: base statline value, each power's effect, comparable official cards"}, "points": {"type": "integer"}}, "required": ["reasoning", "points"], "additionalProperties": False}

def card_block(c):
    ab = "\n".join(f"{a['title'].upper()}: {a['description']}" for a in c["abilities"])
    return (f"Type: {c['figure_type']}\nGeneral: {c['general']} | Species: {c['entity_type']} | Class: {c['occupation']} | Personality: {c['personality']}\n"
            f"Size: {c['size']} {c['height']}\nLife {c['life']}, Move {c['move']}, Range {c['range']}, Attack {c['attack']}, Defense {c['defense']}\n{ab}")

def generate(client, per_cat, cats=None, path=GEN_PATH, chunk=8):
    cards = json.load(open(path)) if os.path.exists(path) else []
    done = {}
    for c in cards: done[c["category"]] = done.get(c["category"], 0) + 1
    for cat, desc in (cats or CATEGORIES).items():
        while done.get(cat, 0) < per_cat:
            n = min(chunk, per_cat - done.get(cat, 0)); used = [c["name"] for c in cards if c["category"] == cat]
            prompt = (RULES + refs(25, seed=(hash(cat) + done.get(cat, 0)) % 1000) + f"\n\nDesign {n} NEW custom Heroscape cards in this category:\n{cat}: {desc}\n"
                      "Write powers in authentic Heroscape rules language (precise, referencing spaces, dice, d20 thresholds, order markers). Vary generals, species and classes. Do NOT include point values."
                      + (f"\nDo not reuse these names: {', '.join(used[-40:])}" if used else ""))
            try:
                resp = client.messages.create(model=MODEL, max_tokens=16000, messages=[{"role": "user", "content": prompt}], output_config={"format": {"type": "json_schema", "schema": CARD_SCHEMA}})
                got = json.loads(next(b.text for b in resp.content if b.type == "text"))["cards"]
            except (json.JSONDecodeError, StopIteration) as e:
                print(f"  {cat}: parse error ({e}); retrying with smaller chunk", flush=True); chunk = max(4, chunk // 2); continue
            for c in got: c["category"] = cat
            cards += got; done[cat] = done.get(cat, 0) + len(got)
            json.dump(cards, open(path, "w"), indent=1)
            print(f"  {cat}: +{len(got)} -> {done[cat]}/{per_cat}  (in={resp.usage.input_tokens} out={resp.usage.output_tokens})", flush=True)
    print(f"saved {len(cards)} cards -> {path}")

def label_one(client, system_blocks, c, seed):
    resp = client.messages.create(model=MODEL, max_tokens=4000, system=system_blocks,
        messages=[{"role": "user", "content": f"Price this card. Consider the statline first, then each power, then comparable official cards. Answer with the point value as a multiple of 5.\n\n{card_block(c)}"}],
        output_config={"format": {"type": "json_schema", "schema": LABEL_SCHEMA}})
    d = json.loads(next(b.text for b in resp.content if b.type == "text")); d["_cache_read"] = resp.usage.cache_read_input_tokens; return d

def label(client, k, gen_path=GEN_PATH, out=OUT):
    cards = json.load(open(gen_path))
    system_blocks = [{"type": "text", "text": RULES + refs(60, seed=1), "cache_control": {"type": "ephemeral"}}]
    jobs = [(i, s) for i in range(len(cards)) for s in range(k)]; results = {i: [] for i in range(len(cards))}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(label_one, client, system_blocks, cards[i], s): (i, s) for i, s in jobs}
        for n, fut in enumerate(as_completed(futs)):
            i, s = futs[fut]
            try: results[i].append(fut.result())
            except Exception as e: print("  ERR", cards[i]["name"], e)
            if (n + 1) % 25 == 0: print(f"  labeled {n+1}/{len(jobs)}", flush=True)
    cols = ["name","general","entity_type","figure_type","occupation","personality","size","height","life","move","range","attack","defense","ability_1_title","ability_1_desc","ability_2_title","ability_2_desc","ability_3_title","ability_3_desc","ability_4_title","ability_4_desc","points","source_file","label_spread","label_samples","category","design_note","provenance"]
    tag = os.path.basename(out).replace("synthetic_cards", "").replace(".csv", "") or ""
    with open(out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader()
        for i, c in enumerate(cards):
            pts = [r["points"] for r in results[i]]
            if not pts: continue
            med = int(round(statistics.median(pts) / 5) * 5); spread = (max(pts) - min(pts))
            row = {k: c.get(k, "") for k in cols[:13]}
            for j in range(4):
                row[f"ability_{j+1}_title"] = c["abilities"][j]["title"] if j < len(c["abilities"]) else ""; row[f"ability_{j+1}_desc"] = c["abilities"][j]["description"] if j < len(c["abilities"]) else ""
            row.update({"points": med, "source_file": f"synthetic{tag}-{i:03d}.json", "label_spread": spread, "label_samples": "|".join(map(str, pts)), "category": c["category"], "design_note": c["design_note"], "provenance": f"llm_consensus_{MODEL}_k{k}"})
            w.writerow(row)
    print(f"wrote {out}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--generate", action="store_true"); ap.add_argument("--label", action="store_true"); ap.add_argument("--per-category", type=int, default=6); ap.add_argument("-k", type=int, default=3)
    ap.add_argument("--set", default="v1", help="v1 (original 9 categories) or v3 (drawback-focused, larger)")
    a = ap.parse_args(); sys.stdout.reconfigure(line_buffering=True); client = anthropic.Anthropic(max_retries=5)
    cats = {"v3": CATEGORIES_V3, "v4": CATEGORIES_V4}.get(a.set, CATEGORIES); gp = os.path.join(HERE, f"synthetic_generated_{a.set}.json") if a.set != "v1" else GEN_PATH; op = os.path.join(HERE, f"synthetic_cards_{a.set}.csv") if a.set != "v1" else OUT
    if a.generate: generate(client, a.per_category, cats, gp)
    if a.label: label(client, a.k, gp, op)
