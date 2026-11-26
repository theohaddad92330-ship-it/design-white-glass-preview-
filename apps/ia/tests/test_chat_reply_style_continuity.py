"""#3769 (BEL-LAU-1015) — une conversation garde sa forme : le tour est rejoué
(historique avec une carte → raffinement → prompt système)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.prompts.reply_style_continuity import derive_reply_style, reply_style_block
from app.prompts.thread_state import THREAD_STATE_HEADER
from tests.test_chat_thread_state_turn import _FIXTURE, _post

_RANKING = {
    "type": "account_ranking",
    "axes": ["Besoin identifié"],
    "items": [
        {
            "name": "Acme Industrie",
            "why": ["Besoin cyber identifié"],
            "action": {"label": "Ouvrir les contacts du premier compte", "href": "/accounts"},
        }
    ],
}

# #3769.4b — un classement dont une ligne porte un badge du vocabulaire fermé
# (`RankedAccount.level`, miroir de `reply-badges.ts`).
_RANKING_WITH_BADGE = {
    "type": "account_ranking",
    "axes": ["Besoin identifié"],
    "items": [
        {
            "name": "Acme Industrie",
            "why": ["Besoin cyber identifié"],
            "level": "priority",
        }
    ],
}

# Une cartographie en grille (#3762) : badge de statut par compte + complétude.
_MAP_WITH_BADGES = {
    "type": "account_map",
    "title": "Cartographie des comptes",
    "completeness": {"level": "partial", "label": "Partielle"},
    "context": [{"kind": "territory", "label": "Occitanie"}],
    "framing": {
        "origin": "Registre public des entreprises",
        "proves": "Les comptes identifiés sur la zone",
        "not_proven": "Le besoin actuel de chaque compte",
    },
    "summary": {"retained_count": 1, "qualification": "À qualifier"},
    "accounts": [
        {
            "name": "Acme Industrie",
            "status": {"level": "to_qualify", "label": "À qualifier"},
            "proof": "Besoin cyber identifié",
            "caution": "Non vérifié sur le terrain",
            "next_action": {"label": "Qualifier", "href": "/accounts"},
        }
    ],
}


def _card(block: dict, prose: str = "") -> str:
    fenced = "```bellum-block\n" + json.dumps(block, ensure_ascii=False) + "\n```"
    return f"{fenced}\n\n{prose}".strip()


def _history(content: str) -> list[dict]:
    return [
        {"role": "user", "content": "Cartographie les comptes du 34"},
        {"role": "assistant", "content": content},
    ]


def test_no_card_in_history_gives_nothing() -> None:
    assert reply_style_block([]) == ""
    assert reply_style_block(_history("Voici une réponse en paragraphes.")) == ""


def test_a_card_reply_sets_the_family_density_and_actions() -> None:
    style = derive_reply_style(_history(_card(_RANKING, "Tu veux affiner ?")))
    assert style.family == "account_ranking"
    assert style.cards_in_last_reply == 1
    assert style.last_reply_has_prose is True
    assert style.actions_proposed == ("Ouvrir les contacts du premier compte",)
    assert style.badges_used == ()


def test_a_ranking_badge_is_tracked_as_already_used() -> None:
    # #3769.4b — le badge de ligne (`RankedAccount.level`) entre dans la continuité.
    style = derive_reply_style(_history(_card(_RANKING_WITH_BADGE)))
    assert style.badges_used == ("priority",)


def test_an_account_map_badge_and_completeness_are_tracked() -> None:
    style = derive_reply_style(_history(_card(_MAP_WITH_BADGES)))
    assert set(style.badges_used) == {"to_qualify", "partial"}


def test_the_block_names_badges_already_used() -> None:
    block = reply_style_block(_history(_card(_RANKING_WITH_BADGE)))
    assert "« priority »" in block
    assert "vocabulaire fermé" in block


def test_the_block_tells_a_refinement_to_stay_in_the_form_without_hiding_an_absence() -> None:
    block = reply_style_block(_history(_card(_RANKING)))
    assert "account_ranking" in block
    assert "sans texte autour" in block
    assert "jamais un retour au texte brut" in block
    assert "ne maquille jamais une absence" in block
    assert "probabilité" not in block.lower()


def test_user_turns_and_invalid_cards_are_ignored() -> None:
    history = [
        {"role": "user", "content": _card(_RANKING)},
        {"role": "assistant", "content": "```bellum-block\n{oops}\n```"},
    ]
    assert reply_style_block(history) == ""


def test_the_replayed_turn_carries_the_style_before_the_thread_state(client: TestClient) -> None:
    captured, terminal = _post(
        client, {"history": _history(_card(_RANKING)), "thread_state": _FIXTURE, "message": "Seulement en Occitanie"}
    )
    system = captured["system"]
    assert "CE FIL A DÉJÀ UNE FORME" in system
    assert system.index("CE FIL A DÉJÀ UNE FORME") < system.index(THREAD_STATE_HEADER)
    assert terminal["success"] is True


def test_without_a_card_the_prompt_is_unchanged(client: TestClient) -> None:
    captured, _terminal = _post(client, {"history": _history("Texte simple.")})
    assert "CE FIL A DÉJÀ UNE FORME" not in captured["system"]


# #3769.1 / #3769.4 (recette prod R47) — « Cartographie… » rend des cartes au tour 1 (prochaine action
# ×6) ; « seulement ceux qui ont un appel d'offres » retombait en puces plates, sans prochaine action.
_SIX_ACCOUNT_MAP = {
    **_MAP_WITH_BADGES,
    "accounts": [
        {
            "name": f"Compte {i}",
            "status": {"level": "to_qualify", "label": "À qualifier"},
            "proof": "Besoin cyber identifié",
            "caution": "Non vérifié sur le terrain",
            "next_action": {"label": f"Appeler le compte {i}"},
        }
        for i in range(1, 7)
    ],
}


def test_the_next_actions_of_a_map_grid_are_tracked_account_by_account() -> None:
    style = derive_reply_style(_history(_card(_SIX_ACCOUNT_MAP)))
    assert "Appeler le compte 6" in style.actions_proposed


def test_a_refinement_of_a_map_stays_a_map_with_one_next_action_per_account() -> None:
    block = reply_style_block(_history(_card(_SIX_ACCOUNT_MAP)))
    assert "account_map" in block
    assert "next_action" in block
    assert "propre à chaque compte" in block
    assert "jamais une liste de puces" in block


def test_the_map_rule_is_absent_for_other_families() -> None:
    block = reply_style_block(_history(_card(_RANKING)))
    assert "next_action" not in block


def test_a_filter_refinement_applies_to_the_previous_result_never_to_a_refusal() -> None:
    # #3769.1 / #3769.4 (18/10) — « Garde seulement ceux qui recrutent » filtre la carte précédente.
    block = reply_style_block(_history(_card(_SIX_ACCOUNT_MAP)))
    assert "filtre du résultat précédent" in block
    assert "JAMAIS « je n'ai pas pu appliquer le filtre »" in block
    assert "Prochaine action" in block
    assert "filtre du résultat précédent" not in reply_style_block(_history(_card(_RANKING)))
