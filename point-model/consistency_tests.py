"""
Rule-based consistency ("vibes") tests for a point estimator. No labels needed.

For each base card (official hold-out cards by default) we build perturbed variants and
check directional and magnitude sanity:
  +1 attack / +1 defense / +1 life  -> estimate must not decrease, and should rise by a plausible amount
  range 1 -> 6 on a hero            -> must not decrease
  -1 attack ...                     -> must not increase
  strip all powers                  -> must not increase (powers on official cards are net positive)
  add a crippling drawback power    -> must not increase
  add a strong aura power           -> must not decrease
  Unique Hero -> Common Squad w/ life 1 (same stats): no sign constraint, reported only
Reports pass rates + median deltas per perturbation, plus the worst violations.

Usage: uv run python consistency_tests.py output/llm/<tag>/model [--n 60] [--split holdout]
"""
import argparse, copy, csv, json, os, random, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)

DRAWBACK = ("Eternal Hatred", "After revealing an Order Marker on this card, you must roll the 20-sided die. If you roll a 17 or higher, choose an opponent. That opponent will now control this figure for the remainder of your turn.")
AURA = ("Shield of Valor Aura", "All friendly figures within 4 clear sight spaces of this figure add 1 to their defense dice when rolling defense.")

def variants(r):
    def with_stat(k, d):
        c = dict(r); c[k] = str(int(float(r[k])) + d); return c
    out = {"+1 attack": (with_stat("attack", 1), "nondecrease"), "+1 defense": (with_stat("defense", 1), "nondecrease"), "+1 life": (with_stat("life", 1), "nondecrease"),
           "-1 attack": (with_stat("attack", -1), "nonincrease") if float(r["attack"]) > 1 else None, "-1 defense": (with_stat("defense", -1), "nonincrease") if float(r["defense"]) > 1 else None,
           "+2 move": (with_stat("move", 2), "nondecrease")}
    if "Hero" in r["figure_type"] and float(r["range"]) == 1:
        c = dict(r); c["range"] = "6"; out["range 1->6"] = (c, "nondecrease")
    c = dict(r)
    for i in range(1, 5): c[f"ability_{i}_title"] = ""; c[f"ability_{i}_desc"] = ""
    out["strip powers"] = (c, "nonincrease")
    def add_power(base, title, desc):
        c = dict(base)
        for i in range(1, 5):
            if not c[f"ability_{i}_title"].strip(): c[f"ability_{i}_title"] = title; c[f"ability_{i}_desc"] = desc; return c
        c["ability_4_title"], c["ability_4_desc"] = title, desc; return c
    out["add drawback"] = (add_power(r, *DRAWBACK), "nonincrease"); out["add aura"] = (add_power(r, *AURA), "nondecrease")
    return {k: v for k, v in out.items() if v}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("model_dir"); ap.add_argument("--n", type=int, default=60); ap.add_argument("--split", default="holdout"); ap.add_argument("--groups", default="official,c3v_sov"); ap.add_argument("--seed", type=int, default=0); ap.add_argument("--device", default=None); ap.add_argument("--llm-only", action="store_true")
    a = ap.parse_args()
    from estimator import PointEstimator
    est = PointEstimator(a.model_dir, device=a.device or ("mps" if __import__("torch").backends.mps.is_available() else "cpu"))
    if a.llm_only: est.w = 0.0
    rows = [r for r in csv.DictReader(open(os.path.join(HERE, "dataset.csv"))) if r["split"] == a.split and r["source_group"] in a.groups.split(",") and str(r["use_default"]) == "1"]
    random.Random(a.seed).shuffle(rows); rows = rows[:a.n]
    base_pred = np.array(est.predict_rows(rows)); results = {}; worst = []
    for name in variants(rows[0]).keys():
        vs = [(i, variants(r).get(name)) for i, r in enumerate(rows)]; vs = [(i, v) for i, v in vs if v]
        preds = np.array(est.predict_rows([v[0] for _, v in vs])); deltas = preds - base_pred[[i for i, _ in vs]]; rule = vs[0][1][1]
        ok = deltas >= -2.5 if rule == "nondecrease" else deltas <= 2.5   # 2.5 pt tolerance (< half a rounding step)
        results[name] = {"n": len(vs), "pass_rate": float(ok.mean()), "median_delta": float(np.median(deltas)), "p10_delta": float(np.percentile(deltas, 10)), "p90_delta": float(np.percentile(deltas, 90)), "rule": rule}
        for (i, _), d, k in zip(vs, deltas, ok):
            if not k: worst.append((abs(d), name, rows[i]["name"], float(base_pred[i]), float(d)))
    print(f"model={a.model_dir}  base cards={len(rows)} ({a.split}: {a.groups})")
    print(f"{'perturbation':16s} {'rule':12s} {'pass':>6s} {'median d':>9s} {'p10':>7s} {'p90':>7s}")
    for k, v in results.items(): print(f"{k:16s} {v['rule']:12s} {v['pass_rate']:6.1%} {v['median_delta']:9.1f} {v['p10_delta']:7.1f} {v['p90_delta']:7.1f}")
    overall = float(np.mean([v["pass_rate"] for v in results.values()])); print(f"overall pass rate: {overall:.1%}")
    worst.sort(reverse=True); print("worst violations:"); [print(f"  {n:16s} {c[:28]:28s} base={b:6.1f} delta={d:+6.1f}") for _, n, c, b, d in worst[:10]]
    json.dump({"results": results, "overall_pass_rate": overall}, open(os.path.join(a.model_dir, "consistency.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
