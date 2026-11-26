"""#3399 / B2-RESTES (recette prod 11/10 nuit, 12/10) — « Quel compte attaquer en premier ? » : carte de 3 lignes
(Recette 10-10, QUIETALIS, AHSENE), 0 Accor, 0 Airbus, 0 « Pari long déclaré ».

CAUSE : la porte ne remplaçait la carte du modèle que si TOUS ses comptes étaient dans les seaux « maintenant /
à vérifier / à surveiller ». Un seul compte hors de ces seaux (ici AHSENE, « à ne pas travailler ») gardait la
carte du modèle telle quelle, paris longs absents. Un pari DÉCLARÉ ne disparaît jamais d'une carte de priorité.
Et un compte de recette (nom « Recette … ») ne passe pas devant un vrai compte de même niveau."""

from __future__ import annotations

import pytest

from tests.test_3399_carte_forcee_complete_rbi import _row
from tests.test_3399_compte_a_attaquer_hors_plafond import _card, _run_turn


def _bridge() -> dict:
    return {
        "now": [],
        "toVerify": [_row(1, "RECETTE 10-10"), _row(2, "QUIETALIS"), _row(3, "VRAI COMPTE")],
        "toWatch": [_row(30, "ACCOR", betHorizon="long"), _row(31, "AIRBUS", betHorizon="long")],
        "notNow": [_row(40, "AHSENE")],
    }


@pytest.fixture(autouse=True)
def _portfolio(monkeypatch):
    monkeypatch.setattr("tests.test_3399_compte_a_attaquer_hors_plafond._bridge", _bridge)


@pytest.mark.asyncio
async def test_card_with_a_name_outside_the_buckets_still_carries_declared_long_bets(monkeypatch):
    _reply, cards = await _run_turn(monkeypatch, _card("RECETTE 10-10", "QUIETALIS", "AHSENE"))

    items = {item["name"]: item for item in cards[0]["items"]}
    assert {"ACCOR", "AIRBUS"} <= set(items)
    assert "Pari long déclaré." in items["ACCOR"]["why"]
    assert "Pari long déclaré." in items["AIRBUS"]["why"]
    assert "AHSENE" in items  # le choix du modèle n'est pas écarté en silence


@pytest.mark.asyncio
async def test_a_card_that_already_names_the_bets_is_left_alone(monkeypatch):
    _reply, cards = await _run_turn(monkeypatch, _card("QUIETALIS", "AHSENE", "ACCOR", "AIRBUS"))

    assert [i["name"] for i in cards[0]["items"]] == ["QUIETALIS", "AHSENE", "ACCOR", "AIRBUS"]


@pytest.mark.asyncio
async def test_a_recette_account_does_not_rank_ahead_of_a_real_one_of_the_same_level(monkeypatch):
    _reply, cards = await _run_turn(monkeypatch, "Aucun compte à travailler maintenant.")

    names = [i["name"] for i in cards[0]["items"]]
    assert "RECETTE 10-10" in names  # jamais exclu d'office
    assert names.index("VRAI COMPTE") < names.index("RECETTE 10-10")
    assert names.index("QUIETALIS") < names.index("RECETTE 10-10")
