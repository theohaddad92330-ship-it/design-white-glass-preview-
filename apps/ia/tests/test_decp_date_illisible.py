"""Incident 24/09 : DECP publie parfois la date comme le TEXTE « None ».

Le marché reste retenu (on ne sur-filtre pas), mais sa date d'attribution est
une ABSENCE, jamais le texte brut : « None » partait jusqu'à une colonne
timestamptz et annulait la transaction de l'analyse côté api.
"""

import pytest

from app.services.data_sources.decp import _rank_awards


def _record(**dates):
    return {
        "objet": "Tierce maintenance applicative du système d'information",
        "acheteur_nom": "Ville de Test",
        "titulaire_denominationSociale": "SOPRA STERIA GROUP",
        "codeCPV": "72000000",
        "dureemois": 24,
        **dates,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("raw", ["None", "null", "", "n/a", "NaN"])
async def test_une_date_illisible_devient_une_absence(raw):
    payload = {"results": [_record(datenotification=None, datepublicationdonnees=raw)]}
    awards = await _rank_awards(None, payload, None)  # type: ignore[arg-type]
    assert len(awards) == 1, "le marché reste retenu"
    assert awards[0]["notifiedDate"] is None
    assert awards[0]["endsOn"] is None


@pytest.mark.asyncio
async def test_une_date_illisible_cede_la_place_a_la_suivante_lisible():
    payload = {"results": [_record(datenotification="None", datepublicationdonnees="2026-03-02")]}
    awards = await _rank_awards(None, payload, None)  # type: ignore[arg-type]
    assert awards[0]["notifiedDate"] == "2026-03-02"


@pytest.mark.asyncio
async def test_une_date_lisible_reste_inchangee():
    payload = {"results": [_record(datenotification="2026-01-15")]}
    awards = await _rank_awards(None, payload, None)  # type: ignore[arg-type]
    assert awards[0]["notifiedDate"] == "2026-01-15"
