#!/bin/sh
# Final pipeline on dataset v2 (+ synthetic augmentation). Usage: TAG=v2_final FLAGS="--augment" ./finalize.sh
cd /Users/zackaryglazewski/hcc-codex/point-model
TAG=${TAG:-v2_final}; DATA=${DATA:-dataset_v2.csv}; EXTRA=${EXTRA:-synthetic_train.csv}; EPOCHS=${EPOCHS:-4}; W=${W:-0.5}
set -x
.venv/bin/python xgb_baseline.py --data $DATA 2>&1 | grep XGB
.venv/bin/python train_llm.py --cv --epochs $EPOCHS --tag $TAG --data $DATA --pricing-col pricing_group --extra-train $EXTRA $FLAGS > output/llm_${TAG}_cv.log 2>&1
grep -E "=== CV|official MAE|calibration" output/llm_${TAG}_cv.log
.venv/bin/python train_llm.py --final --epochs $EPOCHS --tag $TAG --data $DATA --pricing-col pricing_group --extra-train $EXTRA --ensemble-w $W $FLAGS > output/llm_${TAG}_final.log 2>&1
grep -E "exported|Traceback" output/llm_${TAG}_final.log
.venv/bin/python report.py $TAG > output/llm_${TAG}_report.txt 2>&1
.venv/bin/python eval_fold_model.py output/llm/$TAG/model >> output/llm_${TAG}_report.txt 2>&1
.venv/bin/python consistency_tests.py output/llm/$TAG/model --n 80 --device cpu >> output/llm_${TAG}_report.txt 2>&1
.venv/bin/python bench_latency.py output/llm/$TAG/model --n 20 --threads 4 >> output/llm_${TAG}_report.txt 2>&1
rm -rf output/llm/best; mkdir -p output/llm/best; cp -R output/llm/$TAG/model output/llm/best/model
echo "=== finalize done: $TAG -> output/llm/best/model ==="
