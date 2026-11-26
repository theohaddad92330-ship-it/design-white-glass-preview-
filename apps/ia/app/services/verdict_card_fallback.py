"""#3395 (recette prod 01/10) — la carte verdict ne dépend plus du bon vouloir du modèle.

Le verdict d'aptitude (`get_account_suitability_verdict`) est CALCULÉ côté
serveur ; sa carte était pourtant écrite — ou pas — par le modèle, et la recette
le voyait rendre une phrase libre. Quand l'outil a rendu un verdict ce tour et
que la réponse ne porte aucune carte `verdict`, la carte est bâtie ICI, à
partir du résultat de l'outil — mêmes champs, jamais un second calcul (GA-26),
jamais une donnée inventée : un champ que l'outil n'a pas rendu reste absent.

Le statut est TRADUIT (« Pas maintenant »), jamais le code brut `NO_GO_NOW`.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from typing import Any

from app.models.reply_blocks import validate_reply_block
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks

VERDICT_TOOL_NAME = "get_account_suitability_verdict"

#: Mêmes mots que `chat.json › accountVerdict` (FR) côté écran.
_STATUS_FR: dict[str, str] = {
    "GO_NOW": "Mouvement immédiat",
    "GO_VIA_PARTNER": "Plutôt via un partenaire",
    "GO_AFTER_PROOF": "D’abord une preuve",
    "WATCH": "À surveiller",
    "NO_GO_NOW": "Pas maintenant",
    "NOT_EVALUABLE": "Non évaluable",
}


def _cut(text: object, limit: int) -> str:
    value = " ".join(str(text or "").split())
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def _pairs(rows: object, sep: str) -> list[str]:
    out: list[str] = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, Mapping):
            continue
        axis = str(row.get("axis") or "").strip()
        rest = str(row.get("evidence") or row.get("reason") or "").strip()
        if axis:
            out.append(_cut(f"{axis}{sep}{rest}" if rest else axis, 400))
    return out


def verdict_status_of(output: object) -> str | None:
    """Le statut (`NO_GO_NOW`, `WATCH`…) rendu par l'outil de verdict, ou
    ``None`` (erreur, verdict hors vocabulaire) — jamais deviné. Lu par la trace
    de raisonnement (#3223.7) : la MÊME lecture que la carte ci-dessous, pas une
    seconde (GA-26)."""
    if not isinstance(output, Mapping) or output.get("error"):
        return None
    verdict = str(output.get("verdict") or "")
    return verdict if verdict in _STATUS_FR else None


def verdict_block_from_tool_output(output: object) -> dict | None:
    """La carte `verdict` d'un résultat de l'outil, ou ``None`` (erreur, verdict
    inconnu, aucune raison à citer — pas de carte vide)."""
    if isinstance(output, Mapping) and "introuvable" in str(output.get("error") or "").lower():
        return validate_reply_block(
            {
                "type": "verdict",
                "conclusion": f"{_STATUS_FR['NOT_EVALUABLE']} — ce compte n’est pas dans l’espace",
                "reasons": ["Aucune analyse de ce compte dans l’espace : aucun verdict ne peut être donné."],
                "next_action": {"label": "Analyser ce compte pour obtenir un verdict"},
            }
        )
    if not isinstance(output, Mapping) or output.get("error"):
        return None
    verdict = str(output.get("verdict") or "")
    if verdict not in _STATUS_FR:
        return None
    reasons = (_pairs(output.get("dominant_reasons"), " : ") + _pairs(output.get("blocking_factors"), " : "))[:6]
    proof = [str(p) for p in (output.get("proof_needed") or []) if str(p).strip()]
    if not reasons:
        reasons = [_cut(p, 400) for p in proof[:1]]
    if not reasons:
        return None
    block: dict[str, Any] = {
        "type": "verdict",
        "conclusion": _cut(f"{_STATUS_FR[verdict]} — {output.get('verdict_label') or ''}".rstrip(" —"), 300),
        "reasons": reasons,
    }
    limits = _pairs(output.get("unknowns"), " — ")[:6]
    if limits:
        block["limits"] = limits
    if output.get("best_route"):
        block["route"] = _cut(output["best_route"], 300)
    if proof:
        block["next_action"] = {"label": _cut(proof[0], 120)}
    return validate_reply_block(block)


def reply_has_verdict_card(reply: str) -> bool:
    return any(s.kind == "block" and (s.block or {}).get("type") == "verdict" for s in split_reply_blocks(reply))


_WORD = re.compile(r"[\w’'-]{4,}", re.UNICODE)
#: Une ligne de prose n'est jugée répétée qu'au-delà de ce nombre de mots significatifs…
_MIN_REPEAT_WORDS = 5
#: …dont cette part se retrouve dans UNE seule ligne de la carte.
_REPEAT_SHARE = 0.7


def _words(text: str) -> set[str]:
    return {w.lower() for w in _WORD.findall(text)}


def _card_lines(block: Mapping[str, Any]) -> list[set[str]]:
    lines: list[str] = []
    for key in ("reasons", "limits"):
        lines += [str(v) for v in block.get(key) or []]
    for key in ("conclusion", "route"):
        if block.get(key):
            lines.append(str(block[key]))
    return [w for w in (_words(line) for line in lines) if w]


def _line_is_repeated_by_card(line: str, card_lines: list[set[str]]) -> bool:
    words = _words(line)
    return len(words) >= _MIN_REPEAT_WORDS and any(
        len(words & card) / len(words) >= _REPEAT_SHARE for card in card_lines
    )


def _drop_lines_repeated_by_card(text: str, card_lines: list[set[str]]) -> str:
    """Retire d'un texte les LIGNES dont l'essentiel est déjà dans la carte (#3395, « feuille de route
    2026-2029 » dite deux fois). Prudent : une ligne courte, ou qui n'est qu'en partie dans la carte, reste."""
    kept = [line for line in text.split("\n") if not _line_is_repeated_by_card(line, card_lines)]
    return "\n".join(kept)


def _drop_why_repeated_by_card(items: object, card_lines: list[set[str]]) -> tuple[list, bool]:
    """#3763.1 (recette prod 08/10) — la carte « Priorités du portefeuille » (``account_ranking``)
    redisait le « Pourquoi » déjà posé par la carte verdict pour le même compte. Même garde que la
    prose (``_drop_lines_repeated_by_card``), appliquée ligne à ligne au ``why`` de chaque ligne de
    classement — jamais vidée : le contrat veut au moins une raison par ligne (GA-26, pas de carte
    nue), donc une ligne SEULE qui duplique reste (mieux une répétition qu'une carte invalide)."""
    changed = False
    out: list = []
    for item in items if isinstance(items, list) else []:
        why = item.get("why") if isinstance(item, Mapping) else None
        if not isinstance(why, list) or len(why) <= 1:
            out.append(item)
            continue
        kept = [line for line in why if not _line_is_repeated_by_card(str(line), card_lines)]
        if not kept:
            kept = why[:1]
        if kept != why:
            item = {**item, "why": kept}
            changed = True
        out.append(item)
    return out, changed


def _status_of(block: Mapping[str, Any]) -> str:
    return str(block.get("conclusion") or "").split(" — ", 1)[0]


def with_verdict_card(reply: str, block: dict | None) -> str:
    """``reply`` + la carte si le modèle n'en a pas écrit une. Quand il en a écrit une : le statut
    TRADUIT y figure toujours (#3395, « Pas maintenant » non affiché) et la prose ne redit pas la carte."""
    if block is None:
        return reply
    if not reply_has_verdict_card(reply):
        fence = f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"
        return f"{reply.rstrip()}\n\n{fence}" if reply.strip() else fence
    segments = split_reply_blocks(reply)
    if any(seg.kind not in ("text", "block") for seg in segments):
        return reply
    status = _status_of(block)
    parts: list[str] = []
    changed = False
    card = next((seg.block for seg in segments if seg.kind == "block" and (seg.block or {}).get("type") == "verdict"), None)
    card_lines = _card_lines(card or {})
    for seg in segments:
        if seg.kind == "block":
            fixed = dict(seg.block or {})
            if fixed.get("type") == "verdict" and status and status.lower() not in str(fixed.get("conclusion") or "").lower():
                fixed["conclusion"] = _cut(f"{status} — {fixed.get('conclusion') or ''}".rstrip(" —"), 300)
                changed = True
            elif fixed.get("type") == "account_ranking" and fixed is not card:
                items, items_changed = _drop_why_repeated_by_card(fixed.get("items"), card_lines)
                if items_changed:
                    validated = validate_reply_block({**fixed, "items": items})
                    if validated is not None:
                        fixed = validated
                        changed = True
            parts.append(f"```{REPLY_BLOCK_FENCE}\n{json.dumps(fixed, ensure_ascii=False)}\n```")
        else:
            text = _drop_lines_repeated_by_card(seg.text, card_lines)
            if text != seg.text:
                changed = True
            if text.strip():
                parts.append(text.strip())
    return "\n\n".join(parts) if changed else reply
