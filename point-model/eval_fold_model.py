"""Evaluate an exported (fold or final) model on the held-out synthetic sets, LLM-only, on CPU. Usage: eval_fold_model.py <model_dir>"""
import csv, sys, re, numpy as np, torch
torch.set_num_threads(6)
from estimator import PointEstimator
est = PointEstimator(sys.argv[1], device="cpu"); est.w = 0.0
for fn in ["synthetic_val.csv", "synthetic_cards.csv"]:
    syn = list(csv.DictReader(open(fn))); y = np.array([float(r["points"]) for r in syn]); p = np.array(est.predict_rows(syn)); e = np.abs(p - y)
    print(f"{fn} n={len(syn)}  LLM MAE={e.mean():5.1f} medAE={np.median(e):5.1f} ratio={np.median(p/y):.2f}")
    cats = [r["category"] for r in syn]
    for c in dict.fromkeys(cats):
        mk = np.array([x == c for x in cats]); print(f"   {c:28s} n={mk.sum():2d} MAE={e[mk].mean():5.1f} ratio={np.median(p[mk]/y[mk]):.2f}")
    byname = {r["name"].strip(): (r, pp) for r, pp in zip(syn, p)}; stats = {}
    for r, pp in zip(syn, p):
        n = r["name"].strip()
        if n.endswith("(variant)") and n[:-9].strip() in byname:
            b, bp = byname[n[:-9].strip()]; dj = float(r["points"]) - float(b["points"]); dm = pp - bp
            ok = (np.sign(dj) == np.sign(dm)) or abs(dj) < 10; s = stats.setdefault(r["category"], [0, 0, []]); s[0] += int(ok); s[1] += 1; s[2].append((dj, dm))
    for c, (ok, tot, ds) in stats.items():
        print(f"   pairs {c:26s} ordered {ok}/{tot}   judge median {np.median([d for d,_ in ds]):+5.0f}  model median {np.median([m for _,m in ds]):+6.1f}")
