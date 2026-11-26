"""Deux leviers de coût sur le chemin Claude, mesurés par la console Anthropic
(juillet 2026) :

1. ``cache_system`` — le cache prompt est écrit à 1,25× et lu à 0,1×. Il n'est
   rentable QUE s'il est relu. Un fan-out parallèle (N appels concurrents avec
   le même system prompt) écrit N fois et ne lit jamais : personne ne peut lire
   ce que les autres sont en train d'écrire. Mesuré côté Haiku : 3,13 $ d'écriture
   pour 0,07 $ de lecture — amortissement 0,27×, soit une perte sèche.
   ``cache_system=False`` retire le ``cache_control`` sur ces appels-là.

2. Télémétrie de troncature — une réponse coupée à ``max_tokens`` est facturée
   plein tarif puis jetée (batch de contacts droppé, vocabulaire inchangé). Le
   code retentait déjà en doublant le budget, mais sans jamais compter ce que
   la tentative perdue avait coûté. On ne peut pas arbitrer un plafond qu'on ne
   mesure pas.

Le défaut reste inchangé (``cache_system=True``) : sans argument explicite, la
requête envoyée à Anthropic est byte-identique à celle d'avant.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from instructor.exceptions import IncompleteOutputException
from pydantic import BaseModel

from app.services.claude_service import (
    DICT_ENVELOPE_INSTRUCTION,
    CallMetadata,
    ClaudeIncompleteOutputError,
    _cached_system,
    cache_system_for_fanout,
    call_claude,
    reset_truncation_counters,
    truncation_counters,
)


class SimpleOutput(BaseModel):
    name: str


def _structured_client() -> MagicMock:
    completion = MagicMock()
    completion.usage.input_tokens = 100
    completion.usage.output_tokens = 50
    client = MagicMock()
    client.messages.create_with_completion = AsyncMock(
        return_value=(SimpleOutput(name="AXA"), completion),
    )
    return client


def _text_client() -> MagicMock:
    block = MagicMock(type="text")
    block.text = "ok"
    response = MagicMock()
    response.content = [block]
    response.usage.input_tokens = 10
    response.usage.output_tokens = 5
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=response)
    return client


# ---------------------------------------------------------------------------
# _cached_system — la primitive
# ---------------------------------------------------------------------------


class TestCachedSystem:
    def test_enabled_wraps_in_ephemeral_block(self) -> None:
        assert _cached_system("sys") == [
            {"type": "text", "text": "sys", "cache_control": {"type": "ephemeral"}}
        ]

    def test_disabled_returns_plain_string(self) -> None:
        # Une string simple est une valeur `system` valide pour l'API Messages :
        # aucun bloc, donc aucune écriture de cache facturée à 1,25×.
        assert _cached_system("sys", enabled=False) == "sys"


class TestCacheSystemForFanout:
    def test_first_call_writes_the_cache(self) -> None:
        """On garde une écriture : c'est elle qui rend la relecture possible au
        run suivant (les system prompts ne dépendent que du profil ESN)."""
        assert cache_system_for_fanout(0) is True

    def test_siblings_do_not_rewrite_it(self) -> None:
        # Ils ne peuvent pas la lire (elle n'est pas encore lisible) et la
        # réécrire coûte 1,25× pour rien.
        assert cache_system_for_fanout(1) is False
        assert cache_system_for_fanout(7) is False


# ---------------------------------------------------------------------------
# cache_system sur call_claude — les 3 chemins de dispatch
# ---------------------------------------------------------------------------


class TestCacheSystemFlag:
    @pytest.mark.asyncio
    async def test_default_still_caches_structured_path(self) -> None:
        """Garde-fou de non-régression : sans argument, rien ne change."""
        client = _structured_client()
        with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("sys", "usr", response_model=SimpleOutput, prompt_name="t")

        system = client.messages.create_with_completion.call_args.kwargs["system"]
        assert system[0]["cache_control"] == {"type": "ephemeral"}

    @pytest.mark.asyncio
    async def test_disabled_drops_cache_control_structured_path(self) -> None:
        client = _structured_client()
        with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude(
                    "sys", "usr", response_model=SimpleOutput, prompt_name="t", cache_system=False
                )

        assert client.messages.create_with_completion.call_args.kwargs["system"] == "sys"

    @pytest.mark.asyncio
    async def test_disabled_keeps_envelope_instruction_on_dict_path(self) -> None:
        """Le chemin dict concatène une consigne d'enveloppe au system prompt.
        Couper le cache ne doit pas la perdre — sinon la réponse n'est plus
        parsable."""
        client = _structured_client()
        # Le chemin dict enveloppe la réponse dans un modèle `{"data": {...}}`.
        envelope = MagicMock()
        envelope.data = {"ok": True}
        completion = MagicMock()
        completion.usage.input_tokens = 100
        completion.usage.output_tokens = 50
        client.messages.create_with_completion = AsyncMock(return_value=(envelope, completion))

        with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude(
                    "sys", "usr", response_model=dict, prompt_name="t", cache_system=False
                )

        system = client.messages.create_with_completion.call_args.kwargs["system"]
        assert system == "sys" + DICT_ENVELOPE_INSTRUCTION

    @pytest.mark.asyncio
    async def test_disabled_on_text_path(self) -> None:
        client = _text_client()
        with patch("anthropic.AsyncAnthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("sys", "usr", prompt_name="chat", cache_system=False)

        assert client.messages.create.call_args.kwargs["system"] == "sys"

    @pytest.mark.asyncio
    async def test_explicit_metadata_carries_the_flag(self) -> None:
        """Les appelants qui passent un ``CallMetadata`` complet (le gateway le
        thread jusqu'au dispatch Anthropic) doivent pouvoir porter le réglage
        sans nouveau paramètre de plomberie."""
        client = _structured_client()
        meta = CallMetadata(prompt_name="t", cache_system=False)
        with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("sys", "usr", response_model=SimpleOutput, metadata=meta)

        assert client.messages.create_with_completion.call_args.kwargs["system"] == "sys"


# ---------------------------------------------------------------------------
# Télémétrie de troncature
# ---------------------------------------------------------------------------


class TestTruncationTelemetry:
    def setup_method(self) -> None:
        reset_truncation_counters()

    def teardown_method(self) -> None:
        reset_truncation_counters()

    @pytest.mark.asyncio
    async def test_counts_the_wasted_attempt_when_retrying(self) -> None:
        """Une troncature suivie d'un retour OK au budget doublé reste une
        génération payée pour rien — elle doit être comptée."""
        completion = MagicMock()
        completion.usage.input_tokens = 100
        completion.usage.output_tokens = 50
        client = MagicMock()
        client.messages.create_with_completion = AsyncMock(
            side_effect=[
                IncompleteOutputException(last_completion=MagicMock()),
                (SimpleOutput(name="AXA"), completion),
            ],
        )

        with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude(
                    "sys", "usr",
                    response_model=SimpleOutput,
                    max_tokens=4000,
                    model="claude-haiku-4-5",
                    prompt_name="bellum_contacts",
                )

        stats = truncation_counters()["bellum_contacts"]
        assert stats.events == 1
        # La tentative perdue a rempli son plafond : c'est ce qu'on a payé.
        assert stats.wasted_output_tokens == 4000
        # Haiku sort à 5 $/M → 4000 tokens = 0,02 $ jetés.
        assert stats.wasted_cost_usd == pytest.approx(0.02)

    @pytest.mark.asyncio
    async def test_counts_every_rung_of_the_ladder(self) -> None:
        """Le retry double le budget jusqu'au plafond ; chaque barreau raté est
        une génération payée."""
        client = MagicMock()
        client.messages.create_with_completion = AsyncMock(
            side_effect=IncompleteOutputException(last_completion=MagicMock()),
        )

        with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                with pytest.raises(ClaudeIncompleteOutputError):
                    await call_claude(
                        "sys", "usr",
                        response_model=SimpleOutput,
                        max_tokens=8192,
                        model="claude-haiku-4-5",
                        prompt_name="bellum_vocabulary_builder",
                    )

        stats = truncation_counters()["bellum_vocabulary_builder"]
        # 8192 tronqué → retry à 16384 (plafond) tronqué → abandon.
        assert stats.events == 2
        assert stats.wasted_output_tokens == 8192 + 16384

    def test_counters_start_empty(self) -> None:
        assert truncation_counters() == {}
