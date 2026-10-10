"""
Re-extract OFFICIAL card rows in cards.csv with a strict prompt + JSON schema.

Why: the original extraction (extract.py) invented point values when the POINTS
box was blank, read set/subtitle numbers as points, and misread stats on rotated
photos. This pass reads only what is printed on the card and returns null when a
field is not legible, so the diff against cards.csv is trustworthy.

Usage:
  uv run python reextract_official.py --smoke            # 1 card, prints usage/cost
  uv run python reextract_official.py -j 8               # all official rows -> official_reextract.jsonl
  uv run python reextract_official.py --diff             # write official_reextract_changes.csv (no CSV edits)
  uv run python reextract_official.py --apply            # back up cards.csv, apply changes, log them
"""
import argparse, base64, csv, json, os, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import anthropic

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "cards.csv")
IMG_DIR = os.path.join(HERE, "card-images")
OUT_JSONL = os.path.join(HERE, "official_reextract.jsonl")
CHANGES_CSV = os.path.join(HERE, "official_reextract_changes.csv")
MODEL = "claude-opus-5"
PRICE_IN, PRICE_OUT = 5.0 / 1e6, 25.0 / 1e6

CSV_COLUMNS = ["name","general","entity_type","figure_type","occupation","personality","size","height",
               "life","move","range","attack","defense","ability_1_title","ability_1_desc","ability_2_title",
               "ability_2_desc","ability_3_title","ability_3_desc","ability_4_title","ability_4_desc","points","source_file"]

SCHEMA = {
    "type": "object",
    "properties": {
        "is_army_card": {"type": "boolean", "description": "true only if this image is a single Heroscape army card with a stats panel"},
        "rotated_or_photo": {"type": "boolean"},
        "name": {"type": ["string", "null"]},
        "general": {"type": ["string", "null"], "description": "text printed directly under the name (general/faction), or null"},
        "type_slot_text": {"type": ["string", "null"], "description": "EXACT text of the second slot in the left column, e.g. 'Unique Hero', 'Uncommon Hero', 'Common Squad', 'Event Hero'"},
        "entity_type": {"type": ["string", "null"], "description": "first slot in the left column (species/race)"},
        "occupation": {"type": ["string", "null"], "description": "third slot (class/role)"},
        "personality": {"type": ["string", "null"], "description": "fourth slot"},
        "size": {"type": ["string", "null"], "description": "size word only: Tiny/Small/Medium/Large/Huge"},
        "height": {"type": ["integer", "null"], "description": "number printed next to the size word"},
        "life": {"type": ["integer", "null"]},
        "move": {"type": ["integer", "null"]},
        "range": {"type": ["integer", "null"]},
        "attack": {"type": ["integer", "null"]},
        "defense": {"type": ["integer", "null"]},
        "points": {"type": ["integer", "null"], "description": "ONLY the number printed inside the POINTS box at the bottom of the stats panel. null if that box is empty, missing, or illegible."},
        "points_box_visible": {"type": "boolean", "description": "true if a POINTS box with a legible number is present"},
        "figures_in_squad": {"type": ["integer", "null"], "description": "number of figure silhouettes/icons shown for a squad card, else null"},
        "starts_on_battlefield": {"type": "boolean", "description": "false if any power text says the figure does not start the game on the battlefield"},
        "abilities": {"type": "array", "items": {"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}}, "required": ["title", "description"], "additionalProperties": False}},
        "notes": {"type": "string", "description": "anything ambiguous, e.g. 'image rotated 90 degrees', 'two cards in image, read the left one'"},
    },
    "required": ["is_army_card","rotated_or_photo","name","general","type_slot_text","entity_type","occupation","personality","size","height","life","move","range","attack","defense","points","points_box_visible","figures_in_squad","starts_on_battlefield","abilities","notes"],
    "additionalProperties": False,
}

PROMPT = """Read this Heroscape army card image and transcribe ONLY what is printed on it.

Rules:
- Transcribe, never infer. If a value is not printed or not legible, return null for it.
- POINTS is the number inside the POINTS box at the bottom of the stats panel (below DEFENSE). It is never the number under the card name, never a set number, never the height. If the POINTS box is blank, return points=null and points_box_visible=false.
- The stats panel reads LIFE, MOVE, RANGE, ATTACK, DEFENSE from top to bottom. If the image is rotated, mentally rotate it and read carefully; set rotated_or_photo=true.
- type_slot_text must be the exact printed text (e.g. "Uncommon Hero" or "Event Hero"), not normalized.
- Copy every power's title and full text word for word.
- If the image shows more than one card, read the leftmost/topmost one and say so in notes.
- If the image is not a single army card with a stats panel (glyph, terrain, item, campaign sheet), set is_army_card=false."""


UPSCALE_BELOW = 0   # set via --upscale: images narrower than this are resized to UPSCALE_TO px wide
UPSCALE_TO = 1400

def read_image(path):
    with open(path, "rb") as f:
        raw = f.read()
    if UPSCALE_BELOW:
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(raw))
        if im.size[0] < UPSCALE_BELOW:
            im = im.convert("RGB"); ratio = UPSCALE_TO / im.size[0]
            im = im.resize((UPSCALE_TO, int(im.size[1] * ratio)), Image.LANCZOS)
            buf = io.BytesIO(); im.save(buf, format="PNG"); raw = buf.getvalue()
            return base64.standard_b64encode(raw).decode(), "image/png"
    if raw[:8] == b"\x89PNG\r\n\x1a\n": mt = "image/png"
    elif raw[:2] == b"\xff\xd8": mt = "image/jpeg"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP": mt = "image/webp"
    elif raw[:3] == b"GIF": mt = "image/gif"
    else: mt = "image/jpeg"
    return base64.standard_b64encode(raw).decode(), mt


def extract_one(client, fname):
    data, mt = read_image(os.path.join(IMG_DIR, fname))
    resp = client.messages.create(
        model=MODEL, max_tokens=8000,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": mt, "data": data}},
            {"type": "text", "text": PROMPT}]}],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
    )
    if resp.stop_reason == "refusal":
        return {"source_file": fname, "error": f"refusal: {getattr(resp.stop_details, 'category', None)}"}, resp.usage
    text = next(b.text for b in resp.content if b.type == "text")
    out = json.loads(text); out["source_file"] = fname
    out["_usage"] = {"in": resp.usage.input_tokens, "out": resp.usage.output_tokens}
    return out, resp.usage


def official_rows():
    with open(CSV_PATH) as f:
        rows = list(csv.DictReader(f))
    return rows, [r for r in rows if not r["source_file"].startswith("custom-")]


def load_results():
    res = {}
    if os.path.exists(OUT_JSONL):
        for line in open(OUT_JSONL):
            d = json.loads(line); res[d["source_file"]] = d
    return res


def to_row_fields(d):
    """Map an extraction result onto CSV columns (only fields we trust to overwrite)."""
    f = {}
    tc = lambda s: s.title() if s.isupper() else s  # cards print in ALL CAPS; keep CSV style
    for k in ["name", "general", "entity_type", "occupation", "personality", "size"]:
        if d.get(k) is not None: f[k] = tc(str(d[k]).strip())
    if d.get("type_slot_text"): f["figure_type"] = d["type_slot_text"].strip().title()
    for k in ["height", "life", "move", "range", "attack", "defense", "points"]:
        if d.get(k) is not None: f[k] = str(int(d[k]))
    ab = d.get("abilities") or []
    for i in range(4):
        f[f"ability_{i+1}_title"] = tc(ab[i]["title"].strip()) if i < len(ab) else ""
        f[f"ability_{i+1}_desc"] = ab[i]["description"].strip() if i < len(ab) else ""
    return f


def norm(v):  # compare loosely: whitespace/case-insensitive for text, numeric for numbers
    s = " ".join(str(v).split()).strip()
    try: return str(int(float(s)))
    except ValueError: return s.lower()


def compute_changes(rows, results):
    changes = []
    for r in rows:
        d = results.get(r["source_file"])
        if not d or d.get("error") or not d.get("is_army_card", True): continue
        for k, new in to_row_fields(d).items():
            old = r.get(k, "")
            if norm(old) != norm(new):
                changes.append({"source_file": r["source_file"], "name": r["name"], "field": k, "old": old, "new": new,
                                "points_box_visible": d.get("points_box_visible"), "rotated": d.get("rotated_or_photo"), "notes": d.get("notes", "")})
    return changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-j", type=int, default=8); ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--diff", action="store_true"); ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only", nargs="*", help="restrict to these source_files")
    ap.add_argument("--custom-sample", type=int, default=0, help="also extract N random custom rows (seed 0)")
    ap.add_argument("--custom-all", action="store_true", help="extract every custom row too")
    ap.add_argument("--out", default=None, help="results jsonl (default official_reextract.jsonl)")
    ap.add_argument("--upscale", type=int, default=0, help="upscale images narrower than N px to 1400 px before sending")
    ap.add_argument("--force", action="store_true", help="re-extract even if a result exists in --out")
    ap.add_argument("--scope", choices=["all", "custom", "official"], default="all", help="which rows --diff/--apply may touch")
    a = ap.parse_args(); sys.stdout.reconfigure(line_buffering=True)
    global OUT_JSONL, UPSCALE_BELOW
    if a.out: OUT_JSONL = os.path.join(HERE, a.out)
    UPSCALE_BELOW = a.upscale
    rows, off = official_rows(); results = {} if a.force else load_results()
    if a.custom_all: off = rows
    elif a.custom_sample:
        import random; cust = [r for r in rows if r["source_file"].startswith("custom-")]
        random.Random(0).shuffle(cust); off = cust[:a.custom_sample]

    if a.diff or a.apply:
        scoped = [r for r in rows if a.scope == "all" or (a.scope == "custom") == r["source_file"].startswith("custom-")]
        changes = compute_changes(scoped, results)  # every in-scope row that has a result
        with open(CHANGES_CSV, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(changes[0].keys()) if changes else ["source_file"]); w.writeheader(); w.writerows(changes)
        by_field = {}
        for c in changes: by_field[c["field"]] = by_field.get(c["field"], 0) + 1
        print(f"{len(changes)} field changes across {len({c['source_file'] for c in changes})} rows -> {CHANGES_CSV}"); print("  by field:", by_field)
        missing = [r["source_file"] for r in off if r["source_file"] not in results and not r["source_file"].startswith("custom-")]
        errs = [k for k, v in results.items() if v.get("error")]
        print(f"  official rows without a result: {len(missing)}  errors: {len(errs)}")
        if a.apply:
            bak = CSV_PATH + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
            os.replace(CSV_PATH, bak) if False else None  # keep original in place; write backup copy
            with open(bak, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=CSV_COLUMNS); w.writeheader(); w.writerows(rows)
            idx = {c["source_file"]: [] for c in changes}
            for c in changes: idx[c["source_file"]].append(c)
            n = 0
            for r in rows:
                for c in idx.get(r["source_file"], []): r[c["field"]] = c["new"]; n += 1
            with open(CSV_PATH, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=CSV_COLUMNS); w.writeheader(); w.writerows(rows)
            print(f"  applied {n} changes to {CSV_PATH}; backup at {bak}")
        return

    todo = [r["source_file"] for r in off if r["source_file"] not in results and os.path.exists(os.path.join(IMG_DIR, r["source_file"]))]
    if a.only: todo = [f for f in todo if f in set(a.only)]
    if a.smoke: todo = todo[:1]
    print(f"model={MODEL}  official rows={len(off)}  already done={len(results)}  to extract={len(todo)}  workers={a.j}")
    client = anthropic.Anthropic(max_retries=5); lock = threading.Lock(); tin = tout = 0; done = 0; t0 = time.time()

    def work(fname):
        try: return extract_one(client, fname)
        except Exception as e: return {"source_file": fname, "error": f"{type(e).__name__}: {e}"}, None

    with open(OUT_JSONL, "a") as out, ThreadPoolExecutor(max_workers=a.j) as pool:
        futs = {pool.submit(work, f): f for f in todo}
        for fut in as_completed(futs):
            d, usage = fut.result()
            with lock:
                out.write(json.dumps(d) + "\n"); out.flush(); done += 1
                if usage: tin += usage.input_tokens; tout += usage.output_tokens
                tag = "ERR " if d.get("error") else "ok  "
                print(f"  {tag}{done:3d}/{len(todo)} {d['source_file'][:45]:45s} pts={d.get('points')} box={d.get('points_box_visible')} {d.get('error','')[:80]}")
    cost = tin * PRICE_IN + tout * PRICE_OUT
    print(f"done in {time.time()-t0:.0f}s  tokens in={tin} out={tout}  cost=${cost:.2f}  (${cost/max(done,1):.4f}/card)")


if __name__ == "__main__":
    main()
