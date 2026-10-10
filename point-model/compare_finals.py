"""Compare two final tags on the shared hold-out (LLM-only and 0.5 ensemble with the v2 tree). Usage: compare_finals.py v2_final v3_final"""
import csv, json, os, sys, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); tags = sys.argv[1:3]
rows = {r["source_file"]: r for r in csv.DictReader(open(os.path.join(HERE, "dataset_v2.csv")))}
xgb = json.load(open(os.path.join(HERE, "output", "xgb_holdout_preds_v2.json")))
ft = json.load(open(os.path.join(HERE, "franchise_tags.json")))
preds = {t: json.load(open(os.path.join(HERE, "output", "llm", t, "holdout_preds.json"))) for t in tags}
files = [f for f in preds[tags[0]] if all(f in preds[t] for t in tags) and f in xgb]
y = np.array([preds[tags[0]][f]["y"] for f in files]); px = np.array([xgb[f]["pred"] for f in files])
g = np.array([rows[f]["source_group"] for f in files]); orig = np.array([ft.get(f, {}).get("franchise", "original") == "original" for f in files])
def m(p): e = np.abs(p - y); return f"MAE={e.mean():5.1f} medAE={np.median(e):5.1f} w10={np.mean(e<=10):5.1%} w20={np.mean(e<=20):5.1%}"
print(f"hold-out n={len(files)}"); print(f"  {'XGB v2':22s} {m(px)}")
for t in tags:
    p = np.array([preds[t][f]["pred"] for f in files]); pe = np.exp(0.5*np.log(p) + 0.5*np.log(px)); e = np.abs(pe - y)
    print(f"  {t+' LLM':22s} {m(p)}"); print(f"  {t+' ensemble':22s} {m(pe)}   rounded5 {m(np.round(pe/5)*5)}")
    print(f"     ensemble by group: " + ", ".join(f"{k}={e[g==k].mean():.1f}" for k in ["official","c3v_sov","taf","swc","other"]) + f"; original designs={e[orig].mean():.1f}")
