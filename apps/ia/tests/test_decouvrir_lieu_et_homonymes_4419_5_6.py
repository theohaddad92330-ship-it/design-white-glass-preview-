"""#4419.5 / #4419.6 — le lieu d'une offre se lit proprement, et il départage les homonymes (jamais un SIREN deviné)."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services import discover_skill_offers as skill
from app.services import provider_cache
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate


@pytest.fixture(autouse=True)
def no_cache(monkeypatch):
    async def get(*_a: Any, **_k: Any) -> None:
        return None

    async def put(*_a: Any, **_k: Any) -> None:
        return None

    monkeypatch.setattr(provider_cache, "get_json", get)
    monkeypatch.setattr(provider_cache, "set_json", put)


@pytest.mark.parametrize(
    ("city", "expected"),
    [
        ("Lille, Hauts-de-", "59"),  # lieu tronqué par la source : la ville suffit
        ("Marcq-en-Barœul, Hauts-de-", "59"),
        ("59800", "59"),  # un code postal seul
        ("59800 Lille", "59"),
        ("Lille (59)", "59"),
        ("Hauts-de-", None),  # une région tronquée ne devine rien
        ("", None),
    ],
)
def test_le_lieu_d_une_offre_se_lit_proprement(city: str, expected: str | None) -> None:
    assert skill.offer_department({"city": city}) == expected


def test_un_code_postal_d_outre_mer_ou_de_corse_ne_devine_pas() -> None:
    assert skill.offer_department({"city": "97200"}) == "972"
    assert skill.offer_department({"city": "20000"}) is None  # 2A ou 2B : ambigu, jamais deviné


def _scored(siren: str, name: str, **kw: Any) -> ScoredCandidate:
    base: dict[str, Any] = {"city": "PARIS", "department": "75", "nameScore": 1.0, "score": 0.9, "isActive": True}
    return ScoredCandidate(siren=siren, name=name, **{**base, **kw})


def _ambiguous(*cands: ScoredCandidate) -> HomonymResolution:
    return HomonymResolution(status="ambiguous", candidateCount=len(cands), candidates=list(cands))


def _run(resolution: HomonymResolution, **kw: Any):
    mock = AsyncMock(return_value=resolution)
    with patch("app.services.research.homonym.resolve_company_identity", mock):
        return asyncio.run(skill.resolve_employer("Consort", None, **kw))


def test_la_ville_de_l_offre_tranche_quand_le_departement_ne_suffit_pas() -> None:
    res = _ambiguous(
        _scored("111111118", "CONSORT", city="LILLE", department="59"),
        _scored("222222226", "CONSORT", city="ROUBAIX", department="59"),
    )
    out = _run(res, department="59", city="Lille")
    assert out.identity and out.identity["siren"] == "111111118"


def test_deux_entites_dans_la_meme_ville_restent_homonymes() -> None:
    res = _ambiguous(
        _scored("111111118", "CONSORT", city="LILLE", department="59"),
        _scored("222222226", "CONSORT", city="LILLE", department="59"),
    )
    out = _run(res, department="59", city="Lille")
    assert out.identity is None and out.failure in ("homonym", "homonym_on_site")


def test_a_egalite_le_naf_du_metier_departage() -> None:
    res = _ambiguous(
        _scored("111111118", "CONSORT", nafIsIt=True, nafCode="6202A"),
        _scored("222222226", "CONSORT", nafIsIt=False, nafCode="4711D"),
    )
    out = _run(res, it_trade=True)
    assert out.identity and out.identity["siren"] == "111111118"


def test_le_naf_ne_departage_pas_quand_les_deux_sont_du_metier() -> None:
    res = _ambiguous(
        _scored("111111118", "CONSORT", nafIsIt=True),
        _scored("222222226", "CONSORT", nafIsIt=True),
    )
    out = _run(res, it_trade=True)
    assert out.identity is None and out.failure == "homonym"


def test_la_tete_de_groupe_gagne_entre_entites_d_un_meme_groupe() -> None:
    res = _ambiguous(
        _scored("111111118", "CONSORT GROUP", headcount=3000),
        _scored("222222226", "CONSORT GROUP FRANCE", headcount=40),
    )
    out = _run(res)
    assert out.identity and out.identity["siren"] == "111111118"


def test_deux_grosses_entites_ne_sont_pas_une_tete_de_groupe() -> None:
    res = _ambiguous(
        _scored("111111118", "CONSORT", headcount=3000),
        _scored("222222226", "CONSORT", headcount=2800),
    )
    out = _run(res)
    assert out.identity is None and out.failure == "homonym"


def test_un_effectif_inconnu_ne_departage_jamais() -> None:
    res = _ambiguous(_scored("111111118", "CONSORT"), _scored("222222226", "CONSORT"))
    assert _run(res).failure == "homonym"


@pytest.mark.parametrize("name", ["Forums Talents Handicap", "FREE-WORK GROUP"])
def test_un_site_d_annonces_n_est_pas_un_employeur(name: str) -> None:
    """#4419.9 — rejoint les intermédiaires (jamais les comptes ni les « sans SIREN »)."""
    assert skill.intermediary_kind(name, None) == "recruiter"


def test_un_vrai_employeur_homonyme_n_est_pas_range_avec_les_sites_d_annonces() -> None:
    assert skill.intermediary_kind("Consort Group", None) is None


# ── #4419.7 — la base commune et les comptes de l'espace d'abord ───────────────────────────


def test_un_nom_connu_de_la_base_a_son_siren_sans_toucher_le_registre() -> None:
    from app.services import bellum_api

    base = AsyncMock(return_value={"siren": "111111118", "name": "Consort Group", "origin": "space"})
    registry = AsyncMock()
    enrich = AsyncMock(return_value={"name": "CONSORT GROUP", "nafCode": "6202A"})
    with (
        patch.object(bellum_api, "employer_identity", base),
        patch("app.services.research.homonym.resolve_company_identity", registry),
        patch("app.services.data_sources.registry_lookup.identity_by_siren", enrich),
    ):
        out = asyncio.run(skill.resolve_employer("Consort Group", None, user_id="u-1"))
    assert out.identity and out.identity["siren"] == "111111118" and out.identity["nafCode"] == "6202A"
    registry.assert_not_awaited()  # le registre public n'est pas interrogé
    assert base.await_args.args[0] == "u-1"  # l'espace de l'appelant, jamais un autre


def test_un_nom_inconnu_de_la_base_retombe_sur_le_registre() -> None:
    from app.services import bellum_api

    registry = AsyncMock(return_value=_ambiguous(_scored("1", "X"), _scored("2", "X")))
    with (
        patch.object(bellum_api, "employer_identity", AsyncMock(return_value=None)),
        patch("app.services.research.homonym.resolve_company_identity", registry),
    ):
        out = asyncio.run(skill.resolve_employer("Consort", None, user_id="u-1"))
    registry.assert_awaited()
    assert out.identity is None and out.failure == "homonym"


def test_sans_appelant_la_base_n_est_pas_lue() -> None:
    from app.services import bellum_api

    base = AsyncMock()
    registry = AsyncMock(return_value=_ambiguous(_scored("1", "X"), _scored("2", "X")))
    with (
        patch.object(bellum_api, "employer_identity", base),
        patch("app.services.research.homonym.resolve_company_identity", registry),
    ):
        asyncio.run(skill.resolve_employer("Consort", None))
    base.assert_not_awaited()


# ── #4419.8 — les candidats d'un homonyme voyagent avec la ligne, pour que le commercial choisisse ──


def test_une_homonymie_non_tranchee_porte_ses_candidats_pour_le_choix() -> None:
    cands = [
        _scored("111111118", "CONSORT", city="LILLE", department="59", nafCode="6202A", nafLabel="Conseil", headcountTranche="200 à 249"),
        _scored("222222226", "CONSORT", city="LYON", department="69"),
    ]
    out = _run(_ambiguous(*cands))
    assert out.failure == "homonym" and out.identity is None
    assert [c["siren"] for c in out.candidates] == ["111111118", "222222226"]
    assert out.candidates[0] == {
        "siren": "111111118", "name": "CONSORT", "city": "LILLE", "nafCode": "6202A", "sector": "Conseil",
        "headcountTranche": "200 à 249",
    }


def test_la_ligne_homonyme_expose_de_2_a_5_candidats_et_les_autres_lignes_aucun() -> None:
    many = [_scored(f"{i}00000000"[:9], "CONSORT", city=f"V{i}") for i in range(1, 9)]
    row = skill._pending_employer([{"employer": "Consort", "city": "Lille"}], "homonym", [
        {"siren": c.siren, "name": c.name, "city": c.city} for c in many
    ])
    assert len(row["candidates"]) == 5
    assert "candidates" not in skill._pending_employer([{"employer": "X"}], "registry_silent")
    assert "candidates" not in skill._pending_employer([{"employer": "X"}], "homonym", [{"siren": "1", "name": "a"}])  # un seul : pas un choix


# Lot Q (recette prod 01/11 : 6/21 « Hauts-de- ») — le lieu RENDU est complété par l'IA ; la lecture du département
# ci-dessus reste tolérante à une entrée coupée, mais ce qui sort vers l'écran ne l'est plus.
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Lille, Hauts-de-", "Lille, Hauts-de-France"),
        ("Paris, Île-de-", "Paris, Île-de-France"),
        ("Lille, Hauts-de-France", "Lille, Hauts-de-France"),
        ("Aix-", "Aix-"),  # tiret final sans région connue : jamais deviné
        ("  ", None),
        (None, None),
    ],
)
def test_le_lieu_rendu_est_complete(raw: str | None, expected: str | None) -> None:
    assert skill.complete_offer_place(raw) == expected
