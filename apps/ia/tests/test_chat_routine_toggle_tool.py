"""`toggle_routine` — l'écriture qui complète `get_routines` (#1823).

La LECTURE est livrée depuis hier (`get_routines`, `test_chat_tools_settings.py`).
Ce fichier verrouille l'ÉCRITURE : basculer l'abonnement à une routine EXISTANTE
depuis la conversation. Le chemin est celui de tous les outils d'écriture du
copilote (`test_chat_write_tools.py`, `test_chat_action_tools.py`) :

1. l'exécuteur ne fait QUE des lectures — il RÉSOUT la routine (comme
   `_resolve_owned_contact` résout un contact) avant de proposer, jamais
   après ;
2. il renvoie une PROPOSITION (`pending_confirmation`), jamais un effet — il
   n'existe, nulle part sous cette branche, de fonction qui PATCH
   `/routines/:key` ;
3. une clé inventée par le modèle est REFUSÉE, jamais proposée comme un bouton
   condamné d'avance ;
4. sans pont configuré, on le DIT — zéro appel réseau.

Le neuvième littéral `"action": "toggle_routine"` est celui que
`chat-actions-cross-language.test.ts` (web) doit désormais connaître : ce test
Python ne peut PAS voir un défaut de rendu côté web, seul le côté TypeScript le
peut (cf. le commentaire de tête de cette garde).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"

#: #1822 — les bornes SONT SERVIES par le pont (contrat partagé), jamais
#: recopiées côté Python : une troisième copie de « 0-23 », « 1-7 » et des deux
#: canaux, dans un langage sans compilateur pour la rapprocher des deux autres,
#: aurait divergé au premier changement.
_BOUNDS = {"hour": {"min": 0, "max": 23}, "weekday": {"min": 1, "max": 7}, "channels": ["in_app", "email"]}

_ROUTINES_SUMMARY = {
    "bounds": _BOUNDS,
    "routines": [
        {
            "key": "daily_briefing",
            "label": "Brief du matin",
            "outcome": "Ce que ta journée contient",
            "cadence": "daily",
            "enabled": False,
            "hour": 8,
            # Une routine QUOTIDIENNE n'a pas de jour : `weekday` vaut `null`,
            # et c'est ce `null` — pas une liste de cadences recopiée — qui dit
            # qu'un jour ne se règle pas ici (même construction que « won » qui
            # n'a pas de durée cible dans le catalogue du pipe).
            "weekday": None,
            "channel": "in_app",
            "blockers": ["agenda_not_connected"],
            "last_run_at": None,
            "last_outcome": None,
        },
        {
            "key": "weekly_review",
            "label": "Revue hebdomadaire",
            "outcome": "Ce que ta semaine a produit",
            "cadence": "weekly",
            "enabled": True,
            "hour": 9,
            "weekday": 1,
            "channel": "email",
            "blockers": [],
            "last_run_at": None,
            "last_outcome": None,
        },
    ],
}


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(tool_input: dict) -> dict:
    return await chat_tools.execute_chat_tool(
        "toggle_routine", tool_input, user_id=USER, profile_data=None
    )


def _summary(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le catalogue RÉEL de cette personne, tel que le pont le rend."""

    async def summary(*_args: object, **_kwargs: object) -> dict:
        return _ROUTINES_SUMMARY

    monkeypatch.setattr(bellum_api, "laura_routines_summary", summary)


# ── 1. Registre ─────────────────────────────────────────────────────────────


def test_toggle_routine_is_declared() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert "toggle_routine" in names
    # Additif : get_routines et get_import_overview restent exposés.
    assert {"get_routines", "get_import_overview"} <= names


def test_toggle_routine_is_appended_right_after_the_two_settings_reads() -> None:
    # #1596.1 / la règle du fichier : une primitive nouvelle se pose EN FIN de
    # liste, jamais au milieu — sinon le préfixe d'outils mis en cache saute
    # pour tous les tours suivants.
    #
    # ⚠️ Plus « à la toute fin » depuis le LOT 16 (#1822) :
    # `get_settings_overview` / `propose_settings_update` sont la primitive
    # ADDITIVE suivante, posée elle aussi en fin de liste (voir
    # `test_chat_settings_write_tool.py`). L'invariant qui compte n'est pas
    # « c'est le dernier » mais « les trois restent CONSÉCUTIFS, dans l'ordre,
    # sans rien inséré entre eux ».
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    toggle_index = names.index("toggle_routine")
    assert names[toggle_index - 2 : toggle_index + 1] == ["get_routines", "get_import_overview", "toggle_routine"]


def test_toggle_routine_is_counted_as_a_write_tool() -> None:
    assert "toggle_routine" in chat_tools.WRITE_TOOL_NAMES


def test_toggle_routine_description_announces_the_confirmation_step() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "toggle_routine")
    description = str(tool["description"]).lower()
    assert "valid" in description
    assert "n'exécute" in tool["description"] or "n'écrit" in tool["description"]


def test_toggle_routine_requires_only_the_key() -> None:
    """#1822 — `enabled` n'est plus OBLIGATOIRE.

    Il l'était tant que l'outil ne savait faire qu'une chose. Depuis que « mets
    mon brief à 7 h » passe par la même porte, exiger l'état forcerait le modèle
    à le RE-DÉCLARER pour changer l'heure — et à se tromper une fois sur dix.
    L'état non dit n'est pas deviné pour autant : il est LU dans le catalogue
    réel de cette personne (`get_routines`), donc mesuré."""
    schema = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "toggle_routine")["input_schema"]
    assert set(schema["required"]) == {"key"}
    assert schema["properties"]["enabled"]["type"] == "boolean"
    assert schema["properties"]["hour"]["type"] == "integer"
    assert schema["properties"]["channel"]["type"] == "string"


# ── 2. Sans pont : on le DIT, zéro appel réseau ──────────────────────────────


@pytest.mark.asyncio
async def test_without_bridge_configured_it_refuses() -> None:
    result = await _run({"key": "daily_briefing", "enabled": True})
    assert "error" in result
    assert "status" not in result


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    result = await _run({"key": "daily_briefing", "enabled": True})
    assert "error" in result


# ── 3. Le pont configuré : ça RÉSOUT, puis ça PROPOSE ────────────────────────


@pytest.mark.asyncio
async def test_toggle_routine_returns_a_proposal_and_writes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict:
        return _ROUTINES_SUMMARY

    monkeypatch.setattr(bellum_api, "laura_routines_summary", summary)

    out = await _run({"key": "daily_briefing", "enabled": True})
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "toggle_routine"
    assert proposal["key"] == "daily_briefing"
    assert proposal["label"] == "Brief du matin"
    assert proposal["enabled"] is True
    # Un réglage de routine ne coûte rien — jamais un crédit.
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_toggle_routine_can_propose_switching_off_too(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict:
        return _ROUTINES_SUMMARY

    monkeypatch.setattr(bellum_api, "laura_routines_summary", summary)

    out = await _run({"key": "daily_briefing", "enabled": False})
    assert out["proposal"]["enabled"] is False


@pytest.mark.asyncio
async def test_an_invented_key_is_refused_not_proposed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Une clé qui n'existe pas dans LE catalogue de CET utilisateur ne produit
    aucun bouton — condamné d'avance côté `PATCH /routines/:key`, qui la
    refuserait (`BadRequestException`)."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict:
        return _ROUTINES_SUMMARY

    monkeypatch.setattr(bellum_api, "laura_routines_summary", summary)

    out = await _run({"key": "invente_une_routine", "enabled": True})
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_a_key_alone_changes_nothing_and_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """#1822 — une proposition qui ne change RIEN est un bouton qui ment : il
    annonce un geste et n'en fait aucun."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    out = await _run({"key": "daily_briefing"})
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_a_non_boolean_enabled_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    out = await _run({"key": "daily_briefing", "enabled": "true"})
    assert "error" in out


@pytest.mark.asyncio
async def test_says_it_could_not_read_rather_than_proposing_blind(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le pont répond `None` (panne) : on ne propose PAS une bascule sur un
    catalogue qu'on n'a pas pu relire — ce serait proposer à l'aveugle."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "laura_routines_summary", unreachable)
    out = await _run({"key": "daily_briefing", "enabled": True})
    assert "error" in out
    assert "status" not in out


# ── 4. #1822 — l'heure, le jour et le canal passent par la MÊME porte ───────
#
# Ce que le lot 12 écrivait ici : « pour changer l'heure, le jour ou le canal
# d'une routine, renvoie vers l'écran — ce réglage plus fin ne se bascule pas
# encore depuis la conversation ». Louis a tranché l'inverse (« il faut qu'elle
# puisse écrire OU renvoyer ») : une routine est personnelle, son catalogue est
# FERMÉ, ses bornes viennent du contrat, et le geste se refait d'un clic. Elle
# ÉCRIT donc — par la porte qui existe déjà, jamais par une seconde.


@pytest.mark.asyncio
async def test_the_hour_alone_can_be_proposed_and_keeps_the_current_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    out = await _run({"key": "daily_briefing", "hour": 7})
    proposal = out["proposal"]
    assert proposal["hour"] == 7
    # L'état n'a pas été DIT : il est LU dans le catalogue (`enabled: False`),
    # jamais deviné, et surtout jamais inversé par accident.
    assert proposal["enabled"] is False


@pytest.mark.asyncio
async def test_the_channel_is_checked_against_the_list_the_bridge_SERVES(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    assert (await _run({"key": "daily_briefing", "channel": "email"}))["proposal"]["channel"] == "email"
    # Un canal inventé ne produit aucun bouton : il serait refusé derrière le
    # clic par `PATCH /routines/:key`, donc condamné d'avance.
    assert "error" in await _run({"key": "daily_briefing", "channel": "sms"})


@pytest.mark.asyncio
@pytest.mark.parametrize("hour", [-1, 24, 8.5, True, "7"])
async def test_an_hour_outside_the_bounds_is_refused(hour: object, monkeypatch: pytest.MonkeyPatch) -> None:
    """Les bornes viennent de la réponse du pont (`bounds`), pas d'une copie
    locale. ⚠️ `True` est un `int` en Python : il doit être écarté AVANT le
    contrôle numérique, sinon « active-la » réglerait l'heure à 1 h."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    assert "error" in await _run({"key": "daily_briefing", "hour": hour})


@pytest.mark.asyncio
async def test_a_weekday_is_refused_on_a_routine_that_has_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """Par CONSTRUCTION, pas par une liste de cadences recopiée : le catalogue
    dit `weekday: null` pour une routine quotidienne, donc il n'y a pas de jour
    à régler. Poser « lundi » sur un brief du matin annoncerait un geste que
    l'écran ne sait pas faire."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    assert "error" in await _run({"key": "daily_briefing", "weekday": 1})


@pytest.mark.asyncio
async def test_a_weekday_is_accepted_on_a_weekly_routine(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le témoin du cas légitime voisin : la routine hebdomadaire, elle, PORTE
    un jour — sans ce test, le refus ci-dessus pourrait être un refus de tout."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    out = await _run({"key": "weekly_review", "weekday": 4})
    assert out["proposal"]["weekday"] == 4
    assert out["proposal"]["enabled"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("weekday", [0, 8])
async def test_a_weekday_outside_the_iso_bounds_is_refused(weekday: int, monkeypatch: pytest.MonkeyPatch) -> None:
    """1 = lundi, 7 = dimanche (ISO-8601, la convention de la base et de
    l'écran). `0` est le piège classique d'un décalage d'un jour."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    assert "error" in await _run({"key": "weekly_review", "weekday": weekday})


@pytest.mark.asyncio
async def test_several_changes_travel_in_ONE_proposal(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un seul clic pour « passe ma revue au jeudi 18 h par mail » : trois
    cartes pour un geste donneraient trois fois raison à celui qui n'en clique
    que deux."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    out = await _run({"key": "weekly_review", "weekday": 4, "hour": 18, "channel": "email", "enabled": True})
    assert out["proposal"] == {
        "action": "toggle_routine",
        "key": "weekly_review",
        "label": "Revue hebdomadaire",
        "enabled": True,
        "hour": 18,
        "weekday": 4,
        "channel": "email",
        "cost_credits": 0,
    }


@pytest.mark.asyncio
async def test_an_unchanged_field_is_NOT_carried(monkeypatch: pytest.MonkeyPatch) -> None:
    """La proposition ne porte que ce qui CHANGE : la carte annonce « de 8 h
    vers 7 h », jamais « et aussi le canal que tu avais déjà »."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _summary(monkeypatch)
    proposal = (await _run({"key": "daily_briefing", "hour": 7}))["proposal"]
    assert "channel" not in proposal
    assert "weekday" not in proposal


@pytest.mark.asyncio
async def test_bounds_missing_from_the_bridge_refuse_rather_than_guess(monkeypatch: pytest.MonkeyPatch) -> None:
    """Une API ancienne qui ne sert pas encore `bounds` (la fenêtre « front
    neuf, serveur ancien » déjà payée dans ce dépôt) ne doit PAS faire retomber
    le contrôle sur des bornes devinées ici : on refuse le réglage fin, et
    l'état, lui, reste basculable."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict:
        return {"routines": _ROUTINES_SUMMARY["routines"]}

    monkeypatch.setattr(bellum_api, "laura_routines_summary", summary)
    assert "error" in await _run({"key": "daily_briefing", "hour": 7})
    assert (await _run({"key": "daily_briefing", "enabled": True}))["status"] == "pending_confirmation"


def test_the_description_names_the_three_fine_settings() -> None:
    description = str(
        next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "toggle_routine")["description"]
    ).lower()
    for word in ("heure", "jour", "canal"):
        assert word in description


@pytest.mark.asyncio
async def test_toggle_routine_never_calls_the_write_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """Preuve par l'absence : `bellum_api` n'expose aucun verbe d'écriture pour
    les routines. Si un jour quelqu'un en ajoute un, ce test échoue et rappelle
    la règle — l'écriture passe par le CLIC de l'utilisateur, authentifié JWT,
    jamais par le pont interne."""
    assert not hasattr(bellum_api, "update_routine")
    assert not hasattr(bellum_api, "toggle_routine")
    assert not hasattr(bellum_api, "patch_routine")
