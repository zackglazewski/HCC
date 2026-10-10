"""
Reconcile two independent Opus reads of every official card (pass 1 = original
resolution, pass 2 = upscaled) against cards.csv.

  agree(p1, p2)            -> accept
  disagree, numeric/points -> official_gold_review.csv for manual (image) adjudication
  text/abilities           -> prefer pass 2 (upscaled) when the image was small, else pass 1;
                              if ability counts differ, take the read with more abilities

Usage:
  uv run python reconcile_official.py            # writes official_gold_review.csv + official_gold_apply.json
  uv run python reconcile_official.py --apply    # applies accepted values (+ any decisions in official_gold_decisions.csv) to cards.csv
"""
import csv, json, os, sys, time
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reextract_official import CSV_PATH, IMG_DIR, CSV_COLUMNS, to_row_fields, norm

HERE = os.path.dirname(os.path.abspath(__file__))
P1 = os.path.join(HERE, "official_reextract.jsonl"); P2 = os.path.join(HERE, "official_reextract_pass2.jsonl")
REVIEW = os.path.join(HERE, "official_gold_review.csv"); DECISIONS = os.path.join(HERE, "official_gold_decisions.csv")
APPLY = os.path.join(HERE, "official_gold_apply.json")
NUMERIC = {"height", "life", "move", "range", "attack", "defense", "points"}

def load(p):
    d = {}
    for line in open(p):
        j = json.loads(line)
        if not j.get("error"): d[j["source_file"]] = j
    return d

def width(f):
    try:
        with Image.open(os.path.join(IMG_DIR, f)) as im: return im.size[0]
    except Exception: return 0

def main():
    apply = "--apply" in sys.argv
    rows = list(csv.DictReader(open(CSV_PATH)))
    p1, p2 = load(P1), load(P2)
    review, accepted, drop = [], {}, []
    for r in rows:
        f = r["source_file"]
        if f.startswith("custom-") or f not in p1 or f not in p2: continue
        a, b = p1[f], p2[f]
        if not a.get("is_army_card", True) and not b.get("is_army_card", True):
            drop.append(f); continue
        small = width(f) < 1000
        fa, fb = to_row_fields(a), to_row_fields(b)
        acc = {}
        # numeric + figure_type: need agreement
        for k in sorted(NUMERIC | {"figure_type"}):
            va, vb = fa.get(k), fb.get(k)
            if va is None and vb is None:
                if k == "points" and r.get("points"):
                    review.append({"source_file": f, "field": k, "old": r.get(k, ""), "pass1": "", "pass2": "", "width": width(f), "why": "both reads found no legible value"})
                continue
            if va is not None and vb is not None and norm(va) == norm(vb):
                acc[k] = va
            else:
                review.append({"source_file": f, "field": k, "old": r.get(k, ""), "pass1": va or "", "pass2": vb or "", "width": width(f), "why": "reads disagree" if (va and vb) else "only one read found a value"})
        # text fields
        pref, alt = (fb, fa) if small else (fa, fb)
        for k in ["name", "general", "entity_type", "occupation", "personality", "size"]:
            v = pref.get(k) or alt.get(k)
            if v: acc[k] = v
        na = sum(1 for i in range(1, 5) if fa.get(f"ability_{i}_title")); nb = sum(1 for i in range(1, 5) if fb.get(f"ability_{i}_title"))
        src = fb if (nb > na or (nb == na and small)) else fa
        for i in range(1, 5):
            acc[f"ability_{i}_title"] = src.get(f"ability_{i}_title", ""); acc[f"ability_{i}_desc"] = src.get(f"ability_{i}_desc", "")
        accepted[f] = acc
    # apply manual decisions if present (columns: source_file, field, value)
    decided = 0
    if os.path.exists(DECISIONS):
        for d in csv.DictReader(open(DECISIONS)):
            accepted.setdefault(d["source_file"], {})[d["field"]] = d["value"]; decided += 1
    with open(REVIEW, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["source_file", "field", "old", "pass1", "pass2", "width", "why"]); w.writeheader(); w.writerows(review)
    json.dump({"accepted": accepted, "drop": drop}, open(APPLY, "w"), indent=1)
    by_file = {r["source_file"]: r for r in rows}
    accepted = {f: acc for f, acc in accepted.items() if f in by_file}
    n_changes = sum(1 for f, acc in accepted.items() for k, v in acc.items() if norm(v) != norm(by_file[f].get(k, "")))
    print(f"official rows reconciled: {len(accepted)}  non-army-card rows to drop: {drop}")
    print(f"accepted field values differing from cards.csv: {n_changes}   manual decisions loaded: {decided}")
    print(f"needs manual review: {len(review)} fields on {len({x['source_file'] for x in review})} rows -> {REVIEW}")
    byf = {}
    for x in review: byf[x["field"]] = byf.get(x["field"], 0) + 1
    print("  by field:", byf)
    if apply:
        bak = CSV_PATH + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
        with open(bak, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS); w.writeheader(); w.writerows(rows)
        n = 0; out = []
        pending = {(x["source_file"], x["field"]) for x in review} - {(d["source_file"], d["field"]) for d in (csv.DictReader(open(DECISIONS)) if os.path.exists(DECISIONS) else [])}
        for r in rows:
            f = r["source_file"]
            if f in drop: continue
            for k, v in accepted.get(f, {}).items():
                if (f, k) in pending: continue
                if norm(r.get(k, "")) != norm(v): r[k] = v; n += 1
            # a pending POINTS disagreement means the label is untrusted -> blank it so training skips the row
            if (f, "points") in pending: r["points"] = ""; n += 1
            out.append(r)
        with open(CSV_PATH, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS); w.writeheader(); w.writerows(out)
        print(f"applied {n} field updates, dropped {len(drop)} rows; backup at {bak}")

if __name__ == "__main__":
    main()
