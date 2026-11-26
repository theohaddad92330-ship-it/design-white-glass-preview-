"""#3094 — « Laura doit savoir quel membre travaille quels comptes. »

Retour du call bêta Apricot Labs du 24/09/2026 : demander à Laura « qui suit
ce compte ? » ou « mes comptes » (dans un espace à plusieurs sièges) et
obtenir le porteur.

`assigned_to` existe déjà sur `AccountEntity` (#1408) et était déjà LU côté
chat pour un CONTRÔLE de visibilité (`ChatConversationsService.citesAccountOutside`)
— jamais exposé au modèle comme un fait CITABLE. Deux moitiés :

 1. « qui s'occupe de X ? » — `search_workspace_accounts` porte désormais le
    responsable de chaque compte trouvé (voir `test_chat_workspace_accounts_tool.py`
    pour son propre contrat ; ce fichier ne re-teste pas ce chemin).
 2. « quels sont les comptes de <membre> ? » — le nouvel outil `get_accounts_by_owner`,
    couvert ici : le nom tapé n'est JAMAIS un identifiant, la résolution vers
    un membre réel se fait côté pont, et l'outil dit clairement quand
    personne ne correspond ou quand plusieurs collègues partagent le même
    prénom — jamais un choix au hasard.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
TOOL = "get_accounts_by_owner"


async def _run(payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(TOOL, payload or {}, user_id=USER, profile_data=None)


def _tool() -> dict:
    return next(t for t in chat_tools.CHAT_TOOLS if t["name"] == TOOL)


def test_the_tool_is_declared() -> None:
    names = [t["name"] for t in chat_tools.CHAT_TOOLS]
    assert TOOL in names


def test_owner_name_is_required() -> None:
    assert _tool()["input_schema"]["required"] == ["owner_name"]


@pytest.mark.asyncio
async def test_without_a_name_the_tool_refuses_rather_than_guess(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    called = False

    async def by_owner(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {}

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({})
    assert "error" in result
    assert called is False


@pytest.mark.asyncio
async def test_bridge_off_is_said_never_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"owner_name": "Bedros"})
    assert "error" in result
    assert "accounts" not in result


@pytest.mark.asyncio
async def test_bridge_failure_is_an_error_never_nobody(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def by_owner(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({"owner_name": "Bedros"})
    assert "error" in result
    assert "accounts" not in result


@pytest.mark.asyncio
async def test_a_real_member_rends_their_accounts_with_their_full_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def by_owner(user_id: str, **kwargs: object) -> dict:
        seen["user_id"] = user_id
        seen.update(kwargs)
        return {
            "memberFound": True,
            "ownerName": "Bedros Astourian",
            "accounts": [{"account_id": "a-1", "company_name": "Acme", "sector": "SSII"}],
        }

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({"owner_name": "Bedros"})
    assert seen == {"user_id": USER, "owner_name": "Bedros", "limit": None}
    assert result["member_found"] is True
    assert result["owner_name"] == "Bedros Astourian"
    assert result["accounts"] == [{"account_id": "a-1", "company_name": "Acme", "sector": "SSII"}]


@pytest.mark.asyncio
async def test_no_member_matches_the_name_says_so_never_an_invented_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def by_owner(*_a: object, **_k: object) -> dict:
        return {"memberFound": False, "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({"owner_name": "Personne Inconnue"})
    assert result == {
        "member_found": False,
        "accounts": [],
        "status": "empty",
        "result_type": "account_list",
        "sources_consulted": ["bellum_workspace"],
        "sources_succeeded": ["bellum_workspace"],
        "scope": {"owner_name": "Personne Inconnue"},
    }


@pytest.mark.asyncio
async def test_ambiguous_name_names_the_candidates_never_picks_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def by_owner(*_a: object, **_k: object) -> dict:
        return {"memberFound": False, "accounts": [], "ambiguousCandidates": ["Louis Schlegel", "Louis Martin"]}

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({"owner_name": "Louis"})
    assert result == {
        "member_found": False,
        "accounts": [],
        "ambiguous_candidates": ["Louis Schlegel", "Louis Martin"],
        "status": "ambiguous",
        "result_type": "account_list",
        "sources_consulted": ["bellum_workspace"],
        "sources_succeeded": ["bellum_workspace"],
        "scope": {"owner_name": "Louis"},
    }


# #2852.6-53 — même enveloppe canonique que search_workspace_accounts, avec un
# statut `ambiguous` propre — le NO-GO de #2282 vaut ici aussi : « personne »
# et « plusieurs collègues partagent ce prénom » ne se confondent jamais.
@pytest.mark.asyncio
async def test_missing_name_names_invalid_input(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await _run({})
    assert result["status"] == "invalid_input"
    assert result["error_code"] == "missing_owner_name"


@pytest.mark.asyncio
async def test_bridge_off_names_not_covered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"owner_name": "Bedros"})
    assert result["status"] == "not_covered"
    assert result["error_code"] == "bridge_not_configured"


@pytest.mark.asyncio
async def test_bridge_failure_names_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def by_owner(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({"owner_name": "Bedros"})
    assert result["status"] == "provider_error"
    assert result["error_code"] == "bridge_unavailable"


@pytest.mark.asyncio
async def test_a_resolved_member_names_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def by_owner(*_a: object, **_k: object) -> dict:
        return {"memberFound": True, "ownerName": "Bedros Astourian", "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({"owner_name": "Bedros"})
    assert result["status"] == "success"


# #2852.12 (lot V22, suite) — même ajout que search_workspace_contacts/accounts.
@pytest.mark.asyncio
async def test_names_the_effective_scope_actually_applied(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def by_owner(*_a: object, **_k: object) -> dict:
        return {"memberFound": True, "ownerName": "Bedros Astourian", "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", by_owner)
    result = await _run({"owner_name": "Bedros"})
    assert result["scope"] == {"owner_name": "Bedros Astourian"}


@pytest.mark.asyncio
async def test_bridge_posts_to_the_by_owner_capability(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def post(path: str, payload: dict[str, object], **_k: object) -> dict:
        seen["path"] = path
        seen["payload"] = payload
        return {"memberFound": False, "accounts": []}

    monkeypatch.setattr(bellum_api, "_post", post)
    await bellum_api.workspace_accounts_by_owner(USER, owner_name="Bedros", limit=10)
    assert seen["path"] == "/internal/copilot/accounts/by-owner"
    assert seen["payload"] == {"userId": USER, "ownerName": "Bedros", "limit": 10}
