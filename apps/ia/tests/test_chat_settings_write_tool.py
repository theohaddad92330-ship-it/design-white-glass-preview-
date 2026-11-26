"""`propose_settings_update` — Laura ÉCRIT dans les réglages (#1822, Lot 16).

La décision de Louis, prise en connaissant l'alternative « rediriger
seulement » (lot 12) : l'écriture est autorisée, MAIS par une porte visible —
Laura propose, la personne valide, jamais d'écriture silencieuse. C'est le
MÊME patron que `toggle_routine` (#1823, `test_chat_routine_toggle_tool.py`) :

1. l'exécuteur ne fait QUE des lectures — il RÉSOUT `screen`/`field` contre
   `get_settings_overview` (donc contre `bellum_api.laura_settings_overview`)
   AVANT de proposer, jamais après ;
2. il renvoie une PROPOSITION FIGÉE (ancienne valeur, nouvelle valeur, écran),
   jamais un effet — il n'existe, nulle part sous cette branche, de fonction
   qui PATCH/PUT un réglage ;
3. un couple `screen`/`field` inventé, ou une valeur du mauvais type ou hors
   bornes, est REFUSÉ, jamais proposé comme un bouton condamné d'avance ;
4. sans pont configuré, on le DIT — zéro appel réseau.

Deux écrans SEULEMENT : `/settings/notifications` (interrupteurs + un plafond
borné) et `/settings/pipeline` (durées cibles, un entier borné par étape).
Aucun réglage d'argent, de droits, de cloisonnement ou de sécurité n'entre
jamais dans ce catalogue — `test_settings_write_screens_are_known.py` et
`laura-settings-catalog.spec.ts` (API) tiennent cette limite.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"

_OVERVIEW = {
    "screens": [
        {
            "screen": "/settings/notifications",
            "fields": [
                {"field": "buy_signals", "label": "Alerte de signaux d’achat détectés", "type": "bool", "value": True},
                {
                    "field": "proactivity_cap",
                    "label": "Plafond de messages proactifs par jour",
                    "type": "int",
                    "value": 3,
                    "min": 1,
                    "max": 5,
                },
            ],
        },
        {
            "screen": "/settings/pipeline",
            "fields": [
                {
                    "field": "negotiation",
                    "label": "Négociation",
                    "type": "int",
                    "value": 21,
                    "min": 1,
                    "max": 365,
                }
            ],
        },
    ]
}


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str, tool_input: dict) -> dict:
    return await chat_tools.execute_chat_tool(name, tool_input, user_id=USER, profile_data=None)


def _configure_overview(monkeypatch: pytest.MonkeyPatch, overview: dict | None = None) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def read(*_args: object, **_kwargs: object) -> dict | None:
        return overview if overview is not None else _OVERVIEW

    monkeypatch.setattr(bellum_api, "laura_settings_overview", read)


# ── 1. Registre ─────────────────────────────────────────────────────────────


def test_the_two_tools_are_declared() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert {"get_settings_overview", "propose_settings_update"} <= names


def test_they_are_appended_right_after_toggle_routine() -> None:
    # ⚠️ Plus « à la toute fin » depuis `pin_memory_fact` (#1793, même lot),
    # la primitive ADDITIVE suivante — voir
    # `test_chat_pin_memory_fact_tool.py`. L'invariant qui compte est la
    # CONSÉCUTIVITÉ, pas la position finale.
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    toggle_index = names.index("toggle_routine")
    assert names[toggle_index : toggle_index + 3] == [
        "toggle_routine",
        "get_settings_overview",
        "propose_settings_update",
    ]


def test_propose_settings_update_is_counted_as_a_write_tool() -> None:
    assert "propose_settings_update" in chat_tools.WRITE_TOOL_NAMES
    # La lecture, elle, n'écrit rien.
    assert "get_settings_overview" not in chat_tools.WRITE_TOOL_NAMES


def test_propose_settings_update_description_announces_the_confirmation_step() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "propose_settings_update")
    description = str(tool["description"]).lower()
    assert "valid" in description
    assert "n'écrit rien" in tool["description"] or "n'exécute" in tool["description"]


def test_propose_settings_update_requires_screen_field_and_value() -> None:
    schema = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "propose_settings_update")["input_schema"]
    assert set(schema["required"]) == {"screen", "field", "value"}


def test_get_settings_overview_names_the_forbidden_families_as_EXCLUDED() -> None:
    """La description NOMME les familles interdites — comme `get_routines` NOMME
    ce qu'elle ne bascule pas (`_settings_screens_digest`) — pour que le modèle
    sache qu'il ne doit même pas les CHERCHER ici. Les nommer n'est pas le
    risque : le risque serait de laisser croire qu'elles sont accessibles.
    """
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "get_settings_overview")
    description = str(tool["description"])
    assert "JAMAIS ici" in description
    for family_hint in ("argent", "droits", "cloisonnement", "sécurité"):
        assert family_hint in description.lower(), family_hint


# ── 2. Sans pont : on le DIT, zéro appel réseau ──────────────────────────────


@pytest.mark.asyncio
async def test_get_settings_overview_without_bridge_refuses() -> None:
    result = await _run("get_settings_overview", {})
    assert "error" in result


@pytest.mark.asyncio
async def test_propose_without_bridge_refuses() -> None:
    result = await _run(
        "propose_settings_update", {"screen": "/settings/notifications", "field": "buy_signals", "value": False}
    )
    assert "error" in result
    assert "status" not in result


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    result = await _run(
        "propose_settings_update", {"screen": "/settings/notifications", "field": "buy_signals", "value": False}
    )
    assert "error" in result


# ── 3. La lecture ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_settings_overview_relays_the_bridge_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_overview(monkeypatch)
    result = await _run("get_settings_overview", {})
    assert {key: result[key] for key in _OVERVIEW} == _OVERVIEW  # enveloppe additive (#2852.6-53)


@pytest.mark.asyncio
async def test_get_settings_overview_says_it_could_not_read_rather_than_returning_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "laura_settings_overview", unreachable)
    result = await _run("get_settings_overview", {})
    assert "error" in result


# ── 4. Le pont configuré : ça RÉSOUT, puis ça PROPOSE ────────────────────────


@pytest.mark.asyncio
async def test_toggling_a_notification_switch_returns_a_frozen_proposal(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_overview(monkeypatch)
    out = await _run(
        "propose_settings_update", {"screen": "/settings/notifications", "field": "buy_signals", "value": False}
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "update_setting"
    assert proposal["screen"] == "/settings/notifications"
    assert proposal["field"] == "buy_signals"
    assert proposal["old_value"] is True
    assert proposal["new_value"] is False
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_changing_a_pipeline_stage_duration_returns_a_frozen_proposal(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_overview(monkeypatch)
    out = await _run("propose_settings_update", {"screen": "/settings/pipeline", "field": "negotiation", "value": 30})
    proposal = out["proposal"]
    assert proposal["screen"] == "/settings/pipeline"
    assert proposal["field"] == "negotiation"
    assert proposal["old_value"] == 21
    assert proposal["new_value"] == 30


@pytest.mark.asyncio
async def test_an_invented_screen_is_refused_not_proposed(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_overview(monkeypatch)
    out = await _run(
        "propose_settings_update", {"screen": "/settings/branding", "field": "name", "value": "Nouveau nom"}
    )
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_an_invented_field_on_a_real_screen_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_overview(monkeypatch)
    out = await _run(
        "propose_settings_update", {"screen": "/settings/notifications", "field": "un_champ_invente", "value": True}
    )
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_a_string_on_a_boolean_field_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_overview(monkeypatch)
    out = await _run(
        "propose_settings_update", {"screen": "/settings/notifications", "field": "buy_signals", "value": "oui"}
    )
    assert "error" in out


@pytest.mark.asyncio
async def test_a_boolean_on_an_integer_field_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """`bool` est un sous-type d'`int` en Python — sans un contrôle explicite,
    `True` passerait un contrôle `isinstance(value, int)`."""
    _configure_overview(monkeypatch)
    out = await _run("propose_settings_update", {"screen": "/settings/pipeline", "field": "negotiation", "value": True})
    assert "error" in out


@pytest.mark.asyncio
async def test_a_value_out_of_bounds_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_overview(monkeypatch)
    out = await _run(
        "propose_settings_update", {"screen": "/settings/notifications", "field": "proactivity_cap", "value": 12}
    )
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_missing_value_is_refused() -> None:
    out = await _run("propose_settings_update", {"screen": "/settings/notifications", "field": "buy_signals"})
    assert "error" in out


@pytest.mark.asyncio
async def test_says_it_could_not_read_rather_than_proposing_blind(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "laura_settings_overview", unreachable)
    out = await _run(
        "propose_settings_update", {"screen": "/settings/notifications", "field": "buy_signals", "value": False}
    )
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_propose_settings_update_never_calls_a_write_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """Preuve par l'absence : `bellum_api` n'expose aucun verbe d'écriture pour
    les réglages. L'écriture passe par le CLIC de l'utilisateur, authentifié
    JWT (`PATCH /notifications/preferences`, `PUT /pipeline/stage-sla/:stage`),
    jamais par le pont interne."""
    assert not hasattr(bellum_api, "update_settings")
    assert not hasattr(bellum_api, "patch_notification_preferences")
    assert not hasattr(bellum_api, "set_stage_sla")
