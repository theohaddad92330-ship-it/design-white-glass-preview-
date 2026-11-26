"""#2975 (#2440.69-72) — la route de secours vers Anthropic, ANNONCÉE, LIMITÉE,
et maintenant AVEC RETRY.

``_select_provider`` retombait déjà sur Anthropic avec un `logger.warning`
quand le fournisseur routé est indisponible (`test_falls_back_to_anthropic_
without_key`, test_llm_gateway.py) — la première section de cette suite garde
ce qui manquait : que la dégradation qui DURE cesse d'être un bruit de fond
identique à la première bascule, jamais qu'elle bloque ou invente un résultat.

La seconde section (28/09, passe 2) livre LE RETRY qui restait « reste » sur
cinq lots indépendants : `complete()` bascule maintenant, une seule fois et
sans jamais réessayer le fournisseur qui vient d'échouer, vers Anthropic —
mais UNIQUEMENT pour une panne RUNTIME (délai, connexion, quota, panne
serveur) et UNIQUEMENT derrière `LLM_GATEWAY_RETRY_ON_ERROR` (hors réglage :
chemin byte-identique, l'exception remonte nue).
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock

import httpx
import openai
import pytest

from app.services import claude_service, llm_gateway
from app.services.llm_gateway import Route, _select_provider


@pytest.fixture(autouse=True)
def _clean_streaks():
    llm_gateway.reset_degraded_route_streak()
    yield
    llm_gateway.reset_degraded_route_streak()


def _unavailable_route() -> Route:
    # OPENAI_API_KEY absent (fixture globale de test_llm_gateway.py — non
    # rechargée ici, mais aucun test de ce fichier ne le pose) : le fournisseur
    # OpenAI est indisponible, donc chaque appel dégrade vers Anthropic.
    return Route(llm_gateway.PROVIDER_OPENAI, "gpt-4o")


def test_a_single_fallback_only_warns(monkeypatch, caplog):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with caplog.at_level("WARNING", logger="app.services.llm_gateway"):
        provider = _select_provider(_unavailable_route())
    assert provider is llm_gateway.ANTHROPIC_PROVIDER
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)
    assert any("bascule dégradée consécutive #1" in r.getMessage() for r in caplog.records)


def test_repeated_fallbacks_escalate_to_error_past_the_threshold(monkeypatch, caplog):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with caplog.at_level("WARNING", logger="app.services.llm_gateway"):
        for _ in range(llm_gateway._DEGRADED_ROUTE_ALERT_THRESHOLD - 1):
            _select_provider(_unavailable_route())
        assert not any(r.levelno >= logging.ERROR for r in caplog.records)

        _select_provider(_unavailable_route())
    assert any(r.levelno >= logging.ERROR for r in caplog.records)


def test_the_streak_resets_once_the_provider_is_available_again(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    for _ in range(3):
        _select_provider(_unavailable_route())
    assert llm_gateway._degraded_route_streaks[llm_gateway.PROVIDER_OPENAI] == 3

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    provider = _select_provider(_unavailable_route())

    assert provider is llm_gateway.OPENAI_PROVIDER
    assert llm_gateway.PROVIDER_OPENAI not in llm_gateway._degraded_route_streaks


def test_streaks_are_never_aggregated_across_providers(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    for _ in range(4):
        _select_provider(_unavailable_route())

    # Un fournisseur inconnu du registre dégrade aussi, sous SA propre clé.
    _select_provider(Route("un-fournisseur-jamais-route", None))

    assert llm_gateway._degraded_route_streaks[llm_gateway.PROVIDER_OPENAI] == 4
    assert llm_gateway._degraded_route_streaks["un-fournisseur-jamais-route"] == 1


def test_a_healthy_route_never_touches_the_streak(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    _select_provider(Route(llm_gateway.PROVIDER_OPENAI, "gpt-4o"))
    assert llm_gateway._degraded_route_streaks == {}


def test_anthropic_routes_never_count_as_degraded():
    _select_provider(Route(llm_gateway.PROVIDER_ANTHROPIC, None))
    assert llm_gateway._degraded_route_streaks == {}


# ── #2440.69-72 (suite) : LE RETRY, hors réglage puis avec ────────────────────
#
# `_select_provider` (tests ci-dessus) bascule déjà sur une INDISPONIBILITÉ
# STATIQUE (pas de clé/SDK, vérifiée AVANT l'appel). Ce qui manquait : la même
# bascule pour une panne RUNTIME (délai, connexion, quota, panne serveur),
# mesurée PENDANT l'appel — le morceau que cinq lots précédents ont nommé
# « reste » parce qu'un retry INCONDITIONNEL sur le fournisseur qui vient
# d'échouer ajouterait de la latence au chemin chaud. Ici on ne réessaie
# JAMAIS ce fournisseur : on bascule, une fois, vers Anthropic.


def _timeout_exc() -> openai.APITimeoutError:
    return openai.APITimeoutError(request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"))


def _connection_exc() -> openai.APIConnectionError:
    return openai.APIConnectionError(request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"))


@pytest.fixture(autouse=True)
def _clean_retry_env(monkeypatch):
    monkeypatch.delenv("LLM_GATEWAY_RETRY_ON_ERROR", raising=False)


@pytest.mark.asyncio
async def test_hors_reglage_lexception_dune_panne_transitoire_remonte_nue(monkeypatch):
    """Le défaut de TOUT appelant d'avant ce champ : aucune bascule, aucun
    coût de latence — l'exception remonte telle quelle."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", AsyncMock(side_effect=_timeout_exc()))
    dispatch = AsyncMock(side_effect=AssertionError("Anthropic ne doit jamais être appelé hors réglage"))
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

    with pytest.raises(openai.APITimeoutError):
        await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
    dispatch.assert_not_called()
    assert llm_gateway._degraded_route_streaks == {}


@pytest.mark.asyncio
async def test_avec_reglage_une_panne_transitoire_bascule_une_fois_sans_reessayer(monkeypatch, caplog):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    monkeypatch.setenv("LLM_GATEWAY_RETRY_ON_ERROR", "1")
    invoke = AsyncMock(side_effect=_connection_exc())
    monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", invoke)
    anthropic_usage = claude_service.TokenUsage(input_tokens=10, output_tokens=5, model="claude-sonnet-5", cost_usd=0.01)
    dispatch = AsyncMock(return_value=("anthropic-out", anthropic_usage))
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

    with caplog.at_level("WARNING", logger="app.services.llm_gateway"):
        result, usage = await llm_gateway.complete(
            "bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5"
        )

    assert (result, usage) == ("anthropic-out", anthropic_usage)
    # UNE seule invocation OpenAI : jamais réessayé sur LUI, la bascule part
    # directement vers Anthropic.
    invoke.assert_awaited_once()
    dispatch.assert_awaited_once()
    # Le modèle SUIT l'appelant, jamais la route en panne : un identifiant
    # OpenAI ne doit jamais partir dans l'appel Anthropic.
    assert dispatch.call_args.kwargs["model"] == "claude-sonnet-5"
    assert llm_gateway._degraded_route_streaks[llm_gateway.PROVIDER_OPENAI] == 1
    assert any("bascule dégradée consécutive #1" in r.getMessage() for r in caplog.records)
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)


@pytest.mark.asyncio
async def test_une_erreur_non_transitoire_ne_bascule_jamais_meme_reglee(monkeypatch):
    """Une erreur de FORME (ici une `ValueError` quelconque) n'est jamais
    « un fournisseur en panne » — la retenter sur Anthropic masquerait un
    défaut réel plutôt que de le réparer."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    monkeypatch.setenv("LLM_GATEWAY_RETRY_ON_ERROR", "1")
    monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", AsyncMock(side_effect=ValueError("boom")))
    dispatch = AsyncMock(side_effect=AssertionError("Anthropic ne doit pas être appelé sur une erreur de forme"))
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

    with pytest.raises(ValueError, match="boom"):
        await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
    dispatch.assert_not_called()


@pytest.mark.asyncio
async def test_une_panne_anthropic_ne_bascule_jamais_sur_elle_meme(monkeypatch):
    """Le fournisseur déjà Anthropic n'a aucune route de secours : sa propre
    panne remonte telle quelle, réglage ou non."""
    monkeypatch.setenv("LLM_GATEWAY_RETRY_ON_ERROR", "1")
    dispatch = AsyncMock(side_effect=_timeout_exc())
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

    with pytest.raises(openai.APITimeoutError):
        await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
    dispatch.assert_awaited_once()
