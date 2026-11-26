"""#3495 — l'état de processus de `llm_gateway` ne fuit pas d'un test à l'autre.

En CI du 01/10, une série d'échecs d'exécution laissée par un test (trois 429
simulés) écartait la route OpenAI des tests suivants (« 3 échecs d'exécution
consécutifs ») et les faisait basculer sur Anthropic. Les deux tests ci-dessous
tournent dans cet ordre : le premier SALIT l'état, le second exige de le
trouver propre — sans la fixture autouse de `conftest.py`, il échoue.
"""

from app.services import llm_gateway


def test_un_test_peut_laisser_une_serie_d_echecs_et_un_fournisseur_epuise() -> None:
    for _ in range(3):
        llm_gateway.record_runtime_failure("openai")
    llm_gateway.mark_provider_exhausted("openai")
    assert llm_gateway._live_runtime_failure_streak("openai") == 3
    assert llm_gateway.is_provider_exhausted("openai")


def test_le_test_suivant_trouve_l_etat_propre() -> None:
    assert llm_gateway._live_runtime_failure_streak("openai") == 0
    assert not llm_gateway.is_provider_exhausted("openai")
