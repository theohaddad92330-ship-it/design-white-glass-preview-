"""#3762 (BEL-LAU-1005) — le gabarit canonique d'une cartographie de comptes.

Le tour rejoué : « ouvre mon périmètre à Montpellier et périphérie » →
`run_account_search` rend de vrais comptes → Laura répond. La réponse DOIT être
la carte `account_map` (en-tête, cadrage, synthèse, grille de cartes, blocs
secondaires, actions), jamais des puces. Ce qu'on tient ici : la consigne
atteint le prompt réel, le squelette est forcé par le contrat (raison, prudence
et prochaine action sur CHAQUE carte), et la doctrine ne se relâche pas."""

from __future__ import annotations

import copy
import json

from app.models.reply_blocks import validate_reply_block
from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.reply_formats import REPLY_FORMATS_DIRECTIVE
from app.services.reply_blocks import reply_blocks_as_text, split_reply_blocks

USER_TURN = "ouvre mon périmètre à Montpellier et périphérie"

# Ce que `run_account_search` a rendu pour ce tour (deux comptes réels de l'espace).
TOOL_RESULT = [
    {"name": "Alpha Industrie", "id": "alpha-1", "signal": "Signal cyber daté de juillet 2026."},
    {"name": "Beta Services", "id": "beta-2", "signal": None},
]


def _reply(partial: bool = True) -> str:
    block = {
        "type": "account_map",
        "title": "Cartographie Montpellier et périphérie",
        "completeness": {"level": "partial" if partial else "complete", "label": "Partielle"},
        "context": [{"kind": "territory", "label": "Montpellier + périphérie"}],
        "framing": {
            "origin": "Comptes enregistrés dans l'espace sur le département 34.",
            "proves": "Ces entreprises existent et sont rattachées au territoire.",
            "not_proven": "Elle ne prouve ni un budget, ni un besoin ouvert.",
        },
        "summary": {
            "retained_count": len(TOOL_RESULT),
            "qualification": "Un compte prioritaire, un à qualifier",
            "main_reserve": "Aucun contact vérifié sur Beta Services.",
        },
        "accounts": [
            {
                "name": TOOL_RESULT[0]["name"],
                "href": f"/accounts/{TOOL_RESULT[0]['id']}",
                "status": {"level": "priority", "label": "Prioritaire"},
                "proof": TOOL_RESULT[0]["signal"],
                "tags": ["Industrie"],
                "caution": "Budget non confirmé.",
                "next_action": {"label": "Ouvrir la fiche", "href": f"/accounts/{TOOL_RESULT[0]['id']}"},
            },
            {
                "name": TOOL_RESULT[1]["name"],
                "status": {"level": "to_qualify", "label": "À qualifier"},
                "proof": "Présent dans le registre local.",
                "caution": "Aucun signal daté.",
                "next_action": {"label": "Chercher un premier contact"},
            },
        ],
        "to_document": ["Contacts décisionnaires de Beta Services."],
        "actions": {"validate": {"label": "Valider l'ouverture du périmètre"}},
    }
    return f"Voici ton périmètre.\n\n```bellum-block\n{json.dumps(block, ensure_ascii=False)}\n```"


def test_the_replayed_turn_renders_the_account_map_card() -> None:
    segments = split_reply_blocks(_reply())
    blocks = [s.block for s in segments if s.kind == "block"]
    assert [b["type"] for b in blocks] == ["account_map"], USER_TURN
    assert [a["name"] for a in blocks[0]["accounts"]] == [r["name"] for r in TOOL_RESULT]


def test_the_directive_reaches_the_real_prompt_and_names_the_trigger() -> None:
    assert "CARTOGRAPHIE DE COMPTES (#3762)" in REPLY_FORMATS_DIRECTIVE
    assert "CARTOGRAPHIE DE COMPTES (#3762)" in build_system_prompt({}, {}, "", "")
    assert "jamais une liste de puces" in REPLY_FORMATS_DIRECTIVE


def test_every_card_carries_reason_caution_and_next_action() -> None:
    block = json.loads(_reply().split("```bellum-block\n")[1].split("\n```")[0])
    for field in ("proof", "caution", "next_action"):
        broken = copy.deepcopy(block)
        del broken["accounts"][0][field]
        assert validate_reply_block(broken) is None, field


def test_the_framing_must_say_what_the_selection_does_not_prove() -> None:
    block = json.loads(_reply().split("```bellum-block\n")[1].split("\n```")[0])
    del block["framing"]["not_proven"]
    assert validate_reply_block(block) is None


def test_a_partial_selection_stays_a_card_and_zero_accounts_is_not_a_map() -> None:
    block = json.loads(_reply().split("```bellum-block\n")[1].split("\n```")[0])
    assert validate_reply_block(block) is not None
    block["accounts"] = []
    assert validate_reply_block(block) is None


def test_no_probability_and_completeness_is_a_level_never_a_percentage() -> None:
    block = json.loads(_reply().split("```bellum-block\n")[1].split("\n```")[0])
    block["framing"]["proves"] = "Une forte probabilité de signer."
    assert validate_reply_block(block) is None
    block["framing"]["proves"] = "ok"
    block["completeness"]["level"] = "72%"
    assert validate_reply_block(block) is None


def test_plain_text_keeps_the_skeleton_for_history_and_copy() -> None:
    text = reply_blocks_as_text(_reply())
    assert "Cartographie Montpellier et périphérie" in text
    assert "2 comptes · Un compte prioritaire, un à qualifier" in text
    assert "Elle ne prouve ni un budget, ni un besoin ouvert." in text
    assert "```" not in text
