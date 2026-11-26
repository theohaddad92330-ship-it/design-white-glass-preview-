"""#3769.3 (lot M06, recette prod 09/10, conv fa28d127) — « Ouvre mon périmètre
à Montpellier et périphérie » rendait, après ~100 s, du texte BRUT : des puces
« filter », « Occitanie », « Recherche territoriale interrompue… » et le
bandeau « Refaire en carte ».

Cause : ces puces sont les FEUILLES d'une carte `account_map` que le modèle a
écrite lui-même (puces de contexte `{"kind": "filter", "label": "Occitanie"}`)
alors que la recherche n'avait rendu aucun compte — carte refusée par le
contrat (une grille vide n'existe pas), puis aplatie en puces par
`normalize_reply_blocks`. La porte de forme ne regardait que les cartes
VALIDES : une carte refusée de la famille attendue passait telle quelle.

Désormais, une carte REFUSÉE de la famille demandée ne part jamais en puces :
elle est retirée, puis remplacée par la carte que l'outil a réellement rendue,
ou — sans lecture — par une absence NOMMÉE (`missing_data`) qui ne prétend
pas « aucun résultat » (on ne le sait pas).
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes
from app.services.reply_blocks import REPLY_BLOCK_FENCE, normalize_reply_blocks, split_reply_blocks

MESSAGE = "Ouvre mon périmètre à Montpellier et périphérie"

_REFUSED_MAP = {
    "type": "account_map",
    "title": "Périmètre Montpellier",
    "context": [{"kind": "filter", "label": "Occitanie"}],
    "framing": {
        "origin": "Recherche territoriale interrompue avant la fin.",
        "proves": "rien",
        "not_proven": "tout",
    },
    "summary": {"retained_count": 0, "qualification": "aucun"},
}


def _reply(block: dict) -> str:
    return f"Voici ton périmètre.\n\n```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"


def _kinds(reply: str) -> list[str]:
    return [s.kind if s.kind != "block" else s.block["type"] for s in split_reply_blocks(reply)]


def test_a_refused_map_without_any_read_becomes_a_named_absence_never_bullets() -> None:
    routed = route_known_shapes(_reply(_REFUSED_MAP), [], user_message=MESSAGE)
    assert "invalid" not in _kinds(routed)
    assert "missing_data" in _kinds(routed)
    final = normalize_reply_blocks(routed)
    assert "- filter" not in final
    assert "Voici ton périmètre." in final


def test_the_absence_never_claims_the_search_found_nothing() -> None:
    routed = route_known_shapes(_reply(_REFUSED_MAP), [], user_message=MESSAGE)
    assert "sans aucun résultat" not in routed


def test_a_refused_map_with_a_real_read_is_replaced_by_the_tool_card() -> None:
    action = {
        "shape_read": {
            "tool": "run_account_search",
            "count": 1,
            "what": "Comptes",
            "blocks": {
                "account_map": {
                    "type": "account_map",
                    "coverage": "Siège dans l'Hérault (34).",
                    "groups": [{"label": "Hérault (34)", "items": [{"name": "ACME"}]}],
                }
            },
        }
    }
    routed = route_known_shapes(_reply(_REFUSED_MAP), [action], user_message=MESSAGE)
    assert _kinds(routed).count("invalid") == 0
    assert "Hérault (34)" in routed
    assert "Recherche territoriale interrompue" not in routed


def test_a_refused_card_of_another_family_is_left_to_the_existing_fallback() -> None:
    other = {"type": "file_export", "filename": "x.csv", "columns": [f"c{i}" for i in range(9)], "rows": []}
    reply = _reply(other)
    assert route_known_shapes(reply, [], user_message=MESSAGE) == reply


def test_without_a_known_family_nothing_changes() -> None:
    reply = _reply(_REFUSED_MAP)
    assert route_known_shapes(reply, [], user_message="bonjour") == reply
