"""`POST /discover/registry` — l'angle tient dans SA part, même avec beaucoup de
candidats (#2521, suite — mesure en prod, recette 13, 17/09 ~13:30, api/ia sur
1aa32423c).

1. « Ta cible » (5 secteurs) → 20,65 s, 24 candidats, AUCUN angle. Bandeau :
   « le modèle d'analyse — pas de réponse dans le temps imparti ». La moitié du
   budget (``DISCOVER_MODEL_SHARE``) suffit pour UN appel modèle, pas pour un
   JSON de 24 entrées (un angle + des rôles suggérés par entrée) : le prompt et
   la génération grandissent avec N, le budget n'a pas bougé.

   Correctif : l'angle n'est demandé que pour les ``ANGLE_CANDIDATE_LIMIT``
   premiers candidats du classement déterministe (le score, pas l'ordre
   d'arrivée) — avec un ``max_tokens`` proportionné à ce nombre fixe, pas à la
   taille de la page. Le reste de la liste garde son score et son verdict, sans
   angle — l'écran sait déjà afficher un candidat sans angle (`angle: null`,
   pas une phrase de remplissage).

2. Durée totale 20,65 s pour un budget de 20 s : le dépassement doit être NUL.
   Le calcul de ``remaining`` compte tout ce qui a déjà eu lieu (ville, pages,
   scoring, tri), mais pas le CLASSEMENT et la construction de la réponse qui
   suivent le retour du modèle (rattachement de l'angle, sérialisation) : une
   marge fixe les couvre, pour que le budget mesuré au proxy ne soit jamais
   dépassé — pas seulement réduit.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services.company_filters import DegradeReason

_FIVE_SECTIONS = "64.19Z,29.10Z,84.22Z,47.75Z,86.10Z"


def _index_of(codes: str) -> int:
    return 10 * _FIVE_SECTIONS.split(",").index(codes.split(",")[0])


def _row(index: int, naf: str) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": naf,
        "sector": "Activité",
        "city": "PARIS",
        "department": "75",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
    }


def _post(client: TestClient, filters: dict, limit: int = 30) -> Any:
    return client.post("/discover/registry", json={"filters": filters, "limit": limit})


@pytest.fixture
def five_fast_sections(monkeypatch):
    """Cinq sections, CINQ lignes chacune (25 candidats), toutes rapides."""

    async def gouv(filters, limit, degraded=None):
        codes = filters.naf_code or ""
        idx = _index_of(codes)
        return [_row(idx + i, codes.split(",")[0]) for i in range(5)]

    async def pappers_unreached(filters, limit, degraded=None):
        raise AssertionError("Pappers ne passe pas devant le chemin gouv.fr")

    monkeypatch.setattr(discover_router, "_registry_search", pappers_unreached)
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)


def test_the_angle_call_is_capped_to_the_top_candidates_by_score(client: TestClient, five_fast_sections, monkeypatch):
    """25 candidats trouvés : l'appel modèle n'en porte que
    ``ANGLE_CANDIDATE_LIMIT`` — les mieux classés, pas les 25."""
    captured: dict[str, Any] = {}

    def _spy_prompt(companies, query=None, internal_knowledge=""):
        captured["n"] = len(companies)
        return "prompt"

    monkeypatch.setattr(discover_router, "build_angle_user_prompt", _spy_prompt)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))

    body = _post(client, {"nafCode": _FIVE_SECTIONS}).json()

    # Le reste garde son score et son verdict — rien n'est perdu, seul l'angle
    # ne leur est pas demandé.
    assert len(body["candidates"]) == 25
    assert captured["n"] == discover_router.ANGLE_CANDIDATE_LIMIT


def test_witness_a_small_result_set_is_not_capped(client: TestClient, monkeypatch):
    """Témoin : sous la borne, rien n'est coupé — la borne ne mord que quand
    elle protège vraiment quelque chose."""

    async def gouv(filters, limit, degraded=None):
        return [_row(0, "29.10Z")]

    monkeypatch.setattr(discover_router, "_registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)

    captured: dict[str, Any] = {}

    def _spy_prompt(companies, query=None, internal_knowledge=""):
        captured["n"] = len(companies)
        return "prompt"

    monkeypatch.setattr(discover_router, "build_angle_user_prompt", _spy_prompt)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))

    _post(client, {"nafCode": "29.10Z"})

    assert captured["n"] == 1


def test_the_model_call_reserves_a_trailing_margin_for_what_follows(
    client: TestClient, five_fast_sections, monkeypatch
):
    """Mesuré en prod : 20,65 s pour un budget de 20 s — un dépassement de
    0,65 s malgré la part réservée au modèle. `remaining` comptait tout ce qui
    avait DÉJÀ eu lieu (ville, pages, scoring, tri) mais rien du CLASSEMENT et
    de la construction de la réponse qui suivent le retour du modèle. Le
    modèle doit donc recevoir MOINS que sa part brute — une marge fixe,
    nommée — pour que le dépassement mesuré au proxy soit nul."""
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 2.0)
    allowed: dict[str, float] = {}

    async def _angles(*args, **kwargs):
        started = time.monotonic()
        try:
            await asyncio.sleep(10.0)
        except asyncio.CancelledError:
            allowed["s"] = time.monotonic() - started
            raise
        return {"angles": []}, None

    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(side_effect=_angles))
    started = time.monotonic()
    _post(client, {"nafCode": _FIVE_SECTIONS})
    total_elapsed = time.monotonic() - started

    assert "s" in allowed, "le modèle doit avoir été appelé, puis annulé au budget"
    margin = discover_router.ANGLE_TRAILING_MARGIN_S
    assert margin > 0, "la marge doit être un réglage réel, pas un no-op"
    # La route entière (moisson quasi instantanée ici + modèle + classement +
    # sérialisation) doit tenir sous budget MOINS la marge — 0,15 s de
    # tolérance pour la boucle asyncio, pas pour une marge absente.
    assert total_elapsed <= discover_router.DISCOVER_TIME_BUDGET_S - margin + 0.15, (
        f"{total_elapsed:.3f}s pour un budget de {discover_router.DISCOVER_TIME_BUDGET_S}s "
        f"moins sa marge ({margin}s) — le classement qui suit le modèle n'est pas couvert"
    )


def test_witness_a_fast_model_is_not_cut_short_by_the_margin(client: TestClient, five_fast_sections, monkeypatch):
    """Témoin : la marge ne mord que sur le TEMPS ALLOUÉ au modèle, jamais sur
    un appel qui répond dans les temps."""
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 2.0)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))

    body = _post(client, {"nafCode": _FIVE_SECTIONS}).json()

    assert DegradeReason.TIME_BUDGET not in {e.get("reason") for e in body["degraded"] if e.get("source") == "claude"}
