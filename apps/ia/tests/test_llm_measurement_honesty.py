"""La MESURE d'un appel LLM doit être vraie, quel que soit le fournisseur.

Ce fichier ne teste pas le ROUTAGE (c'est ``test_llm_gateway.py``) : il teste ce
que le routage laisse derrière lui. Comparer deux modèles sur la durée n'a de
sens que si les trois colonnes de la comparaison — **qui**, **combien de temps**,
**combien ça coûte** — disent la vérité. Six défauts les rendaient fausses :

1. ``cost_ledger.record("anthropic", …)`` était écrit en dur dans ``_log_usage``,
   la fonction que les DEUX fournisseurs appellent. Un appel OpenAI atterrissait
   dans le registre du run sous l'étiquette « anthropic » — et de là dans la
   table ``provider_costs``, que le back-office lit pour répondre à « lequel a
   monté quand la facture monte ». La réponse était structurellement fausse.
2. La latence n'était pas mesurée côté OpenAI : ``_log_usage`` était appelé sans
   ``duration_s`` alors que la signature l'accepte. Pas de colonne latence, pas
   de comparaison.
3. Le tarif OpenAI s'arrêtait à ``gpt-4o``/``o3``.
4. Aucune surcharge par env côté OpenAI, alors que le côté Anthropic en a une.
5. ``temperature`` partait inconditionnellement vers OpenAI.
6. ``max_tokens`` partait vers OpenAI alors que le SDK embarqué le déclare
   déprécié et « not compatible with o-series models » — et la table de tarifs
   contient déjà ``o3``, ``o3-mini`` et ``o4-mini``.

Le fil rouge est la règle du dépôt : **un prix inconnu ne se lit jamais
« gratuit »** — et sa sœur, découverte ici, **un prix inconnu ne se lit jamais
« comme gpt-4o »**. Facturer un modèle inconnu au tarif d'un autre est pire
qu'un zéro : le chiffre a l'air juste, donc personne ne le vérifie.

Aucun réseau : la couture ``OPENAI_PROVIDER._invoke`` est remplacée dans les
tests de bout en bout, et le SDK OpenAI lui-même est remplacé par un double dans
les tests qui exercent le VRAI ``_invoke``.
"""

from __future__ import annotations

import asyncio
import logging
import os

import pytest

from app.services import claude_service, cost_ledger, llm_gateway
from app.services.claude_service import CallMetadata, TokenUsage
from app.services.llm_gateway import _ProviderUsage

_ROUTE_ENV = tuple(f"LLM_ROUTE_{t.upper()}" for t in llm_gateway.CANONICAL_TASKS)
_PRICE_ENV_PREFIX = "OPENAI_PRICE_"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch):
    """Chaque test part d'un environnement de routage ET de tarification propre.

    ``OPENAI_PRICE_*`` n'est pas couvert par la politique d'hermétisme
    (``tests/env_hermeticity.py`` liste des noms exacts, pas des familles), donc
    on le balaie ici — sinon un shell de développeur qui l'exporte ferait mentir
    les tests de surcharge.
    """
    for name in (*_ROUTE_ENV, "LLM_GATEWAY_ROUTING", "OPENAI_API_KEY", "LLM_GATEWAY_DISABLED"):
        monkeypatch.delenv(name, raising=False)
    for name in [n for n in list(os.environ) if n.startswith(_PRICE_ENV_PREFIX)]:
        monkeypatch.delenv(name, raising=False)
    # Les avertissements « une seule fois par modèle » sont mémorisés dans des
    # ensembles au niveau module : sans ce nettoyage, le deuxième test qui
    # attend un warning ne le verrait pas.
    llm_gateway._warned_unpriced_models.clear()
    llm_gateway._warned_openai_sampling_models.clear()
    yield


#: 100 jetons d'entrée, 50 de sortie, 0 en cache — la forme que ``_invoke`` rend.
_DEFAULT_PROVIDER_USAGE = _ProviderUsage(100, 50, 0)


async def _route_to_openai(
    monkeypatch: pytest.MonkeyPatch,
    model: str,
    *,
    usage: _ProviderUsage = _DEFAULT_PROVIDER_USAGE,
    delay_s: float = 0.0,
) -> TokenUsage:
    """Exécute UN appel réellement routé vers OpenAI, sans réseau."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", f"openai:{model}")

    async def fake_invoke(*_args, **_kwargs):
        if delay_s:
            await asyncio.sleep(delay_s)
        return "openai-out", usage

    monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", fake_invoke)
    _result, token_usage = await llm_gateway.complete(
        "bellum_strategy",
        "sys",
        "usr",
        response_model=None,
        model="claude-sonnet-5",
        metadata=CallMetadata(prompt_name="bellum_strategy"),
    )
    return token_usage


# ── 1. Le fournisseur voyage avec l'usage ─────────────────────────────────────


class TestProviderTravelsWithUsage:
    def test_token_usage_carries_a_provider_defaulting_to_anthropic(self) -> None:
        """Le défaut fait que les 19 sites d'appel de ``call_claude`` ignorent le
        sujet — c'est la contrainte du lot : aucun site d'appel ne change."""
        usage = TokenUsage(input_tokens=1, output_tokens=1, model="claude-sonnet-5", cost_usd=0.01)
        assert usage.provider == "anthropic"

    @pytest.mark.asyncio
    async def test_openai_call_is_recorded_under_openai(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with cost_ledger.bind_run("run-openai") as ledger:
            await _route_to_openai(monkeypatch, "gpt-4o")
            snapshot = cost_ledger.snapshot()

        # La garde LIT quelque chose : sans cette assertion, un registre vide
        # ferait passer la suivante par vacuité.
        assert ledger.entries, "le registre du run doit contenir la ligne de cet appel"
        assert [row["provider"] for row in snapshot] == ["openai"]
        assert snapshot[0]["operation"] == "bellum_strategy"
        assert snapshot[0]["units"] == 150

    @pytest.mark.asyncio
    async def test_anthropic_call_stays_recorded_under_anthropic(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Non-régression : le chemin par défaut ne bouge pas d'un iota."""

        async def fake_dispatch(_system, _user, **kwargs):
            usage = TokenUsage(
                input_tokens=10, output_tokens=5, model=kwargs["model"], cost_usd=0.0007
            )
            claude_service._log_usage(usage, kwargs["metadata"])
            return "ok", usage

        monkeypatch.setattr(claude_service, "_dispatch_anthropic", fake_dispatch)

        with cost_ledger.bind_run("run-anthropic") as ledger:
            await llm_gateway.complete(
                "bellum_facts", "sys", "usr", model="claude-sonnet-5",
                metadata=CallMetadata(prompt_name="bellum_facts"),
            )
            snapshot = cost_ledger.snapshot()

        assert ledger.entries
        assert [row["provider"] for row in snapshot] == ["anthropic"]
        assert snapshot[0]["cost_usd"] == pytest.approx(0.0007)

    @pytest.mark.asyncio
    async def test_log_line_names_the_provider(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Le second endroit où « anthropic » était écrit en dur : la ligne de log.

        Un run routé OpenAI écrivait ``Claude [gpt-4o] …`` dans Railway — le seul
        endroit où un humain regarde quand une facture surprend.
        """
        with caplog.at_level(logging.INFO, logger="app.services.claude_service"):
            await _route_to_openai(monkeypatch, "gpt-4o")

        assert caplog.records, "aucune ligne de log capturée — la garde ne lit rien"
        assert "openai" in caplog.text
        assert "gpt-4o" in caplog.text


class TestLedgerDetailTravelsWithUsage:
    """#2440.6/.7/.8/.9/.16/.19 — modèle, jetons, cache, statut et grille
    tarifaire doivent atteindre `provider_costs`, quel que soit le fournisseur."""

    @pytest.mark.asyncio
    async def test_anthropic_call_carries_model_tokens_cache_status_and_tariff_version(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def fake_dispatch(_system, _user, **kwargs):
            usage = TokenUsage(
                input_tokens=10,
                output_tokens=5,
                model=kwargs["model"],
                cost_usd=0.0007,
                cache_read_tokens=2,
                cache_creation_tokens=1,
                tariff_version=claude_service.ANTHROPIC_PRICING_VERSION,
            )
            claude_service._log_usage(usage, kwargs["metadata"])
            return "ok", usage

        monkeypatch.setattr(claude_service, "_dispatch_anthropic", fake_dispatch)

        with cost_ledger.bind_run("run-anthropic-detail"):
            await llm_gateway.complete(
                "bellum_facts", "sys", "usr", model="claude-sonnet-5",
                metadata=CallMetadata(prompt_name="bellum_facts"),
            )
            row = cost_ledger.snapshot()[0]

        assert row["model"] == "claude-sonnet-5"
        assert row["input_tokens"] == 10
        assert row["output_tokens"] == 5
        assert row["cache_read_tokens"] == 2
        assert row["cache_creation_tokens"] == 1
        assert row["status"] == "ok"
        assert row["tariff_version"] == claude_service.ANTHROPIC_PRICING_VERSION

    @pytest.mark.asyncio
    async def test_openai_call_carries_its_own_tariff_version(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with cost_ledger.bind_run("run-openai-detail"):
            await _route_to_openai(monkeypatch, "gpt-4o")
            row = cost_ledger.snapshot()[0]

        assert row["model"] == "gpt-4o"
        assert row["tariff_version"] == llm_gateway.OPENAI_PRICING_VERSION

    @pytest.mark.asyncio
    async def test_an_unpriced_openai_model_cites_no_tariff_version(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Un appel non tarifé n'a appliqué aucune grille — la citer inventerait
        # un prix appliqué qui n'a jamais eu lieu.
        with cost_ledger.bind_run("run-openai-unpriced"):
            await _route_to_openai(monkeypatch, "un-modele-inconnu")
            row = cost_ledger.snapshot()[0]

        assert "tariff_version" not in row


# ── 2. La latence côté OpenAI ─────────────────────────────────────────────────


class TestLatency:
    @pytest.mark.asyncio
    async def test_openai_call_carries_a_measured_latency(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict = {}
        real_log_usage = claude_service._log_usage

        def spy(usage, metadata, **kwargs):
            captured.update(kwargs)
            return real_log_usage(usage, metadata, **kwargs)

        monkeypatch.setattr(claude_service, "_log_usage", spy)

        await _route_to_openai(monkeypatch, "gpt-4o", delay_s=0.02)

        assert captured, "_log_usage n'a pas été appelé — la garde ne lit rien"
        assert "duration_s" in captured, "un appel OpenAI doit porter sa latence"
        # Le double dort 20 ms : une horloge honnête ne peut pas rendre moins.
        assert captured["duration_s"] >= 0.02

    @pytest.mark.asyncio
    async def test_anthropic_latency_is_unchanged(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Le chemin Anthropic mesurait déjà sa latence dans ses ``_call_*`` ;
        rien de ce lot ne doit la lui retirer."""
        import inspect

        for name in ("_call_structured", "_call_dict", "_call_text"):
            source = inspect.getsource(getattr(claude_service, name))
            assert "time.monotonic()" in source, f"{name} ne mesure plus sa durée"
            assert "duration_s=" in source, f"{name} ne transmet plus sa durée"


# ── 3. Un tarif OpenAI qui ne ment jamais ─────────────────────────────────────


class TestOpenAIPricingTable:
    def test_the_table_is_not_empty(self) -> None:
        """Preuve que la garde LIT un corpus : une table vide rendrait vraies,
        par vacuité, toutes les assertions « ce modèle est inconnu »."""
        assert len(llm_gateway._OPENAI_PRICING) >= 8

    @pytest.mark.parametrize("key", sorted(llm_gateway._OPENAI_PRICING))
    def test_every_declared_price_is_strictly_positive(self, key: str) -> None:
        price = llm_gateway._OPENAI_PRICING[key]
        assert price.input_usd > 0 and price.output_usd > 0 and price.cached_input_usd > 0

    def test_gpt_5_6_luna_is_priced_on_its_own_grid(self) -> None:
        # 0,20 $/M en entrée, 1,20 $/M en sortie, 0,02 $/M en entrée mise en
        # cache (fiche officielle du modèle, fournie par Louis, 28/08/2026).
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-5.6-luna") == pytest.approx(0.20)
        assert llm_gateway._openai_compute_cost(0, 1_000_000, "gpt-5.6-luna") == pytest.approx(1.20)
        assert llm_gateway._openai_compute_cost(
            0, 0, "gpt-5.6-luna", cache_read_tokens=1_000_000
        ) == pytest.approx(0.02)

    def test_gpt_5_6_luna_is_not_billed_at_the_gpt_4o_rate(self) -> None:
        """Le défaut exact qu'on corrige : avant, ce modèle tombait sur le palier
        ``gpt-4o`` (2,50 $/M) — soit 12,5 fois son vrai prix d'entrée."""
        luna = llm_gateway._openai_compute_cost(1_000_000, 1_000_000, "gpt-5.6-luna")
        gpt4o = llm_gateway._openai_compute_cost(1_000_000, 1_000_000, "gpt-4o")
        assert luna == pytest.approx(1.40)
        assert gpt4o == pytest.approx(12.50)
        assert luna != pytest.approx(gpt4o)

    def test_existing_tiers_are_unchanged(self) -> None:
        """Non-régression sur les paliers déjà en place — y compris la remise de
        0,5× sur l'entrée mise en cache, qui devient une valeur explicite."""
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o") == pytest.approx(2.50)
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o-mini") == pytest.approx(0.15)
        assert llm_gateway._openai_compute_cost(0, 1_000_000, "gpt-4o") == pytest.approx(10.00)
        assert llm_gateway._openai_compute_cost(
            0, 0, "gpt-4o", cache_read_tokens=1_000_000
        ) == pytest.approx(1.25)
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "o3") == pytest.approx(2.00)


class TestUnknownModelIsNeverInvented:
    def test_unknown_model_has_no_cost(self) -> None:
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "some-future-model") is None

    def test_unknown_model_warns_once(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="app.services.llm_gateway"):
            llm_gateway._openai_compute_cost(1, 1, "some-future-model")
            llm_gateway._openai_compute_cost(1, 1, "some-future-model")

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1, "un avertissement par modèle, pas un par appel"
        assert "some-future-model" in warnings[0].getMessage()
        assert "non tarifé" in warnings[0].getMessage()

    @pytest.mark.asyncio
    async def test_unknown_model_is_recorded_untariffed_not_free(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Le cœur du lot : ``cost_usd`` NULL dans le registre, jamais 0.

        ``None`` traverse déjà toute la chaîne — ``cost_ledger`` (« non
        tarifé »), ``provider_costs.cost_usd NUMERIC NULL`` côté API, et
        l'agrégat du back-office qui COMPTE les lignes non tarifées au lieu de
        les noyer dans le total."""
        with cost_ledger.bind_run("run-unknown") as ledger:
            usage = await _route_to_openai(monkeypatch, "some-future-model")
            snapshot = cost_ledger.snapshot()

        assert ledger.entries
        assert snapshot[0]["provider"] == "openai"
        assert snapshot[0]["cost_usd"] is None
        assert snapshot[0]["units"] == 150  # les UNITÉS sont comptées quand même
        assert usage.cost_known is False

    @pytest.mark.asyncio
    async def test_a_known_model_stays_priced(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Contre-épreuve : la garde ci-dessus doit pouvoir dire NON."""
        with cost_ledger.bind_run("run-known"):
            usage = await _route_to_openai(monkeypatch, "gpt-4o")
            snapshot = cost_ledger.snapshot()

        assert usage.cost_known is True
        assert snapshot[0]["cost_usd"] == pytest.approx(0.00075)  # 100×2,50 + 50×10,00 /1M

    def test_langfuse_receives_none_for_an_unknown_model(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Cohérence avec ``langfuse_client.record_generation`` : ``cost_usd=None``
        ⇒ la génération ne porte AUCUN ``costDetails``."""
        captured: dict = {}
        monkeypatch.setattr(
            claude_service.langfuse_client,
            "record_generation",
            lambda **kwargs: captured.update(kwargs),
        )
        usage = TokenUsage(
            input_tokens=1, output_tokens=1, model="some-future-model",
            cost_usd=0.0, provider="openai", cost_known=False,
        )
        claude_service._log_usage(usage, CallMetadata(prompt_name="p"))

        assert captured, "record_generation n'a pas été appelé — la garde ne lit rien"
        assert captured["cost_usd"] is None

    def test_a_priced_call_still_carries_its_cost_to_langfuse(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict = {}
        monkeypatch.setattr(
            claude_service.langfuse_client,
            "record_generation",
            lambda **kwargs: captured.update(kwargs),
        )
        usage = TokenUsage(input_tokens=1, output_tokens=1, model="gpt-4o", cost_usd=0.5, provider="openai")
        claude_service._log_usage(usage, CallMetadata(prompt_name="p"))

        assert captured["cost_usd"] == pytest.approx(0.5)

    def test_metrics_cost_counts_the_unpriced_calls(self) -> None:
        """``/metrics/cost`` doit dire combien d'appels n'ont PAS de prix.

        Sans ce compteur, ``cost_usd=0.0`` dans les agrégats en mémoire se
        relirait « gratuit » — le zéro exact qu'on refuse partout ailleurs."""
        claude_service.reset_cost_counters()
        claude_service._record_cost(
            TokenUsage(input_tokens=1, output_tokens=1, model="x", cost_usd=0.0, cost_known=False),
            "p",
        )
        claude_service._record_cost(
            TokenUsage(input_tokens=1, output_tokens=1, model="x", cost_usd=0.25), "p"
        )
        counters = claude_service.cost_counters()
        claude_service.reset_cost_counters()

        assert counters["p"].calls == 2
        assert counters["p"].unpriced_calls == 1
        assert counters["p"].cost_usd == pytest.approx(0.25)


# ── 4. La surcharge par env, côté OpenAI ──────────────────────────────────────


class TestOpenAIPriceOverride:
    def test_env_overrides_input_and_output(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("OPENAI_PRICE_GPT_4O_IN", "1.5")
        monkeypatch.setenv("OPENAI_PRICE_GPT_4O_OUT", "6")
        assert llm_gateway._openai_compute_cost(1_000_000, 1_000_000, "gpt-4o") == pytest.approx(7.5)

    def test_env_overrides_the_cached_input_price(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("OPENAI_PRICE_GPT_5_6_LUNA_CACHED_IN", "0.05")
        assert llm_gateway._openai_compute_cost(
            0, 0, "gpt-5.6-luna", cache_read_tokens=1_000_000
        ) == pytest.approx(0.05)

    def test_partial_override_keeps_the_other_half(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("OPENAI_PRICE_GPT_5_6_LUNA_OUT", "2")
        # entrée inchangée (0,20), sortie surchargée (2,00)
        assert llm_gateway._openai_compute_cost(
            1_000_000, 1_000_000, "gpt-5.6-luna"
        ) == pytest.approx(2.20)

    def test_the_override_is_read_fresh_on_every_call(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Même sémantique que ``_price_override`` côté Anthropic : relue à chaque
        appel, donc réglable sans redéploiement."""
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o") == pytest.approx(2.50)
        monkeypatch.setenv("OPENAI_PRICE_GPT_4O_IN", "9")
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o") == pytest.approx(9.0)
        monkeypatch.delenv("OPENAI_PRICE_GPT_4O_IN")
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o") == pytest.approx(2.50)

    @pytest.mark.parametrize("bad", ["", "   ", "gratuit", "0", "-2", "NaN", "inf"])
    def test_an_absurd_value_falls_back_to_the_default(
        self, bad: str, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Motif écrit côté Anthropic, repris mot pour mot : « un coût à zéro se
        lit c'est gratuit » et éteindrait l'alerte de dépassement en silence."""
        monkeypatch.setenv("OPENAI_PRICE_GPT_4O_IN", bad)
        with caplog.at_level(logging.WARNING, logger="app.services.llm_gateway"):
            cost = llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o")

        assert cost == pytest.approx(2.50)
        if bad.strip():  # une valeur vide est une absence, pas une erreur
            assert any(
                "OPENAI_PRICE_GPT_4O_IN" in r.getMessage()
                for r in caplog.records
                if r.levelno == logging.WARNING
            ), "une valeur illisible doit être signalée, jamais avalée"

    def test_env_can_declare_a_price_for_a_model_absent_from_the_table(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Ce qui rend la comparaison de modèles tenable dans la durée : un
        modèle sorti ce matin se tarife sans attendre un déploiement."""
        monkeypatch.setenv("OPENAI_PRICE_SOME_FUTURE_MODEL_IN", "0.5")
        monkeypatch.setenv("OPENAI_PRICE_SOME_FUTURE_MODEL_OUT", "3")
        assert llm_gateway._openai_compute_cost(
            1_000_000, 1_000_000, "some-future-model"
        ) == pytest.approx(3.5)

    def test_a_half_declared_price_stays_unknown(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """La tolérance s'arrête où commencerait la devinette : une entrée sans
        sortie ne se complète pas au tarif d'un autre modèle."""
        monkeypatch.setenv("OPENAI_PRICE_SOME_FUTURE_MODEL_IN", "0.5")
        assert llm_gateway._openai_compute_cost(1_000_000, 1_000_000, "some-future-model") is None


# ── 5. Les paramètres d'échantillonnage, décidés chez le fournisseur ──────────


class TestSamplingDecisionPerProvider:
    def test_openai_allow_listed_model_gets_the_temperature(self) -> None:
        assert llm_gateway._openai_sampling_kwargs("gpt-4o") == {
            "temperature": claude_service.CLAUDE_TEMPERATURE
        }

    @pytest.mark.parametrize("model", ["o3", "o3-mini", "o4-mini", "gpt-5.6-luna", "brand-new"])
    def test_openai_reasoning_and_unknown_models_get_nothing(self, model: str) -> None:
        assert llm_gateway._openai_sampling_kwargs(model) == {}

    def test_openai_omission_is_logged_once(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="app.services.llm_gateway"):
            llm_gateway._openai_sampling_kwargs("o3")
            llm_gateway._openai_sampling_kwargs("o3")

        messages = [r.getMessage() for r in caplog.records if "o3" in r.getMessage()]
        assert len(messages) == 1, "la perte du décodage glouton ne doit jamais être silencieuse"

    def test_the_anthropic_decision_is_untouched(self) -> None:
        """Contrainte explicite du lot : ne PAS changer le comportement Anthropic.

        ⚠️ La décision Anthropic ne peut pas déménager dans ``AnthropicProvider`` :
        deux chemins l'appellent SANS passer par le gateway — ``call_claude_sync``
        (``claude_service.py``, qui appelle ``_call_sync`` directement) et
        ``chat_orchestrator.py``. La déplacer les priverait de la décision et
        rejouerait la panne totale du 400 ``temperature`` sur Sonnet 5.
        """
        assert claude_service._sampling_kwargs("claude-sonnet-4-5") == {"temperature": 0.0}
        assert claude_service._sampling_kwargs("claude-sonnet-5") == {}
        # …et l'allow-list Anthropic ne répond jamais « oui » à un modèle OpenAI,
        # ce qui est précisément la contradiction que ce lot supprime.
        assert claude_service.supports_sampling_params("gpt-4o") is False


# ── 6. max_tokens vs max_completion_tokens ────────────────────────────────────


class _FakeUsage:
    prompt_tokens = 100
    completion_tokens = 50


class _FakeResponse:
    def __init__(self) -> None:
        message = type("_M", (), {"content": "hello"})()
        self.choices = [type("_C", (), {"message": message})()]
        self.usage = _FakeUsage()


class _FakeCompletions:
    def __init__(self, calls: list[dict]) -> None:
        self._calls = calls

    async def create(self, **kwargs):
        self._calls.append(kwargs)
        return _FakeResponse()


class _FakeClient:
    def __init__(self, calls: list[dict], **_kwargs) -> None:
        self.chat = type("_Chat", (), {"completions": _FakeCompletions(calls)})()


class TestOpenAIRequestShape:
    """Ces tests exercent le VRAI ``_invoke`` — seul le SDK est un double.

    Preuve tirée du SDK embarqué (``openai==1.109.1``,
    ``openai/types/chat/completion_create_params.py``), citée verbatim :
    « This value is now deprecated in favor of `max_completion_tokens`, and is
    not compatible with o-series models ». La table de tarifs contient déjà
    ``o3``, ``o3-mini`` et ``o4-mini`` : le changement n'est pas une précaution,
    c'est un 400 en attente.
    """

    @pytest.fixture
    def calls(self, monkeypatch: pytest.MonkeyPatch) -> list[dict]:
        recorded: list[dict] = []
        fake_openai = type(
            "_FakeOpenAI", (), {"AsyncOpenAI": lambda **kwargs: _FakeClient(recorded, **kwargs)}
        )
        monkeypatch.setattr(llm_gateway, "openai", fake_openai)
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        return recorded

    @pytest.mark.asyncio
    async def test_text_path_sends_max_completion_tokens(self, calls: list[dict]) -> None:
        await llm_gateway.OPENAI_PROVIDER._invoke(
            "sys", "usr", response_model=None, max_tokens=1234, max_retries=1, model="gpt-4o"
        )
        assert calls, "le double n'a rien enregistré — la garde ne lit rien"
        assert calls[0]["max_completion_tokens"] == 1234
        assert "max_tokens" not in calls[0]

    @pytest.mark.asyncio
    async def test_text_path_sends_temperature_only_when_the_model_takes_it(
        self, calls: list[dict]
    ) -> None:
        await llm_gateway.OPENAI_PROVIDER._invoke(
            "sys", "usr", response_model=None, max_tokens=10, max_retries=1, model="gpt-4o"
        )
        await llm_gateway.OPENAI_PROVIDER._invoke(
            "sys", "usr", response_model=None, max_tokens=10, max_retries=1, model="o3"
        )
        assert calls[0]["temperature"] == claude_service.CLAUDE_TEMPERATURE
        assert "temperature" not in calls[1]

    @pytest.mark.asyncio
    async def test_the_dict_and_structured_paths_agree_with_the_text_path(self) -> None:
        """Les trois branches de ``_invoke`` doivent envoyer la MÊME forme.

        Le défaut d'origine était présent trois fois : trois ``max_tokens=`` et
        trois ``temperature=`` recopiés. Un test qui n'en couvrirait qu'un
        laisserait deux chemins mentir."""
        import inspect

        source = inspect.getsource(llm_gateway.OpenAIProvider._invoke)
        assert source.count("max_completion_tokens=max_tokens") == 3
        assert "temperature=claude_service.CLAUDE_TEMPERATURE" not in source
        assert source.count("**_openai_sampling_kwargs(model)") == 3
