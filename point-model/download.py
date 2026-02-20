"""
Download Heroscape card images from heroscapers.com galleries.

Scrapes both official and custom unit card galleries, skipping:
  - "basic" cards
  - Images already in ./card-images/

Usage: uv run python download.py
"""

import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import urlopen, Request

CARD_IMAGES_DIR = os.path.join(os.path.dirname(__file__), "card-images")
BASE_URL = "https://www.heroscapers.com"
PARALLEL = 8
MEDIA_PATTERN = re.compile(r"/media/[a-z0-9][a-z0-9._-]+\.[0-9]+/")

GALLERIES = [
    {
        "name": "official",
        "url": f"{BASE_URL}/media/categories/official-unit-cards.11",
        "prefix": "",
    },
    {
        "name": "custom",
        "url": f"{BASE_URL}/media/categories/custom-unit-cards.10",
        "prefix": "custom-",
    },
]


def fetch_page(url):
    """Fetch a gallery page and return media paths found."""
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8", errors="replace")
        return list(set(MEDIA_PATTERN.findall(html)))
    except Exception:
        return []


def collect_urls(gallery):
    """Paginate through a gallery in parallel batches, collecting media paths."""
    all_paths = set()
    page_start = 1
    batch_size = 50

    print(f"\n  Scanning {gallery['name']} gallery...")

    while True:
        pages = range(page_start, page_start + batch_size)
        urls = []
        for p in pages:
            url = f"{gallery['url']}/" if p == 1 else f"{gallery['url']}/page-{p}"
            urls.append((p, url))

        batch_new = 0
        with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
            futures = {pool.submit(fetch_page, url): p for p, url in urls}
            for future in as_completed(futures):
                paths = future.result()
                new = set(paths) - all_paths
                all_paths.update(new)
                batch_new += len(new)

        print(f"    Pages {page_start}-{page_start + batch_size - 1}: "
              f"{batch_new} new URLs (total: {len(all_paths)})")

        if batch_new == 0:
            break

        page_start += batch_size

    return all_paths


def slug_to_filename(path, prefix):
    """Convert a media path like /media/some-card.123/ to a filename."""
    slug = path.strip("/").replace("media/", "", 1)
    name = re.sub(r"\.[0-9]+$", "", slug)
    return f"{prefix}{name}.png"


def download_image(url, output_path):
    """Download a single image. Returns (output_path, success, detail)."""
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                data = resp.read()
                with open(output_path, "wb") as f:
                    f.write(data)
                return output_path, True, resp.status
            return output_path, False, f"HTTP {resp.status}"
    except Exception as e:
        return output_path, False, str(e)


def main():
    sys.stdout.reconfigure(line_buffering=True)
    os.makedirs(CARD_IMAGES_DIR, exist_ok=True)

    existing = set(os.listdir(CARD_IMAGES_DIR))

    print("=" * 55)
    print("Heroscape Card Image Downloader")
    print("=" * 55)

    # Collect URLs from all galleries
    download_queue = []
    skipped_basic = 0
    skipped_exists = 0

    for gallery in GALLERIES:
        paths = collect_urls(gallery)

        for path in paths:
            if "basic" in path.lower():
                skipped_basic += 1
                continue

            filename = slug_to_filename(path, gallery["prefix"])

            if filename in existing:
                skipped_exists += 1
                continue

            image_url = f"{BASE_URL}{path}full"
            output_path = os.path.join(CARD_IMAGES_DIR, filename)
            download_queue.append((image_url, output_path))

    print(f"\nSummary:")
    print(f"  Skipped (basic):    {skipped_basic}")
    print(f"  Skipped (existing): {skipped_exists}")
    print(f"  To download:        {len(download_queue)}")

    if not download_queue:
        print("\nNothing to download!")
        return

    # Parallel download
    print(f"\nDownloading {len(download_queue)} images ({PARALLEL} parallel)...")
    ok = 0
    fail = 0

    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        futures = {
            pool.submit(download_image, url, path): path
            for url, path in download_queue
        }
        for future in as_completed(futures):
            path, success, detail = future.result()
            fname = os.path.basename(path)

            if success:
                ok += 1
                if ok % 50 == 0:
                    print(f"  Progress: {ok + fail}/{len(download_queue)} "
                          f"({ok} ok, {fail} failed)")
            else:
                fail += 1
                if os.path.exists(path):
                    os.remove(path)
                print(f"  FAIL ({detail}): {fname}")

    total_images = sum(
        1 for f in os.listdir(CARD_IMAGES_DIR)
        if f.lower().endswith((".png", ".jpg", ".jpeg"))
    )
    print(f"\n{'='*55}")
    print(f"Done. Downloaded {ok}, failed {fail}")
    print(f"Total images in card-images/: {total_images}")


if __name__ == "__main__":
    main()
