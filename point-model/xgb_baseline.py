"""Tree baseline on features.py vectors. Saves output/xgb_baseline.json (full fit on default train rows) and
   OOF / holdout predictions (output/xgb_oof_preds.json, output/xgb_holdout_preds.json). Used for ensembling and
   as the 'Stats-based estimate' prompt line."""
import csv, json, os, sys, numpy as np
import xgboost as xgb
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from features import featurize, FEATURE_NAMES
PARAMS = dict(n_estimators=900, max_depth=4, learning_rate=0.03, subsample=0.8, colsample_bytree=0.6, min_child_weight=3, n_jobs=8)
MODEL_PATH = os.path.join(HERE, "output", "xgb_baseline.json")
def paths(suffix): return (os.path.join(HERE, "output", f"xgb_baseline{suffix}.json"), os.path.join(HERE, "output", f"xgb_oof_preds{suffix}.json"), os.path.join(HERE, "output", f"xgb_holdout_preds{suffix}.json"))
def suffix_for(data_path):
    b = os.path.basename(data_path); return "" if b == "dataset.csv" else "_" + b[len("dataset_"):-4] if b.startswith("dataset_") else "_" + b[:-4]

def vec(rows): return np.array([[featurize(r)[k] for k in FEATURE_NAMES] for r in rows], dtype=np.float32)

class XGBBaseline:
    def __init__(self, path=MODEL_PATH):
        self.m = xgb.XGBRegressor(); self.m.load_model(path)
    def predict_rows(self, rows): return np.exp(self.m.predict(vec(rows))).tolist()

def main():
    import argparse; ap = argparse.ArgumentParser(); ap.add_argument("--data", default=os.path.join(HERE, "dataset.csv")); a = ap.parse_args()
    model_path, oof_path, ho_path = paths(suffix_for(a.data))
    rows = [r for r in csv.DictReader(open(a.data)) if str(r["use_default"]) == "1"]
    tr = [r for r in rows if r["split"] == "train"]; ho = [r for r in rows if r["split"] == "holdout"]
    Xtr, ytr = vec(tr), np.array([float(r["points"]) for r in tr]); folds = np.array([int(r["fold"]) for r in tr]); oof = np.zeros(len(tr))
    for f in sorted(set(folds)):
        m = xgb.XGBRegressor(**PARAMS).fit(Xtr[folds != f], np.log(ytr[folds != f])); oof[folds == f] = np.exp(m.predict(Xtr[folds == f]))
    m = xgb.XGBRegressor(**PARAMS).fit(Xtr, np.log(ytr)); os.makedirs(os.path.dirname(model_path), exist_ok=True); m.save_model(model_path)
    ph = np.exp(m.predict(vec(ho))); yho = np.array([float(r["points"]) for r in ho])
    json.dump({r["source_file"]: {"y": float(y), "pred": float(p)} for r, y, p in zip(tr, ytr, oof)}, open(oof_path, "w"))
    json.dump({r["source_file"]: {"y": float(y), "pred": float(p)} for r, y, p in zip(ho, yho, ph)}, open(ho_path, "w"))
    print(f"XGB OOF MAE={np.abs(oof-ytr).mean():.1f}  holdout MAE={np.abs(ph-yho).mean():.1f}  saved {model_path}")

if __name__ == "__main__": main()
