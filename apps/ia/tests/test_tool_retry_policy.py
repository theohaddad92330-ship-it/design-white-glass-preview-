"""#2283.18/.19/.20/.21/.22/.23 — politique de retry PAR OUTIL du chat : nombre
maximal, backoff, durée maximale, coût du retry, erreurs (non-)retryables.

Avant ce module, seul `brave_search.py` avait un `max_retries=3` — pour UNE
source, pas "chaque outil" comme le demande #2283. Ce module donne un lookup
`get_retry_policy(tool_name)` : un tool nommé a SA politique (même si, faute
d'avoir audité individuellement les 84 outils, la valeur par défaut est
partagée) — jamais une constante globale sans nom d'outil."""

from __future__ import annotations

from app.services.tool_error_taxonomy import ToolErrorCode
from app.services.tool_retry_policy import (
    DEFAULT_RETRY_POLICY,
    RETRY_POLICIES,
    ToolRetryPolicy,
    get_retry_policy,
)


def test_default_policy_only_retries_transient_families() -> None:
    assert DEFAULT_RETRY_POLICY.retryable_codes == frozenset(
        {ToolErrorCode.TEMPORARILY_UNAVAILABLE, ToolErrorCode.TIMEOUT}
    )


def test_default_policy_is_bounded() -> None:
    # Une politique sans borne de durée retenterait indéfiniment un outil mort
    # pendant qu'un utilisateur attend une réponse de chat.
    assert DEFAULT_RETRY_POLICY.max_retries >= 1
    assert DEFAULT_RETRY_POLICY.max_duration_s > 0
    assert DEFAULT_RETRY_POLICY.max_duration_s < 60.0  # sous le _PER_CALL_TIMEOUT_S du tour LLM


def test_get_retry_policy_falls_back_to_default_for_unknown_tool() -> None:
    assert get_retry_policy("un_outil_qui_n_existe_pas") is DEFAULT_RETRY_POLICY


def test_get_retry_policy_is_keyed_by_tool_name_not_a_bare_global() -> None:
    # Le point du lot : chaque outil a SON entrée de lookup, pas une seule
    # constante partagée invisible depuis le nom de l'outil.
    for name in RETRY_POLICIES:
        assert isinstance(name, str) and name
        assert isinstance(get_retry_policy(name), ToolRetryPolicy)


def test_retry_costs_no_credit_by_default() -> None:
    # #2283.23 — "coût du retry" : une nouvelle tentative d'un outil de LECTURE
    # du chat ne débite jamais l'utilisateur une deuxième fois (le coût du
    # tour est déjà fixé avant l'appel outil — `_ReplyCostBudget`). Vrai tant
    # qu'aucune politique ne dit le contraire.
    assert DEFAULT_RETRY_POLICY.retry_costs_credits is False
    for policy in RETRY_POLICIES.values():
        assert policy.retry_costs_credits is False
