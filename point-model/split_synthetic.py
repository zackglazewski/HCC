"""Split synthetic_cards_v3.csv into synthetic_train.csv (augmentation) and synthetic_val.csv (validation),
   keeping twin pairs ('X' / 'X (variant)') together and stratifying by category. 25% -> val."""
import csv, os, random, re, collections, sys
HERE = os.path.dirname(os.path.abspath(__file__))
srcs = sys.argv[1:] or [os.path.join(HERE, "synthetic_cards_v3.csv")]
rows = [r for src in srcs for r in csv.DictReader(open(src))]; base = lambda n: re.sub(r"\s*\(variant\)\s*$", "", n).strip().lower()
by = collections.defaultdict(list)
for r in rows: by[(r["category"], base(r["name"]))].append(r)
val_keys = set()
src_of = {}
for src in srcs:
    for r in csv.DictReader(open(src)): src_of[(r["category"], base(r["name"]))] = os.path.basename(src)
for src in srcs:
    tag = os.path.basename(src); rnd = random.Random(0 if tag.endswith("_v3.csv") else hash(tag) % 10000)
    for cat in sorted({k[0] for k in by if src_of.get(k) == tag}):
        ks = sorted(k for k in by if k[0] == cat and src_of.get(k) == tag); rnd.shuffle(ks); val_keys |= set(ks[: max(1, round(0.25 * len(ks)))])
tr = [r for k, rs in by.items() if k not in val_keys for r in rs]; va = [r for k, rs in by.items() if k in val_keys for r in rs]
for name, rs in [("synthetic_train.csv", tr), ("synthetic_val.csv", va)]:
    with open(os.path.join(HERE, name), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rs)
print(f"{len(rows)} synthetic rows from {len(srcs)} file(s) -> train {len(tr)} / val {len(va)}; val categories:", dict(collections.Counter(r["category"] for r in va)))
