"""CPU latency + size of an exported estimator. Usage: uv run python bench_latency.py output/llm/<tag>/model [--n 30] [--threads 4]"""
import argparse, csv, os, sys, time, torch
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
ap = argparse.ArgumentParser(); ap.add_argument("model_dir"); ap.add_argument("--n", type=int, default=30); ap.add_argument("--threads", type=int, default=4); a = ap.parse_args()
torch.set_num_threads(a.threads)
from estimator import PointEstimator
t0 = time.time(); est = PointEstimator(a.model_dir, device="cpu"); load = time.time() - t0
rows = [r for r in csv.DictReader(open(os.path.join(HERE, "dataset.csv"))) if r["split"] == "holdout"][:a.n]
est.predict_rows(rows[:2])  # warm-up
lat = []
for r in rows:
    t = time.time(); est.predict_rows([r]); lat.append(time.time() - t)
lat.sort(); size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(a.model_dir) for f in fs) / 1e6
t = time.time(); est.predict_rows(rows); batch = (time.time() - t) / len(rows)
print(f"model={a.model_dir}\n  size on disk: {size:.0f} MB   load: {load:.1f}s   threads={a.threads}\n  single-card latency: p50={lat[len(lat)//2]*1000:.0f}ms  p95={lat[int(len(lat)*0.95)]*1000:.0f}ms   batched: {batch*1000:.0f}ms/card")
