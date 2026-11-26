"""GA-291 / GA-292 — le total de coût qui n'additionne pas.

``builder.summarize_telemetry`` calcule
``providers_cost_usd(get_metrics(cid)) or llm_cost``. ``providers_cost_usd``
est ``provider_pricing.total_cost_usd``, dont le docstring dit : « Token-priced
providers keep the exact cost claude_service already recorded » (price_run,
ligne 91). Ce contrat suppose que quelque chose écrit le coût Claude dans le
seau ``run_metrics`` du fournisseur token-priced — c'est le rôle documenté de
``run_metrics.record_cost``. Or ``record_cost`` n'avait AUCUN appelant en
dehors des tests : le seau ``claude``/``anthropic`` ne portait jamais que
``calls``/``duration_ms``, son ``cost_usd`` restait 0.0 par construction.

Conséquence : ``providers_cost_usd(...)`` n'incluait jamais Claude. Tant que ce
total valait 0.0 (aucun fournisseur facturé n'avait été appelé sous ce
correlation id), le ``or`` retombait sur ``llm_cost`` et le total restait juste
PAR ACCIDENT. Dès qu'un fournisseur facturable (Firecrawl, Apollo — tous deux
ont un prix par défaut non nul dans ``_DEFAULT_UNIT_COST_USD``, aucune variable
d'environnement n'est même nécessaire) avait été appelé avec succès sous ce
run, ``providers_cost_usd(...)`` devenait non nul, le ``or`` gardait cette
valeur, et Claude — la plus grosse ligne — disparaissait purement et simplement
du total.

Corrigé en restaurant le contrat documenté : ``claude_service._log_usage`` (le
seul seam commun aux DEUX fournisseurs LLM, Anthropic et OpenAI) appelle
maintenant ``run_metrics.record_cost`` avec le coût exact déjà calculé par
``_compute_cost`` — sans compter un appel supplémentaire (``record_cost`` ne
touche jamais ``calls``), pour ne jamais doubler ce que ``price_run``
recompterait par ailleurs. ``price_run`` exclut déjà explicitement les
fournisseurs token-priced (``TOKEN_PRICED_PREFIXES``) de son calcul par appel,
donc le coût qu'il porte pour "anthropic"/"openai" reste EXACTEMENT celui posé
par ``record_cost`` — jamais un centime de plus.
"""

from __future__ import annotations

import pytest

from app.graph.builder import summarize_telemetry
from app.middleware import correlation_id as correlation
from app.services import run_metrics
from app.services.claude_service import CallMetadata, TokenUsage, _log_usage

CID_CENTRAL = "cid-cost-total-central"
CID_LLM_ONLY = "cid-cost-total-llm-only"
CID_NOTHING = "cid-cost-total-nothing"


def _bind(cid: str):
    """Pose le correlation id comme le ferait le middleware en prod, et repart
    d'un seau ``run_metrics`` vide — un test qui hérite du seau d'un test
    voisin ne prouverait rien sur SON propre run."""
    run_metrics.clear_metrics(cid)
    return correlation._correlation_id.set(cid)


def _unbind(token, cid: str) -> None:
    run_metrics.clear_metrics(cid)
    correlation._correlation_id.reset(token)


def _envelope(cost_usd: float) -> dict:
    """Une méta de phase telle que les nodes du graphe la construisent : c'est
    elle qui alimente ``total_llm_cost_usd``, le chiffre d'AVANT ce lot."""
    return {
        "phase": "research",
        "cost_usd": cost_usd,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
        "duration_ms": 1,
    }


class TestClaudePlusProvidersAddUpExactlyOnce:
    def test_total_includes_claude_and_every_priced_provider_exactly_once(self) -> None:
        """Le cas central du lot : un coût Claude non nul ET un coût
        fournisseur non nul (Firecrawl, tarifé par défaut).

        Avant le correctif : ``total_cost_usd`` valait STRICTEMENT le coût
        Firecrawl seul (0.003 $) — Claude (0.20 $) manquait entièrement, alors
        que ``total_cost_usd >= total_llm_cost_usd`` est l'invariant que ce
        champ promet depuis son introduction (voir le commentaire dans
        ``builder.py``: "providers_cost_usd is the full picture").
        """
        token = _bind(CID_CENTRAL)
        try:
            # Claude : passe par le VRAI seam de production (`_log_usage`), pas
            # par un appel direct à `run_metrics` — c'est ce seam qui porte le
            # correctif, un test qui court-circuiterait ne prouverait rien.
            usage = TokenUsage(
                input_tokens=1000,
                output_tokens=500,
                model="claude-sonnet-4-6",
                cost_usd=0.20,
                provider="anthropic",
            )
            _log_usage(usage, CallMetadata(prompt_name="research", correlation_id=CID_CENTRAL))

            # Firecrawl : 3 appels réussis. Prix par défaut 0.001 $/appel — AUCUNE
            # variable d'environnement n'est posée ici, exactement le régime où
            # le piège s'arme (les défauts de `_DEFAULT_UNIT_COST_USD` suffisent).
            for _ in range(3):
                run_metrics.record_call(CID_CENTRAL, "firecrawl", duration_ms=50)

            state = {"envelopes": [_envelope(0.20)]}
            summary = summarize_telemetry(state, log_breakdown=False)

            assert summary["total_llm_cost_usd"] == pytest.approx(0.20)
            assert summary["total_cost_usd"] == pytest.approx(0.203)
            assert summary["total_cost_usd"] >= summary["total_llm_cost_usd"]

            # Double comptage interdit dans les DEUX sens : le seau anthropic
            # porte 0.20 pile — ni 0 (jamais écrit, le bug d'origine), ni 0.40
            # (compté une fois par `record_cost` et une seconde fois par le
            # calcul par appel de `price_run`).
            assert summary["providers"]["anthropic"]["cost_usd"] == pytest.approx(0.20)
            assert summary["providers"]["anthropic"]["calls"] == 0, (
                "record_cost ne doit JAMAIS compter un appel supplémentaire "
                "(ce n'est pas ce qui manquait : c'était le coût)"
            )
            assert summary["providers"]["firecrawl"]["cost_usd"] == pytest.approx(0.003)
        finally:
            _unbind(token, CID_CENTRAL)

    def test_llm_only_regime_stays_exact_without_any_priced_provider_call(self) -> None:
        """Régime actuel de production : aucun fournisseur facturable n'a été
        appelé sous ce run (seul Claude a tourné).

        Non-régression : le total doit rester EXACTEMENT le coût Claude — ni un
        zéro (`providers_cost_usd` vide qui écraserait le nombre), ni une valeur
        gonflée par un double comptage.
        """
        token = _bind(CID_LLM_ONLY)
        try:
            usage = TokenUsage(
                input_tokens=800,
                output_tokens=300,
                model="claude-sonnet-4-6",
                cost_usd=0.15,
                provider="anthropic",
            )
            _log_usage(usage, CallMetadata(prompt_name="plan", correlation_id=CID_LLM_ONLY))

            state = {"envelopes": [_envelope(0.15)]}
            summary = summarize_telemetry(state, log_breakdown=False)

            assert summary["total_llm_cost_usd"] == pytest.approx(0.15)
            assert summary["total_cost_usd"] == pytest.approx(0.15)
        finally:
            _unbind(token, CID_LLM_ONLY)

    def test_a_run_with_no_cost_at_all_is_not_flagged(self) -> None:
        """Témoin (la garde ne doit pas attraper ce qu'elle ne vise pas) : un
        run sans AUCUN coût — ni Claude, ni fournisseur — est un run
        légitimement gratuit (ex. classification pure, phase Apollo-only), pas
        une panne. Il doit rester à zéro sans qu'aucune assertion ne le
        signale comme suspect."""
        token = _bind(CID_NOTHING)
        try:
            summary = summarize_telemetry({"envelopes": []}, log_breakdown=False)

            assert summary["total_llm_cost_usd"] == 0.0
            assert summary["total_cost_usd"] == 0.0
            assert summary["providers"] == {}
        finally:
            _unbind(token, CID_NOTHING)
