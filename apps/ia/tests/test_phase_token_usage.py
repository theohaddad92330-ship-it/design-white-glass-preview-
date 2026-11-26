"""#274 — per-phase output-token attribution.

`phase_token_usage` is the measurement instrument the strategy-output-reduction
work needs: the run total alone can't say which phase to shrink, so we break the
`_api_metrics.token_usage` blob down per generation (facts / signals / strategy)
while keeping the previously-shipped top-level keys byte-for-byte compatible.
"""

from app.services.claude_service import TokenUsage, phase_token_usage


def _usage(inp: int, out: int, cost: float, cr: int = 0, cc: int = 0) -> TokenUsage:
    return TokenUsage(
        input_tokens=inp,
        output_tokens=out,
        model="claude-x",
        cost_usd=cost,
        cache_read_tokens=cr,
        cache_creation_tokens=cc,
    )


def _phases() -> dict[str, TokenUsage]:
    return {
        "facts": _usage(100, 10, 0.1, cr=5, cc=1),
        "signals": _usage(200, 20, 0.2, cr=0, cc=2),
        "strategy": _usage(300, 90, 0.6, cr=7, cc=0),
    }


def test_totals_are_the_sum_of_phases():
    tu = phase_token_usage(_phases())
    assert tu["input_tokens"] == 600
    assert tu["output_tokens"] == 120
    assert tu["cost_usd"] == 0.9
    assert tu["cache_read_input_tokens"] == 12
    assert tu["cache_creation_input_tokens"] == 3


def test_top_level_keys_stay_compatible_with_the_reader():
    # `_token_usage_from_metrics` reads exactly these keys — they must survive.
    tu = phase_token_usage(_phases())
    for key in (
        "input_tokens",
        "output_tokens",
        "cost_usd",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    ):
        assert key in tu


def test_by_phase_breaks_down_each_generation():
    tu = phase_token_usage(_phases())
    by_phase = tu["by_phase"]
    assert set(by_phase) == {"facts", "signals", "strategy"}
    # The #274 target: strategy output tokens are attributable on their own.
    assert by_phase["strategy"]["output_tokens"] == 90
    assert by_phase["facts"]["output_tokens"] == 10
    assert by_phase["signals"]["output_tokens"] == 20
    # strategy is the biggest generation post (what #274 aims to shrink).
    assert max(by_phase, key=lambda p: by_phase[p]["output_tokens"]) == "strategy"


def test_each_phase_carries_the_full_usage_shape():
    tu = phase_token_usage(_phases())
    strat = tu["by_phase"]["strategy"]
    assert strat == {
        "input_tokens": 300,
        "output_tokens": 90,
        "cost_usd": 0.6,
        "cache_read_input_tokens": 7,
        "cache_creation_input_tokens": 0,
    }


def test_empty_phases_yield_zero_totals():
    tu = phase_token_usage({})
    assert tu["output_tokens"] == 0
    assert tu["by_phase"] == {}
