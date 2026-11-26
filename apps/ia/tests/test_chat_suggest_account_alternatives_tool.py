"""#3181.1 (LAU-FINAL-187) — LE GÉNÉRATEUR D'ALTERNATIVES PROACTIF.

Retour bêta #3181, 28/09/2026 : après un verdict qui n'est PAS un GO, Laura ne
doit jamais laisser l'utilisateur seul avec une objection — elle propose des
comptes alternatifs, réellement plus accessibles.

Ce fichier tient :
  - l'outil existe, lecture seule, jamais gated par une famille connectée ;
  - il refuse un compte étranger, un compte sans verdict, un compte déjà en
    AGIR MAINTENANT (rien à proposer), et un appel sans secteur (jamais deviné) ;
  - il RELÂCHE lui-même le département (recherche nationale) et abaisse
    l'effectif d'un cran — jamais au modèle de deviner comment relâcher ;
  - une alternative sans fait RÉEL qui la rend plus accessible est écartée
    (#3181.5 : « pas une simple liste du même secteur ») ;
  - la relation CRM et la mémoire marché sont croisées PAR CANDIDAT (#3181.2,
    épopée #3247) ; rien n'est inventé : `missing_check` nomme ce que cet
    outil n'a pas pu vérifier (chemin d'accès, lecture en échec), jamais un
    `access_path` deviné ;
  - aucun crédit débité (même moteur que `run_account_search`).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool, tools_for

USER = "44444444-4444-4444-8444-444444444444"
TOOL_NAME = "suggest_account_alternatives"


def _account(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": "acc-1",
        "company_name": "Société Générale",
        "siren": "552120222",
        "raw_analysis": {
            "plan": {
                "evaluation": {"verdict": "PRUDENT"},
            }
        },
    }
    base.update(overrides)
    return base


def _stub_owned_account(monkeypatch: pytest.MonkeyPatch, account: dict) -> None:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _fetch(*_a: object, **_k: object) -> dict:
        return account

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch))


def _candidate(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "siren": "111222333",
        "name": "BANQUE ALTERNATIVE SAS",
        "city": "Nantes",
        "department": "44",
        "headcount": 400,
        "nafLabel": "Banque",
        "score": 60,
        "scoreMax": 100,
        "scoreFactors": [{"label": "Filiale autonome", "detail": "gouvernance locale"}],
        "sources": [{"name": "registre", "fetchedAt": "2026-09-28T10:00:00+00:00"}],
    }
    base.update(overrides)
    return base


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub_registry(monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]]) -> None:
    async def _fake(req: Any) -> Any:
        return _Response(candidates)

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)


async def _run(tool_input: dict[str, Any]) -> dict[str, Any]:
    return await execute_chat_tool(TOOL_NAME, tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool_and_it_stays_read_only() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert TOOL_NAME in names
    assert TOOL_NAME not in WRITE_TOOL_NAMES


def test_tool_is_never_gated_by_a_connected_family() -> None:
    names = {t["name"] for t in tools_for(())}
    assert TOOL_NAME in names


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert "error" in result


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _not_found(*_a: object, **_k: object) -> dict:
        raise HTTPException(status_code=404, detail="Account not found")

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_not_found))
    result = await _run({"account_id": "acc-x", "sectors": ["finance"]})
    assert "error" in result


@pytest.mark.asyncio
async def test_refuses_an_account_never_analysed(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account(raw_analysis={}))
    result = await _run({"account_id": "acc-1", "sectors": ["finance"]})
    assert "error" in result
    assert "verdict" in result["error"]


@pytest.mark.asyncio
async def test_refuses_when_the_account_is_already_agir_maintenant(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(
        monkeypatch, _account(raw_analysis={"plan": {"evaluation": {"verdict": "GO"}}})
    )
    result = await _run({"account_id": "acc-1", "sectors": ["finance"]})
    assert "error" in result
    assert "AGIR MAINTENANT" in result["error"]


@pytest.mark.asyncio
async def test_never_guesses_a_sector(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account())
    result = await _run({"account_id": "acc-1"})
    assert "error" in result


@pytest.mark.asyncio
async def test_drops_department_and_lowers_the_headcount_tier(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account())
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response([])

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})

    assert len(seen) == 1
    filters = seen[0].filters
    assert not getattr(filters, "department", "")
    assert filters.headcountMax == 999  # tranche "250-999", un cran sous "1000+"


@pytest.mark.asyncio
async def test_keeps_only_alternatives_with_a_real_easier_fact(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(
        monkeypatch,
        [
            # Plus petit effectif que la tranche 1000+ du compte visé — retenu.
            _candidate(siren="111", name="Alternative accessible", headcount=400),
            # Aucun fait différenciant (même département, effectif inconnu,
            # aucun signal, aucun verdict favorable) — écarté.
            _candidate(siren="222", name="Alternative sans preuve", department="75", headcount=None),
        ],
    )
    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})

    assert "alternatives" in result
    names = [alt["account"]["name"] for alt in result["alternatives"]]
    assert "Alternative accessible" in names
    assert "Alternative sans preuve" not in names
    kept = result["alternatives"][0]
    assert kept["why_similar"]
    assert kept["why_easier"]
    assert kept["first_move"]
    assert kept["access_path"].startswith("non vérifié")  # #4289.5 : jamais null
    assert any("CRM" in item or "accès" in item for item in kept["missing_check"])
    assert result["cost_credits"] == 0
    assert result["source_account_verdict"] == "RÉSERVE"


@pytest.mark.asyncio
async def test_names_the_absence_of_alternative_rather_than_inventing_one(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(monkeypatch, [_candidate(department="75", headcount=None)])

    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})
    assert result["alternatives"] == []
    assert "no_alternative_note" in result


# ── #3181.2/.3/.4 (partiel, épopée #3247) — croisement Market Memory PAR
# CANDIDAT du pool. Le SEUL point d'entrée déjà branché
# (`bellum_api.market_memory_context_for`, GA-258), jamais un second moteur ;
# best-effort, jamais bloquant.


def _stub_market_memory(monkeypatch: pytest.MonkeyPatch, by_name: dict[str, dict[str, Any]]) -> list[str]:
    seen: list[str] = []

    async def _fake(_user_id: str, *, ref: str, company_name: str, website: str | None = None) -> dict[str, Any]:
        seen.append(company_name)
        return by_name.get(company_name, {"status": "ok", "coverage": {"covered": False}})

    monkeypatch.setattr("app.services.bellum_api.market_memory_context_for", _fake)
    return seen


@pytest.mark.asyncio
async def test_ex_esn_presence_becomes_an_easier_fact_and_leaves_missing_check(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_owned_account(monkeypatch, _account())
    # Même département, effectif inconnu (un effectif hors de la tranche relâchée
    # est écarté par le contrôle de périmètre #3705) : aucun autre fait n'est
    # mesuré ici — seule la mémoire marché peut retenir ce candidat.
    _stub_registry(
        monkeypatch,
        [_candidate(siren="111", name="Alternative accessible", department="75", headcount=None)],
    )
    _stub_market_memory(
        monkeypatch,
        {
            "Alternative accessible": {
                "status": "ok",
                "coverage": {"covered": True, "exEsnPresent": 4},
            }
        },
    )

    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})

    kept = result["alternatives"][0]
    assert "mémoire marché" in kept["why_easier"] or "externes" in kept["why_easier"]
    assert not any("observation du marché" in item for item in kept["missing_check"])


@pytest.mark.asyncio
async def test_market_memory_unavailable_names_it_in_missing_check_never_blocks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(
        monkeypatch,
        [_candidate(siren="111", name="Alternative accessible", headcount=400)],
    )

    async def _boom(*_a: object, **_k: object) -> dict[str, Any]:
        raise RuntimeError("bridge down")

    monkeypatch.setattr("app.services.bellum_api.market_memory_context_for", _boom)

    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})

    assert result["alternatives"], "un pont en panne ne bloque jamais les alternatives (best-effort)"
    kept = result["alternatives"][0]
    assert any("observation du marché" in item for item in kept["missing_check"])


# ── #3181.2 (épopée #3247) — croisement CRM PAR CANDIDAT du pool, la famille
# « compte où le workspace possède une relation (CRM) ». Le SEUL point
# d'entrée déjà branché (`bellum_api.crm_company_presence`, relayant
# `CrmReadService.findAccountPresence` PAR IDENTITÉ, sans exiger un compte
# possédé) ; best-effort, jamais bloquant, même patron que la mémoire marché.


def _stub_crm_company_presence(monkeypatch: pytest.MonkeyPatch, by_name: dict[str, dict[str, Any]]) -> list[str]:
    seen: list[str] = []

    async def _fake(_user_id: str, *, company_name: str, domain: str | None = None, siren: str | None = None) -> dict[str, Any]:
        seen.append(company_name)
        return by_name.get(company_name, {"connected": True, "matched": False})

    monkeypatch.setattr("app.services.bellum_api.crm_company_presence", _fake)
    return seen


@pytest.mark.asyncio
async def test_crm_relation_becomes_an_easier_fact_and_leaves_missing_check(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_owned_account(monkeypatch, _account())
    # Même département, effectif inconnu (un effectif hors de la tranche relâchée
    # est écarté par le contrôle de périmètre #3705) : aucun autre fait n'est
    # mesuré ici — seule la relation CRM peut retenir ce candidat.
    _stub_registry(
        monkeypatch,
        [_candidate(siren="111", name="Alternative accessible", department="75", headcount=None)],
    )
    _stub_crm_company_presence(monkeypatch, {"Alternative accessible": {"connected": True, "matched": True}})

    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})

    kept = result["alternatives"][0]
    assert "CRM" in kept["why_easier"]
    assert not any(item.startswith("relation CRM") for item in kept["missing_check"])
    # #3181.4 reste distinct : la relation CRM n'ouvre pas un chemin d'accès.
    assert kept["access_path"].startswith("non vérifié")  # #4289.5 : jamais null


@pytest.mark.asyncio
async def test_crm_relation_unavailable_names_it_in_missing_check_never_blocks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(
        monkeypatch,
        [_candidate(siren="111", name="Alternative accessible", headcount=400)],
    )

    async def _boom(*_a: object, **_k: object) -> dict[str, Any]:
        raise RuntimeError("bridge down")

    monkeypatch.setattr("app.services.bellum_api.crm_company_presence", _boom)

    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})

    assert result["alternatives"], "un pont en panne ne bloque jamais les alternatives (best-effort)"
    kept = result["alternatives"][0]
    assert any(item.startswith("relation CRM") for item in kept["missing_check"])


@pytest.mark.asyncio
async def test_crm_relation_refused_permission_is_not_a_match(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(
        monkeypatch,
        [_candidate(siren="111", name="Alternative accessible", headcount=400)],
    )
    _stub_crm_company_presence(monkeypatch, {"Alternative accessible": {"error": "crm_read_forbidden"}})

    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})

    kept = result["alternatives"][0]
    assert "CRM" not in kept["why_easier"]
    assert any(item.startswith("relation CRM") for item in kept["missing_check"])


@pytest.mark.asyncio
async def test_french_entity_is_an_easier_fact_only_when_the_target_is_registered_abroad(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3181.2 (épopée #3247, lot X47) — famille « entité française plutôt que
    mondiale » : sourcée par `accounts.registry_country` du compte visé."""
    # Même profil que `_candidate` : sans signal, même département, effectif inconnu →
    # sans ce fait, écarté.
    bare = _candidate(siren="333", name="Entité française", department="75", headcount=None)
    _stub_registry(monkeypatch, [bare])

    _stub_owned_account(monkeypatch, _account(registry_country="DE"))
    abroad = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})
    assert [alt["account"]["name"] for alt in abroad["alternatives"]] == ["Entité française"]
    assert "française" in abroad["alternatives"][0]["why_easier"]

    # Compte visé en France : aucun fait — l'entité n'est pas « plutôt que mondiale ».
    _stub_owned_account(monkeypatch, _account(registry_country="FR"))
    domestic = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})
    assert not domestic.get("alternatives")

    # Pays inconnu : jamais deviné.
    _stub_owned_account(monkeypatch, _account(registry_country=None))
    unknown = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})
    assert not unknown.get("alternatives")
