"""#3762 Reste (lot K06 07/10) — LA GRILLE (``accounts``) N'EST JAMAIS FABRIQUÉE PAR LA PORTE DE FORME.

Le brief demandait de livrer la lecture en GRILLE de la carte « Cartographie » si elle se dérive des items
de l'outil, sans inventer de preuve, de prudence ni de prochaine action par carte — sinon de nommer ce qui
manque (voir le docblock de ``known_shape_gate._search_map``).

Ce test le PROUVE plutôt que de l'affirmer : même avec un tour d'horizon RICHE (score, qualification,
hypothèse de doublon — tout ce que ``run_account_search`` peut rendre), la porte ne produit TOUJOURS que la
lecture en groupes. Une prudence (``limits``) existe pour certains comptes mais pas tous, et AUCUN champ de
l'outil ne porte une prochaine action par compte — la grille resterait donc incomplète ou inventée sur au
moins un compte, ce que la doctrine refuse.
"""

from __future__ import annotations

from app.services.known_shape_gate import shape_read_from_tool


def _rich_output() -> dict:
    return {
        "axes": ["Score du registre"],
        "items": [
            {
                "name": "Banque Alpha",
                "account_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "activity": "Intermédiation monétaire",
                "city": "Montpellier",
                "headcount": 120,
                # Une « raison » RÉELLE : un score + ses facteurs.
                "why": ["Effectif compatible — 120 salariés"],
                "verdict": "À qualifier",
                # Une « prudence » RÉELLE, mais SEULE Banque Alpha la porte.
                "limits": ["Nom proche d'un autre candidat du registre — hypothèse de doublon non tranchée."],
            },
            {
                "name": "Banque Beta",
                "activity": "Intermédiation monétaire",
                "city": "Montpellier",
                "headcount": 80,
                # RIEN d'autre : ni score, ni qualification, ni doublon. Une
                # grille devrait pourtant lui inventer une prudence ET une
                # prochaine action pour être valide (contrat : les deux
                # obligatoires sur CHAQUE carte).
            },
        ],
    }


def test_even_a_rich_search_only_derives_groups_never_a_fabricated_grid() -> None:
    read = shape_read_from_tool("run_account_search", _rich_output(), language="fr")
    assert read is not None
    blocks = read["blocks"]

    # La lecture en groupes sort, et seule elle.
    assert "account_map" in blocks
    card = blocks["account_map"]
    assert card["groups"], "la porte dérive bien une cartographie de ces items"
    assert "accounts" not in card or card["accounts"] is None

    # Aucune prudence, aucune prochaine action n'a fui dans la carte : rien
    # n'est recopié depuis `why`/`verdict`/`limits`, et rien n'est inventé
    # pour Banque Beta, qui n'en rend aucun.
    serialized = str(card)
    assert "caution" not in serialized
    assert "next_action" not in serialized
    assert "hypothèse de doublon" not in serialized

    # Banque Alpha est bien dans un groupe (la cartographie se dérive) —
    # seule sa prudence RÉELLE (`limits`) n'est reprise nulle part : elle
    # exigerait une grille, et une grille exigerait aussi une prochaine
    # action que l'outil ne rend pour AUCUN des deux comptes.
    names_in_groups = [item["name"] for group in card["groups"] for item in group["items"]]
    assert names_in_groups == ["Banque Alpha", "Banque Beta"]


def test_an_account_search_with_no_items_produces_no_map_reading() -> None:
    read = shape_read_from_tool("run_account_search", {"axes": ["Score"], "items": []}, language="fr")
    assert read is not None
    assert "account_map" not in read["blocks"]
