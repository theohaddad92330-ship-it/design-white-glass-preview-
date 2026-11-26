"""Laura compte avant de proposer un lien filtre (décision Louis, 15/09/2026).

Le défaut corrigé : un lien profond VALIDE (route connue, filtre LU par
``_deep_link_refusal``) qui ne ramène AUCUNE ligne atterrit sur un écran vide —
l'utilisateur le découvre en cliquant, pas nous. ``_deep_link_count``
(``chat_tools.py``) répond à « combien de lignes ce filtre ramène-t-il » AVANT
la proposition, avec trois issues, et seulement trois :

  > 0       → le lien est proposé, ``proposal["count"]`` PEUT le nommer ;
  = 0 MESURÉ → le lien n'est PAS proposé, une erreur le dit ;
  non mesuré → le lien est proposé COMME AVANT, sans aucun nombre.

Ce fichier prouve, dans l'ordre que la garde exige :
 1. un compte MESURÉ à zéro bloque la proposition ;
 2. un budget dépassé laisse passer le lien SANS jamais nommer de nombre —
    « non mesuré » n'est jamais « 0 », la doctrine la plus chère du dépôt ;
 3. ``DEEP_LINK_COUNT_DISABLED`` est un no-op STRICT — zéro appel réseau,
    chemin byte-identique à avant ce lot ;
 4. le corpus des écrans comptables n'est pas vide, et le drapeau ``countable``
    ne peut JAMAIS rendre comptable un écran de détail (``:id``) ;
 5. témoin de non-régression : un écran de détail n'est pas compté et se
    propose exactement comme avant.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import bellum_api, chat_tools

USER = "44444444-4444-4444-8444-444444444444"
TALENT = "a800466a-4194-4394-bd74-8d15a52df24f"


@pytest.fixture(autouse=True)
def _clear_deep_link_count_env(monkeypatch: pytest.MonkeyPatch) -> None:
    # Hermétique même si tests/env_hermeticity.py ne couvre pas encore les deux
    # variables au moment où ce fichier tourne isolément.
    monkeypatch.delenv("DEEP_LINK_COUNT_DISABLED", raising=False)
    monkeypatch.delenv("DEEP_LINK_COUNT_BUDGET_S", raising=False)


async def _propose(route: str, label: str = "Contacts") -> dict:
    return await chat_tools.execute_chat_tool(
        "propose_guided_action", {"route": route, "label": label}, user_id=USER, profile_data=None
    )


# ── 1. compte mesuré à zéro ⇒ pas de proposition ─────────────────────────────


@pytest.mark.asyncio
async def test_a_measured_zero_count_blocks_the_proposal(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_zero(*_args: object, **_kwargs: object) -> int:
        return 0

    monkeypatch.setattr(bellum_api, "count_contacts", fake_zero)
    result = await _propose("/contacts?company=SNCF")
    assert "proposal" not in result, result
    assert "aucune ligne" in result["error"]
    assert "/contacts" in result["error"]


@pytest.mark.asyncio
async def test_a_positive_measured_count_is_kept_and_can_be_named(monkeypatch: pytest.MonkeyPatch) -> None:
    # Témoin positif : sans lui, le test n°1 pourrait passer pour la MAUVAISE
    # raison (un compte qui bloquerait toujours, quelle que soit sa valeur).
    async def fake_five(*_args: object, **_kwargs: object) -> int:
        return 5

    monkeypatch.setattr(bellum_api, "count_contacts", fake_five)
    result = await _propose("/contacts?company=SNCF")
    assert "error" not in result, result
    assert result["proposal"]["count"] == 5


# ── 2. budget dépassé ⇒ le lien passe, SANS jamais nommer de nombre ─────────


@pytest.mark.asyncio
async def test_a_count_over_budget_still_proposes_and_never_names_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEP_LINK_COUNT_BUDGET_S", "0.01")

    async def slow_count(*_args: object, **_kwargs: object) -> int:
        await asyncio.sleep(0.3)
        return 42  # ne doit JAMAIS être atteint dans le budget du test

    monkeypatch.setattr(bellum_api, "count_contacts", slow_count)
    result = await _propose("/contacts?company=SNCF")
    assert "error" not in result, result
    # « Non mesuré » n'est jamais « 0 » : la clé est ABSENTE, jamais posée à 0.
    assert "count" not in result["proposal"], result
    assert result["proposal"]["route"] == "/contacts?company=SNCF"


# ── 3. DEEP_LINK_COUNT_DISABLED ⇒ no-op strict ──────────────────────────────


@pytest.mark.asyncio
async def test_the_kill_switch_makes_the_count_a_strict_no_op(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEP_LINK_COUNT_DISABLED", "true")
    calls: list[object] = []

    async def spy(*args: object, **kwargs: object) -> int:
        calls.append((args, kwargs))
        return 7

    monkeypatch.setattr(bellum_api, "count_contacts", spy)
    result = await _propose("/contacts?company=SNCF")
    assert calls == [], "zéro appel réseau attendu, le compte est coupé"
    assert "error" not in result, result
    # Chemin byte-identique à avant le lot : exactement les quatre clés d'une
    # proposition d'écran, jamais de `count`.
    assert set(result["proposal"]) == {"action", "cost_credits", "route", "label"}
    assert result["proposal"]["route"] == "/contacts?company=SNCF"


@pytest.mark.asyncio
async def test_disabled_kill_switch_still_counts(monkeypatch: pytest.MonkeyPatch) -> None:
    # Témoin positif du n°3 : sans lui, le kill-switch pourrait être un no-op
    # pour la MAUVAISE raison (le compte ne marcherait jamais, coupé ou pas).
    monkeypatch.delenv("DEEP_LINK_COUNT_DISABLED", raising=False)

    async def fake_zero(*_args: object, **_kwargs: object) -> int:
        return 0

    monkeypatch.setattr(bellum_api, "count_contacts", fake_zero)
    result = await _propose("/contacts?company=SNCF")
    assert "proposal" not in result, result


# ── 4. le corpus n'est pas vide, et le drapeau ne rend jamais comptable un
#       écran de détail ──────────────────────────────────────────────────────


def test_the_countable_corpus_is_not_empty() -> None:
    assert chat_tools._COUNTABLE_DEEP_LINK_ROUTES
    assert "/contacts" in chat_tools._COUNTABLE_DEEP_LINK_ROUTES


def test_a_detail_route_is_never_countable_even_if_flagged_so() -> None:
    # Le catalogue réel ne marque aucun écran `:id` comme `countable` — cette
    # entrée FABRIQUÉE prouve la protection STRUCTURELLE (`_deep_link_is_countable`)
    # plutôt qu'un simple constat sur les données du jour.
    fabricated = {"route": "/consultants/:id/reverse-market", "countable": True}
    assert chat_tools._deep_link_is_countable(fabricated) is False


# ── 5. témoin de non-régression : un écran de détail n'est jamais compté ────


@pytest.mark.asyncio
async def test_a_detail_screen_is_never_counted_and_proposes_exactly_as_before(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[object] = []

    async def spy(*args: object, **kwargs: object) -> int:
        calls.append((args, kwargs))
        return 0  # s'il était lu, bloquerait le lien à tort

    monkeypatch.setattr(bellum_api, "count_contacts", spy)
    route = f"/consultants/{TALENT}/reverse-market?scope=mine"
    result = await _propose(route, label="Marché inverse")
    assert "error" not in result, result
    assert calls == [], "un écran de détail ne doit déclencher aucun compte"
    assert "count" not in result["proposal"]
    assert result["proposal"]["route"] == route
