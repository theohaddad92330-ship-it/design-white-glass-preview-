"""#4705.2 — la carte de comparaison se bâtit du résultat de `compare_accounts`, jamais du seul modèle.

Recette prod 28/10 (« Compare Servier, Sanofi et Thales ») : l'outil rendait les six questions par compte, aucun
code ne les mettait en carte ; la `comparison` écrite par le modèle dépassait le plafond d'une case (200 car.),
le contrat la refusait et la porte de forme posait « Carte non construite ». Ici : colonnes = comptes (4 au plus,
les suivants se NOMMENT), lignes = relation, six questions, recommandation. Une réponse absente reste une case
VIDE (jamais comblée, jamais « 0 »). Ni pourcentage d'allocation, ni score, ni probabilité n'entrent dans la carte.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.models.reply_blocks import validate_reply_block

COMPARE_ACCOUNTS_TOOL_NAME = "compare_accounts"

_COLUMNS_MAX = 4
_CELL_MAX = 200
_NOTE_MAX = 300

_ROWS = (
    ("relation", "relation"),
    ("pourquoi", "why"),
    ("moment", "when"),
    ("perimetre", "scope"),
    ("personne", "person"),
    ("preuve", "proof"),
    ("prochaine_action", "next"),
)

_LABELS = {
    "fr": {
        "relation": "Relation",
        "why": "Pourquoi",
        "when": "Moment",
        "scope": "Périmètre",
        "person": "Personne",
        "proof": "Preuve",
        "next": "Prochaine action",
        "recommendation": "Recommandation",
        "title": "Comparaison de comptes",
        "others": "Non affichés (quatre colonnes au plus) : {names}.",
    },
    "en": {
        "relation": "Relationship",
        "why": "Why",
        "when": "Timing",
        "scope": "Scope",
        "person": "Person",
        "proof": "Evidence",
        "next": "Next action",
        "recommendation": "Recommendation",
        "title": "Account comparison",
        "others": "Not shown (four columns at most): {names}.",
    },
}


def _cell(value: object) -> str | None:
    """Le texte lu, coupé à la case (mot entier + « … ») ; vide ⇒ ``None``."""
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
    if not text:
        return None
    if len(text) <= _CELL_MAX:
        return text
    return text[: _CELL_MAX - 1].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"


def comparison_block_from_output(output: object, *, language: str | None = None) -> dict | None:
    """La carte `comparison` du SEUL résultat de l'outil. ``None`` : erreur, moins de deux comptes, rien à montrer."""
    if not isinstance(output, Mapping) or output.get("error"):
        return None
    labels = _LABELS["en" if (language or "").lower().startswith("en") else "fr"]
    accounts = [
        a for a in output.get("comparison") or [] if isinstance(a, Mapping) and str(a.get("company") or "").strip()
    ]
    if len(accounts) < 2:
        return None
    shown, hidden = accounts[:_COLUMNS_MAX], accounts[_COLUMNS_MAX:]
    rows: list[dict[str, Any]] = []
    for key, label in _ROWS:
        if key == "relation":
            cells = [_cell(a.get("relation")) for a in shown]
        else:
            cells = [
                _cell((a.get("questions") or {}).get(key) if isinstance(a.get("questions"), Mapping) else None)
                for a in shown
            ]
        if any(cells):
            rows.append({"label": labels[label], "cells": cells})
    recommendations = [_cell(a.get("recommendation")) for a in shown]
    if any(recommendations):
        rows.append({"label": labels["recommendation"], "cells": recommendations})
    if not rows:
        return None
    block: dict[str, Any] = {
        "type": "comparison",
        "title": labels["title"],
        "columns": [str(a["company"]).strip()[:80] for a in shown],
        "rows": rows,
    }
    if hidden:
        names = ", ".join(str(a["company"]).strip() for a in hidden)
        block["note"] = labels["others"].format(names=names)[:_NOTE_MAX]
    try:
        return validate_reply_block(block)
    except ValueError:
        return None
