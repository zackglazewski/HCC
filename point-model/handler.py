"""
Custom handler for Hugging Face Inference Endpoints.

Upload estimator.py, train_llm.py, features.py, this file and the exported model directory
contents (config.json, model.safetensors, tokenizer files, head.pt, estimator_config.json).
"""
import os
from estimator import PointEstimator
from serve import EstimateRequest, card_to_row


class EndpointHandler:
    def __init__(self, path=""):
        self.est = PointEstimator(path or ".", device="cuda" if os.environ.get("CUDA_VISIBLE_DEVICES") else "cpu")

    def __call__(self, data):
        if "inputs" in data: data = data["inputs"]
        row = card_to_row(EstimateRequest(**data)); raw = self.est.predict_rows([row])[0]
        return {"points": int(max(5, round(raw / 5) * 5)), "raw": round(raw, 1)}
