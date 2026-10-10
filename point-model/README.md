# point-model — Heroscape custom-card point estimator

Small, fast, cheap estimator: `Qwen2.5-0.5B` + LoRA + regression head on `log(points)`, optionally
ensembled with a gradient-boosted tree on deterministic features. Serves `POST /estimate` for the card editor.

## Data pipeline

| Step | Script | Output |
|---|---|---|
| Scrape card images from heroscapers.com | `download.py` | `card-images/` |
| First-pass extraction (legacy, Sonnet) | `extract.py` | `cards.csv` |
| Strict re-read of official cards with Opus 5 (JSON schema; pass 1 native res, pass 2 upscaled) | `reextract_official.py` | `official_reextract*.jsonl` |
| Accept a value only when both reads agree; manual decisions for the rest | `reconcile_official.py` (+ `official_gold_decisions.csv`) | edits `cards.csv` (backups `cards.csv.bak-*`) |
| Re-read flagged custom rows | `reextract_official.py --custom-all --only ...` then `--apply --scope custom` | edits `cards.csv` |
| Clean, tag, de-duplicate, split | `build_dataset.py` | `dataset.csv` |
| Franchise / comic-superhero tags (Opus) | `classify_franchise.py` | `franchise_tags.json` |
| Synthetic tricky cards (Opus-designed, judge-consensus labels; `--set v1|v3|v4`) | `make_synthetic.py --generate`, `--label` | `synthetic_cards*.csv` |
| Split synthetic sets into training augmentation / held-out validation (twin pairs stay together) | `split_synthetic.py synthetic_cards_v3.csv synthetic_cards_v4.csv` | `synthetic_train.csv`, `synthetic_val.csv` |

`dataset.csv` columns beyond the card fields: `source_group` (official / c3v_sov / taf / swc / other / superhero / grishnakh),
`group` (normalized name, the split key), `flags` (alt_form, zero_stat, event, blank_suspect, uncommon), `use_default`
(1 = in the default train/eval pool), `split` (train / holdout, 80/20 by name group, stratified by source), `fold` (0-4, GroupKFold).

Why the pool excludes some rows: comic-superhero customs are priced on a different economy (one prolific designer runs 1.67x the
crowd for identical statlines); event/vessel cards have no normal stats; rows whose POINTS box was blank or unreadable had
invented labels. Alternate-form cards stay in but are flagged. Official + C3V/SoV are the calibration reference.

## Model

```
uv run python xgb_baseline.py                 # tree baseline -> output/xgb_baseline.json + OOF/holdout preds
TAG=v4_final DATA=dataset_v2.csv FLAGS="--augment --pair-loss 1.0 --pair-repeat 3 --extra-weight 2.0" ./finalize.sh   # shipped recipe (final_only.sh skips the CV)
#   = xgb_baseline.py --data dataset_v2.csv
#   + train_llm.py --cv    ... --pricing-col pricing_group --extra-train synthetic_train.csv $FLAGS
#   + train_llm.py --final ... --ensemble-w 0.5  (exports output/llm/<tag>/model, copies to output/llm/best/model)
#   + report.py, eval_fold_model.py (synthetic sets, CPU), consistency_tests.py, bench_latency.py -> output/llm_<tag>_report.txt
```

Final recipe: Qwen2.5-0.5B, LoRA r=16 on all linear layers, last-token head on standardized log(points), Huber loss,
4 epochs, label-preserving augmentation (shuffled powers, blanked flavor fields), 270 Opus-designed synthetic rows as extra
training data under their own `Pricing standard: judge` token, and a twin-pair ranking loss (`--pair-loss 1.0 --pair-repeat 3`) that forces
"X (variant)" to be priced on the judges' side of "X" (drawback => lower, aura => higher). The pair loss is what fixed
drawback handling (severe-drawback twins ordered 6/6, add-drawback consistency 72% -> 85%) for ~0.5 MAE on real cards
(hold-out ensemble 19.0 vs 18.5 without it). With `--pair-repeat 1` the signal is too sparse to take reliably.

Known gaps: novel turn-economy mechanics (extra turns, "dice equal to target health") are nearly invisible to the model;
`features.py` `heal` matches "health" (fix and retrain together, the featurizer text is baked into the trained prompts). Bigger backbones did not help:
Qwen2.5-1.5B tied the 0.5B on the same fold at 3x the latency; Qwen3-0.6B was worse and slower.

Input text = type, faction, stats, powers, a deterministic `Mechanics:` line (`features.py`), a `Pricing standard:` token and
optionally the tree's `Stats-based estimate`. The card name is excluded by default (new custom cards have new names).
`estimator.py` wraps an exported model (merged LoRA, `head.pt`, `estimator_config.json`) and applies the optional tree ensemble.

## Serving

```
POINT_MODEL_DIR=output/llm/q05_v1/model uv run uvicorn serve:app --port 5175
python download_model.py --upload output/llm/q05_v1/model llm/best/   # publish to R2; Docker build pulls llm/best/
```

## Metrics to read

Latest numbers live in `output/llm_<tag>_report.txt`. MAE = mean absolute error in points (median card is 100 pts; official cards are the clean reference; designers publishing
identical statlines disagree by ~14 pts, which bounds what is learnable on customs). Always compare on `dataset.csv` folds or
the holdout — random K-fold leaks duplicate scans of the same card and flatters MAE by about a point.
