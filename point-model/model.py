"""
Heroscape Point Estimator — inference-only module.

Contains the model architecture, card serialization, and constants
needed for serving. No training dependencies (sklearn, xgboost, etc.).
"""

import torch
import torch.nn as nn
from transformers import AutoModel, AutoConfig

FIGURE_TYPES = ["Unique Hero", "Unique Squad", "Common Hero", "Common Squad"]
SIZES = ["Small", "Medium", "Large", "Huge"]
NUMERIC_FIELDS = ["height", "life", "move", "range", "attack", "defense"]


def serialize_card(row):
    """Serialize a full card into a single structured text passage."""
    parts = [
        f"{row.get('name', 'Unknown')}.",
        f"{row.get('figure_type', '')} {row.get('entity_type', '')}.",
        f"{row.get('occupation', '')}. {row.get('personality', '')}.",
        f"{row.get('size', 'Medium')} size, height {row.get('height', '0')}.",
        f"Life {row.get('life', '0')}, Move {row.get('move', '0')}, "
        f"Range {row.get('range', '0')}, Attack {row.get('attack', '0')}, "
        f"Defense {row.get('defense', '0')}.",
    ]

    for i in range(1, 5):
        title = row.get(f"ability_{i}_title", "")
        desc = row.get(f"ability_{i}_desc", "")
        if title or desc:
            parts.append(f"Ability: {title}. {desc}")

    return " ".join(parts)


class HeroPointEstimator(nn.Module):
    """
    End-to-end card -> points model.

    1. Fine-tuned transformer encodes the full card text
    2. Cross-attention: text tokens attend to stat tokens
    3. Explicit stat-text interaction via gating
    4. MLP regression head
    """

    def __init__(self, encoder_name, n_stats=6, n_cats=8, proj_dim=128, pretrained=True):
        super().__init__()
        self.proj_dim = proj_dim

        if pretrained:
            self.encoder = AutoModel.from_pretrained(encoder_name)
        else:
            config = AutoConfig.from_pretrained(encoder_name)
            self.encoder = AutoModel.from_config(config)
        self._freeze_encoder()
        self.embed_dim = self.encoder.config.hidden_size

        self.text_proj = nn.Sequential(
            nn.Linear(self.embed_dim, proj_dim),
            nn.LayerNorm(proj_dim),
            nn.GELU(),
        )

        self.stat_embed = nn.Sequential(
            nn.Linear(1, proj_dim),
            nn.GELU(),
        )

        self.cross_attn = nn.MultiheadAttention(
            embed_dim=proj_dim, num_heads=4, batch_first=True, dropout=0.1,
        )
        self.cross_norm = nn.LayerNorm(proj_dim)

        self.gate_proj = nn.Sequential(
            nn.Linear(proj_dim, n_stats),
            nn.Sigmoid(),
        )

        head_dim = proj_dim + proj_dim + n_cats + n_stats + n_stats
        self.head = nn.Sequential(
            nn.Linear(head_dim, 256),
            nn.GELU(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.GELU(),
            nn.Linear(64, 1),
        )

    def _freeze_encoder(self):
        for param in self.encoder.parameters():
            param.requires_grad = False
        for layer in self.encoder.encoder.layer[-2:]:
            for param in layer.parameters():
                param.requires_grad = True

    def forward(self, input_ids, attention_mask, cats, nums):
        encoder_out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        token_embeds = encoder_out.last_hidden_state
        token_proj = self.text_proj(token_embeds)

        mask = attention_mask.unsqueeze(-1).float()
        text_pool = (token_proj * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)

        stat_tokens = self.stat_embed(nums.unsqueeze(-1))
        cross_out, _ = self.cross_attn(
            token_proj, stat_tokens, stat_tokens, key_padding_mask=None,
        )
        cross_out = self.cross_norm(token_proj + cross_out)
        cross_pool = (cross_out * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)

        gate = self.gate_proj(text_pool)
        gated_stats = gate * nums

        x = torch.cat([text_pool, cross_pool, cats, nums, gated_stats], dim=1)
        return self.head(x).squeeze(-1)
