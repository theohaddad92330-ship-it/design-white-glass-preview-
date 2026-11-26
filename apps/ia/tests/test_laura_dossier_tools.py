"""LOT (15/10) DATA-B — « Laura voit tout ce qu'on a déjà » : briefing élargi + trois outils de lecture.

Ce que ce fichier tient :
  1. `get_account_briefing` relaie technos, ESN en place, signaux budgétaires… (point 1) ;
  2. `get_company_public_facts` lit le cache commun SANS aucun appel (point 2) ;
  3. `get_account_firmographics` lit le compte (point 3) ;
  4. `get_account_org_chart` relaie le pont interne et le cache de registre (point 4) ;
  5. chaque outil neuf : données présentes ET absentes, jamais un appel réseau externe, jamais un
     fournisseur nommé, ownership respectée, déclaré au catalogue.
"""

from __future__ import annotations

import socket
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import bellum_api, provider_cache, public_facts
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool
from app.services.laura_dossier_tools import LAURA_DOSSIER_TOOL_NAMES, REGISTRY_PROFILE_NAMESPACE

USER = "33333333-4333-4333-8333-333333333333"
ACCOUNT = "acc-1"

_RAW = {
    "detected_tech_stack": ["Java", "Kafka"],
    "budget_signals": [{"signal": "Budget cloud en hausse", "timeframe": "T4 2026"}],
    "github_signals": {"org": "acme", "public_repos": 42},
}
_ACCOUNT = {
    "id": ACCOUNT,
    "company_name": "Client Test",
    "siren": "552100554",
    "website": "https://www.client-test.fr",
    "raw_analysis": _RAW,
    "apollo_enrichment": {"estimatedNumEmployees": 1200, "totalFundingPrinted": "$40M"},
}


@pytest.fixture(autouse=True)
def _no_external_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """AUCUN outil neuf n'émet d'appel réseau externe : toute ouverture de socket échoue le test."""

    def _boom(*_a: object, **_k: object) -> None:
        raise AssertionError("appel réseau externe interdit dans ces outils")

    monkeypatch.setattr(socket.socket, "connect", _boom)
    monkeypatch.setattr("httpx.AsyncClient", _boom)
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))


def _own(monkeypatch: pytest.MonkeyPatch, account: dict | None = _ACCOUNT) -> None:
    from fastapi import HTTPException

    async def _fetch(*_a: object, **_k: object) -> dict:
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        return account

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch))


async def _run(name: str, tool_input: dict) -> dict:
    return await execute_chat_tool(name, tool_input, user_id=USER, profile_data=None)


# ── Catalogue ────────────────────────────────────────────────────────────────


def test_les_trois_outils_sont_au_catalogue_en_lecture_seule_avant_push_profile() -> None:
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names[-1] == "push_profile"
    for name in LAURA_DOSSIER_TOOL_NAMES:
        assert name in names and names.index(name) < names.index("push_profile")
        assert name not in WRITE_TOOL_NAMES
    assert {"get_company_public_facts", "get_account_firmographics", "get_account_org_chart"} == LAURA_DOSSIER_TOOL_NAMES


def test_aucune_description_ne_nomme_un_fournisseur() -> None:
    for tool in CHAT_TOOLS:
        if tool["name"] in LAURA_DOSSIER_TOOL_NAMES:
            text = str(tool).lower()
            for word in ("apollo", "pappers", "brave", "adzuna", "theirstack", "dataforge", "firecrawl"):
                assert word not in text, (tool["name"], word)


def test_le_cache_de_registre_lu_est_celui_qu_ecrit_pappers() -> None:
    from app.services.pappers import detail

    assert REGISTRY_PROFILE_NAMESPACE == detail._PAPPERS_COMPANY_NS


# ── Point 1 : le briefing ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_le_briefing_expose_technos_esn_en_place_et_signaux_budgetaires(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch)
    context = {
        "companyName": {"state": "known"},
        "technologies": {
            "state": "known",
            "value": [{"name": "SAP", "usage": "ERP"}],
            "provenance": {"source": "current_data", "observedAt": "2026-10-01T00:00:00Z"},
        },
        "incumbentEsn": {
            "state": "known",
            "value": [{"name": "Capgemini", "contractType": "régie", "strengths": None, "weaknesses": None}],
            "provenance": {"source": "human_correction", "observedAt": "2026-09-30T00:00:00Z"},
        },
    }
    monkeypatch.setattr(bellum_api, "account_intelligence_context", AsyncMock(return_value=context))
    out = await _run("get_account_briefing", {"account_id": ACCOUNT})
    assert out["technologies"]["items"] == [{"name": "SAP", "usage": "ERP"}]
    assert out["technologies"]["observed_at"] == "2026-10-01T00:00:00Z"
    assert out["incumbents"]["items"] == [{"name": "Capgemini", "contract_type": "régie"}]
    assert out["incumbents"]["source"] == "correction humaine"
    assert out["detected_tech_stack"] == ["Java", "Kafka"]
    assert out["budget_signals"] == [{"signal": "Budget cloud en hausse", "timeframe": "T4 2026"}]


@pytest.mark.asyncio
async def test_le_briefing_sans_facade_ni_donnee_n_ajoute_aucune_cle(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch, {"id": ACCOUNT, "company_name": "Client Test", "raw_analysis": {}})
    monkeypatch.setattr(bellum_api, "account_intelligence_context", AsyncMock(return_value=None))
    out = await _run("get_account_briefing", {"account_id": ACCOUNT})
    for key in ("technologies", "incumbents", "budget_signals", "qualified_hypotheses", "regulations", "sites_france"):
        assert key not in out


# ── Point 2 : faits publics, cache commun ────────────────────────────────────


def _peek_with(monkeypatch: pytest.MonkeyPatch, table: dict[tuple[str, str], list[dict] | None]) -> list[tuple]:
    calls: list[tuple] = []

    async def _peek(nature: str, key: str | None, variant: str) -> list[dict] | None:
        calls.append((nature, key, variant))
        return table.get((nature, variant))

    monkeypatch.setattr(public_facts, "peek_fact", _peek)
    monkeypatch.setattr(provider_cache, "cache_available", AsyncMock(return_value=True))

    async def _no_fetch(*_a: object, **_k: object) -> None:
        raise AssertionError("une lecture du cache commun ne collecte jamais")

    monkeypatch.setattr(public_facts, "cached_fact", _no_fetch)
    return calls


@pytest.mark.asyncio
async def test_faits_publics_presents_sont_rendus_avec_leur_date(monkeypatch: pytest.MonkeyPatch) -> None:
    ft = public_facts.jobs_fact_variant("france_travail", "esn_it", False)
    calls = _peek_with(
        monkeypatch,
        {
            ("jobs", ft): [{"title": "Architecte cloud", "date": "2026-10-10", "source": "adzuna"}],
            ("tenders", "esn_it"): [{"title": "AO TMA", "deadline": "2026-11-30"}],
            ("legal", ""): [],
            ("news", ""): [{"title": "Levée de fonds", "date": "2026-09-30", "source": "Les Échos"}],
        },
    )
    out = await _run("get_company_public_facts", {"siren": "552 100 554"})
    assert out["company_key"] == "siren"
    assert out["facts"]["jobs"]["state"] == "cached"
    assert out["facts"]["jobs"]["items"] == [{"title": "Architecte cloud", "date": "2026-10-10"}]  # jamais la source de collecte
    assert out["facts"]["tenders"]["items"][0]["deadline"] == "2026-11-30"
    assert out["facts"]["legal"]["state"] == "searched_nothing"
    assert out["facts"]["news"]["items"][0]["date"] == "2026-09-30"
    assert all(call[1] == "siren:552100554" for call in calls)
    assert "adzuna" not in str(out).lower()
    assert out["status"] == "success"


@pytest.mark.asyncio
async def test_faits_publics_absents_le_disent_sans_rien_inventer(monkeypatch: pytest.MonkeyPatch) -> None:
    _peek_with(monkeypatch, {})
    out = await _run("get_company_public_facts", {"siren": "552100554"})
    assert {f["state"] for f in out["facts"].values()} == {"not_collected"}
    assert all("items" not in f and "count" not in f for f in out["facts"].values())  # jamais « 0 »
    assert out["status"] == "empty"


@pytest.mark.asyncio
async def test_faits_publics_par_nom_de_compte_possede(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch)
    calls = _peek_with(monkeypatch, {})
    monkeypatch.setattr("app.services.chat_tools._accounts_named_like", AsyncMock(return_value=[{"id": ACCOUNT, "company_name": "Client Test"}]))
    out = await _run("get_company_public_facts", {"company_name": "Client Test"})
    assert out["company_name"] == "Client Test"
    assert calls and calls[0][1] == "siren:552100554"


@pytest.mark.asyncio
async def test_faits_publics_sans_cle_d_entreprise_ne_devinent_pas(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _peek_with(monkeypatch, {})
    monkeypatch.setattr("app.services.chat_tools._accounts_named_like", AsyncMock(return_value=[]))
    out = await _run("get_company_public_facts", {"company_name": "Inconnue SA"})
    assert "error" in out and not calls


@pytest.mark.asyncio
async def test_faits_publics_homonymes_posent_une_question(monkeypatch: pytest.MonkeyPatch) -> None:
    _peek_with(monkeypatch, {})
    monkeypatch.setattr(
        "app.services.chat_tools._accounts_named_like",
        AsyncMock(return_value=[{"id": "a", "company_name": "Acme France"}, {"id": "b", "company_name": "Acme Maroc"}]),
    )
    out = await _run("get_company_public_facts", {"company_name": "Acme"})
    assert out["needs_precision"] is True and len(out["candidates"]) == 2


@pytest.mark.asyncio
async def test_faits_publics_cache_indisponible_est_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    _peek_with(monkeypatch, {})
    monkeypatch.setattr(provider_cache, "cache_available", AsyncMock(return_value=False))
    out = await _run("get_company_public_facts", {"siren": "552100554"})
    assert "error" in out and out["status"] == "not_covered"


# ── Point 3 : firmographie ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_firmographie_presente(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch)
    out = await _run("get_account_firmographics", {"account_id": ACCOUNT})
    assert out["firmographics"]["headcount_estimate"] == 1200
    assert out["firmographics"]["total_funding"] == "$40M"
    assert out["detected_tech_stack"] == ["Java", "Kafka"]
    assert out["github_signals"]["public_repos"] == 42
    assert out["status"] == "success"
    assert "apollo" not in str(out).lower()


@pytest.mark.asyncio
async def test_firmographie_absente_le_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch, {"id": ACCOUNT, "company_name": "Client Test", "raw_analysis": {}, "apollo_enrichment": None})
    out = await _run("get_account_firmographics", {"account_id": ACCOUNT})
    assert out["status"] == "empty" and "firmographics" not in out and "note" in out


@pytest.mark.asyncio
async def test_firmographie_compte_etranger_ne_donne_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch, None)
    out = await _run("get_account_firmographics", {"account_id": "autre"})
    assert out["error"] and out["status"] == "empty" and "firmographics" not in out


@pytest.mark.asyncio
async def test_firmographie_exige_un_identifiant() -> None:
    out = await _run("get_account_firmographics", {})
    assert "error" in out


# ── Point 4 : organigramme ───────────────────────────────────────────────────

_CHART = {
    "status": "ok",
    "graph_version": 2,
    "graph_confidence": 80,
    "counts": {"entities": 1, "people": 1, "verified_lines": 0, "inferred_lines": 1},
    "people": [{"full_name": "Claire Dubois", "title": "DSI", "decision_roles": ["economic_buyer"]}],
    "people_not_shown": 0,
}
_PROFILE = {
    "legal_name": "CLIENT TEST SA",
    "c_level": [{"first_name": "Jean", "last_name": "Martin", "role": "Président"}],
    "subsidiaries": [{"name": "Client Pay"}],
}


def _bridge(monkeypatch: pytest.MonkeyPatch, chart: dict | None) -> AsyncMock:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    mock = AsyncMock(return_value=chart)
    monkeypatch.setattr(bellum_api, "account_org_chart", mock)
    return mock


@pytest.mark.asyncio
async def test_organigramme_present_avec_registre_du_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch)
    _bridge(monkeypatch, _CHART)
    seen: list[tuple[str, str]] = []

    async def _peek(namespace: str, key: str) -> dict | None:
        seen.append((namespace, key))
        return _PROFILE if key.endswith(":1") else None

    monkeypatch.setattr(provider_cache, "peek_json", _peek)
    monkeypatch.setattr(provider_cache, "get_json", AsyncMock(side_effect=AssertionError("le registre ne se LIT que par peek")))
    out = await _run("get_account_org_chart", {"account_id": ACCOUNT})
    assert out["org_chart"]["people"][0]["full_name"] == "Claire Dubois"
    assert out["registry"]["executives"] == [{"name": "Jean Martin", "role": "Président"}]
    assert seen[0] == ("pappers:company", "552100554:1")
    assert out["status"] == "success" and out["href"] == f"/accounts/{ACCOUNT}"
    assert "pappers" not in str({k: v for k, v in out.items() if k != "href"}).lower()


@pytest.mark.asyncio
async def test_organigramme_absent_le_dit_sans_dessiner(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch)
    _bridge(monkeypatch, {"status": "no_graph"})
    monkeypatch.setattr(provider_cache, "peek_json", AsyncMock(return_value=None))
    out = await _run("get_account_org_chart", {"account_id": ACCOUNT})
    assert out["org_chart_status"] == "no_graph" and "org_chart" not in out and "registry" not in out
    assert out["status"] == "empty" and "note" in out


@pytest.mark.asyncio
async def test_organigramme_pont_en_echec_est_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch)
    _bridge(monkeypatch, None)
    out = await _run("get_account_org_chart", {"account_id": ACCOUNT})
    assert "error" in out and out["status"] == "provider_error"


@pytest.mark.asyncio
async def test_organigramme_compte_etranger_ne_donne_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch, None)
    bridge = _bridge(monkeypatch, _CHART)
    out = await _run("get_account_org_chart", {"account_id": "autre"})
    assert out["status"] == "empty" and "org_chart" not in out
    bridge.assert_not_called()


@pytest.mark.asyncio
async def test_organigramme_pont_non_configure_est_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    _own(monkeypatch)
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    out = await _run("get_account_org_chart", {"account_id": ACCOUNT})
    assert "error" in out and out["status"] == "not_covered"
