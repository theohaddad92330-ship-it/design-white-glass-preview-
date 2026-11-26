"""#4421.6 — « trouve-moi des missions » pour un consultant : les besoins DÉJÀ OUVERTS de l'espace
(`find_needs_for_talent`, le matching inverse de l'écran) sont montrés EN PLUS des comptes du marché quand il y en
a ; leur absence, ou un pont muet, ne bloque jamais la recherche marché et ne fait aucune ligne."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool
from app.services.discover_skill_offers import SkillAccounts

ACCOUNTS = "find_accounts_for_talent"
HUGO = "11111111-1111-4111-8111-111111111111"


def _account(i: int) -> dict[str, Any]:
    offer = {"title": f"Développeur Java {i}", "city": "Lille", "date": "2026-10-20", "skill": "Java"}
    return {
        "siren": f"55400{i:04d}",
        "name": f"Employeur {i}",
        "department": "59",
        "skillEvidence": {"skill": "Java", "offerCount": 1, "latestOffer": offer, "offers": [offer]},
    }


def _entry(need_id: str, bucket: str) -> dict[str, Any]:
    return {
        "need": {"needId": need_id, "role": "Développeur Java", "accountName": "Banque Alpha"},
        "result": {"bucket": bucket, "axes": [], "exclusions": [], "gaps": []},
    }


def _patch(monkeypatch: pytest.MonkeyPatch, needs: Any) -> list[str]:
    asked: list[str] = []

    async def _search(user_id: str, **kwargs: Any) -> dict[str, Any]:
        return {"items": [{"id": HUGO, "fullName": "Hugo Houyez", "zones": ["Lille"]}], "total": 1}

    async def _reverse(user_id: str, **kwargs: Any) -> Any:
        market = {
            "consultantId": HUGO,
            "zones": ["Lille"],
            "departments": ["59"],
            "unresolvedZones": [],
            "skillTerms": ["Java"],
            "unavailableReason": "no_snapshot",
            "demand": [],
            "recruiters": [],
        }
        return {"found": True, "market": market}

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        return SkillAccounts(accounts=[_account(i) for i in range(10)], intermediaries=[], info={})

    async def _needs(user_id: str, *, consultant_id: str, mine_only: bool = False) -> Any:
        asked.append(consultant_id)
        if isinstance(needs, Exception):
            raise needs
        return needs

    async def _workspace(user_id: str, **kw: Any) -> Any:
        return {"accounts": [], "total": 0}

    async def _space(user_id: str, *_: Any, **__: Any) -> None:
        return None

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.search_talents", _search)
    monkeypatch.setattr("app.services.bellum_api.talent_reverse_market", _reverse)
    monkeypatch.setattr("app.services.bellum_api.talent_needs_match", _needs)
    monkeypatch.setattr("app.services.bellum_api.workspace_accounts", _workspace)
    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    monkeypatch.setattr("app.services.workspace_scope.resolve_workspace_id", _space)
    return asked


@pytest.mark.asyncio
async def test_4421_6_les_besoins_ouverts_sont_montres_en_plus_du_marche(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _patch(
        monkeypatch,
        {"needs": [_entry("n-1", "recommended"), _entry("n-2", "borderline"), _entry("n-3", "excluded")]},
    )
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez"}, user_id="u", profile_data=None)
    assert asked == [HUGO]
    assert len(out["accounts"]) == 10  # le marché reste rendu en entier
    # Un besoin écarté ne se pousse pas : seuls les recommandés et les limites sont montrés, compartiment nommé.
    assert [(n["need_id"], n["bucket"]) for n in out["workspace_needs"]] == [
        ("n-1", "recommended"),
        ("n-2", "borderline"),
    ]
    assert "workspace_needs" in out["next_steps"]


@pytest.mark.asyncio
@pytest.mark.parametrize("needs", [{"needs": []}, None, RuntimeError("pont muet")])
async def test_4421_6_sans_besoin_ouvert_le_marche_est_rendu_sans_ligne_vide(
    monkeypatch: pytest.MonkeyPatch, needs: Any
) -> None:
    _patch(monkeypatch, needs)
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez"}, user_id="u", profile_data=None)
    assert out["status"] == "ok"
    assert len(out["accounts"]) == 10
    assert "workspace_needs" not in out
    assert "workspace_needs" not in out["next_steps"]
