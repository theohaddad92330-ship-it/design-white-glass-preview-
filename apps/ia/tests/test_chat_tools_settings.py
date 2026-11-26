"""Laura lit les réglages (#1822 / #1823) — `get_routines` et `get_import_overview`.

Le périmètre des réglages est large (`/settings/*` compte une quinzaine
d'écrans) : ce lot en couvre un sous-ensemble cohérent, les deux réglages
nommés par un retour daté — les ROUTINES et l'aperçu de l'IMPORT — pas les
dix-sept. Les deux outils sont des LECTURES SEULES, comme tout ce que le pont
expose : aucun des deux ne modifie un abonnement de routine ni ne lance un
import.

Trois garanties à tenir, dans la même famille que les cinq outils du
back-office (`test_chat_back_office_tools.py`) :

1. **Sans pont configuré, on REFUSE plutôt que de rendre du vide.** Une liste
   de routines absente se lirait « tu n'as aucune routine », ce qui est faux —
   c'est la lecture qui a manqué, pas les routines.
2. **Aucun appel réseau ne part sans configuration.**
3. **Aucun nom d'éditeur** dans la description de l'outil, ni dans ce que le
   pont a renvoyé — trois clés du catalogue d'import (`hubspot_export`,
   `boondmanager_export`, `salesconnect_legacy_export`) nomment un éditeur, et
   la règle du dépôt ne l'autorise qu'à Réglages › Intégrations.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"

SETTINGS_READ_TOOLS = ("get_routines", "get_import_overview")


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str) -> dict:
    return await chat_tools.execute_chat_tool(name, {}, user_id=USER, profile_data=None)


# ── Ce que le catalogue promet ───────────────────────────────────────────────


def test_the_two_tools_are_declared() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert set(SETTINGS_READ_TOOLS) <= names


def test_the_two_tools_are_appended_right_before_the_next_addition() -> None:
    # Insérer au milieu invaliderait le préfixe d'outils mis en cache pour tous
    # les tours suivants — la règle écrite au-dessus de `CHAT_TOOLS`.
    #
    # ⚠️ Plus « à la toute fin » depuis #1823 (écriture) : `toggle_routine`
    # (voir `test_chat_routine_toggle_tool.py`) est la primitive ADDITIVE
    # suivante, posée elle aussi en fin de liste. L'invariant qui compte n'est
    # pas « ce sont les deux derniers » mais « ils restent CONSÉCUTIFS, dans
    # l'ordre, sans rien inséré entre eux ».
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    settings_index = names.index(SETTINGS_READ_TOOLS[0])
    assert names[settings_index : settings_index + 2] == list(SETTINGS_READ_TOOLS)


def test_no_editor_name_leaks_into_a_tool_description() -> None:
    forbidden = ("hubspot", "boondmanager", "salesconnect", "salesforce", "pipedrive", "attio")
    for name in SETTINGS_READ_TOOLS:
        tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)
        description = str(tool["description"]).lower()
        assert not any(word in description for word in forbidden), name


def test_neither_tool_can_write_anything() -> None:
    # Les deux passent par le pont interne, LECTURE SEULE (§ tête de
    # `bellum_api.py`) : il n'existe aucun verbe d'écriture à appeler, même en
    # théorie — ce test documente l'absence plutôt que de la supposer.
    for name in SETTINGS_READ_TOOLS:
        tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)
        assert tool["input_schema"]["properties"] == {}
        assert tool["input_schema"]["required"] == []


# ── Sans pont : on le DIT, on ne rend pas du vide ────────────────────────────


@pytest.mark.asyncio
async def test_read_tools_refuse_rather_than_returning_an_empty_answer() -> None:
    """Pas de routine affichée n'est pas la même chose que « tu n'en as aucune »."""
    for name in SETTINGS_READ_TOOLS:
        result = await _run(name)
        assert "error" in result, name
        assert not any(isinstance(value, (list, int, float)) and value for value in result.values()), name


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert await bellum_api.laura_routines_summary(USER) is None
    assert await bellum_api.laura_import_overview(USER) is None


# ── Le pont configuré : l'outil RELAIE, il ne re-décide pas ──────────────────


@pytest.mark.asyncio
async def test_get_routines_relays_the_catalogue_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "routines": [
                {
                    "key": "daily_briefing",
                    "label": "Brief du matin",
                    "outcome": "Ce que ta journée contient",
                    "cadence": "daily",
                    "enabled": False,
                    "hour": 8,
                    "weekday": None,
                    "channel": "in_app",
                    "blockers": ["agenda_not_connected"],
                    "last_run_at": None,
                    "last_outcome": None,
                }
            ]
        }

    monkeypatch.setattr(bellum_api, "laura_routines_summary", summary)
    result = await _run("get_routines")
    assert result["routines"][0]["key"] == "daily_briefing"
    assert result["routines"][0]["enabled"] is False
    assert result["routines"][0]["blockers"] == ["agenda_not_connected"]


@pytest.mark.asyncio
async def test_get_routines_says_it_could_not_read_rather_than_an_empty_catalogue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`None` veut dire « le pont n'a pas répondu » — jamais « aucune routine »."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "laura_routines_summary", unreachable)
    result = await _run("get_routines")
    assert "error" in result
    assert "routines" not in result


@pytest.mark.asyncio
async def test_get_import_overview_relays_capabilities_never_a_vendor_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le pont a déjà retiré `key`/`source` (règle testée côté NestJS) : l'outil
    ne fait que relayer — mais un test qui suppose que « quelqu'un d'autre l'a
    fait » sans jamais vérifier serait le défaut n°1 de ce dépôt (code juste que
    personne n'appelle). On vérifie donc, ICI AUSSI, qu'un JSON avec un mot
    d'éditeur ne ressort jamais tel quel — le filet, pas seulement la promesse.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def overview(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "sources": [
                {"objects": ["contact"], "format": "csv", "readable": True, "tier": "mvp", "imports": [], "skips": []}
            ],
            "recent_sessions": [
                {
                    "object_type": "contact",
                    "state": "applied",
                    "created_at": "2026-09-03T10:00:00Z",
                    "applied_at": "2026-09-03T10:05:00Z",
                    "created_count": 42,
                    "updated_count": 3,
                    "error": None,
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "laura_import_overview", overview)
    result = await _run("get_import_overview")
    serialised = str(result).lower()
    for editor in ("hubspot", "boondmanager", "salesconnect"):
        assert editor not in serialised
    assert result["recent_sessions"][0]["created_count"] == 42


@pytest.mark.asyncio
async def test_get_import_overview_relays_cv_batch_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    """#1952.4 (épopée #2844, lot V15 28/09) — Laura peut désormais LIRE l'état
    d'un import de CV en LOT déjà lancé depuis l'écran (`cv_batch_jobs`, une
    file distincte de l'historique `recent_sessions`). Elle ne le LANCE
    toujours pas : la conversation ne transporte aucun fichier, c'est un pur
    relais de ce que le pont calcule.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def overview(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "sources": [],
            "recent_sessions": [],
            "recent_sessions_truncated": False,
            "cv_batch_jobs": [
                {
                    "id": "job-1",
                    "kind": "zip",
                    "status": "processing",
                    "total": 12,
                    "processed": 5,
                    "summary": {"created": 4, "updated": 0, "skipped": 1, "failed": 0},
                    "error": None,
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "laura_import_overview", overview)
    result = await _run("get_import_overview")
    assert result["cv_batch_jobs"][0]["status"] == "processing"
    assert result["cv_batch_jobs"][0]["processed"] == 5


@pytest.mark.asyncio
async def test_get_import_overview_says_it_could_not_read_rather_than_an_empty_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "laura_import_overview", unreachable)
    result = await _run("get_import_overview")
    assert "error" in result
    assert "sources" not in result
