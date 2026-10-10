"""
Deterministic, inference-time-safe featurization of a Heroscape card.

Everything here is computable from what the card editor already has (stats,
type, size, ability titles + text). No model calls. Used by the tree baseline,
appended as a compact line to the LLM prompt, and reported in eval breakdowns.
"""
import math, re

FIGURE_TYPES = ["Unique Hero", "Common Hero", "Uncommon Hero", "Unique Squad", "Common Squad"]
SIZES = {"tiny": 0, "small": 1, "medium": 2, "large": 3, "huge": 4, "immense": 5}

def _num(v, default=0.0):
    try: return float(v)
    except (TypeError, ValueError): return default

def ability_text(row):
    parts = []
    for i in range(1, 5):
        t = (row.get(f"ability_{i}_title") or "").strip(); d = (row.get(f"ability_{i}_desc") or "").strip()
        if t or d: parts.append(f"{t}: {d}")
    return "\n".join(parts)

# --- regex mechanics (order matters only for readability) ---
_SA = re.compile(r"special attack", re.I)
_SA_RANGE = re.compile(r"range\s*(\d+)[\.,]?\s*attack\s*(\d+)", re.I)
_D20 = re.compile(r"20-?\s*sided die|roll the 20|d20", re.I)
_D20_THRESH = re.compile(r"roll (?:of |a |an )?(\d{1,2})\s*(?:or higher|\+)", re.I)
_ADJ_ALL = re.compile(r"(?:all|each|every) (?:figures?|enemy figures?|opponent'?s? figures?)[^.]{0,40}adjacent", re.I)
_AURA = re.compile(r"(?:all|each|every|any) (?:friendly|figures? you control)[^.]{0,80}within (\d+)", re.I)
_AURA_DEF = re.compile(r"within \d+[^.]{0,60}(?:add|adds|receive|receives|gets?) (\d) (?:additional |extra |automatic )?(?:defense|shield)", re.I)
_AURA_ATK = re.compile(r"within \d+[^.]{0,60}(?:add|adds|receive|receives|gets?) (\d) (?:additional |extra )?(?:attack|die to (?:their|its|his|her) attack)", re.I)
PATTERNS = {
    "bonding":          re.compile(r"\bbonding\b", re.I),
    "flying":           re.compile(r"\bflying\b|\bfly\b", re.I),
    "stealth":          re.compile(r"stealth|\binvisib|\bconceal", re.I),
    "double_attack":    re.compile(r"double attack|attack (?:one )?additional time|may attack again|attack twice", re.I),
    "disengage":        re.compile(r"\bdisengage\b|never take(?:s)? any leaving engagement", re.I),
    "climb":            re.compile(r"\bclimb\b|ignore elevation", re.I),
    "move_bonus":       re.compile(r"move (?:an )?additional|additional (?:\d+ )?spaces|move \d+ additional", re.I),
    "unblockable":      re.compile(r"unblockable|cannot roll defense|may not roll defense|automatic (?:skull|hit)", re.I),
    "auto_shield":      re.compile(r"automatic shield|add(?:s)? \d automatic shield|shield rolled counts", re.I),
    "self_defense_buff": re.compile(r"add(?:s)? \d (?:additional )?(?:defense|die to (?:his|her|its|their) defense)", re.I),
    "self_attack_buff": re.compile(r"add(?:s)? \d (?:additional )?(?:attack|die to (?:his|her|its|their) attack|dice to (?:his|her|its|their) attack)", re.I),
    "heal":             re.compile(r"remove (?:a|one|\d+|all|up to \d+) wound|heal|regenerat", re.I),
    "life_drain":       re.compile(r"life drain|remove a wound marker from this (?:army )?card", re.I),
    "summon_place":     re.compile(r"place (?:a|an|one|the|any|up to)[^.]{0,60}(?:figure|squad)[^.]{0,40}(?:on|adjacent)|summon|spawn|rise again|resurrect", re.I),
    "control":          re.compile(r"take (?:temporary |permanent )?control|control of (?:this|that|the chosen)", re.I),
    "lava_resist":      re.compile(r"lava resist|molten lava", re.I),
    "water":            re.compile(r"water (?:tunnel|strength|mastery)|swamp water|slither", re.I),
    "counter_strike":   re.compile(r"counter ?strike|excess shields count as unblockable", re.I),
    "carry":            re.compile(r"\bcarry\b", re.I),
    "throw":            re.compile(r"\bthrow\b", re.I),
    "range_enhance":    re.compile(r"range enhancement|additional range|add \d to (?:his|her|its|their) range", re.I),
    "engagement_strike": re.compile(r"leaving engagement attack[^.]{0,40}(?:add|roll|receive)|engagement strike", re.I),
    "drawback_forced":  re.compile(r"must (?:attack|move|be placed)|nearest (?:enemy|figure)|cannot leave an engagement|can only attack", re.I),
    "drawback_cannot":  re.compile(r"(?:cannot|may not|never) (?:move|attack|be moved|be healed|use)|does not roll|rolls? \d less", re.I),
    "drawback_control_loss": re.compile(r"opponent (?:will )?(?:now )?controls?|control of [^.]{0,30} (?:returns|passes)", re.I),
    "not_on_battlefield": re.compile(r"(?:does|do) not start the game on the battlefield|never starts? the game|instead of starting the game|not place [^.]{0,40} on the battlefield|alternate form", re.I),
    "army_restriction": re.compile(r"(?:can|may) only (?:be drafted|include)|your army (?:can|may) only include|must (?:also )?(?:include|draft)", re.I),
    "order_marker":     re.compile(r"order marker", re.I),
    "glyph_interaction": re.compile(r"\bglyph", re.I),
    "wound_marker_cond": re.compile(r"wound marker[^.]{0,30}(?:add|receive|roll|move)", re.I),
    "end_of_round":     re.compile(r"end of (?:the |each |every )?round", re.I),
    "initiative":       re.compile(r"initiative", re.I),
    "squad_reference":  re.compile(r"all \d |each (?:\w+ ){0,3}in the squad|squad members?", re.I),
}
_WORD = re.compile(r"[a-z]+", re.I)

def stat_features(row):
    L, M, R, A, D, H = (_num(row.get(k)) for k in ["life", "move", "range", "attack", "defense", "height"])
    ft = (row.get("figure_type") or "").strip().title()
    size = SIZES.get((row.get("size") or "").strip().lower(), 2)
    is_squad = "Squad" in ft; is_unique = ft.startswith("Unique"); is_common = ft.startswith("Common")
    exp_hits = 0.5 * A                      # attack die: 3 skulls / 6
    exp_blocks = D / 3.0                    # defense die: 2 shields / 6
    ranged = 1.0 if R > 1 else 0.0
    surv = L * (1.0 + exp_blocks)           # crude expected hits-to-kill proxy
    return {
        "life": L, "move": M, "range": R, "attack": A, "defense": D, "height": H, "size_ord": size,
        "is_squad": float(is_squad), "is_unique": float(is_unique), "is_common": float(is_common), "is_uncommon": float(ft.startswith("Uncommon")),
        "exp_hits": exp_hits, "exp_blocks": exp_blocks, "ranged": ranged, "survivability": surv,
        "offense": exp_hits * (1.0 + 0.15 * max(R - 1, 0)), "log_life": math.log1p(L), "life_x_def": L * D, "range_x_attack": R * A,
        "mobility": M + (0.0 if M else 0.0), "big": float(size >= 3), "small": float(size <= 1),
    }

def ability_features(row):
    txt = ability_text(row); titles = [(row.get(f"ability_{i}_title") or "").strip() for i in range(1, 5)]
    n_ab = sum(1 for t in titles if t); words = len(_WORD.findall(txt))
    f = {"n_abilities": float(n_ab), "ability_words": float(words), "log_ability_words": math.log1p(words)}
    for k, pat in PATTERNS.items(): f[f"ab_{k}"] = float(bool(pat.search(txt)))
    sa = _SA_RANGE.findall(txt)
    f["ab_special_attack"] = float(bool(_SA.search(txt))); f["sa_count"] = float(len(sa))
    f["sa_max_range"] = max([_num(r) for r, a in sa], default=0.0); f["sa_max_attack"] = max([_num(a) for r, a in sa], default=0.0)
    f["ab_aoe_adjacent"] = float(bool(_ADJ_ALL.search(txt)))
    f["d20_count"] = float(len(_D20.findall(txt)))
    th = [_num(x) for x in _D20_THRESH.findall(txt) if 1 <= _num(x) <= 20]
    f["d20_success_prob"] = (sum((21 - t) / 20.0 for t in th) / len(th)) if th else 0.0
    au = _AURA.findall(txt); f["aura"] = float(bool(au)); f["aura_range"] = max([_num(x) for x in au], default=0.0)
    f["aura_def_bonus"] = max([_num(x) for x in _AURA_DEF.findall(txt)], default=0.0); f["aura_atk_bonus"] = max([_num(x) for x in _AURA_ATK.findall(txt)], default=0.0)
    f["n_drawbacks"] = f["ab_drawback_forced"] + f["ab_drawback_cannot"] + f["ab_drawback_control_loss"]
    return f

def featurize(row):
    d = stat_features(row); d.update(ability_features(row)); return d

FEATURE_NAMES = list(featurize({k: "" for k in ["life","move","range","attack","defense","height","figure_type","size"]}).keys())

def feature_line(row, max_items=12):
    """Compact human-readable summary of the non-zero mechanics, for the LLM prompt."""
    f = ability_features(row); s = stat_features(row)
    bits = [f"exp_hits={s['exp_hits']:.1f}", f"exp_blocks={s['exp_blocks']:.1f}", f"survivability={s['survivability']:.1f}"]
    if f["sa_count"]: bits.append(f"special_attack(range {int(f['sa_max_range'])}, dice {int(f['sa_max_attack'])})")
    if f["aura"]: bits.append(f"aura(range {int(f['aura_range'])}, +{int(f['aura_def_bonus'])}def/+{int(f['aura_atk_bonus'])}atk)")
    if f["d20_count"]: bits.append(f"d20(p={f['d20_success_prob']:.2f})")
    flags = [k[3:] for k in f if k.startswith("ab_") and f[k] and k not in ("ab_special_attack",)]
    bits += flags[:max_items]
    return "Mechanics: " + ", ".join(bits)

if __name__ == "__main__":
    import csv, sys, collections
    rows = list(csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 else "cards.csv")))
    cnt = collections.Counter()
    for r in rows:
        for k, v in ability_features(r).items():
            if k.startswith("ab_") and v: cnt[k] += 1
    print(f"{len(rows)} rows; feature prevalence:")
    for k, v in cnt.most_common(): print(f"  {v:5d} {k}")
    print("\nexample:", feature_line(rows[2]))
