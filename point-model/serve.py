"""
FastAPI microservice for Heroscape point estimation.

Loads the trained mpnet model and exposes a POST /estimate endpoint
that accepts card JSON from the frontend and returns a point estimate.

Usage:
    cd point-model && uv run uvicorn serve:app --port 5175
"""

import os
import re

import numpy as np
import torch
from fastapi import FastAPI
from pydantic import BaseModel, Field
from transformers import AutoTokenizer

from model import (
    FIGURE_TYPES,
    NUMERIC_FIELDS,
    SIZES,
    HeroPointEstimator,
    serialize_card,
)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "output", "mpnet")

app = FastAPI()

# Globals loaded at startup
model: HeroPointEstimator | None = None
tokenizer = None


@app.on_event("startup")
def load_model():
    global model, tokenizer

    tokenizer = AutoTokenizer.from_pretrained(os.path.join(MODEL_DIR, "tokenizer"))

    encoder_config_path = os.path.join(MODEL_DIR, "encoder_config")
    model = HeroPointEstimator(encoder_name=encoder_config_path, pretrained=False)
    state = torch.load(os.path.join(MODEL_DIR, "model.pt"), map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()

    print(f"Model loaded from {MODEL_DIR}")


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
    # 'class' is a Python keyword so we alias it
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


def parse_size(size_str: str) -> tuple[str, int]:
    """Parse frontend size like 'medium 5' into (size_name, height)."""
    parts = size_str.strip().split()
    size_name = parts[0].title() if parts else "Medium"
    height = 0
    if len(parts) > 1:
        try:
            height = int(parts[-1])
        except ValueError:
            pass
    return size_name, height


def card_to_model_row(req: EstimateRequest) -> dict:
    """Convert a frontend EstimateRequest into the dict format expected by serialize_card."""
    f = req.fields
    size_name, height = parse_size(f.size)

    row = {
        "name": f.cardName,
        "general": f.tribeName,
        "entity_type": f.species,
        "figure_type": f.uniqueness,
        "occupation": f.class_,
        "personality": f.personality,
        "size": size_name,
        "height": str(height),
        "life": f.life or "0",
        "move": f.move or "0",
        "range": f.range or "0",
        "attack": f.attack or "0",
        "defense": f.defense or "0",
    }

    for i, power in enumerate(req.powers[:4]):
        row[f"ability_{i+1}_title"] = power.heading
        row[f"ability_{i+1}_desc"] = power.body

    return row


@app.post("/estimate")
def estimate(req: EstimateRequest):
    row = card_to_model_row(req)

    # Serialize text
    text = serialize_card(row)

    # Tokenize
    encoding = tokenizer(
        text,
        max_length=320,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )

    # Categoricals (figure_type one-hot + size one-hot)
    cats = np.zeros(len(FIGURE_TYPES) + len(SIZES), dtype=np.float32)
    ft = row.get("figure_type", "").strip().title()
    if ft in FIGURE_TYPES:
        cats[FIGURE_TYPES.index(ft)] = 1.0
    s = row.get("size", "").strip().title()
    if s in SIZES:
        cats[len(FIGURE_TYPES) + SIZES.index(s)] = 1.0

    # Numerics
    nums = np.zeros(len(NUMERIC_FIELDS), dtype=np.float32)
    for j, field in enumerate(NUMERIC_FIELDS):
        try:
            nums[j] = float(row.get(field, 0) or 0)
        except ValueError:
            nums[j] = 0.0

    # Run inference
    with torch.no_grad():
        pred = model(
            encoding["input_ids"],
            encoding["attention_mask"],
            torch.tensor(cats).unsqueeze(0),
            torch.tensor(nums).unsqueeze(0),
        )

    points = max(0, round(pred.item()))
    return {"points": points}
