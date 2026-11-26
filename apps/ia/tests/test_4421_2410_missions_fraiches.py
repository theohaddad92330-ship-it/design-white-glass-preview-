"""#4421.4 / #4421.8 / #4421.10 (mesure prod du 24/10) — « trouve moi une mission à Lille pour ce profil » + CV
formateur IA → « Aucune mission freelance récente à Lille », aucun compte.

Deux causes lues dans le code de `find_accounts_for_talent` :

* le moteur de Découvrir triait les offres au MÉTIER DE L'ESN (``outsideTrade`` : pack IT, sans
  ``recruitsForClients``) — une offre de formateur IA, un CDI hors des métiers déclarés de l'ESN, sortait
  avant même d'être lue contre les compétences du consultant. Pour placer UN consultant, c'est SA compétence
  qui trie (l'offre doit la citer) : toute offre qui la cite — freelance, CDI, recrutement — est un besoin ;
* le moteur n'était lu qu'en sources GRATUITES : la collecte fraîche de Découvrir (``spaceKey`` →
  ``fresh_jobs``, sources payantes sous les plafonds du jour) n'était jamais déclenchée par Laura
  (décision Louis 24/10 : « même si ça consomme du crédit »).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import execute_chat_tool
from app.services.discover_skill_offers import SkillAccounts

ACCOUNTS = "find_accounts_for_talent"
SPACE = "33333333-3333-4333-8333-333333333333"


def _account(i: int, *, skill: str = "Copilot") -> dict[str, Any]:
    offer = {"title": f"Formateur IA générative {i}", "city": "Lille", "date": "2026-10-20", "skill": skill}
    return {
        "siren": f"55300{i:04d}",
        "name": f"Employeur {i}",
        "department": "59",
        "city": "Lille",
        "skillEvidence": {"skill": skill, "offerCount": 1, "latestOffer": offer, "offers": [offer]},
    }


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}


def _patch(
    monkeypatch: pytest.MonkeyPatch,
    *,
    engine: list[dict[str, Any]],
    fresh: list[dict[str, Any]],
    space: str | None = SPACE,
) -> dict[str, list[Any]]:
    seen: dict[str, list[Any]] = {"engine": [], "registry": []}

    async def _reverse(user_id: str, **kwargs: Any) -> Any:
        market = {
            "consultantId": None,
            "zones": kwargs.get("zones") or [],
            "departments": kwargs.get("zones") or [],
            "unresolvedZones": [],
            "skillTerms": kwargs.get("skills") or [],
            "unavailableReason": "no_snapshot",
            "demand": [],
            "recruiters": [],
        }
        return {"found": True, "market": market}

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        seen["engine"].append(dict(profile or {}))
        return SkillAccounts(accounts=[dict(a) for a in engine], intermediaries=[], info={})

    async def _registry(req: Any) -> Any:
        seen["registry"].append(req)
        return _Response([dict(a) for a in fresh])

    async def _city(city: str, *_: Any, **__: Any) -> str | None:
        return "59" if city.casefold() == "lille" else None

    async def _space(user_id: str, *_: Any, **__: Any) -> str | None:
        return space

    async def _workspace(user_id: str, **kw: Any) -> Any:
        return {"accounts": [], "total": 0}

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.talent_reverse_market", _reverse)
    monkeypatch.setattr("app.services.bellum_api.workspace_accounts", _workspace)
    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    monkeypatch.setattr("app.routers.discover.discover_registry", _registry)
    monkeypatch.setattr(chat_tools, "_resolve_city_department", _city)
    monkeypatch.setattr("app.services.workspace_scope.resolve_workspace_id", _space)
    return seen


CV_INPUT = {"skills": ["Copilot", "IA générative"], "zones": ["Lille"], "limit": 10}
ESN_IT = {"offerDomain": "esn_it"}


@pytest.mark.asyncio
async def test_4421_4_les_offres_cdi_et_recrutement_qui_citent_la_competence_sont_lues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = _patch(monkeypatch, engine=[_account(i) for i in range(10)], fresh=[])
    await execute_chat_tool(ACCOUNTS, CV_INPUT, user_id="u", profile_data=dict(ESN_IT))
    # Le tri métier de l'ESN ne s'applique pas au placement d'UN consultant : sa compétence trie.
    assert seen["engine"] and all(p.get("recruitsForClients") is True for p in seen["engine"])
    assert all(p.get("offerDomain") == "esn_it" for p in seen["engine"])


@pytest.mark.asyncio
async def test_4421_8_le_cache_ne_suffit_pas_laura_lance_la_collecte_fraiche_de_decouvrir(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = _patch(monkeypatch, engine=[], fresh=[_account(i) for i in range(4)])
    out = await execute_chat_tool(ACCOUNTS, CV_INPUT, user_id="u", profile_data=dict(ESN_IT))
    assert len(seen["registry"]) == 1
    req = seen["registry"][0]
    # Même collecte que Découvrir : compétences × zone, l'espace pose le plafond des offres fraîches payées.
    assert req.spaceKey == SPACE
    assert req.filters.technologiesObserved == ["Copilot", "IA générative"]
    assert req.filters.departments == ["59"]
    assert req.profile_data.get("recruitsForClients") is True
    assert out["status"] == "ok"
    assert [a["name"] for a in out["accounts"]] == [f"Employeur {i}" for i in range(4)]
    # Chaque compte porte son besoin daté (le signal) ; le palier se DIT, sans aucun chiffre de crédits.
    assert out["accounts"][0]["needs"][0]["date"] == "2026-10-20"
    assert any("offres fraîches" in line for line in out["widening"])
    assert "crédit" not in str(out).casefold()


@pytest.mark.asyncio
async def test_4421_8_le_volume_tenu_ne_paie_aucune_collecte(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _patch(monkeypatch, engine=[_account(i) for i in range(10)], fresh=[_account(99)])
    out = await execute_chat_tool(ACCOUNTS, CV_INPUT, user_id="u", profile_data=dict(ESN_IT))
    assert seen["registry"] == []
    assert len(out["accounts"]) == 10


@pytest.mark.asyncio
async def test_4421_8_sans_espace_connu_rien_n_est_paye(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _patch(monkeypatch, engine=[], fresh=[_account(1)], space=None)
    out = await execute_chat_tool(ACCOUNTS, CV_INPUT, user_id="u", profile_data=dict(ESN_IT))
    assert seen["registry"] == []
    assert out["accounts"] == []


@pytest.mark.asyncio
async def test_4421_8_un_compte_frais_deja_trouve_n_est_pas_double(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _patch(monkeypatch, engine=[_account(1)], fresh=[_account(1), _account(2)])
    out = await execute_chat_tool(ACCOUNTS, CV_INPUT, user_id="u", profile_data=dict(ESN_IT))
    assert len(seen["registry"]) == 1
    assert [a["name"] for a in out["accounts"]] == ["Employeur 1", "Employeur 2"]


@pytest.mark.asyncio
async def test_4421_droits_un_role_sans_droit_d_analyse_ne_lance_rien_via_laura(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Droits du lot : l'analyse que `_TALENT_NEXT_STEPS` fait lancer seule passe par la MÊME porte que l'écran
    (`analysis:run`, vérifiée par le pont `analysis/start`). Refusée, elle se DIT — jamais « l'analyse est lancée »."""
    calls: list[dict[str, Any]] = []

    async def _start(user_id: str, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs)
        return {"error": "analysis_forbidden", "message": "Ton rôle ne permet pas de lancer une analyse."}

    monkeypatch.setattr("app.services.bellum_api.start_account_analysis", _start)
    out = await execute_chat_tool(
        "start_account_analysis",
        {"company": "Employeur 1", "plan_token": "tok"},
        user_id="u",
        profile_data=None,
    )
    assert len(calls) == 1
    assert out["error"] == "Ton rôle ne permet pas de lancer une analyse."
    assert out["error_code"] == "analysis_forbidden"
    assert "model_directive" not in out
    assert "launched" not in out or out["launched"] is False


def test_4421_8_la_collecte_fraiche_tient_dans_le_budget_du_tour() -> None:
    """Paliers gratuits + collecte fraîche + contacts tiennent sous le budget d'un tour (90 s, modèle compris)."""
    from app.services.chat_orchestrator import _DEFAULT_TURN_BUDGET_S

    worst = chat_tools._TALENT_OFFERS_BUDGET_S + chat_tools._TALENT_CONTACTS_BUDGET_S
    assert chat_tools._TALENT_ENGINE_BUDGET_S + chat_tools._TALENT_FRESH_MIN_S <= chat_tools._TALENT_OFFERS_BUDGET_S
    assert worst <= _DEFAULT_TURN_BUDGET_S - 20
