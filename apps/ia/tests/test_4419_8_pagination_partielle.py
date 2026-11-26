"""#4419.8 — recette prod 23/10 : Java + Hauts-de-France SANS taille → 9 comptes, « Résultats partiels »,
AUCUN « Voir 10 de plus ».

Deux coupures sur le chemin servi (``_discover_by_skill``) :
- les paliers voisins s'arrêtaient au seuil FIXE (10) : « Voir 10 de plus » (``limit`` 20) relisait la même
  liste exacte, jamais le palier voisin ;
- une liste courte parce qu'une source n'a pas abouti (registre public non joint, budget de temps) se lisait,
  côté écran, comme une source ÉPUISÉE. La réponse le dit maintenant : ``query.skillSearch.more``.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services.discover_skill_offers import SkillAccounts


def _account(siren: str, name: str, skill: str) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "nafCode": "62.01Z",
        "sector": "Programmation informatique",
        "city": "LILLE",
        "department": "59",
        "headcountRange": "250 à 499 salariés",
        "skillEvidence": {
            "skill": skill,
            "offerCount": 1,
            "latestOffer": {"title": f"Développeur {skill}", "city": "Lille", "date": "2026-10-15"},
        },
    }


@pytest.fixture
def engine(monkeypatch):
    state: dict[str, Any] = {"by_term": {}, "calls": [], "info": {}}

    async def fake(skills, zone, profile, *, deadline, city=None, **_circle):
        state["calls"].append(list(skills))
        accounts = [a for term in skills for a in state["by_term"].get(term, [])]
        info = {"skills": list(skills), "emptyCause": None if accounts else "no_offers", **state["info"]}
        return SkillAccounts(accounts=accounts, intermediaries=[], info=info)

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", fake)
    return state


def _post(client, limit: int):
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        return client.post(
            "/discover/registry",
            json={"filters": {"technologiesObserved": ["Java"], "regions": ["32"]}, "profile_data": {}, "limit": limit},
        ).json()


def test_voir_plus_va_chercher_le_palier_voisin(client, engine) -> None:
    # #4419.8 / #4673 — 25 exacts (la cible) suffisent pour la 1re page ; la suite (limit 50) lit le palier voisin.
    engine["by_term"]["Java"] = [_account(f"55210{i:04d}", f"JAVA {i}", "Java") for i in range(25)]
    engine["by_term"]["Kotlin"] = [_account(f"55220{i:04d}", f"KOTLIN {i}", "Kotlin") for i in range(5)]
    engine["by_term"]["Scala"] = [_account(f"55230{i:04d}", f"SCALA {i}", "Scala") for i in range(5)]

    first = _post(client, 25)
    assert len(first["candidates"]) == 25
    assert "widening" not in first["query"]  # la 1re page reste exacte

    more = _post(client, 50)
    assert len(more["candidates"]) > 25
    assert [c["siren"] for c in more["candidates"][:25]] == [c["siren"] for c in first["candidates"]]
    assert any(c.get("widenedBy", {}).get("tier") == 1 for c in more["candidates"][25:])


def test_une_liste_courte_parce_qu_une_source_n_a_pas_abouti_dit_qu_il_y_a_une_suite(client, engine) -> None:
    engine["by_term"]["Java"] = [_account(f"55210{i:04d}", f"JAVA {i}", "Java") for i in range(9)]
    engine["info"] = {"resolutionFailures": {"unavailable": 12}, "notAttempted": 0, "deadlineCut": False}

    body = _post(client, 10)

    assert len(body["candidates"]) == 9
    assert body["query"]["skillSearch"]["more"] is True


def test_coupe_par_le_temps_ou_le_plafond_dit_aussi_qu_il_y_a_une_suite(client, engine) -> None:
    engine["by_term"]["Java"] = [_account(f"55210{i:04d}", f"JAVA {i}", "Java") for i in range(4)]
    engine["info"] = {"beyondCap": 30, "deadlineCut": True}

    assert _post(client, 10)["query"]["skillSearch"]["more"] is True


def test_une_recherche_epuisee_sait_dire_non(client, engine) -> None:
    # Toutes les sources ont répondu, aucun palier n'ajoute rien : pas de bouton qui n'ouvrirait rien.
    engine["by_term"]["Java"] = [_account(f"55210{i:04d}", f"JAVA {i}", "Java") for i in range(3)]
    engine["info"] = {"resolutionFailures": {"unavailable": 0}, "notAttempted": 0, "beyondCap": 0, "deadlineCut": False}

    assert _post(client, 10)["query"]["skillSearch"]["more"] is False
