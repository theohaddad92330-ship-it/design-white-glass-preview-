"""#4421.3 / #4421.2 (recette prod 22/10) — « Pour <consultant>, trouve-moi des missions » : ~10 comptes.

La recette rendait 3 comptes, « Aucun contact connu » partout, aucune offre au-delà de la plus récente, aucun
bouton « Préparer le mail ». Causes lues dans le code :

* le moteur de Découvrir (`discover_skill_offers._evidence`) ne rendait jamais la liste ``offers`` que
  `_skill_needs` attend : un compte n'avait qu'UN besoin ;
* `find_accounts_for_talent` ne lisait que les DEUX premières compétences (``SKILL_MAX_TERMS``) sur la zone
  exacte, et rendait ce qu'il trouvait — 3 comptes — sans tenter le palier suivant (doctrine c126) ;
* les contacts ne se retrouvaient que par une égalité stricte du nom (« ALTEN SAS » ≠ « Alten »).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool
from app.services.discover_skill_offers import SkillAccounts, _evidence
from app.services.zone_palier import widen_zone_to_region

ACCOUNTS = "find_accounts_for_talent"
HUGO = "11111111-1111-4111-8111-111111111111"
ALTEN_ID = "22222222-2222-4222-8222-222222222222"


def _offers(n: int) -> list[dict[str, Any]]:
    return [
        {
            "title": f"Offre {i}",
            "city": "Lille",
            "date": f"2026-10-{i + 1:02d}",
            "url": "u",
            "source": "ft",
            "skill": "Java",
        }
        for i in range(n)
    ]


def test_4421_3_the_engine_evidence_carries_the_dated_offers_up_to_ten() -> None:
    evidence = _evidence(_offers(12))
    assert evidence["offerCount"] == 12
    assert len(evidence["offers"]) == 10
    assert evidence["offers"][0]["date"] == "2026-10-12"  # la plus récente d'abord
    assert {"title", "date", "skill", "city"} <= set(evidence["offers"][0])
    # #4664 (27/10/2026) — le lien de SON annonce voyage avec chaque offre (tiroir « Aperçu du compte »).
    # Seule la SOURCE reste interdite ici : nos fournisseurs ne se nomment jamais (doctrine).
    assert evidence["offers"][0]["url"] == "u"
    assert "source" not in evidence["offers"][0]


def test_4421_3_an_undated_offer_is_not_a_dated_need() -> None:
    offers = [*_offers(2), {"title": "Sans date", "city": "Lille", "date": None, "skill": "Java"}]
    assert all(o["date"] for o in _evidence(offers)["offers"])


def test_4421_3_the_region_palier_names_the_region() -> None:
    label, departments = widen_zone_to_region(["59"]) or ("", [])
    assert label == "Hauts-de-France"
    assert {"59", "62", "80"} <= set(departments)
    assert widen_zone_to_region([]) is None
    # Une zone déjà régionale entière n'a pas de palier plus large.
    assert widen_zone_to_region(["75", "77", "78", "91", "92", "93", "94", "95"]) is None


def _account(i: int, name: str | None = None) -> dict[str, Any]:
    return {
        "siren": f"55200{i:04d}",
        "name": name or f"Employeur {i}",
        "department": "59",
        "city": "Lille",
        "skillEvidence": {
            "skill": "Java",
            "offerCount": 3,
            "latestOffer": _offers(1)[0],
            "offers": _offers(3),
        },
    }


def _patch(
    monkeypatch: pytest.MonkeyPatch,
    engine: Any,
    *,
    workspace: list[dict[str, Any]] | None = None,
    contacts: dict[str, list[dict[str, Any]]] | None = None,
) -> list[tuple[list[str], list[str]]]:
    seen: list[tuple[list[str], list[str]]] = []

    async def _search(user_id: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "items": [
                {
                    "id": HUGO,
                    "fullName": "Hugo Houyez",
                    "zones": ["Lille"],
                    "topSkills": [{"label": s} for s in ("Java", "Vue", "Go", "Rust", "Python", "C++")],
                }
            ],
            "total": 1,
        }

    async def _reverse(user_id: str, **kwargs: Any) -> Any:
        market = {
            "consultantId": HUGO,
            "zones": ["Lille"],
            "departments": ["59"],
            "unresolvedZones": [],
            "skillTerms": ["Java", "Vue", "Go", "Rust", "Python", "C++"],  # SKILL_MAX_TERMS = 5 : la 6e est lue au palier suivant
            "unavailableReason": "no_snapshot",
            "demand": [],
            "recruiters": [],
        }
        return {"found": True, "market": market}

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        seen.append((list(skills), list(zone)))
        return SkillAccounts(accounts=engine(list(skills), list(zone)), intermediaries=[], info={})

    async def _workspace(user_id: str, *, query: Any, sector: Any, limit: Any, **kw: Any) -> Any:
        return {"accounts": list(workspace or []), "total": len(workspace or [])}

    async def _contacts(user_id: str, account_id: str, **kw: Any) -> Any:
        rows = (contacts or {}).get(account_id, [])
        return {"contacts": rows, "total": len(rows), "truncated": False}

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.search_talents", _search)
    monkeypatch.setattr("app.services.bellum_api.talent_reverse_market", _reverse)
    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    monkeypatch.setattr("app.services.bellum_api.workspace_accounts", _workspace)
    monkeypatch.setattr("app.services.bellum_api.account_contacts", _contacts)
    return seen


@pytest.mark.asyncio
async def test_4421_3_three_exact_accounts_are_filled_to_ten_by_paliers(monkeypatch: pytest.MonkeyPatch) -> None:
    def engine(skills: list[str], zone: list[str]) -> list[dict[str, Any]]:
        if zone == ["59"] and "C++" not in skills:
            return [_account(i) for i in range(3)]  # ce que la recette a vu : 3 comptes
        if zone == ["59"]:
            return [_account(i) for i in range(10, 12)]  # la 3e compétence de la fiche
        return [_account(i) for i in range(20, 30)]  # la région

    seen = _patch(monkeypatch, engine)
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez"}, user_id="u", profile_data=None)
    assert out["status"] == "ok"
    assert len(out["accounts"]) == 10
    # La troisième compétence de la fiche a été lue (plus seulement les deux premières).
    assert any("C++" in skills for skills, _ in seen)
    # Le palier de zone a été tenté, et il se DIT (jamais élargi en silence).
    assert any(len(zone) > 1 for _, zone in seen)
    assert any("Hauts-de-France" in line for line in out["widening"])
    # Les exacts restent en tête.
    assert [a["name"] for a in out["accounts"][:3]] == ["Employeur 0", "Employeur 1", "Employeur 2"]


@pytest.mark.asyncio
async def test_4421_3_no_widening_when_the_volume_is_reached(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _patch(monkeypatch, lambda skills, zone: [_account(i) for i in range(12)])
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez"}, user_id="u", profile_data=None)
    assert len(out["accounts"]) == 10
    assert len(seen) == 1 and "widening" not in out  # la garde sait dire NON


@pytest.mark.asyncio
async def test_4421_3_a_requested_volume_below_the_default_is_not_widened(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _patch(monkeypatch, lambda skills, zone: [_account(i) for i in range(3)])
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez", "limit": 3}, user_id="u", profile_data=None)
    assert len(out["accounts"]) == 3 and len(seen) == 1


@pytest.mark.asyncio
async def test_4421_3_an_account_stays_found_when_the_workspace_names_it_differently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contacts = {
        ALTEN_ID: [
            {"contact_id": "ct-1", "full_name": "Claire Petit", "title": "Recrutement IT", "email": "c@alten.fr"}
        ]
    }
    _patch(
        monkeypatch,
        lambda skills, zone: [_account(0, "ALTEN")],
        workspace=[{"account_id": ALTEN_ID, "company_name": "Alten SAS"}],
        contacts=contacts,
    )
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez", "limit": 1}, user_id="u", profile_data=None)
    (alten,) = out["accounts"]
    assert alten["account_id"] == ALTEN_ID
    assert [c["name"] for c in alten["contacts"]] == ["Claire Petit"]


@pytest.mark.asyncio
async def test_4421_3_a_different_company_with_a_shared_word_is_not_matched(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(
        monkeypatch,
        lambda skills, zone: [_account(0, "ALTEN")],
        workspace=[{"account_id": ALTEN_ID, "company_name": "Altenia Conseil"}],
    )
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez", "limit": 1}, user_id="u", profile_data=None)
    (alten,) = out["accounts"]
    assert alten["contacts"] == [] and "account_id" not in alten


def test_4421_3_accounts_without_a_contact_start_their_analysis_alone() -> None:
    from app.services.chat_tools import _TALENT_NEXT_STEPS

    assert "start_account_analysis" in _TALENT_NEXT_STEPS and "TROIS premiers" in _TALENT_NEXT_STEPS
    assert "sans demander" in _TALENT_NEXT_STEPS and "prepare_message_for_contact" in _TALENT_NEXT_STEPS
