"""#3857 (lot RBJ) — des fiches HOMONYMES deviennent des boutons nommés.

Recette prod 11/10 : « ouvre la fiche Société Générale » alors que deux fiches portent ce nom →
« Laquelle veux-tu ouvrir ? » sans bouton ni nom. Les boutons n'existent que si le modèle appelle
`offer_reply_options`, et il l'oublie ; l'orchestrateur les construit donc LUI-MÊME depuis les fiches
candidates que `search_workspace_accounts` vient de rendre.

Ce que cette fonction refuse (elle sait dire NON) :
 - moins de deux fiches de même nom : ce n'est pas une homonymie ;
 - deux fiches que RIEN de réel ne distingue (même secteur, même responsable, même date d'analyse) :
   aucun bouton, jamais une option inventée — on n'affiche pas ce qu'on n'a pas ;
 - plus de `OPTIONS_MAX` fiches : on garde les premières, le plafond est celui du fil (GA-26).
Un identifiant n'est JAMAIS montré : il reste sur l'objet de fil (`ThreadObject.id`)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.services.chat_thread_state import OPTION_MAX, OPTIONS_MAX, ThreadObject, _fold

_SEPARATOR = " — "


@dataclass(frozen=True)
class HomonymOffer:
    options: list[str]
    objects: list[ThreadObject]


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _analysis_date(value: Any) -> str:
    """JJ/MM/AAAA, ou rien : une date illisible n'est pas devinée."""
    raw = _text(value)
    if not raw:
        return ""
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except ValueError:
        return ""


def _qualifiers(row: dict[str, Any], depth: int) -> list[str]:
    """Du plus parlant au plus fin : secteur, puis responsable, puis dernière analyse."""
    parts = [
        _text(row.get("sector")),
        _text(row.get("owner")),
        _analysis_date(row.get("last_analyzed_at")),
    ]
    named = [part for part in parts[:depth]]
    return [part for part in named if part]


def _label(name: str, row: dict[str, Any], depth: int) -> str:
    qualifiers = _qualifiers(row, depth)
    if row.get("inactive") is True:
        qualifiers.append("archivée")
    label = _SEPARATOR.join([name, *qualifiers]) if qualifiers else name
    return label[:OPTION_MAX]


def homonym_account_options(query: str, accounts: Any) -> HomonymOffer | None:
    folded_query = _fold(query.strip())
    if not folded_query or not isinstance(accounts, list):
        return None
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in accounts:
        if not isinstance(row, dict) or not _text(row.get("account_id")) or not _text(row.get("company_name")):
            continue
        folded = _fold(_text(row["company_name"]))
        if folded_query in folded or folded in folded_query:
            groups.setdefault(folded, []).append(row)
    homonyms = next((rows for rows in groups.values() if len(rows) >= 2), None)
    if homonyms is None:
        return None
    homonyms = homonyms[:OPTIONS_MAX]
    name = _text(homonyms[0]["company_name"])
    for depth in (1, 2, 3):
        labels = [_label(name, row, depth) for row in homonyms]
        if len(set(labels)) == len(labels) and all(label != name for label in labels):
            return HomonymOffer(
                options=labels,
                objects=[
                    ThreadObject(kind="account", id=_text(row["account_id"]), label=label)
                    for row, label in zip(homonyms, labels, strict=True)
                ],
            )
    return None


def homonym_question(name: str, language: str | None) -> str:
    if (language or "").lower().startswith("en"):
        return f"Which {name} profile do you mean?"
    return f"Quelle fiche {name} veux-tu ouvrir ?"
