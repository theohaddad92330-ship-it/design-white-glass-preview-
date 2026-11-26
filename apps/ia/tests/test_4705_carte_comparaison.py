"""#4705.2 — la carte de comparaison se bâtit du résultat de `compare_accounts`, jamais du seul modèle."""

from __future__ import annotations

import json

from app.services.compare_card_tool import comparison_block_from_output
from app.services.known_shape_gate import route_known_shapes
from app.services.reply_blocks import split_reply_blocks

LONG = "Contrat-cadre IT renouvelé le 12/03/2026 (source : communiqué de presse, page investisseurs, " + "x" * 220


def _account(name: str, **over):
    base = {
        "company": name,
        "adjusted_score": 8.5,
        "relation": None,
        "recommendation": "GO",
        "estimated_cycle": "3-6 mois",
        "questions": {
            "pourquoi": f"Pourquoi {name}",
            "moment": "Appel d'offres ouvert",
            "perimetre": "Groupe",
            "personne": "Jeanne Martin, DSI",
            "preuve": LONG,
            "prochaine_action": "Appeler la DSI",
        },
    }
    return {**base, **over}


OUTPUT = {
    "comparison": [
        _account("Servier"),
        _account("Sanofi", relation="client"),
        _account("Thales", questions={"pourquoi": "Fit offre"}),
    ],
    "priority_order": ["Servier", "Sanofi", "Thales"],
    "weekly_time_allocation": {"Servier": "40%", "Sanofi": "35%", "Thales": "25%"},
    "reasoning": "Servier d'abord.",
}


def _cards(reply: str):
    return [s.block for s in split_reply_blocks(reply) if s.kind == "block" and s.block]


def test_la_carte_porte_un_compte_par_colonne_et_les_six_questions():
    block = comparison_block_from_output(OUTPUT)
    assert block and block["type"] == "comparison"
    assert block["columns"] == ["Servier", "Sanofi", "Thales"]
    labels = [r["label"] for r in block["rows"]]
    assert "Preuve" in labels and "Prochaine action" in labels and "Relation" in labels
    preuve = next(r for r in block["rows"] if r["label"] == "Preuve")
    assert all(len(c) <= 200 for c in preuve["cells"][:1]) and preuve["cells"][0].endswith("…")


def test_une_reponse_manquante_reste_vide_jamais_comblee():
    block = comparison_block_from_output(OUTPUT)
    moment = next(r for r in block["rows"] if r["label"] == "Moment")
    assert moment["cells"] == ["Appel d'offres ouvert", "Appel d'offres ouvert", None]


def test_ni_pourcentage_ni_score_ni_probabilite():
    dump = json.dumps(comparison_block_from_output(OUTPUT), ensure_ascii=False)
    assert "%" not in dump and "8.5" not in dump


def test_sait_dire_non():
    assert comparison_block_from_output({"error": "boom"}) is None
    assert comparison_block_from_output({"comparison": []}) is None
    assert comparison_block_from_output({"comparison": [_account("Seul")]}) is None
    assert comparison_block_from_output("pas un dict") is None


def test_plus_de_quatre_comptes_les_suivants_se_nomment():
    out = {"comparison": [_account(n) for n in "ABCDE"]}
    block = comparison_block_from_output(out)
    assert block["columns"] == ["A", "B", "C", "D"] and "E" in block["note"]


def test_la_porte_pose_la_carte_quand_le_modele_n_en_a_pas_valide_une():
    block = comparison_block_from_output(OUTPUT)
    refused = {"type": "comparison", "columns": ["A", "B"], "rows": [{"label": "x", "cells": ["z" * 400, "y"]}]}
    reply = f"Voici.\n\n```bellum-block\n{json.dumps(refused)}\n```"
    routed = route_known_shapes(
        reply,
        [{"tool": "compare_accounts", "comparison_block": dict(block)}],
        user_message="Compare Servier, Sanofi et Thales",
    )
    cards = _cards(routed)
    assert [c["type"] for c in cards] == ["comparison"] and cards[0]["columns"] == ["Servier", "Sanofi", "Thales"]
    assert "Carte non construite" not in routed


def test_la_porte_ne_double_pas_une_comparaison_valide_du_modele():
    mine = {"type": "comparison", "columns": ["A", "B"], "rows": [{"label": "x", "cells": ["1", "2"]}]}
    reply = f"```bellum-block\n{json.dumps(mine)}\n```"
    routed = route_known_shapes(
        reply,
        [{"tool": "compare_accounts", "comparison_block": comparison_block_from_output(OUTPUT)}],
        user_message="Compare A et B",
    )
    assert [c["columns"] for c in _cards(routed)] == [["A", "B"]]
