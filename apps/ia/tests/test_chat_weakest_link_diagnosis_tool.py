"""BEL-SC-224 (#3253, P0) — le diagnostic du maillon faible commercial, côté
outil de chat. Même contrat que `get_workspace_health` / `get_blocking_issues`
(pas de configuration = pas d'accès, jamais un silence), mais un objet
canonique DIFFÉRENT (voir le docblock de `WEAKEST_LINK_DIAGNOSIS_TOOL`).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"


def _tool_description(name: str) -> str:
    return str(next(t for t in chat_tools.CHAT_TOOLS if t["name"] == name)["description"])


def test_weakest_link_diagnosis_tool_is_declared() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert "get_weakest_link_diagnosis" in names
    # push_profile reste le dernier outil du catalogue (voir son propre test,
    # `test_chat_push_profile_tool.py::test_push_profile_is_declared_and_appended_last`).
    # AVANT lui, pas forcément juste avant : d'autres lots (BEL-SC-239,
    # `prepare_proposal_pack`) s'intercalent légitimement, même doctrine que
    # le commentaire de `CHAT_TOOLS` — chaque lot le rejoint avant push_profile,
    # jamais forcément en dernière position devant lui.
    assert names[-1] == "push_profile"
    assert names.index("get_weakest_link_diagnosis") < names.index("push_profile")


def test_weakest_link_diagnosis_description_forbids_probability_and_self_report() -> None:
    description = _tool_description("get_weakest_link_diagnosis").lower()
    assert "probabilit" not in description
    assert "% de chance" not in description
    assert "perçoit" in description or "déclare" in description


def test_no_vendor_name_leaks_into_the_weakest_link_description() -> None:
    forbidden = ("hubspot", "boondmanager", "salesconnect", "salesforce", "pipedrive", "attio")
    description = _tool_description("get_weakest_link_diagnosis").lower()
    for vendor in forbidden:
        assert vendor not in description


@pytest.mark.asyncio
async def test_weakest_link_diagnosis_without_bridge_says_no_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await chat_tools.execute_chat_tool("get_weakest_link_diagnosis", {}, user_id=USER, profile_data=None)
    assert result["error"] == "Je n'ai pas accès à l'état de ton espace depuis ici."
    assert result["status"] == "not_covered"


@pytest.mark.asyncio
async def test_weakest_link_diagnosis_relays_the_bridge_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    payload = {
        "computed_at": "2026-09-28T18:00:00.000Z",
        "primary_bottleneck": {
            "family": "absence_de_suivi_ou_de_prochaine_action",
            "business_impact": "7 comptes sur 9 sans prochaine action ni sponsor.",
            "supporting_evidence": ["Compte X : aucune prochaine action, aucun sponsor identifié."],
            "contradictory_evidence": [],
            "recommended_experiment": "Reprendre les 3 comptes les plus prometteurs.",
            "success_metric": "Comptes ouverts avec prochaine action ET sponsor.",
            "review_date": "2026-10-12",
            "actions_to_stop": ["Ne pas lancer de nouvelle recherche de comptes."],
        },
        "secondary_bottlenecks": [],
        "not_evaluable_families": [],
        "confidence": "medium",
        "change_explanation": None,
    }

    async def fake_post(path: str, body: dict) -> dict:
        assert path == "/internal/copilot/laura/weakest-link-diagnosis"
        assert body == {"userId": USER}
        return payload

    monkeypatch.setattr(bellum_api, "_post", fake_post)

    result = await chat_tools.execute_chat_tool("get_weakest_link_diagnosis", {}, user_id=USER, profile_data=None)
    # #2852.6-53 : le contenu du pont est relayé TEL QUEL, l'enveloppe s'ajoute.
    assert {key: result[key] for key in payload} == payload
    assert result["status"] == "success"
    assert result["result_type"] == "weakest_link_diagnosis"


@pytest.mark.asyncio
async def test_weakest_link_diagnosis_bridge_failure_is_an_explicit_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_post(path: str, body: dict) -> None:
        return None

    monkeypatch.setattr(bellum_api, "_post", fake_post)

    result = await chat_tools.execute_chat_tool("get_weakest_link_diagnosis", {}, user_id=USER, profile_data=None)
    assert result["error"] == "Je n'ai pas pu calculer le diagnostic du maillon faible pour le moment."
    assert result["status"] == "provider_error"
