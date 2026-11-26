"""#2910 (#2322.10) — Laura lit le CRM externe branché, depuis le chat.

`POST /internal/copilot/crm/presence` (`CopilotBridgeController.crmPresence`,
#1791.2) existait déjà — permission `crm:read`, compte re-vérifié comme
appartenant à l'espace, jamais le nom du fournisseur — mais aucun outil de
chat ne l'appelait. Laura pouvait PROPOSER d'exporter un contact vers le CRM
(`export_contact_to_crm`) sans jamais pouvoir LIRE ce qui y est déjà.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT = "22222222-2222-4222-8222-222222222222"


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


def test_the_tool_is_declared_and_read_only() -> None:
    names = {str(tool["name"]) for tool in chat_tools.CHAT_TOOLS}
    assert "get_crm_presence" in names


def test_appended_never_inserted() -> None:
    # #2378.9-style discipline (GA-08) : insérer au milieu invaliderait le
    # préfixe d'outils mis en cache pour tous les tours suivants.
    # Pas `names[-1]` : #2900 (`get_confirmed_revenue`, 26/09) a été ajouté
    # PLUS TARD que ce lot — même situation que documentée dans
    # `test_chat_consultant_feedback_tool.py`. L'invariant est « jamais inséré
    # AVANT `compile_day_closure` », le dernier outil du catalogue au moment
    # où ce lot a écrit.
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert names.index("get_crm_presence") > names.index("compile_day_closure")


def test_requires_a_crm_connector() -> None:
    assert chat_tools.TOOL_REQUIRED_FAMILIES["get_crm_presence"] == ("crm",)


def test_no_editor_or_provider_name_leaks_into_the_description() -> None:
    tool = next(tool for tool in chat_tools.CHAT_TOOLS if tool["name"] == "get_crm_presence")
    lowered = str(tool["description"]).lower()
    for vendor in ("hubspot", "salesforce", "pipedrive", "attio", "odoo"):
        assert vendor not in lowered


@pytest.mark.asyncio
async def test_asks_for_the_account_before_reading() -> None:
    result = await _run("get_crm_presence", {})
    assert "error" in result
    # #2852.6-53 (lot t02-29-09) — même enveloppe canonique que
    # get_account_briefing sur une lecture à un seul enregistrement.
    assert result["status"] == "invalid_input"
    assert result["result_type"] == "crm_presence"


@pytest.mark.asyncio
async def test_relays_a_vendor_neutral_presence_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le pont rend déjà `connected: bool`, jamais `provider` — l'outil ne doit
    ajouter ni retirer d'information, juste relayer."""

    async def presence(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "connected": True,
            "matched": True,
            "contacts_count": 3,
            "contacts": [{"name": "Jean Dupont", "email": "jean@acme.fr", "job_title": "DAF"}],
            "open_deals": [{"name": "Migration ERP", "stage": "negotiation", "amount": 45000}],
            "last_activity_at": "2026-09-20T10:00:00.000Z",
        }

    monkeypatch.setattr(bellum_api, "crm_presence", presence)
    result = await _run("get_crm_presence", {"account_id": ACCOUNT})
    assert result["connected"] is True
    assert result["contacts_count"] == 3
    assert result["contacts"][0]["job_title"] == "DAF"
    assert "provider" not in result
    assert result["status"] == "success"
    assert result["result_type"] == "crm_presence"


@pytest.mark.asyncio
async def test_a_missing_bridge_is_a_clear_error_not_a_guessed_absence(monkeypatch: pytest.MonkeyPatch) -> None:
    async def down(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "crm_presence", down)
    result = await _run("get_crm_presence", {"account_id": ACCOUNT})
    assert result["error"] == "Le CRM branché n'a pas répondu."
    assert result["status"] == "provider_error"
    assert result["result_type"] == "crm_presence"


@pytest.mark.asyncio
async def test_a_missing_permission_is_named_not_a_silent_empty_result(monkeypatch: pytest.MonkeyPatch) -> None:
    async def forbidden(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"error": "crm_read_forbidden"}

    monkeypatch.setattr(bellum_api, "crm_presence", forbidden)
    result = await _run("get_crm_presence", {"account_id": ACCOUNT})
    assert result["error"] == "Tu n'as pas le droit de lire le CRM branché."
    assert result["status"] == "permission_denied"
    assert result["result_type"] == "crm_presence"


@pytest.mark.asyncio
async def test_a_foreign_account_is_named_not_a_silent_empty_result(monkeypatch: pytest.MonkeyPatch) -> None:
    async def not_found(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "crm_presence", not_found)
    result = await _run("get_crm_presence", {"account_id": ACCOUNT})
    assert result["error"] == "Ce compte est introuvable dans cet espace."
    assert result["status"] == "empty"
    assert result["result_type"] == "crm_presence"
    assert "error_code" not in result


@pytest.mark.asyncio
async def test_bellum_api_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert await bellum_api.crm_presence(USER, ACCOUNT) is None


def test_read_only_tools_covers_it() -> None:
    from tests.test_copilote_security_eval import READ_ONLY_TOOLS

    assert "get_crm_presence" in READ_ONLY_TOOLS


# #3228 (épopée #213.2, recette prod 30/09/2026) — « combien de contacts chez
# X, et par quelle méthode » appelait CET outil À CÔTÉ de `get_account_contacts`
# sans que celui-ci porte son propre `count_contract` : le modèle n'avait
# qu'un chiffre structuré sur deux, et retombait en prose pour les DEUX (aucune
# carte `count_contract` en prod). Même discipline que
# `test_chat_account_contacts_tool.py`.
@pytest.mark.asyncio
async def test_carries_its_own_count_contract_distinct_from_the_account_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def presence(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "connected": True,
            "matched": True,
            "contacts_count": 23,
            "contacts": [],
            "open_deals": [],
            "last_activity_at": None,
        }

    monkeypatch.setattr(bellum_api, "crm_presence", presence)
    result = await _run("get_crm_presence", {"account_id": ACCOUNT})

    contract = result["count_contract"]
    assert contract["metric_name"] == "contacts_crm_du_compte"
    assert contract["object_type"] == "contact"
    assert contract["scope"] == "compte"
    assert contract["source_layers"] == ["crm_bridge"]
    assert contract["raw_count"] == 23
    # Jamais confondu avec le compte Bellum (`contacts_du_compte`, autre outil,
    # autre `unique_key`) — un caveat le dit plutôt que de laisser deviner.
    assert contract["unique_key"] != f"account_contacts:{ACCOUNT}"
    assert any("bellum" in caveat.lower() for caveat in contract["caveats"])


@pytest.mark.asyncio
async def test_no_count_contract_when_contacts_count_is_unmeasured(monkeypatch: pytest.MonkeyPatch) -> None:
    async def presence(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"connected": True, "matched": False, "contacts_count": None, "contacts": [], "open_deals": []}

    monkeypatch.setattr(bellum_api, "crm_presence", presence)
    result = await _run("get_crm_presence", {"account_id": ACCOUNT})

    assert "count_contract" not in result
