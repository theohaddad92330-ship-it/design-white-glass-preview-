"""#3226 (#3202.6, X13) — la CAPACITÉ DE DELIVERY de l'espace est LUE par le plan.

La donnée (consultants sans affectation en cours) existait côté API
(`DeliveryService.intercontractCount`) mais aucun contrat ne la transmettait à
l'IA. Ces tests rejouent : pont → bloc → prompt du plan.
"""

from pathlib import Path

import pytest

from app.services import bellum_api
from app.services.delivery_capacity import delivery_capacity_block

ROOT = Path(__file__).parent.parent


def test_une_capacite_mesuree_s_ecrit_comme_un_fait_sans_promesse():
    block = delivery_capacity_block({"intercontractCount": 3}, "Acme")
    assert "CAPACITÉ DE DELIVERY" in block
    assert "Acme" in block
    assert "3 consultant" in block
    assert "ne promets" in block.lower()


def test_zero_mesure_n_est_pas_une_mesure_absente():
    block = delivery_capacity_block({"intercontractCount": 0}, "Acme")
    assert "aucun consultant" in block.lower()


@pytest.mark.parametrize(
    "capacity", [None, {}, {"error": "x"}, {"intercontractCount": None}, {"intercontractCount": "3"}]
)
def test_non_mesure_ne_fait_aucune_ligne(capacity):
    assert delivery_capacity_block(capacity, "Acme") == ""


def test_un_nombre_negatif_ou_bool_n_est_pas_une_mesure():
    assert delivery_capacity_block({"intercontractCount": -1}, "Acme") == ""
    assert delivery_capacity_block({"intercontractCount": True}, "Acme") == ""


def test_aucune_probabilite_dans_le_bloc():
    for n in (0, 1, 7):
        assert "%" not in delivery_capacity_block({"intercontractCount": n}, "Acme")


@pytest.mark.asyncio
async def test_le_pont_appelle_la_route_interne(monkeypatch):
    seen = {}

    async def fake_post(path, payload, **_):
        seen["path"], seen["payload"] = path, payload
        return {"intercontractCount": 2}

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    assert await bellum_api.delivery_capacity("u1") == {"intercontractCount": 2}
    assert seen == {"path": "/internal/copilot/delivery/capacity", "payload": {"userId": "u1"}}


def test_garde_d_appelant_le_plan_lit_la_capacite():
    source = (ROOT / "app" / "routers" / "phase4_plan.py").read_text(encoding="utf-8")
    assert "delivery_capacity_block(" in source
    assert "bellum_api.delivery_capacity(" in source


# #3226 (#3202.6, X50) — le croisement par ARCHÉTYPE de la cible : la capacité
# n'a le même usage ni pour un client final ni pour un partenaire possible.
def test_cible_partenaire_la_capacite_mesuree_peut_nourrir_une_co_traitance():
    block = delivery_capacity_block({"intercontractCount": 3}, "Acme", partnership_candidate=True)
    assert "co-traitance" in block
    assert "jamais promise" in block


def test_cible_partenaire_sans_capacite_ne_propose_aucun_renfort():
    block = delivery_capacity_block({"intercontractCount": 0}, "Acme", partnership_candidate=True)
    assert "aucun renfort" in block


def test_cible_ordinaire_le_bloc_reste_identique():
    base = delivery_capacity_block({"intercontractCount": 3}, "Acme")
    assert delivery_capacity_block({"intercontractCount": 3}, "Acme", partnership_candidate=False) == base
    assert "co-traitance" not in base


def test_capacite_non_mesuree_aucune_ligne_meme_pour_un_partenaire():
    assert delivery_capacity_block(None, "Acme", partnership_candidate=True) == ""
