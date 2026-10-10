"""
One scorecard for a trained tag: CV (OOF) + holdout metrics, breakdowns, calibration, ensemble with XGB,
synthetic tricky set, consistency tests (if consistency.json exists).

Usage: uv run python report.py q05_v1 [--synthetic] [--consistency]
"""
import argparse, csv, json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)

def m(p, y):
    e = np.abs(p - y); return f"MAE={e.mean():5.1f} medAE={np.median(e):5.1f} w10={np.mean(e<=10):5.1%} w20={np.mean(e<=20):5.1%} ratio={np.median(p/np.maximum(y,1)):.2f}"

def breakdown(title, p, y, keys, order=None):
    print(f"  {title}")
    ks = order or sorted(set(keys))
    for k in ks:
        mk = np.array([x == k for x in keys])
        if mk.sum(): print(f"    {str(k):22s} n={mk.sum():4d}  {m(p[mk], y[mk])}")

def bucket(y): return ["<50" if v < 50 else "50-99" if v < 100 else "100-149" if v < 150 else "150-249" if v < 250 else "250+" for v in y]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("tag"); ap.add_argument("--synthetic", action="store_true"); ap.add_argument("--consistency", action="store_true"); a = ap.parse_args()
    out = os.path.join(HERE, "output", "llm", a.tag)
    cfgp = os.path.join(out, "model", "estimator_config.json"); data = json.load(open(cfgp)).get("data", "dataset.csv") if os.path.exists(cfgp) else "dataset.csv"
    rows = {r["source_file"]: r for r in csv.DictReader(open(os.path.join(HERE, data)))}
    print(f"dataset: {data}")
    from xgb_baseline import paths as xgb_paths, suffix_for
    _, oofp, hop = xgb_paths(suffix_for(data))
    xgb_oof = json.load(open(oofp)) if os.path.exists(oofp) else {}; xgb_ho = json.load(open(hop)) if os.path.exists(hop) else {}
    for split, fn, key, xp in [("CV out-of-fold", "oof_preds.json", "pred_last", xgb_oof), ("HOLDOUT", "holdout_preds.json", "pred", xgb_ho)]:
        p_ = os.path.join(out, fn)
        if not os.path.exists(p_): print(f"[{split}] no {fn} yet"); continue
        d = json.load(open(p_)); files = list(d.keys()); y = np.array([d[f]["y"] for f in files]); p = np.array([d[f][key] for f in files])
        print(f"\n=== {a.tag} {split} n={len(y)} ===\n  LLM              {m(p, y)}\n  LLM rounded to 5 {m(np.round(p/5)*5, y)}")
        if xp and all(f in xp for f in files):
            px = np.array([xp[f]["pred"] for f in files]); print(f"  XGB              {m(px, y)}")
            for w in (0.5, 0.6, 0.7, 0.8): pe = np.exp(w*np.log(p) + (1-w)*np.log(px)); print(f"  ensemble w_llm={w:.1f} {m(pe, y)}")
        breakdown("by source group", p, y, [rows[f]["source_group"] for f in files], ["official", "c3v_sov", "taf", "swc", "other"])
        breakdown("by figure type", p, y, [rows[f]["figure_type"] for f in files], ["Unique Hero", "Uncommon Hero", "Common Hero", "Unique Squad", "Common Squad"])
        breakdown("by true points (calibration: ratio should be ~1.00 everywhere)", p, y, bucket(y), ["<50", "50-99", "100-149", "150-249", "250+"])
        fl = ["alt_form" if "alt_form" in rows[f]["flags"] else "normal" for f in files]; breakdown("alt-form cards", p, y, fl, ["normal", "alt_form"])
        ftags = os.path.join(HERE, "franchise_tags.json")
        if os.path.exists(ftags):
            ft = json.load(open(ftags)); ck = ["comic_superhero" if ft.get(f, {}).get("is_comic_superhero") else ("other_IP" if ft.get(f, {}).get("franchise", "original") != "original" else "original") for f in files]
            breakdown("by content (Opus franchise tags)", p, y, ck, ["original", "other_IP", "comic_superhero"])
        e = np.abs(p - y); idx = np.argsort(-e)[:12]; print("  worst:")
        for i in idx: print(f"    {rows[files[i]]['name'][:26]:26s} {rows[files[i]]['source_group']:8s} true={y[i]:4.0f} pred={p[i]:6.1f}  L{rows[files[i]]['life']} A{rows[files[i]]['attack']} D{rows[files[i]]['defense']} R{rows[files[i]]['range']}")
    if a.synthetic:
        from estimator import PointEstimator; import torch
        est = PointEstimator(os.path.join(out, "model"), device="mps" if torch.backends.mps.is_available() else "cpu")
        for synfile in ["synthetic_cards.csv", "synthetic_val.csv"]:
            if not os.path.exists(os.path.join(HERE, synfile)): continue
            syn = list(csv.DictReader(open(os.path.join(HERE, synfile)))); y = np.array([float(r["points"]) for r in syn]); p = np.array(est.predict_rows(syn))
            print(f"\n=== SYNTHETIC {synfile} (LLM-consensus labels, n={len(syn)}; never trained on) ===\n  {m(p, y)}"); breakdown("by category", p, y, [r["category"] for r in syn])
            spread = np.array([float(r["label_spread"]) for r in syn]); print(f"  label spread (max-min of judges): median {np.median(spread):.0f}, mean {spread.mean():.1f}  -> judge disagreement floor")
            # matched pairs: does the model move the right way?
            byname = {r["name"]: (r, pp) for r, pp in zip(syn, p)}; ok = tot = 0
            for r, pp in zip(syn, p):
                if r["name"].endswith("(variant)") and r["name"][:-10].strip() in byname:
                    base_r, base_p = byname[r["name"][:-10].strip()]; want = np.sign(float(r["points"]) - float(base_r["points"])); got = np.sign(pp - base_p)
                    tot += 1; ok += int(want == got or want == 0)
            if tot: print(f"  matched pairs: model orders {ok}/{tot} pairs the same way as the judges")
            json.dump({"mae": float(np.abs(p-y).mean()), "preds": {r["source_file"]: [float(pp), float(yy)] for r, pp, yy in zip(syn, p, y)}}, open(os.path.join(out, f"synthetic_metrics_{synfile[:-4]}.json"), "w"), indent=1)
    if a.consistency and os.path.exists(os.path.join(out, "model", "consistency.json")):
        c = json.load(open(os.path.join(out, "model", "consistency.json"))); print(f"\n=== CONSISTENCY tests: overall pass {c['overall_pass_rate']:.1%} ===")
        for k, v in c["results"].items(): print(f"    {k:16s} pass={v['pass_rate']:6.1%} median_delta={v['median_delta']:+6.1f}")

if __name__ == "__main__":
    main()
