"""
FastAPI microservice for Heroscape point estimation.

Loads an exported train_llm.py model (merged LoRA + regression head) via estimator.PointEstimator
and exposes POST /estimate for the card editor.

Usage:
    cd point-model && POINT_MODEL_DIR=output/llm/q05_v1/model uv run uvicorn serve:app --port 5175
"""
import os, time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from estimator import PointEstimator

MODEL_DIR = os.environ.get("POINT_MODEL_DIR", os.path.join(os.path.dirname(__file__), "output", "llm", "best", "model"))
DEVICE = os.environ.get("POINT_MODEL_DEVICE", "cpu")

app = FastAPI()
estimator: PointEstimator | None = None


@app.on_event("startup")
def load_model():
    global estimator
    if not os.path.exists(os.path.join(MODEL_DIR, "estimator_config.json")):
        print(f"WARNING: no model at {MODEL_DIR}; set POINT_MODEL_DIR"); return
    t0 = time.time(); estimator = PointEstimator(MODEL_DIR, device=DEVICE)
    print(f"Model loaded from {MODEL_DIR} on {DEVICE} in {time.time()-t0:.1f}s")


# ── Request schema matching frontend CardState ──
class Power(BaseModel):
    heading: str = ""
    body: str = ""

class Fields(BaseModel):
    model_config = {"populate_by_name": True}
    cardName: str = ""
    tribeName: str = ""
    species: str = ""
    uniqueness: str = ""
    class_: str = Field(default="", alias="class")
    personality: str = ""
    size: str = ""
    life: str = ""
    move: str = ""
    range: str = ""
    attack: str = ""
    defense: str = ""
    points: str = ""

class EstimateRequest(BaseModel):
    fields: Fields
    powers: list[Power] = []


def parse_size(size_str: str) -> tuple[str, str]:
    """Frontend size like 'medium 5' -> ('Medium', '5')."""
    parts = size_str.strip().split()
    name = parts[0].title() if parts else "Medium"
    height = parts[-1] if len(parts) > 1 and parts[-1].isdigit() else {"Small": "3", "Medium": "5", "Large": "7", "Huge": "9"}.get(name, "5")
    return name, height


def card_to_row(req: EstimateRequest) -> dict:
    f = req.fields; size, height = parse_size(f.size)
    ft = f.uniqueness.strip().title() or "Unique Hero"
    row = {"name": f.cardName, "general": f.tribeName, "entity_type": f.species, "figure_type": ft, "occupation": f.class_, "personality": f.personality,
           "size": size, "height": height, "life": f.life or "1", "move": f.move or "5", "range": f.range or "1", "attack": f.attack or "3", "defense": f.defense or "3"}
    for i in range(4):
        p = req.powers[i] if i < len(req.powers) else None
        row[f"ability_{i+1}_title"] = (p.heading if p else "") or ""; row[f"ability_{i+1}_desc"] = (p.body if p else "") or ""
    return row


@app.get("/health")
def health():
    return {"ok": estimator is not None, "model_dir": MODEL_DIR, "device": DEVICE}


@app.post("/estimate")
def estimate(req: EstimateRequest):
    if estimator is None: raise HTTPException(status_code=503, detail="model not loaded")
    row = card_to_row(req); t0 = time.time()
    raw = estimator.predict_rows([row])[0]
    points = int(max(5, round(raw / 5) * 5))
    return {"points": points, "raw": round(raw, 1), "latency_ms": int((time.time() - t0) * 1000)}
