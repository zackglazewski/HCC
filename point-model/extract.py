"""
Extract Heroscape card features from images using Claude vision.

For each image in ./card-images/ not already in cards.csv:
  1. Send to Claude Sonnet for structured extraction
  2. Check for missing core fields
  3. Retry up to 2 more times if fields are missing
  4. Append to cards.csv (writes after each card for crash safety)

Usage:
  uv run python extract.py              # sequential
  uv run python extract.py -j 4         # 4 parallel extractions
  uv run python extract.py -j 4 --watch # parallel + watch for new downloads
"""

import base64
import csv
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import anthropic

CARD_IMAGES_DIR = os.path.join(os.path.dirname(__file__), "card-images")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "cards.csv")
MODEL = "claude-sonnet-4-6"
MAX_RETRIES = 2

CSV_COLUMNS = [
    "name", "general", "entity_type", "figure_type", "occupation",
    "personality", "size", "height", "life", "move", "range", "attack",
    "defense", "ability_1_title", "ability_1_desc", "ability_2_title",
    "ability_2_desc", "ability_3_title", "ability_3_desc", "ability_4_title",
    "ability_4_desc", "points", "source_file",
]

CORE_FIELDS = [
    "name", "figure_type", "size", "life", "move",
    "range", "attack", "defense", "points",
]

EXTRACTION_PROMPT = """\
Extract all features from this Heroscape card image. Return ONLY valid JSON with these exact keys:

{
  "name": "card name",
  "general": "general name (e.g. Vydar, Jandar, Einar, Ullar, Utgar, Valkrill, Aquilla, Volarak)",
  "entity_type": "species/race (e.g. Human, Orc, Marro, Elf, Kyrie, Soulborg)",
  "figure_type": "one of: Unique Hero, Common Hero, Unique Squad, Common Squad",
  "occupation": "class/role (e.g. Champion, Soldier, Agent, Wizard)",
  "personality": "personality trait (e.g. Wild, Disciplined, Tricky, Ferocious)",
  "size": "one of: Small, Medium, Large, Huge",
  "height": "height number",
  "life": "life number",
  "move": "move number",
  "range": "range number",
  "attack": "attack number",
  "defense": "defense number",
  "abilities": [
    {"title": "ability name", "description": "full ability text"},
  ],
  "points": "point value number"
}

Important:
- Read the card carefully, every field matters.
- For abilities, include the COMPLETE description text word for word.
- If a field is not visible or not applicable, use null.
- Return ONLY the JSON object, no other text."""

# Known non-unit card images (glyphs, artifacts, objects, promos)
SKIP_FILES = {
    "belt-of-giant-strength.png",
    "bolt-of-witherwood.png",
    "bracers-of-teleportation.png",
    "breakable-wall-section.png",
    "brooch-of-shielding.png",
    "cloak-of-invisibility.png",
    "cryptoliths-destructable-object-cards.png",
    "fortress-door.png",
    "heroscape-age-of-annihilation-haslab-campaign.png",
    "mavel-heroscape-glyphs.png",
    "moriko.png",
    "official-sotm-and-d-amp-d-glyph-card-scans.png",
    "ring-of-protection.png",
    "symbol-of-pelor.png",
}


def read_image(img_path):
    """Read image and return (base64_data, media_type) detecting format from magic bytes."""
    with open(img_path, "rb") as f:
        raw = f.read()

    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        media_type = "image/png"
    elif raw[:2] == b"\xff\xd8":
        media_type = "image/jpeg"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        media_type = "image/webp"
    elif raw[:3] == b"GIF":
        media_type = "image/gif"
    else:
        media_type = "image/jpeg"

    return base64.standard_b64encode(raw).decode("utf-8"), media_type


def call_claude(client, img_path, prompt=EXTRACTION_PROMPT):
    """Send an image to Claude and parse the JSON response."""
    img_data, media_type = read_image(img_path)

    response = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": img_data,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    text = response.content[0].text.strip()

    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    return json.loads(text)


def flatten_card(data, source_file):
    """Flatten the JSON response into a CSV row dict."""
    row = {col: "" for col in CSV_COLUMNS}
    row["source_file"] = source_file

    for key in ["name", "general", "entity_type", "figure_type", "occupation",
                "personality", "size", "height", "life", "move", "range",
                "attack", "defense", "points"]:
        val = data.get(key)
        if val is not None:
            row[key] = str(val)

    abilities = data.get("abilities", []) or []
    for i, ability in enumerate(abilities[:4]):
        if ability:
            row[f"ability_{i+1}_title"] = ability.get("title", "") or ""
            row[f"ability_{i+1}_desc"] = ability.get("description", "") or ""

    return row


def missing_fields(row):
    """Return list of missing core fields."""
    return [f for f in CORE_FIELDS if not row.get(f)]


def merge_rows(existing, new):
    """Fill blanks in existing row with values from new extraction."""
    for col in CSV_COLUMNS:
        if col == "source_file":
            continue
        if not existing[col] and new.get(col):
            existing[col] = new[col]
    return existing


def build_retry_prompt(row):
    """Build a targeted prompt highlighting which fields are still missing."""
    missing = missing_fields(row)
    return (
        EXTRACTION_PROMPT
        + f"\n\nPREVIOUS EXTRACTION WAS MISSING THESE FIELDS: {', '.join(missing)}. "
        "Please pay extra attention to reading these fields from the card image."
    )


def load_existing_csv():
    """Load existing cards.csv, returning (rows, source_files_set)."""
    if not os.path.exists(OUTPUT_CSV):
        return [], set()

    with open(OUTPUT_CSV) as f:
        rows = list(csv.DictReader(f))

    source_files = {r["source_file"] for r in rows}
    return rows, source_files


def write_csv(rows):
    """Write all rows to cards.csv."""
    with open(OUTPUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def get_new_images(existing_sources):
    """Return image filenames in card-images/ that aren't in CSV yet."""
    new = []
    for fname in sorted(os.listdir(CARD_IMAGES_DIR)):
        if not fname.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        if "basic" in fname.lower():
            continue
        if fname in SKIP_FILES:
            continue
        if fname in existing_sources:
            continue
        new.append(fname)
    return new


def extract_with_retries(client, fname):
    """Extract a card with up to MAX_RETRIES retries for missing fields.

    Returns (row, attempts, status) where status is 'ok', 'incomplete', or 'error'.
    """
    img_path = os.path.join(CARD_IMAGES_DIR, fname)

    try:
        data = call_claude(client, img_path)
        row = flatten_card(data, fname)
        missing = missing_fields(row)

        attempts = 1
        while missing and attempts <= MAX_RETRIES:
            time.sleep(0.5)
            prompt = build_retry_prompt(row)
            data = call_claude(client, img_path, prompt=prompt)
            new_row = flatten_card(data, fname)
            row = merge_rows(row, new_row)
            missing = missing_fields(row)
            attempts += 1

        status = "ok" if not missing else "incomplete"
        return row, attempts, status

    except anthropic.RateLimitError:
        time.sleep(60)
        try:
            data = call_claude(client, img_path)
            row = flatten_card(data, fname)
            missing = missing_fields(row)
            status = "ok" if not missing else "incomplete"
            return row, 1, status
        except Exception:
            row = {col: "" for col in CSV_COLUMNS}
            row["source_file"] = fname
            return row, 0, "error"

    except Exception:
        row = {col: "" for col in CSV_COLUMNS}
        row["source_file"] = fname
        return row, 0, "error"


def process_batch(client, new_images, rows, existing_sources, parallel):
    """Extract a batch of images. Returns (complete, incomplete, errors)."""
    complete = 0
    incomplete = 0
    errors = 0
    csv_lock = threading.Lock()
    counter = {"done": 0}
    total = len(new_images)

    def handle_result(fname, row, attempts, status):
        nonlocal complete, incomplete, errors
        with csv_lock:
            rows.append(row)
            existing_sources.add(fname)

            if status == "ok":
                complete += 1
                name = row.get("name", "???")
                pts = row.get("points", "?")
                retries = f", {attempts - 1} retries" if attempts > 1 else ""
                print(f"  OK:         {fname} -> {name} ({pts} pts{retries})")
            elif status == "incomplete":
                incomplete += 1
                missing = missing_fields(row)
                print(f"  INCOMPLETE: {fname} (missing: {', '.join(missing)})")
            else:
                errors += 1
                print(f"  ERROR:      {fname}")

            counter["done"] += 1
            write_csv(rows)

            if counter["done"] % 25 == 0:
                print(f"\n  --- Progress: {counter['done']}/{total} "
                      f"({complete} ok, {incomplete} incomplete, {errors} errors) ---\n")

    if parallel <= 1:
        for fname in new_images:
            row, attempts, status = extract_with_retries(client, fname)
            handle_result(fname, row, attempts, status)
    else:
        with ThreadPoolExecutor(max_workers=parallel) as pool:
            futures = {
                pool.submit(extract_with_retries, client, fname): fname
                for fname in new_images
            }
            for future in as_completed(futures):
                fname = futures[future]
                try:
                    row, attempts, status = future.result()
                except Exception as e:
                    row = {col: "" for col in CSV_COLUMNS}
                    row["source_file"] = fname
                    attempts, status = 0, "error"
                handle_result(fname, row, attempts, status)

    return complete, incomplete, errors


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Extract card features using Claude vision")
    parser.add_argument("-j", "--parallel", type=int, default=1,
                        help="Number of parallel extractions (default: 1)")
    parser.add_argument("--watch", action="store_true",
                        help="Keep running, picking up new images as they appear")
    parser.add_argument("--interval", type=int, default=30,
                        help="Seconds between scans in watch mode (default: 30)")
    args = parser.parse_args()

    sys.stdout.reconfigure(line_buffering=True)

    print("=" * 55)
    print("Heroscape Card Extractor — Claude Vision")
    print("=" * 55)
    print(f"  Model:       {MODEL}")
    print(f"  Max retries: {MAX_RETRIES}")
    print(f"  Parallel:    {args.parallel}")
    print(f"  Images dir:  {CARD_IMAGES_DIR}")
    print(f"  Output CSV:  {OUTPUT_CSV}")
    if args.watch:
        print(f"  Watch mode:  ON (scan every {args.interval}s)")

    rows, existing_sources = load_existing_csv()
    print(f"\n  Existing CSV entries: {len(rows)}")

    client = anthropic.Anthropic()

    total_complete = 0
    total_incomplete = 0
    total_errors = 0

    while True:
        new_images = get_new_images(existing_sources)

        if not new_images:
            if not args.watch:
                if total_complete + total_incomplete + total_errors == 0:
                    print("\nNothing to extract!")
                break
            print(f"\n  No new images, waiting {args.interval}s...", flush=True)
            time.sleep(args.interval)
            continue

        print(f"\n  Found {len(new_images)} new images to extract")

        c, i, e = process_batch(client, new_images, rows, existing_sources,
                                args.parallel)
        total_complete += c
        total_incomplete += i
        total_errors += e

        if not args.watch:
            break

        print(f"\n  Batch done. Waiting {args.interval}s for more images...", flush=True)
        time.sleep(args.interval)

    print(f"\n{'='*55}")
    print(f"Done. Processed {total_complete + total_incomplete + total_errors} images:")
    print(f"  Complete:   {total_complete}")
    print(f"  Incomplete: {total_incomplete}")
    print(f"  Errors:     {total_errors}")
    print(f"  Total CSV:  {len(rows)} entries")


if __name__ == "__main__":
    main()
