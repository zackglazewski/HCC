#!/bin/sh
# Train + export a final model with given FLAGS (no CV), then evaluate. Usage: TAG=v4_final FLAGS="..." ./final_only.sh
cd /Users/zackaryglazewski/hcc-codex/point-model
TAG=${TAG:-v4_final}; DATA=${DATA:-dataset_v2.csv}; EXTRA=${EXTRA:-synthetic_train.csv}
set -x
.venv/bin/python train_llm.py --final --epochs 4 --tag $TAG --data $DATA --pricing-col pricing_group --extra-train $EXTRA --ensemble-w 0.5 $FLAGS > output/llm_${TAG}_final.log 2>&1
grep -E "exported|Traceback" output/llm_${TAG}_final.log
.venv/bin/python report.py $TAG > output/llm_${TAG}_report.txt 2>&1
.venv/bin/python eval_fold_model.py output/llm/$TAG/model >> output/llm_${TAG}_report.txt 2>&1
.venv/bin/python consistency_tests.py output/llm/$TAG/model --n 80 --device cpu >> output/llm_${TAG}_report.txt 2>&1
echo "=== final_only done: $TAG ==="
