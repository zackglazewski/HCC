"""
Build the cleaned, tagged, de-duplicated training/validation dataset from cards.csv.

Outputs dataset.csv with the card fields plus:
  source_group   official | c3v_sov | taf | swc | grishnakh | superhero | other
  group          normalized name (leak-free splitting key)
  flags          semicolon list: alt_form, zero_stat, event, blank_suspect, uncommon
  use_default    1 = in the default train/eval pool (excludes superhero economy, zero-stat/event cards,
                 untrusted labels); 0 = kept for reference/ablation only
  split          train | holdout   (holdout = ~20% of name groups, stratified by source_group)
  fold           0..4 for train rows (GroupKFold by name), -1 for holdout
  figures_in_squad, starts_on_battlefield  (from the Opus re-extraction where available, else blank)

Usage: uv run python build_dataset.py [--holdout 0.2] [--seed 0]
"""
import argparse, csv, json, os, re, random, collections
HERE = os.path.dirname(os.path.abspath(__file__))
FIGURE_TYPES = ["Unique Hero", "Common Hero", "Uncommon Hero", "Unique Squad", "Common Squad"]
SIZES = {"tiny", "small", "medium", "large", "huge"}
NUM = ["height", "life", "move", "range", "attack", "defense"]
SUPERHERO = re.compile(r"marvel|dc-|comic|c3g|superman|batman|spider|x-men|avenger|cavs-dc|justice|villian|villain|hulk|thor|iron-man|wonder-woman|green-lantern", re.I)

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None

def norm_name(s): return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

def source_group(f):
    if not f.startswith("custom-"): return "official"
    if "grishnakh" in f: return "grishnakh"
    if SUPERHERO.search(f): return "superhero"
    if re.search(r"c3v|-sov-|sov-|scapers-of-valhalla", f): return "c3v_sov"
    if "taf-customs" in f: return "taf"
    if re.search(r"-swc\b|-swc\.|swc-", f): return "swc"
    return "other"

def load_extraction_extras():
    """figures_in_squad / starts_on_battlefield / untrusted flags from every Opus re-extraction jsonl."""
    extras, untrusted = {}, set()
    for fn in ["official_reextract.jsonl", "official_reextract_pass2.jsonl"]:
        p = os.path.join(HERE, fn)
        if not os.path.exists(p): continue
        for line in open(p):
            d = json.loads(line)
            if d.get("error"): continue
            f = d["source_file"]
            if not d.get("is_army_card", True) or not d.get("points_box_visible", True): untrusted.add(f)
            e = extras.setdefault(f, {})
            if d.get("figures_in_squad") is not None: e["figures_in_squad"] = d["figures_in_squad"]
            if "starts_on_battlefield" in d: e["starts_on_battlefield"] = d["starts_on_battlefield"]
            if d.get("type_slot_text"): e["type_slot_text"] = d["type_slot_text"]
    return extras, untrusted

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--holdout", type=float, default=0.2); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--csv", default=os.path.join(HERE, "cards.csv")); ap.add_argument("--out", default=os.path.join(HERE, "dataset.csv"))
    ap.add_argument("--comic", choices=["exclude", "keep"], default="exclude", help="comic-superhero content (franchise_tags.json): exclude from default pool or keep with pricing_group=comic")
    a = ap.parse_args()
    ftags = json.load(open(os.path.join(HERE, "franchise_tags.json"))) if os.path.exists(os.path.join(HERE, "franchise_tags.json")) else {}
    rows = list(csv.DictReader(open(a.csv))); extras, untrusted = load_extraction_extras()
    import sys; sys.path.insert(0, HERE); from features import ability_features
    kept, why = [], collections.Counter()
    for r in rows:
        f = r["source_file"]; p = num(r["points"])
        if p is None: why["points blank/non-numeric"] += 1; continue
        if p <= 0 or p > 1000: why["points out of range"] += 1; continue
        ft = r["figure_type"].strip().title()
        if ft not in FIGURE_TYPES: why[f"figure_type {ft or '(blank)'}"] += 1; continue
        if any(num(r[k]) is None for k in NUM): why["missing stat"] += 1; continue
        if r["size"].strip().lower() not in SIZES: why["size unknown"] += 1; continue
        if f in untrusted: why["untrusted label (no points box / not a card)"] += 1; continue
        r = dict(r); r["figure_type"] = ft; r["size"] = r["size"].strip().title()
        e = extras.get(f, {}); r["figures_in_squad"] = e.get("figures_in_squad", ""); r["starts_on_battlefield"] = "" if "starts_on_battlefield" not in e else int(bool(e["starts_on_battlefield"]))
        af = ability_features(r); flags = []
        if af["ab_not_on_battlefield"] or e.get("starts_on_battlefield") is False: flags.append("alt_form")
        if num(r["move"]) == 0 and num(r["attack"]) == 0: flags.append("zero_stat")
        if re.search(r"event|vessel", e.get("type_slot_text", ""), re.I): flags.append("event")
        if p <= 10 and p == num(r["height"]): flags.append("blank_suspect")
        if ft == "Uncommon Hero": flags.append("uncommon")
        r["source_group"] = source_group(f); r["group"] = norm_name(r["name"])
        tag = ftags.get(f, {}); comic = (bool(tag.get("is_comic_superhero")) or r["source_group"] in ("grishnakh", "superhero")) and r["source_group"] != "official"
        if comic: flags.append("comic")
        if "prototype" in f: flags.append("prototype")
        r["franchise"] = tag.get("franchise", ""); r["pricing_group"] = "comic" if comic else ("official" if r["source_group"] == "official" else "classic")
        r["flags"] = ";".join(flags)
        r["use_default"] = int((a.comic == "keep" or not comic) and not ({"zero_stat", "event", "blank_suspect", "prototype"} & set(flags)))
        kept.append(r)
    # de-duplicate exact copies (same name + type + size + stats + points); prefer official, else first
    seen, dedup = {}, []
    for r in sorted(kept, key=lambda r: (r["source_group"] != "official",)):
        key = (r["group"], r["figure_type"], r["size"], *[str(int(num(r[k]))) for k in NUM], str(int(num(r["points"]))))
        if key in seen: why["exact duplicate"] += 1; continue
        seen[key] = 1; dedup.append(r)
    # holdout split by name group, stratified by source_group
    rnd = random.Random(a.seed); groups_by_src = collections.defaultdict(set)
    for r in dedup: groups_by_src[(r["source_group"], r["pricing_group"])].add(r["group"])
    holdout = set()
    for src, gs in groups_by_src.items():
        gs = sorted(gs); rnd.shuffle(gs); holdout |= set(gs[: int(round(a.holdout * len(gs)))])
    # fold assignment for train groups (balanced by count)
    train_groups = collections.Counter(r["group"] for r in dedup if r["group"] not in holdout)
    fold_of, load = {}, [0] * 5
    for g, c in sorted(train_groups.items(), key=lambda kv: (-kv[1], kv[0])):
        i = load.index(min(load)); fold_of[g] = i; load[i] += c
    for r in dedup:
        r["split"] = "holdout" if r["group"] in holdout else "train"; r["fold"] = -1 if r["split"] == "holdout" else fold_of[r["group"]]
    cols = list(rows[0].keys()) + ["figures_in_squad", "starts_on_battlefield", "source_group", "franchise", "pricing_group", "group", "flags", "use_default", "split", "fold"]
    with open(a.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); w.writerows(dedup)
    print(f"input rows {len(rows)} -> kept {len(kept)} -> after dedupe {len(dedup)} -> {a.out}")
    print("dropped:", dict(why))
    c = collections.Counter((r["source_group"], r["use_default"], r["split"]) for r in dedup)
    print(f"{'source_group':12s} {'use':>3s} {'train':>6s} {'holdout':>8s}")
    for src in ["official", "c3v_sov", "taf", "swc", "other", "superhero", "grishnakh"]:
        for use in (1, 0):
            t, h = c.get((src, use, "train"), 0), c.get((src, use, "holdout"), 0)
            if t or h: print(f"{src:12s} {use:>3d} {t:>6d} {h:>8d}")
    fl = collections.Counter(f for r in dedup for f in r["flags"].split(";") if f); print("flags:", dict(fl))
    d = [r for r in dedup if r["use_default"] == "1" or r["use_default"] == 1]
    print(f"default pool: {len(d)} rows ({sum(1 for r in d if r['split']=='train')} train / {sum(1 for r in d if r['split']=='holdout')} holdout); folds:", collections.Counter(r["fold"] for r in d if r["split"] == "train"))

if __name__ == "__main__":
    main()
