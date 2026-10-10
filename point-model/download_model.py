"""
Sync the exported point-estimator model directory with Cloudflare R2 (S3-compatible).

Docker build:  python download_model.py                 # downloads prefix $POINT_MODEL_R2_PREFIX (default llm/best/) -> output/llm/best/model
Publish:       python download_model.py --upload output/llm/q05_v1/model llm/best/

Skips download if output/llm/best/model/estimator_config.json already exists (local dev).
Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
"""
import os, sys
import boto3

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get("POINT_MODEL_DIR", os.path.join(HERE, "output", "llm", "best", "model"))
PREFIX = os.environ.get("POINT_MODEL_R2_PREFIX", "llm/best/")
MARKER = os.path.join(MODEL_DIR, "estimator_config.json")


def client():
    return boto3.client("s3", endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")


def download():
    if os.path.exists(MARKER):
        print(f"Model already exists at {MODEL_DIR}, skipping download."); return
    s3, bucket = client(), os.environ["R2_BUCKET"]; n = 0
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
        for obj in page.get("Contents", []):
            rel = obj["Key"][len(PREFIX):]
            if not rel: continue
            local = os.path.join(MODEL_DIR, rel); os.makedirs(os.path.dirname(local), exist_ok=True)
            print(f"Downloading {obj['Key']} -> {local} ({obj['Size']/1e6:.1f} MB)"); s3.download_file(bucket, obj["Key"], local); n += 1
    if not n: raise SystemExit(f"no objects under {PREFIX} in bucket {bucket}")
    print(f"Downloaded {n} files.")


def upload(src_dir, prefix):
    s3, bucket = client(), os.environ["R2_BUCKET"]
    for root, _, files in os.walk(src_dir):
        for f in files:
            p = os.path.join(root, f); key = prefix + os.path.relpath(p, src_dir).replace(os.sep, "/")
            print(f"Uploading {p} -> {key}"); s3.upload_file(p, bucket, key)
    print("done")


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--upload": upload(sys.argv[2], sys.argv[3] if sys.argv[3].endswith("/") else sys.argv[3] + "/")
    else: download()
