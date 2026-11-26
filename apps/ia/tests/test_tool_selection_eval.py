"""#4112.3 — ÉVAL avant/après du choix d'outil de Laura : le bon outil, les tokens, le cache.

« Avant » = tout le catalogue à chaque tour. « Après » = `ToolSelection` (noyau stable + `chercher_un_outil`).
Jeu de référence FIGÉ : `tests/golden/tool_selection_eval.json`, dates en dur (`as_of` 2026-11-03), aucune lecture
de l'horloge — le même jeu rend le même nombre chaque mois (`test_the_eval_never_reads_the_clock`).

SEUILS — fixés AVANT la première mesure (jamais ajustés après coup ; le gate est BLOQUANT, doctrine
`c77_gate_qualite_ia_bloque_sur_role_cle`). Le seuil « +10 % de MRR » du tome 7 §38 n'est PAS repris : inatteignable
sur un golden dont la vérité terrain ignore la date (#5216). Ici l'instrument PEUT bouger : chaque cas pèse 1/30, et
un changement réel le déplace —
  * justesse ≥ 85 % : la recherche est lexicale (aucune sémantique) ; 85 % tolère 4 cas sur 30 qu'un libellé de
    description ne porte pas, et tombe dès qu'on retire un outil du noyau ou qu'on casse le repli des accents ;
  * réduction des tokens ≥ 50 % par tour : noyau + structurels + recherche = 27 specs sur ~131 ; 50 % laisse de la
    marge mais échoue si le noyau grossit jusqu'à la moitié du catalogue (le gain du lot #4112 disparaîtrait) ;
  * cache : le préfixe du tour 1 est RÉEMPLOYÉ à l'octet au tour 2 (100 %, exigence de préfixe) et ≥ 80 % des
    tokens du tour 2 sont ce préfixe (les découverts, 5 au plus, arrivent en fin de liste).
Tokens : estimation déterministe `len(json)/4` — un indice, pas la facturation ; seule la COMPARAISON avant/après compte.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.services.chat_tools import tools_for
from app.services.tool_selection import ToolSelection

GOLDEN = Path(__file__).parent / "golden" / "tool_selection_eval.json"

MIN_RIGHT_TOOL = 0.85
MIN_TOKEN_REDUCTION = 0.50
MIN_PREFIX_REUSE = 1.0
MIN_CACHED_SHARE = 0.80


def _tokens(tools: list[dict[str, Any]]) -> int:
    return len(json.dumps(tools, ensure_ascii=False, sort_keys=True)) // 4


def _cases() -> list[dict[str, Any]]:
    return json.loads(GOLDEN.read_text(encoding="utf-8"))["cases"]


def measure(catalog: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    catalog = catalog if catalog is not None else tools_for(None)
    full_tokens = _tokens(catalog)
    right = 0
    misses: list[str] = []
    turn1_tokens: list[int] = []
    prefix_ok = 0
    cached_shares: list[float] = []
    for case in _cases():
        sel = ToolSelection(catalog)
        turn1 = sel.current()
        query = case["search_query"]
        if query:
            sel.run_search({"query": query})
        turn2 = sel.current()
        if case["expected_tool"] in sel.exposed_names():
            right += 1
        else:
            misses.append(case["expected_tool"])
        turn1_tokens.append(_tokens(turn1))
        same_prefix = json.dumps(turn2[: len(turn1)], sort_keys=True) == json.dumps(turn1, sort_keys=True)
        prefix_ok += 1 if same_prefix else 0
        cached_shares.append(_tokens(turn1) / max(_tokens(turn2), 1) if same_prefix else 0.0)
    n = len(_cases())
    avg_turn1 = sum(turn1_tokens) / n
    return {
        "cases": n,
        "right_tool_before": 1.0,  # tout le catalogue exposé : l'outil attendu y est toujours
        "right_tool_after": right / n,
        "misses": misses,
        "tokens_per_turn_before": full_tokens,
        "tokens_per_turn_after": round(avg_turn1),
        "token_reduction": 1 - avg_turn1 / full_tokens,
        "prefix_reuse": prefix_ok / n,
        "cached_share_turn2": sum(cached_shares) / n,
    }


def test_the_reference_set_is_frozen_and_valid() -> None:
    data = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert data["as_of"] == "2026-11-03"
    names = {str(t["name"]) for t in tools_for(None)}
    assert len(data["cases"]) >= 30
    assert [c["expected_tool"] for c in data["cases"] if c["expected_tool"] not in names] == []


def test_the_eval_never_reads_the_clock(monkeypatch) -> None:
    first = measure()
    monkeypatch.setattr(time, "time", lambda: 4_102_444_800.0)  # 2100-01-01
    assert measure() == first


def test_right_tool_is_chosen_above_the_threshold() -> None:
    report = measure()
    assert report["right_tool_after"] >= MIN_RIGHT_TOOL, f"outils manqués : {report['misses']} — {report}"


def test_tokens_per_turn_drop_above_the_threshold() -> None:
    report = measure()
    assert report["token_reduction"] >= MIN_TOKEN_REDUCTION, report


def test_cache_prefix_is_reused_byte_for_byte() -> None:
    report = measure()
    assert report["prefix_reuse"] >= MIN_PREFIX_REUSE, report
    assert report["cached_share_turn2"] >= MIN_CACHED_SHARE, report


def test_the_eval_can_say_no() -> None:
    """Un catalogue amputé de dix outils attendus fait chuter la justesse sous le seuil : l'instrument bouge."""
    dropped = {c["expected_tool"] for c in _cases()[:10]}
    degraded = measure([t for t in tools_for(None) if t["name"] not in dropped])
    assert degraded["right_tool_after"] < MIN_RIGHT_TOOL
