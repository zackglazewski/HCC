"""
Heroscape point estimator: small causal LM + LoRA + regression head on log(points).

  uv run python train_llm.py --cv                       # 5-fold grouped CV on dataset.csv (default pool, split=train)
  uv run python train_llm.py --fold 0                   # one fold (fast iteration)
  uv run python train_llm.py --final --epochs 4         # train on all default train rows, eval holdout, export to output/llm/<tag>
  uv run python train_llm.py --eval output/llm/<tag>    # re-evaluate an exported model on the holdout

Design:
  * input = structured card text (no card name by default; names of new custom cards carry no signal)
            + optional deterministic "Mechanics:" line (features.py)
            + "Pricing standard: <source_group>" token at train time; "official" at inference
  * target = standardized log(points); Huber loss; prediction = exp(...) rounded to 5
  * LoRA (r=16) on all linear layers, hand-rolled (no peft), merged into the base weights on export
  * leak-free: dataset.csv folds are GroupKFold by normalized name
"""
import argparse, csv, json, math, os, sys, time
import numpy as np, torch, torch.nn as nn
from transformers import AutoTokenizer, AutoModel

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from features import feature_line

# ------------------------------------------------------------------ text
def card_text(r, with_name=False, features=True, pricing=None, baseline=None):
    lines = []
    if with_name and r.get("name"): lines.append(f"Name: {r['name']}")
    lines += [
        f"Type: {r['figure_type']}",
        f"General: {r.get('general') or 'None'} | Species: {r.get('entity_type','')} | Class: {r.get('occupation','')} | Personality: {r.get('personality','')}",
        f"Size: {r['size']} {r['height']}",
        f"Life {r['life']}, Move {r['move']}, Range {r['range']}, Attack {r['attack']}, Defense {r['defense']}",
    ]
    for i in range(1, 5):
        t, d = (r.get(f"ability_{i}_title") or "").strip(), (r.get(f"ability_{i}_desc") or "").strip()
        if t or d: lines.append(f"{t.upper()}: {d}")
    if features: lines.append(feature_line(r))
    if pricing: lines.append(f"Pricing standard: {pricing}")
    if baseline is not None: lines.append(f"Stats-based estimate: {int(round(baseline / 5) * 5)}")
    return "Heroscape army card.\n" + "\n".join(lines) + "\nPoint value:"

# ------------------------------------------------------------------ model
class LoRALinear(nn.Module):
    def __init__(self, base, r, alpha, dropout):
        super().__init__(); self.base = base
        self.A = nn.Parameter(torch.empty(r, base.in_features)); nn.init.kaiming_uniform_(self.A, a=math.sqrt(5))
        self.B = nn.Parameter(torch.zeros(base.out_features, r)); self.scale = alpha / r; self.drop = nn.Dropout(dropout)
    def forward(self, x):
        y = self.base(x); xd = self.drop(x)
        return y + ((xd @ self.A.t().to(xd.dtype)) @ self.B.t().to(xd.dtype)) * self.scale
    def merge_(self):
        with torch.no_grad(): self.base.weight += ((self.B @ self.A) * self.scale).to(self.base.weight.dtype)
        return self.base

TARGETS = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")
def apply_lora(model, r, alpha, dropout):
    n = 0
    for mod in list(model.modules()):
        for cn, ch in list(mod.named_children()):
            if isinstance(ch, nn.Linear) and cn in TARGETS: setattr(mod, cn, LoRALinear(ch, r, alpha, dropout)); n += 1
    return n
def merge_lora(model):
    for mod in list(model.modules()):
        for cn, ch in list(mod.named_children()):
            if isinstance(ch, LoRALinear): setattr(mod, cn, ch.merge_())

class Head(nn.Module):
    def __init__(self, h, hidden=256, dropout=0.1):
        super().__init__(); self.norm = nn.LayerNorm(h); self.mlp = nn.Sequential(nn.Linear(h, hidden), nn.GELU(), nn.Dropout(dropout), nn.Linear(hidden, 1))
    def forward(self, x): return self.mlp(self.norm(x)).squeeze(-1)

class Estimator(nn.Module):
    def __init__(self, backbone, head): super().__init__(); self.backbone = backbone; self.head = head
    def forward(self, input_ids, attention_mask):
        hs = self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        last = hs[torch.arange(hs.size(0), device=hs.device), attention_mask.sum(1) - 1].float()
        return self.head(last)

# ------------------------------------------------------------------ data
def load_dataset(path, use_default_only=True):
    rows = list(csv.DictReader(open(path)))
    if use_default_only: rows = [r for r in rows if str(r["use_default"]) == "1"]
    return rows

def metrics(pred, y, tags=None):
    e = np.abs(pred - y); out = {"n": int(len(y)), "mae": float(e.mean()), "medae": float(np.median(e)), "within10": float(np.mean(e <= 10)), "within20": float(np.mean(e <= 20)),
                                 "mape": float(np.mean(e / np.maximum(y, 1))), "median_ratio": float(np.median(pred / np.maximum(y, 1)))}
    if tags is not None:
        by = {}
        for t in sorted(set(tags)):
            m = np.array([x == t for x in tags]); by[t] = {"n": int(m.sum()), "mae": float(e[m].mean()), "median_ratio": float(np.median(pred[m] / np.maximum(y[m], 1)))}
        out["by_group"] = by
    return out

# ------------------------------------------------------------------ train
def run(args, train_rows, val_rows, device, tag, export_dir=None):
    torch.manual_seed(args.seed); np.random.seed(args.seed)
    tok = AutoTokenizer.from_pretrained(args.model); tok.padding_side = "right"
    if tok.pad_token is None: tok.pad_token = tok.eos_token
    backbone = AutoModel.from_pretrained(args.model, dtype=torch.bfloat16); backbone.config.use_cache = False
    for p in backbone.parameters(): p.requires_grad = False
    n_lora = apply_lora(backbone, args.r, args.alpha, args.lora_dropout)
    model = Estimator(backbone, Head(backbone.config.hidden_size, dropout=args.head_dropout)).to(device)
    lora_p = [p for n, p in model.named_parameters() if p.requires_grad and n.startswith("backbone.")]
    head_p = [p for n, p in model.named_parameters() if p.requires_grad and not n.startswith("backbone.")]
    y_tr = np.array([float(r["points"]) for r in train_rows]); mu, sd = float(np.log(y_tr).mean()), float(np.log(y_tr).std())
    base_lookup = {}
    from xgb_baseline import paths as xgb_paths, suffix_for
    xgb_model_path, xgb_oof_path, xgb_ho_path = xgb_paths(suffix_for(args.data))
    if args.baseline:
        for pth in [xgb_oof_path, xgb_ho_path]:
            if os.path.exists(pth): base_lookup.update({k: v["pred"] for k, v in json.load(open(pth)).items()})
        assert base_lookup, f"--baseline needs {xgb_oof_path}; run xgb_baseline.py --data {args.data}"
    def augment(r):
        c = dict(r); ab = [(c[f"ability_{i}_title"], c[f"ability_{i}_desc"]) for i in range(1, 5) if (c[f"ability_{i}_title"] or "").strip()]
        np.random.shuffle(ab)
        for i in range(4): c[f"ability_{i+1}_title"], c[f"ability_{i+1}_desc"] = ab[i] if i < len(ab) else ("", "")
        for k in ("general", "personality", "occupation", "entity_type"):
            if np.random.rand() < 0.15: c[k] = ""
        return c
    def texts_for(rows, train):
        out = []
        for r in rows:
            if train and args.augment: r = augment(r)
            wn = args.with_name and (not train or np.random.rand() >= args.name_dropout)
            pricing = (r.get(args.pricing_col) if train or args.pricing_eval == "own" else args.pricing_eval) if args.pricing else None
            b = base_lookup.get(r["source_file"]) if args.baseline else None
            out.append(card_text(r, with_name=wn, features=args.features, pricing=pricing, baseline=b))
        return out
    enc_val = tok(texts_for(val_rows, False), truncation=True, max_length=args.max_len)["input_ids"] if val_rows else []
    def batchify(ids):
        L = max(len(x) for x in ids); ii = torch.full((len(ids), L), tok.pad_token_id); am = torch.zeros((len(ids), L), dtype=torch.long)
        for k, x in enumerate(ids): ii[k, :len(x)] = torch.tensor(x); am[k, :len(x)] = 1
        return ii.to(device), am.to(device)
    @torch.no_grad()
    def predict_ids(ids, bs=32):
        model.eval(); order = sorted(range(len(ids)), key=lambda i: len(ids[i])); out = np.empty(len(ids))
        for s in range(0, len(order), bs):
            chunk = order[s:s+bs]; ii, am = batchify([ids[i] for i in chunk]); p = model(ii, am).float().cpu().numpy()
            for k, i in enumerate(chunk): out[i] = p[k]
        return np.exp(np.clip(out * sd + mu, math.log(5), math.log(1000)))
    steps_per_epoch = math.ceil(len(train_rows) / (args.bs * args.accum)); total = steps_per_epoch * args.epochs
    opt = torch.optim.AdamW([{"params": lora_p, "lr": args.lr, "weight_decay": 0.0}, {"params": head_p, "lr": args.lr * 5, "weight_decay": 0.01}])
    warm = max(1, int(0.05 * total)); sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / total))))
    loss_fn = nn.HuberLoss(delta=args.huber_delta, reduction="none"); yt_all = (np.log(y_tr) - mu) / sd
    gw = {kv.split("=")[0]: float(kv.split("=")[1]) for kv in args.group_weight.split(",") if "=" in kv}
    w_all = np.array([gw.get(r.get("source_group", ""), 1.0) * (args.extra_weight if r.get("fold") == "-2" else 1.0) for r in train_rows], dtype=np.float32)
    # twin pairs among training rows: (base_idx, variant_idx, sign of judge delta)
    import re as _re
    name_idx = {}
    for i, r in enumerate(train_rows):
        if r.get("fold") == "-2": name_idx[r["name"].strip()] = i
    pairs = []
    for nm, vi in name_idx.items():
        if nm.endswith("(variant)"):
            b = nm[:-9].strip()
            if b in name_idx:
                dj = np.log(float(train_rows[vi]["points"])) - np.log(float(train_rows[name_idx[b]]["points"]))
                pairs.append((name_idx[b], vi, float(np.sign(dj)) if abs(dj) >= np.log(1.1) else 0.0))
    if args.pair_loss: print(f"    twin pairs for ranking loss: {len(pairs)}", flush=True)
    print(f"[{tag}] model={args.model} train={len(train_rows)} val={len(val_rows)} lora_modules={n_lora} trainable={sum(p.numel() for p in lora_p)+sum(p.numel() for p in head_p):,} steps={total}", flush=True)
    best = {"mae": 1e9, "epoch": 0, "pred": None}; t0 = time.time(); step = 0; hist = []
    for ep in range(args.epochs):
        model.train(); enc_tr = tok(texts_for(train_rows, True), truncation=True, max_length=args.max_len)["input_ids"]  # re-tokenize: name dropout is stochastic
        # length-bucketed shuffle: shuffle, then sort within chunks of 50 batches to cut padding
        perm = np.random.permutation(len(train_rows)); chunk = args.bs * 50
        perm = np.concatenate([sorted(perm[i:i+chunk], key=lambda j: len(enc_tr[j])) for i in range(0, len(perm), chunk)])
        batches = [perm[i:i+args.bs] for i in range(0, len(perm), args.bs)]
        if args.pair_loss and pairs:
            half = max(1, args.bs // 2)
            for _rep in range(args.pair_repeat):
                pp = list(pairs); np.random.shuffle(pp)
                batches += [np.array([j for b, v, _ in pp[i:i+half] for j in (b, v)]) for i in range(0, len(pp), half)]
        np.random.shuffle(batches)
        run_loss = 0.0; nb = 0
        for bi, idx in enumerate(batches):
            ii, am = batchify([enc_tr[j] for j in idx]); yt = torch.tensor(yt_all[idx], dtype=torch.float32, device=device)
            wt = torch.tensor(w_all[idx], device=device); out = model(ii, am)
            loss = (loss_fn(out, yt) * wt).sum() / wt.sum()
            if args.pair_loss and pairs:
                pos = {int(j): k for k, j in enumerate(idx)}; terms = []
                for b, v, sg in pairs:
                    if b in pos and v in pos:
                        d = out[pos[v]] - out[pos[b]]
                        terms.append(torch.relu(args.pair_margin - sg * d) if sg else torch.abs(d))
                if terms: loss = loss + args.pair_loss * torch.stack(terms).mean()
            loss = loss / args.accum; loss.backward(); run_loss += loss.item() * args.accum; nb += 1
            if nb % args.accum == 0 or bi == len(batches) - 1:
                torch.nn.utils.clip_grad_norm_(lora_p + head_p, 1.0); opt.step(); sched.step(); opt.zero_grad(set_to_none=True); step += 1
                if step % 50 == 0: print(f"    ep{ep+1} step {step}/{total} loss={run_loss/nb:.4f} {time.time()-t0:.0f}s", flush=True)
        rec = {"epoch": ep + 1, "train_loss": run_loss / max(nb, 1), "time": time.time() - t0}
        if val_rows:
            p = predict_ids(enc_val); yv = np.array([float(r["points"]) for r in val_rows]); m = metrics(p, yv); rec.update({"val_" + k: v for k, v in m.items()})
            print(f"  [{tag}] epoch {ep+1}: loss={rec['train_loss']:.4f} val MAE={m['mae']:.1f} medAE={m['medae']:.1f} within20={m['within20']:.1%} ({rec['time']:.0f}s)", flush=True)
            if m["mae"] < best["mae"]: best = {"mae": m["mae"], "epoch": ep + 1, "pred": p}
        else: print(f"  [{tag}] epoch {ep+1}: loss={rec['train_loss']:.4f} ({rec['time']:.0f}s)", flush=True)
        hist.append(rec)
    if export_dir:
        os.makedirs(export_dir, exist_ok=True); merge_lora(model.backbone); model.backbone.save_pretrained(export_dir); tok.save_pretrained(export_dir)
        torch.save({k: v.cpu() for k, v in model.head.state_dict().items()}, os.path.join(export_dir, "head.pt"))
        if os.path.exists(xgb_model_path): import shutil; shutil.copy(xgb_model_path, os.path.join(export_dir, "xgb_baseline.json"))
        json.dump({"base_model": args.model, "mu": mu, "sd": sd, "with_name": args.with_name, "features": args.features, "pricing": args.pricing, "pricing_eval": args.pricing_eval,
                   "max_len": args.max_len, "hidden_size": backbone.config.hidden_size, "epochs": args.epochs, "lora_r": args.r, "train_rows": len(train_rows),
                   "baseline": args.baseline, "augment": args.augment, "pricing_col": args.pricing_col, "data": os.path.basename(args.data), "extra_train": args.extra_train, "pair_loss": args.pair_loss, "pair_repeat": args.pair_repeat, "extra_weight": args.extra_weight, "group_weight": args.group_weight, "calibration": (json.load(open(os.path.join(os.path.dirname(export_dir), "calibration.json"))) if os.path.exists(os.path.join(os.path.dirname(export_dir), "calibration.json")) else None),
                   "ensemble_w_llm": args.ensemble_w}, open(os.path.join(export_dir, "estimator_config.json"), "w"), indent=1)
        print(f"  exported merged model to {export_dir}", flush=True)
    return best, hist, (predict_ids(enc_val) if val_rows else None)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2.5-0.5B"); ap.add_argument("--data", default=os.path.join(HERE, "dataset.csv"))
    ap.add_argument("--cv", action="store_true"); ap.add_argument("--fold", type=int, default=None); ap.add_argument("--final", action="store_true"); ap.add_argument("--eval", default=None)
    ap.add_argument("--epochs", type=int, default=4); ap.add_argument("--lr", type=float, default=2e-4); ap.add_argument("--bs", type=int, default=8); ap.add_argument("--accum", type=int, default=2)
    ap.add_argument("--max-len", type=int, default=448); ap.add_argument("--r", type=int, default=16); ap.add_argument("--alpha", type=int, default=32); ap.add_argument("--lora-dropout", type=float, default=0.05); ap.add_argument("--head-dropout", type=float, default=0.1)
    ap.add_argument("--with-name", action="store_true"); ap.add_argument("--name-dropout", type=float, default=0.5)
    ap.add_argument("--no-features", dest="features", action="store_false"); ap.add_argument("--no-pricing", dest="pricing", action="store_false")
    ap.add_argument("--pricing-eval", default="official", help="pricing standard used at eval/inference: 'official' or 'own' (row's true group)")
    ap.add_argument("--pricing-col", default="source_group", help="dataset column used for the train-time pricing token (source_group or pricing_group)")
    ap.add_argument("--baseline", action="store_true", help="append 'Stats-based estimate: N' (XGB) to the prompt")
    ap.add_argument("--extra-train", default="", help="comma-separated CSVs of extra training rows (e.g. synthetic_train.csv); never used for validation")
    ap.add_argument("--pair-loss", type=float, default=0.0, help="weight of the twin-pair ranking loss (rows named 'X' and 'X (variant)' in --extra-train); 0 = off")
    ap.add_argument("--pair-repeat", type=int, default=1, help="how many times per epoch the twin-pair batches are replayed")
    ap.add_argument("--pair-margin", type=float, default=0.25, help="required |log-ratio| margin in standardized units when the judges' labels differ by >=10%%")
    ap.add_argument("--extra-weight", type=float, default=1.0, help="loss weight multiplier for --extra-train rows")
    ap.add_argument("--huber-delta", type=float, default=1.0, help="Huber delta in standardized log units (larger = closer to MSE, less tail shrinkage)")
    ap.add_argument("--augment", action="store_true", help="train-time label-preserving augmentation: shuffle abilities, blank flavor fields")
    ap.add_argument("--group-weight", default="", help="per-source loss weights, e.g. official=2,c3v_sov=2")
    ap.add_argument("--ensemble-w", type=float, default=0.0, help="stored in export config: weight of LLM in log-space ensemble with XGB (0 = LLM only)")
    ap.add_argument("--export-fold", action="store_true", help="also export each fold model to output/llm/<tag>/model_fold<k>")
    ap.add_argument("--include-holdout-in-final", action="store_true"); ap.add_argument("--tag", default=None); ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args(); sys.stdout.reconfigure(line_buffering=True)
    device = torch.device("mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu"))
    rows = load_dataset(args.data); train = [r for r in rows if r["split"] == "train"]; hold = [r for r in rows if r["split"] == "holdout"]
    extra = []
    if args.extra_train:
        for pth in args.extra_train.split(","):
            for r in csv.DictReader(open(pth)):
                r = dict(r); r.setdefault("source_group", "synthetic"); r.setdefault("pricing_group", "judge"); r.setdefault("flags", ""); r.setdefault("split", "train"); r.setdefault("fold", "-2"); r.setdefault("use_default", "1"); extra.append(r)
        print(f"extra training rows: {len(extra)} from {args.extra_train}")
    tag = args.tag or (args.model.split("/")[-1] + ("_name" if args.with_name else "") + ("" if args.features else "_nofeat") + ("" if args.pricing else "_noprice"))
    out_dir = os.path.join(HERE, "output", "llm", tag); os.makedirs(out_dir, exist_ok=True)
    print(f"device={device} rows(default pool)={len(rows)} train={len(train)} holdout={len(hold)} tag={tag}")
    if args.eval:
        from estimator import PointEstimator
        est = PointEstimator(args.eval, device=str(device)); y = np.array([float(r["points"]) for r in hold])
        p = np.array(est.predict_rows(hold)); m = metrics(p, y, [r["source_group"] for r in hold]); print(json.dumps(m, indent=1)); return
    if args.cv or args.fold is not None:
        folds = [args.fold] if args.fold is not None else sorted({int(r["fold"]) for r in train}); oof = {}
        for f in folds:
            tr = [r for r in train if int(r["fold"]) != f] + extra; va = [r for r in train if int(r["fold"]) == f]
            best, hist, last = run(args, tr, va, device, f"{tag} fold{f}", export_dir=(os.path.join(out_dir, f"model_fold{f}") if args.export_fold else None))
            for r, p_last, p_best in zip(va, last, best["pred"]): oof[r["source_file"]] = {"y": float(r["points"]), "pred_last": float(p_last), "pred_best": float(p_best), "group": r["source_group"], "type": r["figure_type"], "flags": r["flags"]}
            json.dump({"fold": f, "best_epoch": best["epoch"], "history": hist}, open(os.path.join(out_dir, f"fold{f}_history.json"), "w"), indent=1)
            json.dump(oof, open(os.path.join(out_dir, "oof_preds.json"), "w"))
        y = np.array([v["y"] for v in oof.values()]); pl = np.array([v["pred_last"] for v in oof.values()]); pb = np.array([v["pred_best"] for v in oof.values()])
        tags_ = [v["group"] for v in oof.values()]
        res = {"last_epoch": metrics(pl, y, tags_), "best_epoch(optimistic)": metrics(pb, y, tags_), "rounded5_last": metrics(np.round(pl / 5) * 5, y),
               "official_last_mae": float(np.abs(pl - y)[np.array([t == "official" for t in tags_])].mean()) if "official" in tags_ else None}
        A = np.vstack([np.ones_like(pl), np.log(pl)]).T; a_, b_ = np.linalg.lstsq(A, np.log(y), rcond=None)[0]
        pc = np.exp(a_ + b_ * np.log(pl)); res["calibrated_last"] = metrics(pc, y, tags_); res["calibration"] = {"a": float(a_), "b": float(b_)}
        json.dump({"a": float(a_), "b": float(b_), "fit_on": "oof_last_epoch", "n": int(len(y))}, open(os.path.join(out_dir, "calibration.json"), "w"), indent=1)
        json.dump(res, open(os.path.join(out_dir, "cv_metrics.json"), "w"), indent=1)
        print(f"calibration: log y = {a_:.3f} + {b_:.3f} log p  ->  calibrated OOF MAE {res['calibrated_last']['mae']:.1f}")
        print("\n=== CV (last epoch, leak-free) ==="); print(json.dumps(res["last_epoch"], indent=1)); print("official MAE:", res["official_last_mae"])
    if args.final:
        tr = train + extra + (hold if args.include_holdout_in_final else []); export = os.path.join(out_dir, "model")
        best, hist, ph = run(args, tr, [] if args.include_holdout_in_final else hold, device, f"{tag} final", export_dir=export)
        if ph is not None:
            y = np.array([float(r["points"]) for r in hold]); m = metrics(ph, y, [r["source_group"] for r in hold]); json.dump(m, open(os.path.join(out_dir, "holdout_metrics.json"), "w"), indent=1)
            print("\n=== HOLDOUT ==="); print(json.dumps(m, indent=1))
            json.dump({r["source_file"]: {"y": float(r["points"]), "pred": float(p), "group": r["source_group"], "name": r["name"]} for r, p in zip(hold, ph)}, open(os.path.join(out_dir, "holdout_preds.json"), "w"))

if __name__ == "__main__":
    main()
