"""Retour bêta 30/09 (#3428) — volume de comptes demandé et capacité réelle.

Demande initiale : « Trouve-moi 100 grands comptes à prospecter », ESN d'un
seul commercial. Laura rendait la liste brute des 100 — une liste morte pour
un seul vendeur. Portée par `_BLOCK_ACCOUNT_VOLUME_SPRINT` dans
`build_system_prompt`."""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_ACCOUNT_VOLUME_SPRINT,
    build_system_prompt,
)


def test_never_a_bare_dump_of_the_requested_count():
    """#3428.0 — jamais la seule liste brute."""
    assert "tu ne rends JAMAIS la seule liste brute" in _BLOCK_ACCOUNT_VOLUME_SPRINT


def test_two_named_outputs():
    """#3428.1 — deux sorties nommées : liste complète et sprint exécutable."""
    block = _BLOCK_ACCOUNT_VOLUME_SPRINT
    assert "LA LISTE COMPLÈTE" in block
    assert "LE SPRINT EXÉCUTABLE" in block
    assert "dimensionné à la capacité réelle" in block


def test_priority_accounts_name_why_now_entry_door_and_first_move():
    """#3428.2 — pourquoi maintenant, porte d'entrée, premier mouvement, par compte."""
    block = _BLOCK_ACCOUNT_VOLUME_SPRINT
    for element in ("POURQUOI MAINTENANT", "PAR QUELLE PORTE ENTRER", "LE PREMIER MOUVEMENT"):
        assert element in block, f"élément absent : {element!r}"


def test_starts_with_the_sprint_not_the_full_list():
    """#3428.3 — propose de commencer par le sprint, liste complète jamais imposée en premier."""
    assert "tu proposes de COMMENCER par le sprint" in _BLOCK_ACCOUNT_VOLUME_SPRINT


def test_names_the_three_forbidden_reflexes():
    """#3428.4 — les trois réflexes que ce bloc interdit explicitement."""
    block = _BLOCK_ACCOUNT_VOLUME_SPRINT
    for reflex in (
        "rendre un dump de comptes sans ordre d'action",
        "ignorer la capacité réelle de qui prospecte",
        "fabriquer une porte d'entrée non vérifiée pour remplir les trois comptes prioritaires",
    ):
        assert reflex in block, f"réflexe absent : {reflex!r}"


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "VOLUME DE COMPTES DEMANDÉ ET CAPACITÉ RÉELLE" in prompt


def test_the_sprint_is_forced_into_the_account_volume_sprint_card():
    """#3392 / #3428 (reste, recette prod 30/09) — MÊME défaut que #3340 : le
    bloc demandait déjà les trois champs en PROSE, rien ne forçait leur
    présence dans la réponse. Le correctif nomme la carte qui les force."""
    block = _BLOCK_ACCOUNT_VOLUME_SPRINT
    assert "account_volume_sprint" in block
    for field in ("full_list_count", "sprint", "focus"):
        assert field in block, f"champ absent du bloc : {field!r}"
    assert "OBLIGATOIRES" in block


# ── Lot Q02 (30/09) — recette prod : la carte REFUSÉE retombait en liste plate ──
#
# Recette écran prod (f599483eb3) sur #3392/#3428 : « 8 comptes, 3 puces, une
# seule taille, sans carte ». Un bloc refusé par le contrat redevient ses
# feuilles en puces (`StructuredReply.tsx`, cas `invalid`) — exactement cette
# liste plate. Un écart MINEUR du modèle (dixième compte en trop, texte trop
# long, lien hors application, nom de compte en simple chaîne) ne doit plus
# faire tomber TOUTE la carte ; ce qui ne se répare pas sans inventer (un champ
# du focus manquant) est écarté, jamais deviné.
import json

from app.services.reply_blocks import normalize_reply_blocks, split_reply_blocks, validate_reply_block


def _focus(name: str, **overrides) -> dict:
    item = {
        "name": name,
        "why_now": "Un appel d'offres data vient d'être publié.",
        "entry_point": "La direction des systèmes d'information, contact vérifié.",
        "first_move": "Appeler le DSI cette semaine.",
    }
    item.update(overrides)
    return item


def _sprint_block(**overrides) -> dict:
    block = {
        "type": "account_volume_sprint",
        "full_list_count": 100,
        "sprint": [{"name": f"Compte {i}"} for i in range(8)],
        "focus": [_focus("Compte 0"), _focus("Compte 1"), _focus("Compte 2")],
    }
    block.update(overrides)
    return block


def test_a_clean_card_is_untouched():
    block = validate_reply_block(_sprint_block())
    assert block is not None
    assert len(block["sprint"]) == 8 and len(block["focus"]) == 3


def test_more_than_ten_sprint_accounts_keeps_the_ten_first_instead_of_refusing_the_card():
    block = validate_reply_block(_sprint_block(sprint=[{"name": f"Compte {i}"} for i in range(14)]))
    assert block is not None
    assert [a["name"] for a in block["sprint"]] == [f"Compte {i}" for i in range(10)]


def test_more_than_three_focus_accounts_keeps_the_three_first():
    block = validate_reply_block(_sprint_block(focus=[_focus(f"Compte {i}") for i in range(5)]))
    assert block is not None
    assert [a["name"] for a in block["focus"]] == ["Compte 0", "Compte 1", "Compte 2"]


def test_sprint_accounts_given_as_plain_names_are_read():
    block = validate_reply_block(_sprint_block(sprint=["Sopra Steria", "Enedis"]))
    assert block is not None
    assert [a["name"] for a in block["sprint"]] == ["Sopra Steria", "Enedis"]


def test_a_link_outside_the_app_is_dropped_not_the_card():
    block = validate_reply_block(_sprint_block(sprint=[{"name": "Enedis", "href": "https://enedis.fr"}]))
    assert block is not None
    assert "href" not in block["sprint"][0]


def test_an_overlong_field_is_shortened_not_refused():
    block = validate_reply_block(_sprint_block(focus=[_focus("Compte 0", why_now="x" * 700)]))
    assert block is not None
    assert len(block["focus"][0]["why_now"]) == 400
    assert block["focus"][0]["why_now"].endswith("…")


def test_a_focus_account_without_a_verified_door_is_dropped_never_invented():
    """Doctrine : « un compte sans porte d'entrée vérifiée n'entre pas dans focus »."""
    focus = [_focus("Compte 0"), _focus("Compte 1", entry_point=""), {"name": "Compte 2"}]
    block = validate_reply_block(_sprint_block(focus=focus))
    assert block is not None
    assert [a["name"] for a in block["focus"]] == ["Compte 0"]


def test_no_verified_door_at_all_gives_an_empty_focus_the_screen_names():
    block = validate_reply_block(_sprint_block(focus=[{"name": "Compte 0"}]))
    assert block is not None
    assert block["focus"] == []


def test_a_card_with_no_count_stays_refused_the_count_is_never_guessed():
    block = _sprint_block()
    del block["full_list_count"]
    assert validate_reply_block(block) is None


def test_a_card_with_no_sprint_account_stays_refused():
    assert validate_reply_block(_sprint_block(sprint=[])) is None


def test_the_replayed_turn_ends_as_a_card_not_as_flat_bullets():
    """Le tour rejoué : la réponse du modèle (carte légèrement hors contrat)
    traverse `normalize_reply_blocks` — l'étape que le chat appelle avant de
    persister — et ressort en CARTE, plus en puces."""
    raw = "Je peux te sortir les 100. Je commencerais par le sprint.\n\n```bellum-block\n" + json.dumps(
        _sprint_block(sprint=[{"name": f"Compte {i}", "href": "https://x.example"} for i in range(12)]),
        ensure_ascii=False,
    ) + "\n```"
    kinds = [segment.kind for segment in split_reply_blocks(normalize_reply_blocks(raw))]
    assert kinds == ["text", "block"]
