"""Compteurs de coût par prompt — rendre visible les 85 % de la facture.

Mesure du 24/07/2026 : le pipeline d'analyse déclare 0,75 €/run (15 € sur
29 runs) alors que la console Anthropic facture ~122 € sur le mois. L'écart
part dans les fonctionnalités hors analyse (Copilote, discover, battlecard,
weekly, compare, icebreaker, message, summary, scorer, activity) : elles
appellent Claude à chaque clic, ne persistent aucune métrique et ne débitent
aucun crédit. On ne peut ni les optimiser ni les facturer tant qu'on ne sait
pas ce qu'elles coûtent.

Chaque appel logue déjà sa ligne ; ce qui manquait, c'est l'agrégat. Les
compteurs s'accumulent en mémoire du process et se lisent sur
``GET /metrics/cost`` (protégé par le gate interne comme toute route non
exemptée).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.claude_service import (
    cost_counters,
    reset_cost_counters,
    truncation_counters,
)


def _text_client(inp: int, out: int) -> MagicMock:
    block = MagicMock(type="text")
    block.text = "ok"
    response = MagicMock()
    response.content = [block]
    response.stop_reason = "end_turn"
    response.usage.input_tokens = inp
    response.usage.output_tokens = out
    response.usage.cache_read_input_tokens = 0
    response.usage.cache_creation_input_tokens = 0
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=response)
    return client


class TestCostCounters:
    def setup_method(self) -> None:
        reset_cost_counters()

    def teardown_method(self) -> None:
        reset_cost_counters()

    def test_starts_empty(self) -> None:
        assert cost_counters() == {}

    @pytest.mark.asyncio
    async def test_accumulates_per_prompt(self) -> None:
        from app.services.claude_service import call_claude

        client = _text_client(1000, 500)
        with patch("anthropic.AsyncAnthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                for _ in range(3):
                    await call_claude(
                        "sys", "usr", prompt_name="bellum_icebreaker", model="claude-haiku-4-5"
                    )

        stats = cost_counters()["bellum_icebreaker"]
        assert stats.calls == 3
        assert stats.input_tokens == 3000
        assert stats.output_tokens == 1500
        # Haiku : 1 $/M en entrée, 5 $/M en sortie → 3×(0,001 + 0,0025).
        assert stats.cost_usd == pytest.approx(0.0105)

    @pytest.mark.asyncio
    async def test_separates_prompts_and_keeps_the_model(self) -> None:
        from app.services.claude_service import call_claude

        client = _text_client(100, 100)
        with patch("anthropic.AsyncAnthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("s", "u", prompt_name="bellum_chat", model="claude-sonnet-5")
                await call_claude("s", "u", prompt_name="bellum_weekly", model="claude-haiku-4-5")

        counters = cost_counters()
        assert set(counters) == {"bellum_chat", "bellum_weekly"}
        assert counters["bellum_chat"].model == "claude-sonnet-5"
        assert counters["bellum_weekly"].model == "claude-haiku-4-5"
        # Même volume de tokens, Sonnet coûte 3× l'entrée et 3× la sortie de Haiku.
        assert counters["bellum_chat"].cost_usd > counters["bellum_weekly"].cost_usd


class TestMetricsEndpoint:
    def setup_method(self) -> None:
        reset_cost_counters()

    def teardown_method(self) -> None:
        reset_cost_counters()

    @pytest.mark.asyncio
    async def test_reports_prompts_sorted_by_cost(self) -> None:
        from app.main import cost_metrics
        from app.services.claude_service import call_claude

        client = _text_client(1000, 1000)
        with patch("anthropic.AsyncAnthropic", return_value=client):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("s", "u", prompt_name="bellum_chat", model="claude-sonnet-5")
                await call_claude("s", "u", prompt_name="bellum_summary", model="claude-haiku-4-5")

        payload = await cost_metrics()
        noms = [p["prompt"] for p in payload["prompts"]]
        assert noms == ["bellum_chat", "bellum_summary"], "le plus cher d'abord"
        assert payload["total_cost_usd"] == pytest.approx(
            sum(p["cost_usd"] for p in payload["prompts"])
        )
        # Les troncatures voyagent avec — c'est la même question (« qu'est-ce
        # qui coûte ? »), et une génération jetée est un coût sans livrable.
        assert payload["truncations"] == {
            k: v.__dict__ for k, v in truncation_counters().items()
        }
