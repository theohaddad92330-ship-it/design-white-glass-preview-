"""Le fournisseur promptfoo suit la même règle que la prod pour `temperature`.

Premier vrai run de promptfoo avec la clé (PR #4942) : les 35 cas en 400
« `temperature` is deprecated for this model », parce que provider.py envoyait
`temperature=0` en dur. La décision vit dans `claude_service.supports_sampling_params` ;
le fournisseur doit la relire, pas la recoder.
"""

from __future__ import annotations

from app.services.claude_service import supports_sampling_params
from evals.promptfoo.provider import _sampling


def test_model_without_sampling_params_gets_no_temperature() -> None:
    assert not supports_sampling_params("claude-sonnet-5")
    assert _sampling("claude-sonnet-5") == {}


def test_model_with_sampling_params_stays_greedy() -> None:
    assert supports_sampling_params("claude-haiku-4-5")
    assert _sampling("claude-haiku-4-5") == {"temperature": 0}
