"""
End-to-end Heroscape point estimator with fine-tuned text encoder.

Architecture:
  - Entire card serialized as one structured text passage
  - Last 2 transformer layers unfrozen with low LR (learns game mechanics)
  - Cross-attention between text representation and numeric stats
  - Single model: card -> points (no external LLM calls)

Usage:
  uv run python train_finetuned.py --model minilm
  uv run python train_finetuned.py --model mpnet --gpu
  uv run python train_finetuned.py --model mpnet --gpu --epochs 120 --folds 10
"""

import argparse
import csv
import os
import pickle

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModel
from sklearn.model_selection import KFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

DATA_PATH = os.path.join(os.path.dirname(__file__), "cards.csv")

FIGURE_TYPES = ["Unique Hero", "Unique Squad", "Common Hero", "Common Squad"]
SIZES = ["Small", "Medium", "Large", "Huge"]
NUMERIC_FIELDS = ["height", "life", "move", "range", "attack", "defense"]

MODELS = {
    "minilm": "sentence-transformers/all-MiniLM-L6-v2",
    "mpnet": "sentence-transformers/all-mpnet-base-v2",
}


def get_device(gpu_requested):
    """Auto-detect best available device."""
    if not gpu_requested:
        return torch.device("cpu")
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    print("  WARNING: --gpu requested but no CUDA/MPS found, falling back to CPU")
    return torch.device("cpu")


# ──────────────────────────────────────────────
# Card Serialization
# ──────────────────────────────────────────────

def serialize_card(row):
    """Serialize a full card into a single structured text passage.

    By putting everything in one string, the transformer's self-attention
    can learn that ability text interacts with stats. For example, it can
    learn that "add 2 to attack dice" near "Attack: 3" is mechanically
    different from the same ability near "Attack: 7".
    """
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


# ──────────────────────────────────────────────
# Dataset
# ──────────────────────────────────────────────

class CardDataset(Dataset):
    def __init__(self, rows, tokenizer, max_length=320):
        self.texts = [serialize_card(r) for r in rows]
        self.tokenizer = tokenizer
        self.max_length = max_length

        # Categoricals
        self.cats = np.zeros((len(rows), len(FIGURE_TYPES) + len(SIZES)), dtype=np.float32)
        for i, row in enumerate(rows):
            ft = row.get("figure_type", "").strip().title()
            if ft in FIGURE_TYPES:
                self.cats[i, FIGURE_TYPES.index(ft)] = 1.0
            s = row.get("size", "").strip().title()
            if s in SIZES:
                self.cats[i, len(FIGURE_TYPES) + SIZES.index(s)] = 1.0

        # Numerics
        self.nums = np.zeros((len(rows), len(NUMERIC_FIELDS)), dtype=np.float32)
        for i, row in enumerate(rows):
            for j, f in enumerate(NUMERIC_FIELDS):
                try:
                    self.nums[i, j] = float(row.get(f, 0) or 0)
                except ValueError:
                    self.nums[i, j] = 0.0

        # Target
        self.targets = np.array([float(r["points"]) for r in rows], dtype=np.float32)

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.texts[idx],
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "cats": torch.tensor(self.cats[idx]),
            "nums": torch.tensor(self.nums[idx]),
            "target": torch.tensor(self.targets[idx]),
        }


# ──────────────────────────────────────────────
# Model
# ──────────────────────────────────────────────

class HeroPointEstimator(nn.Module):
    """
    End-to-end card -> points model.

    1. Fine-tuned transformer encodes the full card text
       (last 2 layers unfrozen so it learns game-specific semantics)
    2. Cross-attention: text tokens attend to stat tokens
       -> learns which parts of ability text are amplified by which stats
    3. Explicit stat-text interaction via gating
    4. MLP regression head
    """

    def __init__(self, encoder_name, n_stats=6, n_cats=8, proj_dim=128):
        super().__init__()
        self.proj_dim = proj_dim

        # Text encoder (partially frozen)
        self.encoder = AutoModel.from_pretrained(encoder_name)
        self._freeze_encoder()
        self.embed_dim = self.encoder.config.hidden_size

        # Project encoder output to proj_dim
        self.text_proj = nn.Sequential(
            nn.Linear(self.embed_dim, proj_dim),
            nn.LayerNorm(proj_dim),
            nn.GELU(),
        )

        # Project each stat to proj_dim for cross-attention
        self.stat_embed = nn.Sequential(
            nn.Linear(1, proj_dim),
            nn.GELU(),
        )

        # Cross-attention: text queries, stat keys/values
        self.cross_attn = nn.MultiheadAttention(
            embed_dim=proj_dim, num_heads=4, batch_first=True, dropout=0.1,
        )
        self.cross_norm = nn.LayerNorm(proj_dim)

        # Gated stat-text interaction
        self.gate_proj = nn.Sequential(
            nn.Linear(proj_dim, n_stats),
            nn.Sigmoid(),
        )

        # Regression head
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
        """Freeze all encoder layers except the last 2."""
        for param in self.encoder.parameters():
            param.requires_grad = False

        for layer in self.encoder.encoder.layer[-2:]:
            for param in layer.parameters():
                param.requires_grad = True

    def forward(self, input_ids, attention_mask, cats, nums):
        # 1. Encode full card text
        encoder_out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        token_embeds = encoder_out.last_hidden_state

        # Project to working dim
        token_proj = self.text_proj(token_embeds)

        # Mean pool (respecting attention mask)
        mask = attention_mask.unsqueeze(-1).float()
        text_pool = (token_proj * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)

        # 2. Cross-attention: text tokens attend to stats
        stat_tokens = self.stat_embed(nums.unsqueeze(-1))
        cross_out, _ = self.cross_attn(
            token_proj, stat_tokens, stat_tokens,
            key_padding_mask=None,
        )
        cross_out = self.cross_norm(token_proj + cross_out)
        cross_pool = (cross_out * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)

        # 3. Gated interaction: which stats matter given these abilities?
        gate = self.gate_proj(text_pool)
        gated_stats = gate * nums

        # 4. Regression
        x = torch.cat([text_pool, cross_pool, cats, nums, gated_stats], dim=1)
        return self.head(x).squeeze(-1)


# ──────────────────────────────────────────────
# Training
# ──────────────────────────────────────────────

def train_epoch(model, loader, optimizer, loss_fn, device):
    model.train()
    total_loss = 0
    for batch in loader:
        optimizer.zero_grad()
        preds = model(
            batch["input_ids"].to(device),
            batch["attention_mask"].to(device),
            batch["cats"].to(device),
            batch["nums"].to(device),
        )
        loss = loss_fn(preds, batch["target"].to(device))
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        total_loss += loss.item() * len(batch["target"])
    return total_loss / len(loader.dataset)


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    all_preds, all_targets = [], []
    for batch in loader:
        preds = model(
            batch["input_ids"].to(device),
            batch["attention_mask"].to(device),
            batch["cats"].to(device),
            batch["nums"].to(device),
        )
        all_preds.append(preds.cpu().numpy())
        all_targets.append(batch["target"].numpy())
    return np.concatenate(all_preds), np.concatenate(all_targets)


def train_fold(train_rows, val_rows, tokenizer, encoder_name, device,
               fold_num=0, epochs=80, verbose=True):
    if verbose:
        print(f"\n    Building datasets...")
    train_ds = CardDataset(train_rows, tokenizer)
    val_ds = CardDataset(val_rows, tokenizer)
    pin = device.type == "cuda"
    train_loader = DataLoader(train_ds, batch_size=32, shuffle=True,
                              pin_memory=pin, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False,
                            pin_memory=pin, num_workers=0)

    if verbose:
        print(f"    Initializing model...")
    model = HeroPointEstimator(encoder_name=encoder_name).to(device)
    loss_fn = nn.HuberLoss(delta=25.0)

    # Differential learning rates
    encoder_params = [p for p in model.encoder.parameters() if p.requires_grad]
    new_params = [p for n, p in model.named_parameters()
                  if p.requires_grad and not n.startswith("encoder.")]

    optimizer = torch.optim.AdamW([
        {"params": encoder_params, "lr": 2e-5, "weight_decay": 1e-2},
        {"params": new_params, "lr": 5e-4, "weight_decay": 1e-2},
    ])

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_val_mae = float("inf")
    best_state = None
    patience = 20
    patience_counter = 0

    if verbose:
        print(f"    Training (max {epochs} epochs, patience={patience})...")

    for epoch in range(epochs):
        train_loss = train_epoch(model, train_loader, optimizer, loss_fn, device)
        scheduler.step()

        val_preds, val_targets = evaluate(model, val_loader, device)
        val_mae = mean_absolute_error(val_targets, val_preds)
        val_rmse = np.sqrt(mean_squared_error(val_targets, val_preds))

        improved = ""
        if val_mae < best_val_mae:
            best_val_mae = val_mae
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
            improved = " *best*"
        else:
            patience_counter += 1

        if verbose and (epoch % 5 == 0 or improved or patience_counter >= patience):
            enc_lr = scheduler.get_last_lr()[0]
            head_lr = scheduler.get_last_lr()[1]
            print(f"    Epoch {epoch+1:3d}: loss={train_loss:7.2f}  "
                  f"val_MAE={val_mae:5.1f}  val_RMSE={val_rmse:5.1f}  "
                  f"patience={patience_counter:2d}  "
                  f"lr=[{enc_lr:.1e},{head_lr:.1e}]{improved}")

        if patience_counter >= patience:
            if verbose:
                print(f"    Early stopped at epoch {epoch+1}")
            break

    model.load_state_dict(best_state)
    model.to(device)
    val_preds, val_targets = evaluate(model, val_loader, device)

    if verbose:
        final_mae = mean_absolute_error(val_targets, val_preds)
        print(f"    Best val MAE: {final_mae:.1f}")

    return model, val_preds, val_targets


def cross_validate(rows, tokenizer, encoder_name, device, output_dir,
                   n_folds=5, epochs=80):
    os.makedirs(output_dir, exist_ok=True)

    kf = KFold(n_splits=n_folds, shuffle=True, random_state=42)
    all_preds = np.zeros(len(rows))
    all_targets = np.zeros(len(rows))
    fold_results = []

    # Check for existing fold checkpoints
    start_fold = 0
    for f_idx in range(n_folds):
        ckpt_path = os.path.join(output_dir, f"fold_{f_idx+1}.pt")
        preds_path = os.path.join(output_dir, f"fold_{f_idx+1}_preds.npz")
        if os.path.exists(ckpt_path) and os.path.exists(preds_path):
            data = np.load(preds_path)
            all_preds[data["val_idx"]] = data["preds"]
            all_targets[data["val_idx"]] = data["targets"]
            mae = mean_absolute_error(data["targets"], data["preds"])
            rmse = np.sqrt(mean_squared_error(data["targets"], data["preds"]))
            r2 = r2_score(data["targets"], data["preds"])
            fold_results.append({"mae": mae, "rmse": rmse, "r2": r2})
            print(f"  Fold {f_idx+1}: loaded checkpoint (MAE={mae:.1f}  RMSE={rmse:.1f}  R²={r2:.3f})")
            start_fold = f_idx + 1
        else:
            break

    for fold, (train_idx, val_idx) in enumerate(kf.split(rows)):
        if fold < start_fold:
            continue

        train_rows = [rows[i] for i in train_idx]
        val_rows = [rows[i] for i in val_idx]

        print(f"\n  --- Fold {fold+1}/{n_folds} ({len(train_rows)} train / {len(val_rows)} val) ---")

        model, val_preds, val_targets = train_fold(
            train_rows, val_rows, tokenizer, encoder_name, device,
            fold_num=fold+1, epochs=epochs,
        )
        all_preds[val_idx] = val_preds
        all_targets[val_idx] = val_targets

        mae = mean_absolute_error(val_targets, val_preds)
        rmse = np.sqrt(mean_squared_error(val_targets, val_preds))
        r2 = r2_score(val_targets, val_preds)
        fold_results.append({"mae": mae, "rmse": rmse, "r2": r2})
        print(f"  Fold {fold+1} result: MAE={mae:.1f}  RMSE={rmse:.1f}  R²={r2:.3f}")

        # Save fold checkpoint (always on CPU for portability)
        ckpt_path = os.path.join(output_dir, f"fold_{fold+1}.pt")
        torch.save({k: v.cpu() for k, v in model.state_dict().items()}, ckpt_path)
        preds_path = os.path.join(output_dir, f"fold_{fold+1}_preds.npz")
        np.savez(preds_path, preds=val_preds, targets=val_targets, val_idx=val_idx)
        print(f"  Saved checkpoint: {ckpt_path}")

    valid_mask = all_targets != 0
    overall_mae = mean_absolute_error(all_targets[valid_mask], all_preds[valid_mask])
    overall_rmse = np.sqrt(mean_squared_error(all_targets[valid_mask], all_preds[valid_mask]))
    overall_r2 = r2_score(all_targets[valid_mask], all_preds[valid_mask])
    print(f"\n  {'='*50}")
    print(f"  OVERALL: MAE={overall_mae:.1f}  RMSE={overall_rmse:.1f}  R²={overall_r2:.3f}")
    print(f"  {'='*50}")

    np.savez(os.path.join(output_dir, "cv_results.npz"),
             preds=all_preds, targets=all_targets)

    return all_preds, all_targets


def train_final(rows, tokenizer, encoder_name, device, epochs=100):
    """Train on all data."""
    print(f"  Building full dataset...")
    ds = CardDataset(rows, tokenizer)
    pin = device.type == "cuda"
    loader = DataLoader(ds, batch_size=32, shuffle=True,
                        pin_memory=pin, num_workers=0)

    print(f"  Initializing model...")
    model = HeroPointEstimator(encoder_name=encoder_name).to(device)
    loss_fn = nn.HuberLoss(delta=25.0)

    encoder_params = [p for p in model.encoder.parameters() if p.requires_grad]
    new_params = [p for n, p in model.named_parameters()
                  if p.requires_grad and not n.startswith("encoder.")]

    optimizer = torch.optim.AdamW([
        {"params": encoder_params, "lr": 2e-5, "weight_decay": 1e-2},
        {"params": new_params, "lr": 5e-4, "weight_decay": 1e-2},
    ])
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    print(f"  Training {epochs} epochs...")
    for epoch in range(epochs):
        loss = train_epoch(model, loader, optimizer, loss_fn, device)
        scheduler.step()
        if (epoch + 1) % 10 == 0:
            preds, targets = evaluate(model, loader, device)
            mae = mean_absolute_error(targets, preds)
            rmse = np.sqrt(mean_squared_error(targets, preds))
            print(f"  Epoch {epoch+1:3d}: loss={loss:.2f}  "
                  f"train_MAE={mae:.1f}  train_RMSE={rmse:.1f}")

    return model


def analyze_errors(rows, y_true, y_pred, top_n=10):
    errors = np.abs(y_true - y_pred)
    worst_idx = np.argsort(errors)[-top_n:][::-1]

    print(f"\nTop {top_n} worst predictions:")
    print(f"  {'Name':30s} {'True':>6s} {'Pred':>6s} {'Error':>6s}")
    print(f"  {'-'*30} {'-'*6} {'-'*6} {'-'*6}")
    for idx in worst_idx:
        print(f"  {rows[idx]['name']:30s} {y_true[idx]:6.0f} {y_pred[idx]:6.0f} {errors[idx]:6.0f}")


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

def load_data():
    with open(DATA_PATH) as f:
        rows = list(csv.DictReader(f))

    required = ["name", "figure_type", "size", "points"] + NUMERIC_FIELDS
    valid = [r for r in rows if all(r.get(f) for f in required)]
    print(f"Loaded {len(valid)} valid rows (of {len(rows)} total)")
    return valid


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train Heroscape point estimator with fine-tuned transformer",
    )
    parser.add_argument(
        "--model", choices=list(MODELS.keys()), default="minilm",
        help="Base encoder model (default: minilm)",
    )
    parser.add_argument(
        "--gpu", action="store_true",
        help="Enable GPU training (auto-detects CUDA > MPS > CPU)",
    )
    parser.add_argument(
        "--epochs", type=int, default=80,
        help="Max epochs per fold (default: 80)",
    )
    parser.add_argument(
        "--final-epochs", type=int, default=100,
        help="Epochs for final full-data training (default: 100)",
    )
    parser.add_argument(
        "--folds", type=int, default=5,
        help="Number of CV folds (default: 5)",
    )
    parser.add_argument(
        "--clean", action="store_true",
        help="Delete existing fold checkpoints before training",
    )
    return parser.parse_args()


def main():
    import sys
    sys.stdout.reconfigure(line_buffering=True)

    args = parse_args()
    encoder_name = MODELS[args.model]
    device = get_device(args.gpu)
    output_dir = os.path.join(os.path.dirname(__file__), "output", args.model)

    print("=" * 55)
    print("Heroscape Point Estimator — Fine-tuned Transformer")
    print("=" * 55)
    print(f"  Model:  {args.model} ({encoder_name})")
    print(f"  Device: {device}")
    print(f"  Folds:  {args.folds}")
    print(f"  Epochs: {args.epochs} (CV) / {args.final_epochs} (final)")
    print(f"  Output: {output_dir}")

    # Clean checkpoints if requested
    if args.clean and os.path.exists(output_dir):
        import glob
        for f in glob.glob(os.path.join(output_dir, "fold_*")):
            os.remove(f)
            print(f"  Removed: {f}")

    rows = load_data()

    # Data summary
    y = np.array([float(r["points"]) for r in rows])
    print(f"\nData summary:")
    print(f"  Cards: {len(rows)}")
    print(f"  Point range: {y.min():.0f} - {y.max():.0f}")
    print(f"  Point mean: {y.mean():.1f}, std: {y.std():.1f}")
    print(f"  Figure types: {dict(zip(*np.unique([r.get('figure_type','?') for r in rows], return_counts=True)))}")

    print(f"\nLoading tokenizer ({encoder_name})...")
    tokenizer = AutoTokenizer.from_pretrained(encoder_name)

    # Show example serializations
    print(f"\nExample card serializations:")
    for i in range(min(3, len(rows))):
        s = serialize_card(rows[i])
        toks = tokenizer(s, return_tensors="pt")
        print(f"  [{i+1}] ({toks['input_ids'].shape[1]} tokens) {s[:150]}...")

    # Count params
    print(f"\nBuilding model architecture...")
    model = HeroPointEstimator(encoder_name=encoder_name)
    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    frozen = total - trainable
    print(f"  Total params:     {total:>10,}")
    print(f"  Trainable params: {trainable:>10,} ({100*trainable/total:.1f}%)")
    print(f"  Frozen params:    {frozen:>10,} ({100*frozen/total:.1f}%)")

    print(f"\n  Trainable layers:")
    for name, param in model.named_parameters():
        if param.requires_grad:
            print(f"    {name:50s} {str(list(param.shape)):>20s} ({param.numel():,})")
    del model

    # --- Cross-validation ---
    print(f"\n{'='*55}")
    print(f"Fine-tuned {args.model} {args.folds}-Fold Cross-Validation")
    print(f"{'='*55}")
    cv_preds, cv_targets = cross_validate(
        rows, tokenizer, encoder_name, device, output_dir,
        n_folds=args.folds, epochs=args.epochs,
    )
    analyze_errors(rows, cv_targets, cv_preds)

    # --- Final model ---
    print(f"\n{'='*55}")
    print("Training final model on all data...")
    print(f"{'='*55}")
    model = train_final(rows, tokenizer, encoder_name, device,
                        epochs=args.final_epochs)

    # --- Save (always CPU state for portability) ---
    model_path = os.path.join(output_dir, "model.pt")
    torch.save({k: v.cpu() for k, v in model.state_dict().items()}, model_path)
    print(f"\nSaved model to {model_path}")

    tokenizer_path = os.path.join(output_dir, "tokenizer")
    tokenizer.save_pretrained(tokenizer_path)
    print(f"Saved tokenizer to {tokenizer_path}")

    meta = {
        "encoder_name": encoder_name,
        "figure_types": FIGURE_TYPES,
        "sizes": SIZES,
        "numeric_fields": NUMERIC_FIELDS,
        "serialize_fn": "serialize_card",
    }
    with open(os.path.join(output_dir, "metadata.pkl"), "wb") as f:
        pickle.dump(meta, f)
    print("Saved metadata")


if __name__ == "__main__":
    main()
