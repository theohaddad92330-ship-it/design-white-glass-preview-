"""IA v2 LLM Gateway tests.

Covered: default routing → Anthropic identical result+cost; call_claude always
routes via the gateway and its default routing dispatches a byte-identical
Anthropic call; OpenAI selected when routed + key present; fallback to
Anthropic without a key; per-provider cost accounting; route resolution.

No network: the Anthropic seam ``claude_service._dispatch_anthropic`` and the
OpenAI seam ``OPENAI_PROVIDER._invoke`` are patched in every test.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import claude_service, llm_gateway
from app.services.claude_service import CallMetadata, TokenUsage
from app.services.llm_gateway import Route, _ProviderUsage

_GATEWAY_ENV = ("LLM_GATEWAY_ROUTING", "OPENAI_API_KEY")
_ROUTE_ENV = tuple(f"LLM_ROUTE_{t.upper()}" for t in llm_gateway.CANONICAL_TASKS)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Every test starts from a clean routing environment."""
    for name in (*_GATEWAY_ENV, *_ROUTE_ENV):
        monkeypatch.delenv(name, raising=False)
    yield


def _usage(model: str, cost: float = 0.01) -> TokenUsage:
    return TokenUsage(input_tokens=10, output_tokens=5, model=model, cost_usd=cost)


# ── canonical task + route resolution ───────────────────────────────────────────


class TestRouteResolution:
    @pytest.mark.parametrize(
        "prompt_name,expected",
        [
            ("bellum_facts", "research"),
            ("bellum_signals", "signals"),
            ("bellum_strategy", "strategy"),
            ("bellum_contacts_batch_2_of_5", "classify"),
            # ⚠️ Cette ligne disait « classify », et c'était encore le même
            # défaut d'un cran plus loin : les contacts et l'organigramme
            # partageaient un interrupteur alors que le banc les sépare — sur
            # Luna les contacts tiennent, l'organigramme PERD. Le recul mesuré
            # était donc irréversible sans emporter les contacts. Le test
            # protégeait, là aussi, ce qu'il aurait dû interdire.
            ("bellum_organigramme", "org"),
            # ⚠️ Ces deux lignes disaient « plan » et c'était le défaut, pas la
            # règle : elles rangeaient deux prompts d'EXTRACTION (Haiku) sous la
            # tâche d'un prompt de RAISONNEMENT (Sonnet), si bien qu'un seul
            # routage commandait les deux. Le test protégeait donc ce qu'il
            # aurait dû interdire.
            ("bellum_plan_quick_wins", "plan_light"),
            ("bellum_messages", "messages"),
            # #1911.1 — le titre d'un fil (Haiku) sort de la tâche du copilote
            # (Sonnet), dont il partage le préfixe.
            ("bellum_chat_title", "chat_title"),
            ("bellum_chat", "chat"),
            ("research", "research"),  # already canonical
            ("bellum_battlecard", "bellum_battlecard"),  # unknown → itself
        ],
    )
    def test_canonical_task(self, prompt_name, expected):
        assert llm_gateway.canonical_task(prompt_name) == expected

    def test_default_route_is_anthropic_inherit(self):
        route = llm_gateway.resolve_route("bellum_strategy")
        assert route == Route("anthropic", None)

    def test_unknown_task_defaults_to_anthropic(self):
        assert llm_gateway.resolve_route("bellum_battlecard") == Route("anthropic", None)

    def test_env_override_provider_and_model(self, monkeypatch):
        monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
        assert llm_gateway.resolve_route("bellum_strategy") == Route("openai", "gpt-4o")

    def test_env_override_provider_only_inherits_model(self, monkeypatch):
        monkeypatch.setenv("LLM_ROUTE_SIGNALS", "openai")
        assert llm_gateway.resolve_route("bellum_signals") == Route("openai", None)

    def test_json_override(self, monkeypatch):
        monkeypatch.setenv(
            "LLM_GATEWAY_ROUTING",
            '{"classify": {"provider": "openai", "model": "gpt-4o-mini"}}',
        )
        assert llm_gateway.resolve_route("bellum_organigramme") == Route("openai", "gpt-4o-mini")

    def test_env_override_beats_json(self, monkeypatch):
        monkeypatch.setenv("LLM_GATEWAY_ROUTING", '{"strategy": {"provider": "openai", "model": "gpt-4o"}}')
        monkeypatch.setenv("LLM_ROUTE_STRATEGY", "anthropic")
        assert llm_gateway.resolve_route("bellum_strategy") == Route("anthropic", None)

    def test_malformed_json_is_ignored(self, monkeypatch):
        monkeypatch.setenv("LLM_GATEWAY_ROUTING", "{not json")
        assert llm_gateway.resolve_route("bellum_strategy") == Route("anthropic", None)


# ── default routing → Anthropic, identical result + cost ─────────────────────────


class TestDefaultRoutingAnthropic:
    @pytest.mark.asyncio
    async def test_default_routing_returns_anthropic_result_and_cost(self, monkeypatch):
        sentinel = object()
        usage = _usage("claude-sonnet-5", cost=0.1234)
        dispatch = AsyncMock(return_value=(sentinel, usage))
        monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

        result, out_usage = await llm_gateway.complete(
            "bellum_facts",
            "sys",
            "usr",
            response_model=None,
            model="claude-sonnet-5",
        )

        assert result is sentinel
        assert out_usage is usage  # cost passes through untouched
        dispatch.assert_awaited_once()
        # inherited model (route.model is None) → caller's model
        assert dispatch.call_args.kwargs["model"] == "claude-sonnet-5"

    @pytest.mark.asyncio
    async def test_openai_provider_not_touched_on_default_route(self, monkeypatch):
        monkeypatch.setattr(claude_service, "_dispatch_anthropic", AsyncMock(return_value=("x", _usage("m"))))
        invoke = AsyncMock(side_effect=AssertionError("OpenAI must not be called on the default route"))
        monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", invoke)

        await llm_gateway.complete("bellum_strategy", "sys", "usr", model="claude-sonnet-5")
        invoke.assert_not_called()


# ── call_claude always routes via the gateway ────────────────────────────────────


class TestCallClaudeWiring:
    @pytest.mark.asyncio
    async def test_call_claude_routes_via_gateway(self, monkeypatch):
        dispatch = AsyncMock(side_effect=AssertionError("call_claude must dispatch through the gateway"))
        gateway_complete = AsyncMock(return_value=("gw", _usage("gw")))
        monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)
        monkeypatch.setattr(llm_gateway, "complete", gateway_complete)

        result, _ = await claude_service.call_claude("sys", "usr", model="claude-sonnet-5", prompt_name="bellum_facts")

        assert result == "gw"
        gateway_complete.assert_awaited_once()
        # task defaults to prompt_name
        assert gateway_complete.call_args.args[0] == "bellum_facts"

    @pytest.mark.asyncio
    async def test_default_routing_dispatches_identical_anthropic_call(self, monkeypatch):
        """Safety guarantee: with default routing (no LLM_ROUTE_* override, no
        OPENAI_API_KEY) call_claude reaches ``_dispatch_anthropic`` with exactly
        the args the legacy direct path passed — same system/user prompts,
        response_model, max_tokens, max_retries, model, and metadata. Cost and
        token accounting live below ``_dispatch_anthropic`` and are therefore
        identical too."""
        dispatch = AsyncMock(return_value=("txt", _usage("claude-haiku-4-5")))
        monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

        await claude_service.call_claude(
            "sys", "usr", response_model=dict, model="claude-haiku-4-5", prompt_name="bellum_signals"
        )

        dispatch.assert_awaited_once()
        call = dispatch.call_args
        assert call.args == ("sys", "usr")
        assert call.kwargs["response_model"] is dict
        assert call.kwargs["max_tokens"] == claude_service.DEFAULT_MAX_TOKENS
        assert call.kwargs["max_retries"] == claude_service.DEFAULT_MAX_RETRIES
        assert call.kwargs["model"] == "claude-haiku-4-5"
        assert call.kwargs["metadata"].prompt_name == "bellum_signals"


# ── OpenAI provider selection + fallback ─────────────────────────────────────────


class TestOpenAIProvider:
    @pytest.mark.asyncio
    async def test_openai_selected_when_routed_and_key_present(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
        anthropic_dispatch = AsyncMock(side_effect=AssertionError("Anthropic must not be called"))
        monkeypatch.setattr(claude_service, "_dispatch_anthropic", anthropic_dispatch)
        invoke = AsyncMock(return_value=("openai-out", _ProviderUsage(100, 50, 0)))
        monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", invoke)

        result, usage = await llm_gateway.complete(
            "bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5"
        )

        assert result == "openai-out"
        assert usage.model == "gpt-4o"  # routed model used, not the caller's
        assert usage.input_tokens == 100
        assert usage.output_tokens == 50
        # cost via the OpenAI table, not Anthropic's
        assert usage.cost_usd == pytest.approx(llm_gateway._openai_compute_cost(100, 50, "gpt-4o"))
        assert usage.cost_usd > 0
        anthropic_dispatch.assert_not_called()
        invoke.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_falls_back_to_anthropic_without_key(self, monkeypatch):
        # OPENAI_API_KEY cleared by fixture → provider unavailable
        monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
        sentinel = object()
        anthropic_usage = _usage("claude-sonnet-5")
        dispatch = AsyncMock(return_value=(sentinel, anthropic_usage))
        monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)
        invoke = AsyncMock(side_effect=AssertionError("OpenAI must not be invoked without a key"))
        monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", invoke)

        result, usage = await llm_gateway.complete(
            "bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5"
        )

        assert result is sentinel
        assert usage is anthropic_usage
        dispatch.assert_awaited_once()
        # the routed OpenAI model must NOT leak into the Anthropic fallback call
        assert dispatch.call_args.kwargs["model"] == "claude-sonnet-5"
        invoke.assert_not_called()

    def test_is_available_requires_key(self, monkeypatch):
        assert llm_gateway.OPENAI_PROVIDER.is_available() is False
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        assert llm_gateway.OPENAI_PROVIDER.is_available() is True

    @pytest.mark.asyncio
    async def test_truncated_openai_output_becomes_claude_incomplete_output_error(self, monkeypatch):
        """#2528/#2529 — la cause RÉELLE du crash de production.

        ``claude_service._call_dict`` (chemin Anthropic) attrape la troncature
        et la rend ``ClaudeIncompleteOutputError`` (typée, dégradable par
        ``_run_call_resilient``). ``OpenAIProvider._invoke`` n'avait AUCUNE
        classification équivalente : une section du plan routée vers OpenAI
        (``bellum_plan_evaluation`` en prod, modèle ``gpt-5.6-luna``) qui tronque
        laissait ``InstructorRetryException`` remonter BRUTE jusqu'au nœud
        ``plan`` du graphe, qui la traite comme un échec GÉNÉRAL de toute
        l'analyse au lieu d'une section dégradée. Ce test appelle `complete()`
        (pas `_invoke` directement) pour vérifier la classification faite par le
        provider, pas seulement par `_is_truncation`.
        """
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("LLM_ROUTE_PLAN", "openai:gpt-5.6-luna")

        async def _invoke(*args, **kwargs):
            raise claude_service.IncompleteOutputException()

        monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", _invoke)

        with pytest.raises(claude_service.ClaudeIncompleteOutputError) as exc_info:
            await llm_gateway.complete(
                "bellum_plan_evaluation",
                "sys",
                "usr",
                response_model=dict,
                model="claude-sonnet-5",
                metadata=CallMetadata(prompt_name="bellum_plan_evaluation"),
            )
        assert exc_info.value.prompt_name == "bellum_plan_evaluation"

    @pytest.mark.asyncio
    async def test_non_truncation_openai_error_is_not_reclassified(self, monkeypatch):
        """Un échec OpenAI qui n'est PAS une troncature (ex. 500) remonte tel
        quel — la classification ne doit attraper QUE la troncature, jamais
        devenir un filet qui masque une autre panne."""
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        monkeypatch.setenv("LLM_ROUTE_PLAN", "openai:gpt-5.6-luna")

        async def _invoke(*args, **kwargs):
            raise ValueError("boom — unrelated failure")

        monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", _invoke)

        with pytest.raises(ValueError, match="boom"):
            await llm_gateway.complete(
                "bellum_plan_evaluation",
                "sys",
                "usr",
                response_model=dict,
                model="claude-sonnet-5",
                metadata=CallMetadata(prompt_name="bellum_plan_evaluation"),
            )


# ── per-provider cost accounting ─────────────────────────────────────────────────


class TestCostAccounting:
    def test_each_provider_bills_on_its_own_grid(self):
        # 1 M jetons d'entrée : OpenAI gpt-4o = $2,50 ; Anthropic Sonnet = $2,00
        # (la hausse à $3 annoncée pour le 01/09/2026 a été annulée le 10/08).
        #
        # Ce que le test protège n'est PAS que les deux chiffres soient
        # différents — ils pourraient converger sans que rien soit cassé — mais
        # que chaque fournisseur soit facturé sur SA grille : un jour où le
        # gateway routerait vers OpenAI en facturant au tarif Anthropic, le
        # registre de coûts mentirait sans qu'aucune erreur ne se voie.
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o") == pytest.approx(2.50)
        assert claude_service._compute_cost(1_000_000, 0, "claude-sonnet-5") == pytest.approx(2.00)

    def test_openai_model_substring_precedence(self):
        # gpt-4o-mini must NOT match the gpt-4o tier
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o-mini") == pytest.approx(0.15)
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "gpt-4o") == pytest.approx(2.50)

    def test_openai_output_and_cache_pricing(self):
        # output at $10/1M, cached input at 0.5× the $2.50 input rate
        assert llm_gateway._openai_compute_cost(0, 1_000_000, "gpt-4o") == pytest.approx(10.00)
        assert llm_gateway._openai_compute_cost(0, 0, "gpt-4o", cache_read_tokens=1_000_000) == pytest.approx(1.25)

    def test_unknown_openai_model_is_not_billed_at_someone_elses_rate(self):
        """Ce test disait l'inverse — « un modèle inconnu est facturé au palier
        gpt-4o, un juste milieu conservateur ». C'était faux et coûteux : le
        chiffre avait l'air juste, donc personne ne le vérifiait, et
        ``gpt-5.6-luna`` (0,20 $/M) était facturé 2,50 $/M sans un mot. « Un prix
        inconnu ne se lit jamais gratuit » a une sœur : il ne se lit pas non plus
        « comme un autre modèle ». Détail : ``tests/test_llm_measurement_honesty.py``.
        """
        assert llm_gateway._openai_compute_cost(1_000_000, 0, "some-future-model") is None


# ── usage normalisation ──────────────────────────────────────────────────────────


class TestUsageNormalisation:
    def test_splits_cached_tokens_out_of_prompt_tokens(self):
        class _Details:
            cached_tokens = 30

        class _Usage:
            prompt_tokens = 100
            completion_tokens = 40
            prompt_tokens_details = _Details()

        usage = llm_gateway._usage_from_openai(_Usage())
        assert usage == _ProviderUsage(input_tokens=70, output_tokens=40, cache_read_tokens=30)

    def test_handles_missing_fields(self):
        class _Usage:
            prompt_tokens = 12
            completion_tokens = 8

        usage = llm_gateway._usage_from_openai(_Usage())
        assert usage == _ProviderUsage(input_tokens=12, output_tokens=8, cache_read_tokens=0)


# ── metadata carries through ─────────────────────────────────────────────────────


class TestMetadata:
    @pytest.mark.asyncio
    async def test_metadata_passed_to_provider(self, monkeypatch):
        captured = {}

        async def fake_dispatch(system, user, **kwargs):
            captured["metadata"] = kwargs["metadata"]
            return "ok", _usage("claude-sonnet-5")

        monkeypatch.setattr(claude_service, "_dispatch_anthropic", fake_dispatch)
        meta = CallMetadata(prompt_name="bellum_facts", correlation_id="cid-123")

        await llm_gateway.complete("bellum_facts", "sys", "usr", metadata=meta, model="claude-sonnet-5")
        assert captured["metadata"] is meta


# ── Les prompts d'EXTRACTION doivent pouvoir bouger sans emporter le Sonnet ────
#
# `model_policy.PROMPT_MODELS` range chaque prompt sous `REASONING` (Sonnet) ou
# `EXTRACTION` (Haiku). Le routage, lui, est par TÂCHE : trois prompts d'extraction
# — `bellum_messages`, `bellum_plan_quick_wins`, `bellum_plan_if_no_response` —
# tombaient sous la tâche `plan`, qui porte AUSSI `bellum_plan`, un prompt Sonnet.
#
# Conséquence : router « ce qui était sur Haiku » vers un autre fournisseur
# déplaçait le plan narratif avec. C'est le défaut « un réglage qui commande deux
# choses » ; on le répare en donnant sa tâche à chaque groupe de coût.


def test_les_prompts_dextraction_du_plan_ont_leur_propre_tache():
    """Un prompt Haiku et un prompt Sonnet ne partagent JAMAIS un interrupteur."""
    from app.services import llm_gateway as gw
    from app.services.model_policy import EXTRACTION, PROMPT_MODELS, REASONING

    # Le prompt narratif reste sur sa tâche.
    assert gw.canonical_task("bellum_plan") == "plan"
    assert PROMPT_MODELS["bellum_plan"] == REASONING

    # Les trois prompts d'extraction en sortent.
    assert gw.canonical_task("bellum_messages") == "messages"
    assert gw.canonical_task("bellum_plan_quick_wins") == "plan_light"
    assert gw.canonical_task("bellum_plan_if_no_response") == "plan_light"
    assert PROMPT_MODELS["bellum_messages"] == EXTRACTION

    # Les phases du plan d'action, elles, sont du narratif : elles RESTENT sur `plan`.
    assert gw.canonical_task("bellum_plan_action_plan_phase_0") == "plan"


def test_aucune_tache_ne_melange_extraction_et_raisonnement():
    """La garde qui dit NON : si un prompt change de camp sans changer de tâche,
    ce test tombe. Un corpus vide le ferait passer pour rien — on l'assert."""
    from app.services import llm_gateway as gw
    from app.services.model_policy import EXTRACTION, PROMPT_MODELS

    assert len(PROMPT_MODELS) >= 20, "corpus vide ou tronqué — la garde ne lirait rien"

    par_tache: dict[str, set[str]] = {}
    for prompt, model in PROMPT_MODELS.items():
        par_tache.setdefault(gw.canonical_task(prompt), set()).add(
            "extraction" if model == EXTRACTION else "raisonnement"
        )

    melangees = {t: sorted(v) for t, v in par_tache.items() if len(v) > 1}
    assert not melangees, (
        "ces tâches mélangent extraction et raisonnement, donc un seul routage "
        f"commande les deux : {melangees}"
    )


# ── L'organigramme doit pouvoir revenir en arrière SEUL ───────────────────────
#
# `LLM_ROUTE_CLASSIFY` commandait DEUX prompts : `bellum_contacts` (+ son
# fallback) et `bellum_organigramme`. Or le banc du 28/08 a mesuré qu'ils ne
# réagissent pas pareil au même modèle : sur Luna, `bellum_strategy` gagne,
# `bellum_signals` égalise, et **`bellum_organigramme` PERD** (100 → 95,10,
# l'axe qui tombe étant `chaine_de_decision`, 1,00 → 0,80).
#
# Le défaut n'est donc pas le choix de Louis — pris en connaissance de ce recul —
# c'est qu'il n'était PAS RÉVERSIBLE : ramener l'organigramme sur Haiku aurait
# ramené les contacts avec. C'est le même « un réglage qui commande deux
# choses » qui avait déjà forcé à scinder `plan` / `plan_light` / `messages` ;
# la garde existante ne l'attrape pas, parce que les deux prompts sont du MÊME
# camp (extraction) et qu'elle ne surveille que le mélange extraction/raisonnement.
#
# ⚠️ Un refactor ne change JAMAIS un routage de production au passage : la tâche
# `org` HÉRITE de `LLM_ROUTE_CLASSIFY` tant que `LLM_ROUTE_ORG` n'est pas posée.
# Le jour du déploiement, rien ne bouge ; le jour où Louis décide, une variable
# suffit.


def test_organigramme_et_contacts_ne_partagent_plus_un_interrupteur():
    from app.services import llm_gateway as gw

    assert gw.canonical_task("bellum_contacts") == "classify"
    assert gw.canonical_task("bellum_contacts_batch_2_of_5") == "classify"
    assert gw.canonical_task("bellum_contacts_fallback") == "classify"
    assert gw.canonical_task("bellum_organigramme") == "org"


def test_les_taches_historiques_gardent_leur_rang(monkeypatch: pytest.MonkeyPatch):
    """Une valeur d'énumération ne change jamais de rang — les ajouts vont EN FIN."""
    from app.services import llm_gateway as gw

    assert gw.CANONICAL_TASKS[:7] == (
        "research", "signals", "strategy", "classify", "plan", "messages", "plan_light",
    )
    assert "org" in gw.CANONICAL_TASKS


def test_org_herite_de_classify_tant_quon_ne_la_pas_reglee(monkeypatch: pytest.MonkeyPatch):
    """La production du 28/08 ne bouge pas d'un octet au déploiement."""
    from app.services import llm_gateway as gw

    monkeypatch.delenv("LLM_ROUTE_ORG", raising=False)
    monkeypatch.setenv("LLM_ROUTE_CLASSIFY", "openai:gpt-5.6-luna")

    assert gw.resolve_route("bellum_organigramme") == gw.Route("openai", "gpt-5.6-luna")
    assert gw.resolve_route("bellum_contacts") == gw.Route("openai", "gpt-5.6-luna")


def test_org_a_bien_son_propre_interrupteur(monkeypatch: pytest.MonkeyPatch):
    """La garde qui dit NON : sans ça, ramener l'organigramme ramènerait les contacts."""
    from app.services import llm_gateway as gw

    monkeypatch.setenv("LLM_ROUTE_CLASSIFY", "openai:gpt-5.6-luna")
    monkeypatch.setenv("LLM_ROUTE_ORG", "anthropic:claude-haiku-4-5")

    assert gw.resolve_route("bellum_organigramme") == gw.Route("anthropic", "claude-haiku-4-5")
    # …et les contacts ne bougent PAS.
    assert gw.resolve_route("bellum_contacts") == gw.Route("openai", "gpt-5.6-luna")


def test_org_seule_ne_deplace_pas_les_contacts(monkeypatch: pytest.MonkeyPatch):
    from app.services import llm_gateway as gw

    monkeypatch.delenv("LLM_ROUTE_CLASSIFY", raising=False)
    monkeypatch.setenv("LLM_ROUTE_ORG", "openai:gpt-5.6-luna")

    assert gw.resolve_route("bellum_organigramme") == gw.Route("openai", "gpt-5.6-luna")
    assert gw.resolve_route("bellum_contacts") == gw.Route("anthropic", None)


def test_lheritage_ne_vaut_que_pour_org(monkeypatch: pytest.MonkeyPatch):
    """Aucune autre tâche ne se met à suivre `classify` par effet de bord."""
    from app.services import llm_gateway as gw

    monkeypatch.setenv("LLM_ROUTE_CLASSIFY", "openai:gpt-5.6-luna")
    for task in ("bellum_facts", "bellum_signals", "bellum_strategy", "bellum_plan"):
        assert gw.resolve_route(task) == gw.Route("anthropic", None), task
