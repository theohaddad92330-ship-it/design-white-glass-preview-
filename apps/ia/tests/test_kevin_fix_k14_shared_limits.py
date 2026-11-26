"""KEVIN-FIX K.14 (recette prod 20/10) — « Ce qui manque » IDENTIQUE sur les 3 comptes recommandés de Laura.

Une réserve que TOUS les comptes d'un classement portent à l'identique n'est pas calculée par compte : c'est
une réserve de la CARTE. Elle se dit UNE fois, sous la liste, et quitte les lignes (même discipline que la
garde de parité #3707.7). Ce qui diffère d'un compte à l'autre reste sur sa ligne.
"""

from __future__ import annotations

from app.models.reply_blocks import validate_reply_block

SHARED = "Coordonnées des décideurs non vérifiées"


def _ranking(*limits: list[str]) -> dict:
    return {
        "type": "account_ranking",
        "axes": ["Pertinence"],
        "items": [{"name": f"Compte {i}", "why": ["Raison"], "limits": lim} for i, lim in enumerate(limits)],
    }


def test_k14_une_reserve_identique_sur_tous_les_comptes_remonte_a_la_carte() -> None:
    block = validate_reply_block(_ranking([SHARED], [SHARED], [SHARED]))
    assert block is not None
    assert all("limits" not in item for item in block["items"])
    assert block["not_evaluated"] == [SHARED]


def test_k14_ce_qui_differe_par_compte_reste_sur_sa_ligne() -> None:
    block = validate_reply_block(_ranking([SHARED, "Siège non renseigné"], [SHARED], [SHARED, "Aucune analyse"]))
    assert block is not None
    assert [item.get("limits") for item in block["items"]] == [["Siège non renseigné"], None, ["Aucune analyse"]]
    assert block["not_evaluated"] == [SHARED]


def test_k14_sait_dire_non_une_reserve_portee_par_un_seul_compte_ne_bouge_pas() -> None:
    block = validate_reply_block(_ranking([SHARED], ["Autre"], []))
    assert block is not None
    assert block["items"][0]["limits"] == [SHARED]
    assert "not_evaluated" not in block


def test_k14_un_seul_compte_n_a_rien_a_partager() -> None:
    block = validate_reply_block(_ranking([SHARED]))
    assert block is not None
    assert block["items"][0]["limits"] == [SHARED]


def test_k14_la_reserve_deja_dite_sous_la_liste_n_est_pas_doublee() -> None:
    raw = _ranking([SHARED], [SHARED])
    raw["not_evaluated"] = [SHARED]
    block = validate_reply_block(raw)
    assert block is not None
    assert block["not_evaluated"] == [SHARED]
