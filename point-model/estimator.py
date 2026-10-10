"""Inference wrapper for an exported train_llm.py model (merged LoRA + head)."""
import json, math, os
import numpy as np, torch
from transformers import AutoTokenizer, AutoModel
from train_llm import Head, card_text
from xgb_baseline import XGBBaseline, MODEL_PATH as XGB_PATH

class PointEstimator:
    def __init__(self, model_dir, device="cpu", dtype=None):
        self.cfg = json.load(open(os.path.join(model_dir, "estimator_config.json")))
        self.device = torch.device(device); dtype = dtype or (torch.bfloat16 if self.device.type != "cpu" else torch.float32)
        self.tok = AutoTokenizer.from_pretrained(model_dir); self.tok.padding_side = "right"
        if self.tok.pad_token is None: self.tok.pad_token = self.tok.eos_token
        self.backbone = AutoModel.from_pretrained(model_dir, dtype=dtype).to(self.device).eval()
        self.head = Head(self.cfg["hidden_size"]); self.head.load_state_dict(torch.load(os.path.join(model_dir, "head.pt"), map_location="cpu")); self.head.to(self.device).eval()
        self.calib = self.cfg.get("calibration"); self.w = float(self.cfg.get("ensemble_w_llm") or 0.0); self.use_baseline = bool(self.cfg.get("baseline"))
        xgb_path = os.path.join(model_dir, "xgb_baseline.json") if os.path.exists(os.path.join(model_dir, "xgb_baseline.json")) else XGB_PATH
        self.xgb = XGBBaseline(xgb_path) if (self.use_baseline or self.w > 0) else None
    def text(self, row, baseline=None):
        return card_text(row, with_name=self.cfg["with_name"], features=self.cfg["features"], pricing=(self.cfg["pricing_eval"] if self.cfg["pricing"] else None), baseline=baseline)
    @torch.no_grad()
    def predict_rows(self, rows, bs=16, round_to=None, raw=False):
        xb = self.xgb.predict_rows(rows) if self.xgb is not None else [None] * len(rows)
        texts = [self.text(r, baseline=(b if self.use_baseline else None)) for r, b in zip(rows, xb)]; out = []
        for s in range(0, len(texts), bs):
            enc = self.tok(texts[s:s+bs], padding=True, truncation=True, max_length=self.cfg["max_len"], return_tensors="pt").to(self.device)
            hs = self.backbone(**enc).last_hidden_state; last = hs[torch.arange(hs.size(0), device=self.device), enc["attention_mask"].sum(1) - 1].float()
            z = self.head(last).cpu().numpy(); out.extend(np.exp(np.clip(z * self.cfg["sd"] + self.cfg["mu"], math.log(5), math.log(1000))).tolist())
        if self.calib and not raw: out = [float(math.exp(self.calib["a"] + self.calib["b"] * math.log(v))) for v in out]
        if self.w > 0 and not raw: out = [float(math.exp(self.w * math.log(v) + (1 - self.w) * math.log(b))) for v, b in zip(out, xb)]
        if round_to: out = [float(round(v / round_to) * round_to) for v in out]
        return out
    def predict(self, row, round_to=5): return self.predict_rows([row], round_to=round_to)[0]
