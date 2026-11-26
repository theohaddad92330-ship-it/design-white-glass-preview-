"""#2148.4 (#2848) — Laura retrouve un compte DÉJÀ ANALYSÉ à travers TOUT le
portefeuille (« réutiliser avant de rechercher », #2148 étape 3).

Mesuré le 25/09/2026 : aucun outil ne cherchait un compte au-delà de ceux déjà
résolus par nom exact (`get_account_brief`, etc.) — `find_accounts` prépare une
recherche NEUVE sur Découvrir, jamais ce que le portefeuille contient déjà.
L'outil `search_workspace_accounts` interroge le pont
`/internal/copilot/accounts/search`, qui réutilise la liste de l'écran Comptes
bornée aux comptes déjà analysés et au périmètre de l'appelant.

Ce que ce fichier garde :
1. l'outil RÉPOND avec les comptes trouvés, tels que le pont les rend ;
2. une panne ou un pont éteint devient une ERREUR, jamais une liste vide qui se
   lirait « aucun compte ne correspond dans l'espace » ;
3. sans critère, on ne liste rien (les comptes les plus récemment créés ne
   sont pas une réponse) ;
4. le pont poste au bon chemin, sans champ `None`.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
TOOL = "search_workspace_accounts"


async def _run(payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(TOOL, payload or {}, user_id=USER, profile_data=None)


def _tool() -> dict:
    return next(t for t in chat_tools.CHAT_TOOLS if t["name"] == TOOL)


def test_the_tool_is_declared() -> None:
    names = [t["name"] for t in chat_tools.CHAT_TOOLS]
    assert len(names) > 30, "le catalogue d'outils est vide ou tronqué"
    assert TOOL in names


def test_the_description_says_already_analyzed_and_forbids_inventing() -> None:
    description = _tool()["description"]
    assert "DÉJÀ ANALYSÉ" in description
    assert "find_accounts" in description
    assert "n'invente" in description


@pytest.mark.asyncio
async def test_without_any_criterion_nothing_is_listed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    called = False

    async def search(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {"accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({})
    assert "error" in result
    assert called is False


@pytest.mark.asyncio
async def test_sector_alone_is_a_real_criterion(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    called = False

    async def search(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {"total": 0, "truncated": False, "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"sector": "SSII"})
    assert "error" not in result
    assert called is True


@pytest.mark.asyncio
async def test_bridge_off_is_said_never_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"query": "Acme"})
    assert "error" in result
    assert "accounts" not in result


@pytest.mark.asyncio
async def test_bridge_failure_is_an_error_never_nobody(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"query": "Acme"})
    assert "error" in result
    assert "accounts" not in result


@pytest.mark.asyncio
async def test_relays_the_criteria_and_the_accounts_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen["user_id"] = user_id
        seen.update(kwargs)
        return {
            "total": 2,
            "truncated": True,
            "accounts": [
                {"account_id": "a-1", "company_name": "Acme", "sector": "SSII", "last_analyzed_at": "2026-08-01"},
                {"account_id": "a-2", "company_name": "Globex", "sector": "Banque", "last_analyzed_at": None},
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"query": " Acme ", "limit": 99})
    assert seen == {"user_id": USER, "query": "Acme", "sector": None, "limit": 25}
    assert [a["company_name"] for a in result["accounts"]] == ["Acme", "Globex"]
    assert result["total"] == 2
    assert result["truncated"] is True


# #2852.6-53 — même enveloppe canonique de résultat d'outil que
# `search_workspace_contacts` (#2282 « TOOL RESULT ENVELOPE », routé HORS LOT
# vers #2852 le 24-25/09, jamais trié jusqu'ici) : un statut nommé, un code
# d'erreur stable, jamais plus un texte français comme seul signal.
@pytest.mark.asyncio
async def test_missing_criteria_names_invalid_input(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await _run({})
    assert result["status"] == "invalid_input"
    assert result["error_code"] == "missing_search_criteria"


@pytest.mark.asyncio
async def test_bridge_off_names_not_covered_never_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"query": "Acme"})
    assert result["status"] == "not_covered"
    assert result["error_code"] == "bridge_not_configured"


@pytest.mark.asyncio
async def test_bridge_failure_names_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"query": "Acme"})
    assert result["status"] == "provider_error"
    assert result["error_code"] == "bridge_unavailable"


# #3670 (RAW2, décision Louis 11/10) — une fiche SUPPRIMÉE ne ressort jamais : le pont ne rend que
# `deleted_match`, et Laura NOMME la suppression au lieu de « aucune fiche » (sans contenu, sans l'ouvrir).
@pytest.mark.asyncio
async def test_deleted_match_names_the_deleted_record(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 0, "truncated": False, "deleted_match": True, "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"query": "Altran Technologies"})
    assert result["accounts"] == []
    assert "Une fiche Altran Technologies a été supprimée" in result["deleted_notice"]
    assert "next_step" not in result


@pytest.mark.asyncio
async def test_without_deleted_match_behaviour_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 0, "truncated": False, "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"query": "Altran Technologies"})
    assert "deleted_notice" not in result
    assert "next_step" in result


@pytest.mark.asyncio
async def test_a_truncated_search_names_partial(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {
            "total": 2,
            "truncated": True,
            "accounts": [{"account_id": "a-1", "company_name": "Acme", "sector": "SSII", "last_analyzed_at": None}],
        }

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"query": "Acme"})
    assert result["status"] == "partial"
    assert result["partial_reason"]
    assert result["sources_consulted"] == ["bellum_workspace"]


@pytest.mark.asyncio
async def test_bridge_posts_to_the_search_capability(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def post(path: str, payload: dict[str, object], **_k: object) -> dict:
        seen["path"] = path
        seen["payload"] = payload
        return {"accounts": []}

    monkeypatch.setattr(bellum_api, "_post", post)
    await bellum_api.workspace_accounts(USER, query="Acme", sector=None, limit=10)
    assert seen["path"] == "/internal/copilot/accounts/search"
    # Aucun champ `None` n'est envoyé : le DTO côté API est `.strict()`.
    assert seen["payload"] == {"userId": USER, "query": "Acme", "limit": 10}


# #2852.12 (lot V22, suite) — même ajout que search_workspace_contacts.
@pytest.mark.asyncio
async def test_names_the_effective_scope_actually_applied(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 0, "truncated": False, "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", search)
    result = await _run({"query": "Acme", "sector": "Industrie"})
    assert result["scope"] == {"query": "Acme", "sector": "Industrie"}
