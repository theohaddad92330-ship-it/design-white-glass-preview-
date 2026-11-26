"""#4712 — un employeur prouvé par une offre finit avec un SIREN : l'établissement SUR PLACE tranche l'homonymie.

Entre homonymes au nom équivalent, gagne l'entité qui a un établissement actif dans le département de l'offre
(pas celle dont le siège y est). Plusieurs entités sur place : on reste en homonymie, avec un motif FINAL.
Le nom d'une annonce n'est pas une raison sociale : le suffixe de programme se retire avant d'interroger le registre.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services import discover_skill_offers as skill
from app.services import provider_cache
from app.services.data_sources import recherche_entreprises as registry
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate


@pytest.fixture(autouse=True)
def no_cache(monkeypatch):
    async def get(*_a: Any, **_k: Any) -> None:
        return None

    async def put(*_a: Any, **_k: Any) -> None:
        return None

    monkeypatch.setattr(provider_cache, "get_json", get)
    monkeypatch.setattr(provider_cache, "set_json", put)


def _scored(siren: str, name: str, dept: str, site: int | None = None) -> ScoredCandidate:
    return ScoredCandidate(
        siren=siren,
        name=name,
        department=dept,
        city="PARIS",
        nameScore=1.0,
        score=0.9,
        isActive=True,
        siteEstablishments=site,
    )


def _ambiguous(*cands: ScoredCandidate) -> HomonymResolution:
    return HomonymResolution(status="ambiguous", candidateCount=len(cands), candidates=list(cands))


def _registry(national: HomonymResolution, on_site: HomonymResolution):
    async def fake(name: str, *, department: str | None = None, **_: Any) -> HomonymResolution:
        return on_site if department else national

    return AsyncMock(side_effect=fake)


def test_l_etablissement_sur_place_tranche_quand_aucun_siege_n_y_est() -> None:
    """Thales : aucun siège en Gironde, un seul établissement actif à Bordeaux → cette entité, avec son SIREN."""
    national = _ambiguous(_scored("111111118", "THALES SA", "92"), _scored("222222226", "THALES AVS", "78"))
    on_site = _ambiguous(_scored("111111118", "THALES SA", "92", 0), _scored("222222226", "THALES AVS", "78", 3))
    mock = _registry(national, on_site)
    with patch("app.services.research.homonym.resolve_company_identity", mock):
        out = asyncio.run(skill.resolve_employer("Thales", None, department="33"))

    assert out.failure is None and out.identity is not None
    assert out.identity["siren"] == "222222226"
    assert mock.await_args_list[-1].kwargs["department"] == "33"  # le lieu est une donnée d'ENTRÉE de la recherche


def test_plusieurs_entites_sur_place_restent_en_homonymie_avec_leur_motif() -> None:
    national = _ambiguous(_scored("111111118", "THALES SA", "92"), _scored("222222226", "THALES AVS", "78"))
    on_site = _ambiguous(_scored("111111118", "THALES SA", "92", 1), _scored("222222226", "THALES AVS", "78", 3))
    with patch("app.services.research.homonym.resolve_company_identity", _registry(national, on_site)):
        out = asyncio.run(skill.resolve_employer("Thales", None, department="33"))

    assert out.identity is None  # jamais un SIREN deviné
    assert out.failure == "homonym_on_site"


def test_aucune_preuve_sur_place_reste_homonyme() -> None:
    national = _ambiguous(_scored("111111118", "DUPONT", "75"), _scored("222222226", "DUPONT", "13"))
    on_site = _ambiguous(_scored("111111118", "DUPONT", "75", 0), _scored("222222226", "DUPONT", "13", 0))
    with patch("app.services.research.homonym.resolve_company_identity", _registry(national, on_site)):
        out = asyncio.run(skill.resolve_employer("Dupont", None, department="33"))

    assert out.identity is None and out.failure == "homonym"


def test_sans_departement_le_lieu_n_est_pas_demande() -> None:
    national = _ambiguous(_scored("111111118", "DUPONT", "75"), _scored("222222226", "DUPONT", "13"))
    mock = _registry(national, national)
    with patch("app.services.research.homonym.resolve_company_identity", mock):
        out = asyncio.run(skill.resolve_employer("Dupont", None))

    assert out.failure == "homonym"
    assert mock.await_count == 1


def test_le_registre_recoit_le_departement_et_compte_les_etablissements_actifs() -> None:
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.url.params))
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "siren": "222222226",
                        "nom_complet": "THALES AVS",
                        "siege": {"departement": "78", "libelle_commune": "ELANCOURT"},
                        "matching_etablissements": [
                            {"code_postal": "33700", "etat_administratif": "A"},
                            {"code_postal": "33160", "etat_administratif": "C"},
                            {"code_postal": "75001", "etat_administratif": "A"},
                        ],
                    }
                ]
            },
        )

    async def run() -> list[dict]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await registry._search_page(http, "thales", per_page=8, department="33")

    rows = asyncio.run(run())
    assert seen[0]["departement"] == "33"
    assert rows[0]["siteEstablishments"] == 1  # le cessé et le parisien ne comptent pas


def test_sans_lieu_le_candidat_ne_porte_aucun_compte_inventé() -> None:
    row = registry._candidate({"siren": "222222226", "nom_complet": "X", "siege": {}})
    assert row is not None and "siteEstablishments" not in row


# ── Le nom d'une annonce n'est pas une raison sociale ──────────────────────────────────────────


def test_le_suffixe_de_programme_se_retire_avant_le_registre() -> None:
    assert skill.employer_registry_name("Mantu Manager Program") == "Mantu"
    assert skill.employer_registry_name("Amaris Graduate Programme") == "Amaris"
    assert skill.employer_registry_name("Thales") == "Thales"
    # Un nom qui n'est QUE le programme n'est pas réduit à rien.
    assert skill.employer_registry_name("Program") == "Program"


def test_un_programme_se_rattache_a_la_marque_que_le_registre_publie() -> None:
    async def fake(name: str, **_: Any) -> HomonymResolution:
        if name == "Mantu":
            return HomonymResolution(
                status="unique",
                selectedSiren="333333334",
                candidateCount=1,
                candidates=[_scored("333333334", "MANTU", "75")],
            )
        return HomonymResolution(status="none")

    with patch("app.services.research.homonym.resolve_company_identity", AsyncMock(side_effect=fake)):
        out = asyncio.run(skill.resolve_employer("Mantu Manager Program", None, department="33"))

    assert out.identity is not None and out.identity["siren"] == "333333334"


def test_un_programme_inconnu_du_registre_porte_son_motif_final() -> None:
    with patch(
        "app.services.research.homonym.resolve_company_identity",
        AsyncMock(return_value=HomonymResolution(status="none")),
    ):
        out = asyncio.run(skill.resolve_employer("Mantu Manager Program", None, department="33"))
        plain = asyncio.run(skill.resolve_employer("Zzz Inconnu", None, department="33"))

    assert out.identity is None and out.failure == "brand_or_program"
    assert plain.failure == "registry_silent"  # pas de suffixe retiré → pas de motif de marque


def test_les_motifs_finaux_ont_un_etat_nomme_et_comptent_comme_non_resolus() -> None:
    offers = [{"employer": "Thales", "city": "Bordeaux", "date": "2026-10-16", "title": "Ingénieur"}]
    assert skill._pending_employer(offers, "homonym_on_site")["identity"] == "ambiguous"
    assert skill._pending_employer(offers, "brand_or_program")["identity"] == "unmatched"
    assert skill._pending_employer(offers, "homonym_on_site")["identityReason"] == "homonym_on_site"
    assert skill._RESOLUTION_FAILURES["homonym_on_site"] == "homonym"
    assert skill._RESOLUTION_FAILURES["brand_or_program"] == "registrySilent"
