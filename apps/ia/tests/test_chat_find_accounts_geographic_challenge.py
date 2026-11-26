"""#3180 (LAU-FINAL-186) — l'APPELANT `/chat` du challenge « recherche
excessivement large », câblé sur `find_accounts` et `run_account_search`.

Le détecteur lui-même est testé sans I/O dans `test_commercial_challenge.py`.
Ce fichier prouve que les deux outils de recherche l'appellent réellement et
n'y ajoutent rien quand il ne se déclenche pas (additif).
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "66666666-6666-4666-8666-666666666666"


@pytest.fixture(autouse=True)
def _stub_count(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _count(*_a: object, **_k: object) -> int | None:
        return 5

    monkeypatch.setattr(chat_tools, "_find_accounts_count", _count)


async def _find(tool_input: dict, profile_data: dict | None) -> dict:
    return await chat_tools.execute_chat_tool(
        "find_accounts", tool_input, user_id=USER, profile_data=profile_data
    )


@pytest.mark.asyncio
async def test_find_accounts_carries_the_challenge_when_the_esn_profile_is_narrow() -> None:
    result = await _find({"sectors": ["finance"]}, {"geo_zones": ["Paris & Île-de-France"]})
    assert "error" not in result
    assert result["challenge"]["case"] == "recherche excessivement large"


@pytest.mark.asyncio
async def test_find_accounts_never_carries_a_challenge_when_a_department_is_given() -> None:
    result = await _find({"sectors": ["finance"], "department": "75"}, {"geo_zones": ["Paris & Île-de-France"]})
    assert "error" not in result
    assert "challenge" not in result


@pytest.mark.asyncio
async def test_find_accounts_never_carries_a_challenge_when_a_region_is_given() -> None:
    """#3392 (reste, recette prod 30/09) — un code région (« 84 »,
    Auvergne-Rhône-Alpes) cadre la recherche exactement comme un département :
    le signaler comme « trop large » serait un faux positif."""
    result = await _find({"sectors": ["it"], "region": ["84"]}, {"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]})
    assert "error" not in result
    assert "challenge" not in result


@pytest.mark.asyncio
async def test_find_accounts_never_carries_a_challenge_without_a_declared_profile() -> None:
    result = await _find({"sectors": ["finance"]}, None)
    assert "error" not in result
    assert "challenge" not in result


@pytest.mark.asyncio
async def test_run_account_search_carries_the_same_challenge(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_search(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"items": [], "criteria": {"sectors": ["finance"]}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)
    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["finance"]},
        user_id=USER,
        profile_data={"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]},
    )
    assert result["challenge"]["case"] == "recherche excessivement large"


@pytest.mark.asyncio
async def test_run_account_search_carries_the_capacity_challenge_when_the_volume_is_too_high(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3392.2 (retour bêta 30/09) — « Trouve-moi 100 grands comptes »."""

    async def _fake_search(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"items": [], "criteria": {}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)
    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["finance"], "limit": 100},
        user_id=USER,
        profile_data=None,
    )
    assert result["challenge"]["case"] == "action dont le coût dépasse la valeur probable"


@pytest.mark.asyncio
async def test_run_account_search_prefers_the_capacity_challenge_over_the_geographic_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3392.2 — un seul `challenge` par tour (GA-26) : quand les deux se
    déclenchent, le volume EXPLICITEMENT demandé prime."""

    async def _fake_search(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"items": [], "criteria": {"sectors": ["finance"]}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)
    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["finance"], "limit": 100},
        user_id=USER,
        profile_data={"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]},
    )
    assert result["challenge"]["case"] == "action dont le coût dépasse la valeur probable"


@pytest.mark.asyncio
async def test_find_accounts_logs_the_challenge_internally_never_the_text_shown_to_the_client(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """#3391.5 (retour bêta 30/09) — diagnostic réservé aux tests et à
    l'administration : la ligne journalisée nomme le CAS et la FORCE, jamais
    le texte (`problem`/`impact`/`alternative`) qui contient des données de
    profil et part vers le commercial."""
    with caplog.at_level("INFO", logger="app.services.chat_tools"):
        result = await _find({"sectors": ["finance"]}, {"geo_zones": ["Paris & Île-de-France"]})
    assert result["challenge"]["case"] == "recherche excessivement large"
    logged = [r for r in caplog.records if "Challenge commercial" in r.getMessage()]
    assert len(logged) == 1
    assert "recherche excessivement large" in logged[0].getMessage()
    assert result["challenge"]["problem"] not in logged[0].getMessage()


@pytest.mark.asyncio
async def test_run_account_search_never_carries_a_challenge_on_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_search_error(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"error": "Le registre des entreprises n'a pas répondu."}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search_error)
    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["finance"]},
        user_id=USER,
        profile_data={"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]},
    )
    assert "challenge" not in result
