"""
Download trained model files from Cloudflare R2 (S3-compatible).

Runs at Docker build time so model files are baked into the image layer.
Skips download if output/mpnet/model.pt already exists (local dev).

Required env vars:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
"""

import os

import boto3

MODEL_DIR = os.path.join(os.path.dirname(__file__), "output", "mpnet")
MARKER_FILE = os.path.join(MODEL_DIR, "model.pt")

# Files to download from the bucket (relative to bucket root)
MODEL_FILES = [
    "mpnet/model.pt",
    "mpnet/tokenizer/tokenizer_config.json",
    "mpnet/tokenizer/special_tokens_map.json",
    "mpnet/tokenizer/vocab.txt",
    "mpnet/tokenizer/tokenizer.json",
    "mpnet/encoder_config/config.json",
]


def download_from_r2():
    if os.path.exists(MARKER_FILE):
        print(f"Model already exists at {MARKER_FILE}, skipping download.")
        return

    account_id = os.environ["R2_ACCOUNT_ID"]
    access_key = os.environ["R2_ACCESS_KEY_ID"]
    secret_key = os.environ["R2_SECRET_ACCESS_KEY"]
    bucket = os.environ["R2_BUCKET"]

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    for key in MODEL_FILES:
        # key is like "mpnet/model.pt" → save to "output/mpnet/model.pt"
        local_path = os.path.join(
            os.path.dirname(__file__), "output", key
        )
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        print(f"Downloading {key} → {local_path} ...")
        s3.download_file(bucket, key, local_path)

    print("All model files downloaded successfully.")


if __name__ == "__main__":
    download_from_r2()
