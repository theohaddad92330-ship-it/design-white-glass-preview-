"""Recette LAU-FINAL-024 (#2283, épopée #2983) — deux scénarios cités
explicitement dans « RECETTE » du corps de l'épopée :

  - « source publique en panne » (#2283.46) : le disjoncteur doit ARRÊTER les
    appels réseau après un nombre d'échecs consécutifs, pas les laisser
    s'accumuler indéfiniment pendant qu'un utilisateur attend.
  - « timeout sur la dernière étape » (#2283.49) : un outil qui expire ne doit
    ni bloquer indéfiniment ni relancer sans fin — et NE DOIT JAMAIS effacer
    ce qu'une étape PRÉCÉDENTE, déjà réussie, avait produit (doctrine NO-GO —
    #2283.53 : un job entier n'échoue pas pour une étape facultative).

Simulé au niveau de `tool_resilience.execute_chat_tool_resilient` avec un
exécuteur factice — pas le vrai `execute_chat_tool` (réseau réel, 9248 lignes)."""

from __future__ import annotations

import asyncio

from app.services.tool_circuit_breaker import ToolCircuitBreaker
from app.services.tool_error_taxonomy import ToolErrorCode, tool_error_payload
from app.services.tool_resilience import execute_chat_tool_resilient
from app.services.tool_retry_policy import ToolRetryPolicy


def _fast_policy(**overrides) -> ToolRetryPolicy:
    base = dict(max_retries=1, backoff_base_s=0.001, backoff_max_s=0.002, max_duration_s=0.5)
    base.update(overrides)
    return ToolRetryPolicy(**base)


def test_source_publique_en_panne_le_disjoncteur_arrete_les_appels_reseau() -> None:
    """#2283.46 — après le seuil d'échecs consécutifs, plus AUCUN appel
    n'atteint l'exécuteur (simule Brave/une source publique down)."""
    network_calls = {"n": 0}

    async def flaky_public_source(name, tool_input, *, user_id, **kw):
        network_calls["n"] += 1
        return tool_error_payload(ToolErrorCode.TEMPORARILY_UNAVAILABLE, "Source publique indisponible.")

    breaker = ToolCircuitBreaker(failure_threshold=3, cooldown_s=60.0)
    policy = _fast_policy(max_retries=0)  # un seul essai par appel utilisateur

    async def one_user_request(account_id: str) -> dict:
        return await execute_chat_tool_resilient(
            "run_account_search",
            {"account_id": account_id},
            user_id="user-1",
            executor=flaky_public_source,
            circuit_breaker=breaker,
            retry_policy=policy,
        )

    # Cinq utilisateurs successifs, chacun sur un compte DIFFÉRENT (donc pas
    # dédupliqués entre eux par l'idempotency cache).
    results = [asyncio.run(one_user_request(f"acc-{i}")) for i in range(5)]

    for result in results:
        assert result["error_code"] == "temporarily_unavailable"

    # Seuil=3 : les 3 premiers appels touchent le réseau, les 2 suivants sont
    # court-circuités — le réseau n'a JAMAIS plus de 3 appels, quel que soit
    # le nombre d'utilisateurs qui arrivent ensuite pendant la panne.
    assert network_calls["n"] == 3


def test_timeout_sur_la_derniere_etape_s_arrete_proprement_sans_effacer_ce_qui_precede() -> None:
    """#2283.49 / #2283.53 (NO-GO) — un timeout sur la DERNIÈRE étape d'un job
    en plusieurs étapes n'efface jamais les étapes déjà réussies, et ne
    boucle pas indéfiniment."""
    preserved_steps: list[str] = []
    attempts = {"n": 0}

    async def step_one_succeeds(name, tool_input, *, user_id, **kw):
        return {"ok": True, "step": "recherche_entreprise"}

    async def last_step_always_times_out(name, tool_input, *, user_id, **kw):
        attempts["n"] += 1
        raise TimeoutError("dernière étape trop longue")

    async def run_job() -> dict:
        first = await execute_chat_tool_resilient(
            "find_accounts",
            {},
            user_id="user-2",
            executor=step_one_succeeds,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
        )
        preserved_steps.append(first["step"])

        return await execute_chat_tool_resilient(
            "get_mission_risks",
            {},
            user_id="user-2",
            executor=last_step_always_times_out,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(max_retries=2, backoff_base_s=0.001, backoff_max_s=0.002, max_duration_s=0.05),
        )

    final = asyncio.run(run_job())

    # L'étape 1, réussie AVANT le timeout de l'étape 2, n'a jamais été
    # touchée par l'échec de la suivante.
    assert preserved_steps == ["recherche_entreprise"]
    # La dernière étape rend un timeout typé, retryable mais BORNÉ — jamais
    # une exception qui remonte casser le tour de chat.
    assert final["error_code"] == "timeout"
    assert final["retryable"] is True
    # Bornée par `max_duration_s`, pas par `max_retries` : le nombre d'essais
    # reste petit (pas une boucle infinie).
    assert 1 <= attempts["n"] <= 3
