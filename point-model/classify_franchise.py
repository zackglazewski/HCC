"""Tag every dataset row with franchise/IP info via Claude (names + species + class only). ~25 calls.
   Output: franchise_tags.json {source_file: {franchise, is_comic_superhero}}"""
import csv, json, os, sys, anthropic
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "franchise_tags.json")
SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
    "id": {"type": "integer"}, "franchise": {"type": "string", "description": "e.g. 'original', 'Marvel', 'DC', 'Star Wars', 'Lord of the Rings', 'Transformers', 'Warhammer', 'D&D', 'video game', 'other IP'"},
    "is_comic_superhero": {"type": "boolean", "description": "true only for comic-book superhero/supervillain characters (Marvel, DC, Image, etc.)"}},
    "required": ["id", "franchise", "is_comic_superhero"], "additionalProperties": False}}}, "required": ["items"], "additionalProperties": False}
rows = list(csv.DictReader(open(os.path.join(HERE, "dataset.csv")))); client = anthropic.Anthropic(max_retries=5); tags = {}
B = 150
for s in range(0, len(rows), B):
    chunk = rows[s:s+B]
    listing = "\n".join(f"{i}. {r['name']} | species: {r['entity_type']} | class: {r['occupation']} | general/faction: {r['general']}" for i, r in enumerate(chunk))
    resp = client.messages.create(model="claude-opus-5", max_tokens=16000, output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": "These are custom and official Heroscape army cards. For each, identify the franchise the character comes from (or 'original' if it is an original fantasy/sci-fi design in the Heroscape universe, including official Heroscape units and Valhalla generals) and whether it is a comic-book superhero/supervillain.\n\n" + listing}])
    items = json.loads(next(b.text for b in resp.content if b.type == "text"))["items"]
    for it in items:
        if 0 <= it["id"] < len(chunk): tags[chunk[it["id"]]["source_file"]] = {"franchise": it["franchise"], "is_comic_superhero": it["is_comic_superhero"]}
    print(f"  {min(s+B, len(rows))}/{len(rows)} tagged (in={resp.usage.input_tokens} out={resp.usage.output_tokens})", flush=True)
    json.dump(tags, open(OUT, "w"))
import collections; print(collections.Counter(v["franchise"] for v in tags.values()).most_common(12)); print("comic superheroes:", sum(v["is_comic_superhero"] for v in tags.values()))
