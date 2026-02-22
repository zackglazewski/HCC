"""
Custom handler for Hugging Face Inference Endpoints.

Loads the trained HeroPointEstimator and serves point predictions.
Upload this file alongside train.py, model.pt, tokenizer/, and
encoder_config/ to a HF model repo, then create an Inference Endpoint.
"""

import os

import numpy as np
import torch
from transformers import AutoTokenizer

from model import (
    FIGURE_TYPES,
    NUMERIC_FIELDS,
    SIZES,
    HeroPointEstimator,
    serialize_card,
)


def parse_size(size_str: str) -> tuple[str, int]:
    parts = size_str.strip().split()
    size_name = parts[0].title() if parts else "Medium"
    height = 0
    if len(parts) > 1:
        try:
            height = int(parts[-1])
        except ValueError:
            pass
    return size_name, height


def card_to_model_row(data: dict) -> dict:
    fields = data.get("fields", {})
    powers = data.get("powers", [])

    size_name, height = parse_size(fields.get("size", ""))

    row = {
        "name": fields.get("cardName", ""),
        "general": fields.get("tribeName", ""),
        "entity_type": fields.get("species", ""),
        "figure_type": fields.get("uniqueness", ""),
        "occupation": fields.get("class", ""),
        "personality": fields.get("personality", ""),
        "size": size_name,
        "height": str(height),
        "life": fields.get("life", "") or "0",
        "move": fields.get("move", "") or "0",
        "range": fields.get("range", "") or "0",
        "attack": fields.get("attack", "") or "0",
        "defense": fields.get("defense", "") or "0",
    }

    for i, power in enumerate(powers[:4]):
        row[f"ability_{i+1}_title"] = power.get("heading", "")
        row[f"ability_{i+1}_desc"] = power.get("body", "")

    return row


class EndpointHandler:
    def __init__(self, path=""):
        self.tokenizer = AutoTokenizer.from_pretrained(
            os.path.join(path, "tokenizer")
        )

        encoder_config_path = os.path.join(path, "encoder_config")
        self.model = HeroPointEstimator(
            encoder_name=encoder_config_path, pretrained=False
        )
        state = torch.load(
            os.path.join(path, "model.pt"),
            map_location="cpu",
            weights_only=True,
        )
        self.model.load_state_dict(state)
        self.model.eval()

    def __call__(self, data):
        # HF wraps input in {"inputs": ...} — unwrap if present
        if "inputs" in data:
            data = data["inputs"]

        row = card_to_model_row(data)
        text = serialize_card(row)

        encoding = self.tokenizer(
            text,
            max_length=320,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )

        cats = np.zeros(len(FIGURE_TYPES) + len(SIZES), dtype=np.float32)
        ft = row.get("figure_type", "").strip().title()
        if ft in FIGURE_TYPES:
            cats[FIGURE_TYPES.index(ft)] = 1.0
        s = row.get("size", "").strip().title()
        if s in SIZES:
            cats[len(FIGURE_TYPES) + SIZES.index(s)] = 1.0

        nums = np.zeros(len(NUMERIC_FIELDS), dtype=np.float32)
        for j, field in enumerate(NUMERIC_FIELDS):
            try:
                nums[j] = float(row.get(field, 0) or 0)
            except ValueError:
                nums[j] = 0.0

        with torch.no_grad():
            pred = self.model(
                encoding["input_ids"],
                encoding["attention_mask"],
                torch.tensor(cats).unsqueeze(0),
                torch.tensor(nums).unsqueeze(0),
            )

        points = max(0, round(pred.item()))
        return {"points": points}
