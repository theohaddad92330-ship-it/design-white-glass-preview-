"""#2248 — Laura choisit son palier de modèle, demande par demande.

Demande de Louis : « tourner sur un modèle rapide par défaut, et un modèle fort
pour les vraies demandes de fond, dans certaines exceptions ». Décision du
17/09/2026 : un CLASSIFIEUR à règles (aucun appel de modèle en plus), un
coupe-circuit, le coût mesuré par tour et un banc de demandes types.

Ce fichier tient quatre promesses :

1. **Le banc** fige la décision de palier sur des demandes types (FR et EN —
   une garde monolingue est aveugle à l'autre langue), avec la RÈGLE qui l'a
   prise.
2. **Sans réglage, rien ne change** : ni la destination, ni le nom sous lequel
   le coût est compté — et le classifieur n'est même pas appelé.
3. **La conversation ET la boucle d'outils suivent le même palier** : chaque
   aller-retour d'un tour part vers la destination du palier, sur les deux
   chemins du chat (orchestrateur et repli ``CHAT_TOOLS_DISABLED``).
4. **Le palier se voit dans la mesure** : ligne de log (sans contenu) et nom
   de coût du tour.
"""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import anthropic
import pytest
from fastapi.testclient import TestClient

from app.services import chat_model_routing as routing
from app.services import chat_orchestrator, claude_service, llm_gateway
from app.services.chat_model_routing import (
    ChatTierContext,
    choose_chat_tier,
    mode_insufficiency_notice,
    resolve_chat_route,
)
from app.services.kill_switch import CAPABILITY_KILL_SWITCHES
from app.services.model_policy import model_for

FAST_MODEL = "claude-haiku-4-5"
DEEP_MODEL = "claude-opus-4-6"
_ROUTING_ENV = (
    "LLM_ROUTE_CHAT",
    "LLM_ROUTE_CHAT_FAST",
    "LLM_ROUTE_CHAT_DEEP",
    "LLM_ROUTE_CHAT_CANARY",
    "CHAT_CANARY_WORKSPACE_ALLOWLIST",
    "LLM_GATEWAY_ROUTING",
    "LLM_GATEWAY_DISABLED",
    "CHAT_MODEL_ROUTING_DISABLED",
    "CHAT_TOOLS_DISABLED",
    "OPENAI_API_KEY",
    "MODEL_BELLUM_CHAT",
    "CHAT_MODEL_ROUTING_SHADOW",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for var in _ROUTING_ENV:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")


def _tiers_configured(monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_CHAT_FAST", f"anthropic:{FAST_MODEL}")
    monkeypatch.setenv("LLM_ROUTE_CHAT_DEEP", f"anthropic:{DEEP_MODEL}")


# ── 1. le banc ────────────────────────────────────────────────────────────────

_NO_ACCOUNT = ChatTierContext()
_ON_ACCOUNT = ChatTierContext(account_in_scope=True)
_LONG = "Voici le contexte de la réunion d'hier avec le client. " * 12

BENCH: list[tuple[str, ChatTierContext, str, str]] = [
    # ── rapide : le quotidien ─────────────────────────────────────────────────
    ("Bonjour Laura", _NO_ACCOUNT, "fast", "default"),
    ("RECETTE — combien de comptes je suis en ce moment ?", _NO_ACCOUNT, "fast", "default"),
    ("Ouvre la fiche de Sandrine Pata", _NO_ACCOUNT, "fast", "default"),
    ("Rappelle-moi de relancer Paul lundi à 9h", _ON_ACCOUNT, "fast", "default"),
    ("Prépare un mail de relance pour Julie", _ON_ACCOUNT, "fast", "default"),
    ("What's on my agenda tomorrow?", _NO_ACCOUNT, "fast", "default"),
    ("Quel est le numéro de Marc ?", _ON_ACCOUNT, "fast", "default"),
    # témoins voisins : un mot qui RESSEMBLE à une règle sans en être une
    ("Ouvre mes séquences", _NO_ACCOUNT, "fast", "default"),
    ("Analyse ce mail", _NO_ACCOUNT, "fast", "default"),
    ("Ok ça marche, merci", _NO_ACCOUNT, "fast", "default"),
    ("Compare Thales et Safran", _NO_ACCOUNT, "fast", "default"),
    ("Qui est le DSI ? Et son adjoint ?", _NO_ACCOUNT, "fast", "default"),
    # ── fort : demande explicite ──────────────────────────────────────────────
    ("Approfondis ta réponse précédente", _NO_ACCOUNT, "deep", "explicit_depth"),
    ("APPROFONDIS l'analyse du compte Thales", _NO_ACCOUNT, "deep", "explicit_depth"),
    ("Creuse le sujet en détail", _NO_ACCOUNT, "deep", "explicit_depth"),
    ("Dig deeper into this, please", _NO_ACCOUNT, "deep", "explicit_depth"),
    ("Give me an in-depth view", _NO_ACCOUNT, "deep", "explicit_depth"),
    # ── fort : analyse de compte ──────────────────────────────────────────────
    ("Analyse le compte Thales", _NO_ACCOUNT, "deep", "account_analysis"),
    ("Fais-moi une analyse", _ON_ACCOUNT, "deep", "account_analysis"),
    ("Analyze this company's org chart", _NO_ACCOUNT, "deep", "account_analysis"),
    ("Fais un état des lieux de ce client", _NO_ACCOUNT, "deep", "account_analysis"),
    # ── fort : plan multi-étapes ──────────────────────────────────────────────
    ("Construis un plan d'action sur 90 jours pour SNCF", _NO_ACCOUNT, "deep", "multi_step_plan"),
    ("Quelle stratégie pour entrer chez EDF ?", _NO_ACCOUNT, "deep", "multi_step_plan"),
    ("Give me a step-by-step account plan", _NO_ACCOUNT, "deep", "multi_step_plan"),
    ("Propose une feuille de route", _ON_ACCOUNT, "deep", "multi_step_plan"),
    # ── fort : plusieurs outils lourds ────────────────────────────────────────
    ("Compare Thales et Safran puis montre-moi le pipeline", _NO_ACCOUNT, "deep", "heavy_tools"),
    ("Run the matching and check the mission risks", _NO_ACCOUNT, "deep", "heavy_tools"),
    ("Lance une campagne sur mon territoire", _NO_ACCOUNT, "deep", "heavy_tools"),
    # ── fort : longueur / complexité ──────────────────────────────────────────
    (_LONG, _NO_ACCOUNT, "deep", "long_or_complex"),
    ("Qui est le DSI ? Quel budget ? Quels concurrents ?", _NO_ACCOUNT, "deep", "long_or_complex"),
    ("Pour demain :\n- appeler Paul\n- écrire à Julie\n- relancer Marc", _NO_ACCOUNT, "deep", "long_or_complex"),
    ("To do:\n1. call Paul\n2. email Julie\n3) ping Marc", _NO_ACCOUNT, "deep", "long_or_complex"),
    # ── #2450.1 (épopée #2882) : un mode CHOISI gagne sur toute heuristique ──
    ("Bonjour Laura", ChatTierContext(requested_mode="rapide"), "fast", "mode_rapide"),
    ("Bonjour Laura", ChatTierContext(requested_mode="verifie"), "deep", "mode_verifie"),
    ("Bonjour Laura", ChatTierContext(requested_mode="approfondi"), "deep", "mode_approfondi"),
    # ── #2450.7 (épopée #2882) : le plancher de qualité sur une actualité ────
    ("Quelles sont les dernières actualités sur Thales ?", _NO_ACCOUNT, "deep", "quality_floor_actuality"),
    ("Quoi de neuf chez nos concurrents ?", _NO_ACCOUNT, "deep", "quality_floor_actuality"),
    ("What's the latest news on Safran?", _NO_ACCOUNT, "deep", "quality_floor_actuality"),
    # ── #2440.56/.60/.61 (épopée #2975) : le risque force le palier fort ─────
    ("Confirme", ChatTierContext(risk="elevated"), "deep", "elevated_risk"),
]


@pytest.mark.parametrize(
    ("message", "context", "tier", "reason"),
    BENCH,
    ids=[f"{t}-{r}-{i}" for i, (_m, _c, t, r) in enumerate(BENCH)],
)
def test_le_banc_fige_le_palier_et_sa_regle(message, context, tier, reason):
    decision = choose_chat_tier(message, context)
    assert (decision.tier, decision.reason) == (tier, reason)


def test_le_banc_lit_quelque_chose_et_couvre_chaque_regle():
    """Un banc vide passerait pour rien ; un banc qui oublie une règle ne la
    protège pas."""
    assert len(BENCH) >= 25
    assert {r for *_x, r in BENCH} == set(routing.TIER_REASONS)
    assert {t for _m, _c, t, _r in BENCH} == {"fast", "deep"}


def test_une_demande_vide_reste_rapide():
    assert choose_chat_tier("", _NO_ACCOUNT) == ("fast", "default")
    assert choose_chat_tier("   ", _ON_ACCOUNT) == ("fast", "default")


# ── #2450.1 (épopée #2882) : le mode choisi gagne sur le texte ────────────────


def test_mode_auto_est_byte_identique_a_labsence_de_mode():
    """`"auto"` (et `None`, le défaut) ne changent RIEN à la décision — le
    chemin d'avant ce lot, à la lettre."""
    for message, context, tier, reason in BENCH:
        if context.requested_mode is not None:
            continue
        auto_context = ChatTierContext(account_in_scope=context.account_in_scope, requested_mode="auto", risk=context.risk)
        assert choose_chat_tier(message, auto_context) == (tier, reason)


def test_mode_rapide_lemporte_meme_sur_une_demande_de_fond():
    """Un mode CHOISI est un geste explicite — il gagne sur `explicit_depth`,
    `account_analysis` ou n'importe quelle autre règle du texte."""
    assert choose_chat_tier("Approfondis l'analyse du compte Thales", ChatTierContext(requested_mode="rapide")) == (
        "fast",
        "mode_rapide",
    )


def test_mode_verifie_et_approfondi_forcent_le_palier_fort_meme_sur_une_demande_vide():
    """Un geste explicite n'a pas besoin de texte pour compter — contrairement
    à `explicit_depth`, qui ne lit jamais une demande vide."""
    assert choose_chat_tier("", ChatTierContext(requested_mode="verifie")) == ("deep", "mode_verifie")
    assert choose_chat_tier("   ", ChatTierContext(requested_mode="approfondi")) == ("deep", "mode_approfondi")


# ── #2450.7 (épopée #2882) : le plancher de qualité sur une actualité ────────


def test_le_plancher_de_qualite_ne_declenche_pas_sur_un_faux_voisin():
    """« en ce moment » seul (sans « ce qui se passe ») ne parle pas
    d'actualité — un témoin déjà dans le banc (`fast`/`default`)."""
    assert choose_chat_tier("Combien de comptes je suis en ce moment ?", _NO_ACCOUNT) == ("fast", "default")


def test_le_plancher_de_qualite_cede_devant_une_regle_plus_specifique():
    """Une règle déjà plus précise (ici `account_analysis`) répond avant que
    le plancher de qualité soit même regardé."""
    assert choose_chat_tier("Analyse l'actualité du compte Thales", _NO_ACCOUNT) == ("deep", "account_analysis")


def test_le_plancher_de_qualite_nefface_pas_un_mode_rapide_choisi():
    """#2450.9 — un mode explicite n'est jamais silencieusement contredit,
    même par une demande d'actualité."""
    assert choose_chat_tier("Quoi de neuf ?", ChatTierContext(requested_mode="rapide")) == ("fast", "mode_rapide")


# ── #2440.56/.60/.61 (épopée #2975) : le risque force le palier fort ─────────


def test_risque_inconnu_est_byte_identique_a_labsence_de_risque():
    """Le défaut de TOUT appelant d'avant ce champ : `risk="unknown"` ne change
    RIEN au banc déjà figé plus haut — sauf la ligne qui teste `elevated`
    elle-même, forcée à `"unknown"` ici précisément pour prouver qu'elle
    dépend du risque (sinon ce test masquerait sa propre prémisse)."""
    for message, context, tier, reason in BENCH:
        if context.risk != "unknown":
            continue
        risky_context = ChatTierContext(
            account_in_scope=context.account_in_scope, requested_mode=context.requested_mode, risk="unknown"
        )
        assert choose_chat_tier(message, risky_context) == (tier, reason)


def test_risque_eleve_force_le_palier_fort_sur_une_demande_ordinaire():
    """Une demande qui retomberait `fast` (aucune règle de texte ne répond)
    passe `deep` dès que le risque est `elevated` — la raison le nomme."""
    assert choose_chat_tier("Confirme", ChatTierContext(risk="elevated")) == ("deep", "elevated_risk")
    assert choose_chat_tier("", ChatTierContext(risk="elevated")) == ("deep", "elevated_risk")


def test_risque_eleve_ne_retrograde_jamais_un_palier_fort_deja_choisi():
    """Le risque ne fait JAMAIS `deep` → `fast` : il ne fait que monter, et une
    règle de texte qui a déjà répondu `deep` garde SA raison, pas `elevated_risk`."""
    assert choose_chat_tier("Analyse le compte Thales", ChatTierContext(account_in_scope=True, risk="elevated")) == (
        "deep",
        "account_analysis",
    )


def test_un_mode_explicite_gagne_toujours_sur_le_risque():
    """Un geste explicite (#2450.1) reste prioritaire sur un risque mesuré
    ailleurs — même précédence que face au texte de la demande."""
    assert choose_chat_tier("Confirme", ChatTierContext(requested_mode="rapide", risk="elevated")) == (
        "fast",
        "mode_rapide",
    )


# ── 2. sans réglage, rien ne change ───────────────────────────────────────────


def _classifier_must_not_run(monkeypatch) -> None:
    def _boom(*_a, **_k):
        raise AssertionError("le classifieur ne doit pas tourner sans réglage")

    monkeypatch.setattr(routing, "choose_chat_tier", _boom)


def test_sans_reglage_la_route_est_celle_davant(monkeypatch):
    _classifier_must_not_run(monkeypatch)
    route = resolve_chat_route("bellum_chat", "Approfondis l'analyse du compte", _ON_ACCOUNT)
    assert route == ("bellum_chat", "bellum_chat", None)


def test_llm_route_chat_seul_ne_declenche_pas_le_routage(monkeypatch):
    """Le réglage d'avant garde son sens exact : il commande le chat entier."""
    _classifier_must_not_run(monkeypatch)
    monkeypatch.setenv("LLM_ROUTE_CHAT", f"anthropic:{FAST_MODEL}")
    route = resolve_chat_route("bellum_chat", "Approfondis", _NO_ACCOUNT)
    assert route.task == "bellum_chat"
    assert llm_gateway.resolve_dispatch(route.task, "claude-sonnet-5")[1] == FAST_MODEL


def test_le_coupe_circuit_ramene_le_chemin_davant(monkeypatch):
    _tiers_configured(monkeypatch)
    _classifier_must_not_run(monkeypatch)
    monkeypatch.setenv("CHAT_MODEL_ROUTING_DISABLED", "true")
    assert resolve_chat_route("bellum_chat", "Approfondis", _NO_ACCOUNT) == ("bellum_chat", "bellum_chat", None)


def test_sans_message_le_routage_ne_devine_rien(monkeypatch):
    """Un appelant qui ne transmet pas la demande garde le chemin d'avant."""
    _tiers_configured(monkeypatch)
    _classifier_must_not_run(monkeypatch)
    assert resolve_chat_route("bellum_chat", None, None) == ("bellum_chat", "bellum_chat", None)


def test_le_coupe_circuit_est_inscrit_au_registre():
    assert CAPABILITY_KILL_SWITCHES["copilot.model_routing"] == "CHAT_MODEL_ROUTING_DISABLED"


# ── la passerelle : deux tâches, un héritage ─────────────────────────────────


def test_les_paliers_sont_des_taches_ajoutees_en_fin():
    tasks = llm_gateway.CANONICAL_TASKS
    assert tasks[-3:] == ("chat_fast", "chat_deep", "chat_canary"), "GA-08 : ajout EN FIN, jamais au milieu"
    assert tasks.index("chat_title") < tasks.index("chat_fast")


@pytest.mark.parametrize(("posed", "inherits"), [("chat_deep", "chat_fast"), ("chat_fast", "chat_deep")])
def test_un_palier_sans_reglage_herite_du_chat(monkeypatch, posed, inherits):
    monkeypatch.setenv("LLM_ROUTE_CHAT", "openai:gpt-5.6-luna")
    monkeypatch.setenv(f"LLM_ROUTE_{posed.upper()}", f"anthropic:{DEEP_MODEL}")
    assert llm_gateway.resolve_route(inherits) == llm_gateway.Route("openai", "gpt-5.6-luna")
    assert llm_gateway.resolve_route(posed) == llm_gateway.Route("anthropic", DEEP_MODEL)


def test_un_seul_palier_regle_suffit_a_activer_le_routage(monkeypatch):
    monkeypatch.setenv("LLM_ROUTE_CHAT_DEEP", f"anthropic:{DEEP_MODEL}")
    fast = resolve_chat_route("bellum_chat", "Bonjour", _NO_ACCOUNT)
    deep = resolve_chat_route("bellum_chat", "Approfondis", _NO_ACCOUNT)
    assert fast == ("chat_fast", "bellum_chat_fast", ("fast", "default"))
    assert deep == ("chat_deep", "bellum_chat_deep", ("deep", "explicit_depth"))
    # le palier rapide non réglé retombe sur la destination d'avant
    assert llm_gateway.resolve_dispatch(fast.task, model_for("bellum_chat"))[1] == model_for("bellum_chat")
    assert llm_gateway.resolve_dispatch(deep.task, model_for("bellum_chat"))[1] == DEEP_MODEL


def test_le_bris_de_glace_de_la_passerelle_vaut_aussi_pour_les_paliers(monkeypatch):
    _tiers_configured(monkeypatch)
    monkeypatch.setenv("LLM_GATEWAY_DISABLED", "true")
    assert llm_gateway.resolve_dispatch("chat_deep", "claude-sonnet-5")[1] == "claude-sonnet-5"


# ── 3. la boucle d'outils suit le palier, à chaque aller-retour ──────────────


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


def _usage() -> SimpleNamespace:
    return SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)


class _Stream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in self._response.content:
            if block.type == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


def _install_anthropic(monkeypatch, responses) -> list[dict]:
    calls: list[dict] = []
    queue = list(responses)

    class _Messages:
        def stream(self, **kw):
            calls.append(kw)
            return _Stream(queue.pop(0))

    class _Client:
        def __init__(self, **_kw):
            self.messages = _Messages()

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", _Client)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())
    return calls


def _full_turn() -> list[SimpleNamespace]:
    """Deux rounds d'outils (le plafond ``_MAX_TOOL_ROUNDS``) PUIS le tour final
    forcé sans outils : les trois sites d'appel de la boucle sont lus."""

    def _tool(block_id: str) -> SimpleNamespace:
        return SimpleNamespace(type="tool_use", name="compare_accounts", input={"account_ids": ["a", "b"]}, id=block_id)

    return [
        SimpleNamespace(stop_reason="tool_use", content=[_tool("toolu_1")], usage=_usage()),
        SimpleNamespace(stop_reason="tool_use", content=[_tool("toolu_2")], usage=_usage()),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="ok")], usage=_usage()),
    ]


async def _run_turn(monkeypatch, message: str | None, context: ChatTierContext | None) -> list[dict]:
    calls = _install_anthropic(monkeypatch, _full_turn())
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": 1}))
    claude_service.reset_cost_counters()
    kwargs = {} if message is None else {"tier_request": message, "tier_context": context}
    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, **kwargs
    )
    assert reply == "ok"
    assert chat_orchestrator._MAX_TOOL_ROUNDS == 2, "le faux tour suppose deux rounds d'outils"
    assert len(calls) == 3, "deux rounds d'outils puis le tour final forcé — le test doit lire les trois"
    return calls


@pytest.mark.asyncio
async def test_temoin_sans_reglage_la_boucle_part_ou_elle_partait(monkeypatch):
    _classifier_must_not_run(monkeypatch)
    calls = await _run_turn(monkeypatch, "Approfondis l'analyse du compte", _ON_ACCOUNT)
    assert [c["model"] for c in calls] == [model_for("bellum_chat")] * 3
    assert set(claude_service.cost_counters()) == {"bellum_chat"}


@pytest.mark.asyncio
async def test_temoin_appelant_davant_sans_demande(monkeypatch):
    _tiers_configured(monkeypatch)
    calls = await _run_turn(monkeypatch, None, None)
    assert [c["model"] for c in calls] == [model_for("bellum_chat")] * 3
    assert set(claude_service.cost_counters()) == {"bellum_chat"}


@pytest.mark.asyncio
async def test_une_demande_de_fond_part_sur_le_palier_fort_a_chaque_round(monkeypatch):
    _tiers_configured(monkeypatch)
    calls = await _run_turn(monkeypatch, "Analyse le compte Thales", _NO_ACCOUNT)
    assert [c["model"] for c in calls] == [DEEP_MODEL] * 3
    counters = claude_service.cost_counters()
    assert set(counters) == {"bellum_chat_deep"}
    assert counters["bellum_chat_deep"].calls == 3, "chaque aller-retour, tour final compris, est compté au palier"
    assert counters["bellum_chat_deep"].model == DEEP_MODEL


@pytest.mark.asyncio
async def test_une_demande_courante_part_sur_le_palier_rapide(monkeypatch):
    _tiers_configured(monkeypatch)
    calls = await _run_turn(monkeypatch, "Ouvre la fiche de Paul", _NO_ACCOUNT)
    assert [c["model"] for c in calls] == [FAST_MODEL] * 3
    assert set(claude_service.cost_counters()) == {"bellum_chat_fast"}


@pytest.mark.asyncio
async def test_le_coupe_circuit_ramene_la_boucle_sur_sa_destination(monkeypatch):
    _tiers_configured(monkeypatch)
    monkeypatch.setenv("CHAT_MODEL_ROUTING_DISABLED", "1")
    calls = await _run_turn(monkeypatch, "Analyse le compte Thales", _NO_ACCOUNT)
    assert [c["model"] for c in calls] == [model_for("bellum_chat")] * 3
    assert set(claude_service.cost_counters()) == {"bellum_chat"}


@pytest.mark.asyncio
async def test_un_palier_peut_changer_de_transport(monkeypatch):
    """Le palier rapide routé chez l'autre fournisseur construit l'autre
    transport ; le palier fort, lui, reste chez Anthropic."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
    monkeypatch.setenv("LLM_ROUTE_CHAT_FAST", "openai:gpt-5.6-luna")
    fast_turns = chat_orchestrator._make_turns(
        system_prompt="sys", max_tokens=100, tier_request="Bonjour", tier_context=_NO_ACCOUNT
    )
    deep_turns = chat_orchestrator._make_turns(
        system_prompt="sys", max_tokens=100, tier_request="Approfondis", tier_context=_NO_ACCOUNT
    )
    assert (fast_turns.provider, fast_turns.model, fast_turns.prompt_name) == (
        "openai",
        "gpt-5.6-luna",
        "bellum_chat_fast",
    )
    assert (deep_turns.provider, deep_turns.model, deep_turns.prompt_name) == (
        "anthropic",
        model_for("bellum_chat"),
        "bellum_chat_deep",
    )


# ── 4. le palier se voit, le contenu jamais ───────────────────────────────────


def test_le_palier_et_sa_regle_sont_journalises_sans_le_message(monkeypatch, caplog):
    _tiers_configured(monkeypatch)
    secret = "Approfondis le dossier confidentiel Zorglub"
    with caplog.at_level(logging.INFO, logger=routing.logger.name):
        resolve_chat_route("bellum_chat", secret, _NO_ACCOUNT)
    lines = [r.getMessage() for r in caplog.records if r.name == routing.logger.name]
    assert len(lines) == 1
    assert "tier=deep" in lines[0] and "reason=explicit_depth" in lines[0]
    assert "Zorglub" not in lines[0] and "confidentiel" not in lines[0]


def test_sans_reglage_aucune_ligne_nest_ajoutee(monkeypatch, caplog):
    with caplog.at_level(logging.DEBUG, logger=routing.logger.name):
        resolve_chat_route("bellum_chat", "Approfondis", _NO_ACCOUNT)
    assert [r for r in caplog.records if r.name == routing.logger.name] == []


# ── 4 bis. le mode OMBRE (décision de Louis, 17/09/2026) ─────────────────────


def _routing_lines(caplog) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.name == routing.logger.name]


@pytest.mark.parametrize("value", ["1", "true", "TRUE"])
def test_ombre_allumee_journalise_sans_rien_router(monkeypatch, caplog, value):
    monkeypatch.setenv("CHAT_MODEL_ROUTING_SHADOW", value)
    with caplog.at_level(logging.INFO, logger=routing.logger.name):
        route = resolve_chat_route("bellum_chat", "Analyse le compte confidentiel Zorglub", _NO_ACCOUNT)
    assert route == ("bellum_chat", "bellum_chat", None), "l'ombre ne change ni la destination ni le nom de coût"
    lines = _routing_lines(caplog)
    assert len(lines) == 1
    assert "tier=deep" in lines[0] and "reason=account_analysis" in lines[0] and "shadow=true" in lines[0]
    assert "Zorglub" not in lines[0] and "confidentiel" not in lines[0]


@pytest.mark.parametrize("value", ["", "0", "false", "off-par-erreur"])
def test_ombre_eteinte_aucun_journal(monkeypatch, caplog, value):
    monkeypatch.setenv("CHAT_MODEL_ROUTING_SHADOW", value)
    _classifier_must_not_run(monkeypatch)
    with caplog.at_level(logging.DEBUG, logger=routing.logger.name):
        route = resolve_chat_route("bellum_chat", "Approfondis", _NO_ACCOUNT)
    assert route == ("bellum_chat", "bellum_chat", None)
    assert _routing_lines(caplog) == []


def test_le_coupe_circuit_eteint_aussi_lombre(monkeypatch, caplog):
    monkeypatch.setenv("CHAT_MODEL_ROUTING_SHADOW", "1")
    monkeypatch.setenv("CHAT_MODEL_ROUTING_DISABLED", "true")
    _classifier_must_not_run(monkeypatch)
    with caplog.at_level(logging.DEBUG, logger=routing.logger.name):
        resolve_chat_route("bellum_chat", "Approfondis", _NO_ACCOUNT)
    assert _routing_lines(caplog) == []


def test_ombre_et_palier_regle_le_routage_reel_gagne(monkeypatch, caplog):
    """Un palier réglé, c'est la décision de router : l'ombre n'a plus d'objet."""
    monkeypatch.setenv("CHAT_MODEL_ROUTING_SHADOW", "1")
    _tiers_configured(monkeypatch)
    with caplog.at_level(logging.INFO, logger=routing.logger.name):
        route = resolve_chat_route("bellum_chat", "Approfondis", _NO_ACCOUNT)
    assert route == ("chat_deep", "bellum_chat_deep", ("deep", "explicit_depth"))
    lines = _routing_lines(caplog)
    assert len(lines) == 1 and "shadow" not in lines[0]


def test_ombre_sans_demande_ne_devine_rien(monkeypatch, caplog):
    monkeypatch.setenv("CHAT_MODEL_ROUTING_SHADOW", "1")
    _classifier_must_not_run(monkeypatch)
    with caplog.at_level(logging.DEBUG, logger=routing.logger.name):
        assert resolve_chat_route("bellum_chat", None, None) == ("bellum_chat", "bellum_chat", None)
    assert _routing_lines(caplog) == []


@pytest.mark.asyncio
async def test_ombre_la_boucle_part_ou_elle_partait(monkeypatch, caplog):
    monkeypatch.setenv("CHAT_MODEL_ROUTING_SHADOW", "true")
    with caplog.at_level(logging.INFO, logger=routing.logger.name):
        calls = await _run_turn(monkeypatch, "Analyse le compte Thales", _NO_ACCOUNT)
    assert [c["model"] for c in calls] == [model_for("bellum_chat")] * 3
    assert set(claude_service.cost_counters()) == {"bellum_chat"}
    lines = _routing_lines(caplog)
    assert len(lines) == 1, "un tour = une décision journalisée, pas une par aller-retour"
    assert "shadow=true" in lines[0]


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch-outils"])
def test_ombre_route_destination_inchangee(client, monkeypatch, tools):
    monkeypatch.setenv("CHAT_MODEL_ROUTING_SHADOW", "1")
    assert _models_sent(client, monkeypatch, _body("Analyse le compte Thales"), tools=tools) == [
        model_for("bellum_chat")
    ]


# ── 5. la route : les DEUX chemins du chat suivent le palier ─────────────────


def _body(message: str, account_id: str = "", mode: str | None = None) -> dict:
    body: dict = {
        "user_id": "u-2248",
        "workspace_id": "ws-1",
        "message": message,
        "account_id": account_id,
        "history": [],
        "connected_families": [],
    }
    # #2450.1 (reste partiel, épopée #2882) — omis quand non précisé : le corps
    # reste identique à celui d'un appelant d'avant ce champ.
    if mode is not None:
        body["mode"] = mode
    return body


def _calls_sent(client: TestClient, monkeypatch, body: dict, *, tools: bool) -> list[dict]:
    if not tools:
        monkeypatch.setenv("CHAT_TOOLS_DISABLED", "1")
    calls: list[dict] = []
    text = "ok"
    response = SimpleNamespace(
        stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)], usage=_usage()
    )

    class _Messages:
        def stream(self, **kw):
            calls.append(kw)
            return _Stream(response)

        async def create(self, **kw):
            calls.append(kw)
            return response

    class _Client:
        def __init__(self, **_kw):
            self.messages = _Messages()

    with (
        patch.object(anthropic, "AsyncAnthropic", _Client),
        patch.object(chat_orchestrator, "throttle", lambda _p: _DummyThrottle()),
        patch.object(claude_service, "throttle", lambda _p: _DummyThrottle()),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post("/chat/message", json=body)
    assert res.status_code == 200
    assert '"success": true' in res.text, res.text[-400:]
    assert calls, "aucun appel modèle — le test ne lit rien"
    return calls


def _models_sent(client: TestClient, monkeypatch, body: dict, *, tools: bool) -> list[str]:
    return [c["model"] for c in _calls_sent(client, monkeypatch, body, tools=tools)]


def _response_data(client: TestClient, monkeypatch, body: dict) -> dict:
    """#2448.10 (reste partiel, épopée #2882) — MÊME montage que `_calls_sent`,
    mais rend le corps JSON de la réponse plutôt que les appels modèle : c'est
    lui qui porte `context.mode_explanation`, le contrat de traçabilité."""
    text = "ok"
    response = SimpleNamespace(
        stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)], usage=_usage()
    )

    class _Messages:
        def stream(self, **kw):
            return _Stream(response)

        async def create(self, **kw):
            return response

    class _Client:
        def __init__(self, **_kw):
            self.messages = _Messages()

    with (
        patch.object(anthropic, "AsyncAnthropic", _Client),
        patch.object(chat_orchestrator, "throttle", lambda _p: _DummyThrottle()),
        patch.object(claude_service, "throttle", lambda _p: _DummyThrottle()),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post("/chat/message", json=body)
    assert res.status_code == 200
    # #2450 (LOT STREAM, 12/09/2026) — la réponse est un flux SSE (une ligne
    # `data: {...}` par évènement), jamais un JSON bufferisé : `res.json()`
    # échouerait sur la première trame. L'évènement TERMINAL (`type: done`)
    # porte la MÊME enveloppe que l'ancien corps bufferisé — le seul que ce
    # test lit, comme `askLauraStreaming` (`laura-turn.ts`) côté navigateur.
    events = [json.loads(line[len("data: ") :]) for line in res.text.splitlines() if line.startswith("data: ")]
    done = next(e for e in events if e.get("type") == "done")
    return done["data"]


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch-outils"])
def test_la_route_envoie_la_demande_de_fond_au_palier_fort(client, monkeypatch, tools):
    _tiers_configured(monkeypatch)
    assert _models_sent(client, monkeypatch, _body("Analyse le compte Thales"), tools=tools) == [DEEP_MODEL]


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch-outils"])
def test_la_route_lit_le_compte_actif(client, monkeypatch, tools):
    _tiers_configured(monkeypatch)
    assert _models_sent(client, monkeypatch, _body("Fais-moi une analyse", "acc-1"), tools=tools) == [DEEP_MODEL]
    assert _models_sent(client, monkeypatch, _body("Fais-moi une analyse"), tools=tools)[-1] == FAST_MODEL


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch-outils"])
def test_la_route_lit_le_mode_de_recherche_demande(client, monkeypatch, tools):
    """#2450.1 (reste partiel, épopée #2882) — `requested_mode` était déjà
    câblé et testé (`ChatTierContext`, `choose_chat_tier`) mais AUCUNE requête
    HTTP ne l'atteignait avant ce lot — le point d'appel réel manquait,
    exactement le défaut que ce dépôt nomme « code juste, jamais appelé »."""
    _tiers_configured(monkeypatch)
    # Une question courante part au palier rapide SANS réglage (#553 ci-dessus,
    # même message) — le mode « approfondi » la force malgré tout au palier fort.
    assert _models_sent(client, monkeypatch, _body("Fais-moi une analyse", mode="approfondi"), tools=tools) == [
        DEEP_MODEL
    ]
    # « auto » (ou son absence, testée par les lignes voisines) laisse
    # l'heuristique habituelle décider — comportement inchangé.
    assert _models_sent(client, monkeypatch, _body("Fais-moi une analyse", mode="auto"), tools=tools)[-1] == FAST_MODEL


def test_mode_explanation_porte_le_mode_demande_et_le_palier_choisi(client, monkeypatch):
    """#2448.10 (reste partiel, épopée #2882) — le contrat technique de
    traçabilité : `requested_mode` (le geste de la personne, absent quand
    aucune surface n'en a posé un) et `tier` (le palier RÉELLEMENT choisi),
    les deux déjà calculés par CE tour — aucune donnée inventée."""
    _tiers_configured(monkeypatch)
    data = _response_data(client, monkeypatch, _body("Fais-moi une analyse", mode="approfondi"))
    assert data["context"]["mode_explanation"]["requested_mode"] == "approfondi"
    assert data["context"]["mode_explanation"]["tier"] == "deep"

    data = _response_data(client, monkeypatch, _body("Bonjour"))
    assert data["context"]["mode_explanation"]["requested_mode"] is None
    assert data["context"]["mode_explanation"]["tier"] == "fast"


def test_mode_rapide_retire_web_search_du_catalogue_envoye_au_modele(client, monkeypatch):
    """#2450.4 / #2448.5 (épopée #2882) — RAPIDE explicite : `web_search`
    n'atteint même pas le modèle (pas seulement une consigne priée)."""
    _tiers_configured(monkeypatch)
    calls = _calls_sent(client, monkeypatch, _body("Trouve des contacts chez Thales", mode="rapide"), tools=True)
    sent_tool_names = {t["name"] for t in calls[0].get("tools") or []}
    assert "web_search" not in sent_tool_names


def test_mode_verifie_et_approfondi_gardent_web_search(client, monkeypatch):
    _tiers_configured(monkeypatch)
    for mode in ("verifie", "approfondi"):
        calls = _calls_sent(client, monkeypatch, _body("Trouve des contacts chez Thales", mode=mode), tools=True)
        sent_tool_names = {t["name"] for t in calls[0].get("tools") or []}
        assert "web_search" in sent_tool_names, mode


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch-outils"])
def test_la_route_lit_le_risque_dune_proposition_en_attente(client, monkeypatch, tools):
    """#2440.56/.60/.61 (épopée #2975) — le POINT D'APPEL RÉEL manquait,
    exactement le défaut que ce dépôt nomme « code juste, jamais appelé » :
    `choose_chat_tier`/`ChatTierContext.risk` étaient câblés et testés en
    isolation, mais rien ne les atteignait depuis une vraie requête HTTP. Un
    fil qui porte une proposition d'ÉCRITURE encore en attente de
    confirmation (`thread_state.proposals`, projeté par #1927 depuis un vrai
    statut `pending_confirmation`) force le palier fort sur le tour suivant,
    même une demande ordinaire qui retomberait `fast` seule."""
    _tiers_configured(monkeypatch)
    body = _body("Confirme")
    body["thread_state"] = {
        "version": 1,
        "proposals": [
            {"action": "export_contact_to_crm", "target_kind": "contact", "target_id": "c-1", "target_label": "Jean Dupont"}
        ],
    }
    assert _models_sent(client, monkeypatch, body, tools=tools) == [DEEP_MODEL]
    # Sans proposition en attente (l'immense majorité des tours) : chemin
    # d'avant ce champ, à l'octet — le palier rapide, sans réglage de risque.
    assert _models_sent(client, monkeypatch, _body("Confirme"), tools=tools) == [FAST_MODEL]


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch-outils"])
def test_temoin_route_sans_reglage(client, monkeypatch, tools):
    _classifier_must_not_run(monkeypatch)
    assert _models_sent(client, monkeypatch, _body("Analyse le compte Thales"), tools=tools) == [
        model_for("bellum_chat")
    ]


class TestModeInsufficiencyNotice:
    """#2450.8/.9/.12 (épopée #2882) — NO-GO de l'issue : « le choix utilisateur
    est ignoré OU une dépense est engagée sous prétexte que le mode est
    insuffisant ». `choose_chat_tier` tenait déjà la première moitié (le mode
    explicite gagne toujours, aucune dépense forcée) ; ces cas disent NON à
    ce qui manquait : rester silencieux sur la limite plutôt que la nommer."""

    def test_ne_dit_rien_sans_conflit(self):
        assert mode_insufficiency_notice("Prépare mon brief du jour", ChatTierContext(requested_mode="rapide")) is None

    def test_ne_dit_rien_hors_mode_rapide_explicite(self):
        # « auto »/« verifie »/« approfondi »/absent : aucun conflit à signaler,
        # soit parce que rien n'a été choisi, soit parce que le mode choisi
        # satisfait déjà le plancher.
        for mode in (None, "auto", "verifie", "approfondi"):
            assert mode_insufficiency_notice("Quoi de neuf chez Thales ?", ChatTierContext(requested_mode=mode)) is None

    def test_signale_le_conflit_sans_jamais_deviner_un_cout(self):
        notice = mode_insufficiency_notice("Quoi de neuf chez Thales ?", ChatTierContext(requested_mode="rapide"))
        assert notice is not None
        assert "Rapide" not in notice or "crédit" not in notice.lower()  # jamais un chiffre inventé
        assert "crédit" not in notice.lower() and "credit" not in notice.lower()
        assert "Vérifié" in notice

    def test_rendu_fr_et_en(self):
        fr = mode_insufficiency_notice(
            "Quoi de neuf chez Thales ?", ChatTierContext(requested_mode="rapide"), interface_language="fr"
        )
        en = mode_insufficiency_notice(
            "What's the latest news on Safran?", ChatTierContext(requested_mode="rapide"), interface_language="en"
        )
        assert fr is not None and "Vérifié" in fr
        assert en is not None and "Verified" in en
        assert fr != en

    def test_ne_force_jamais_le_palier__seulement_le_dire(self):
        # #2450.9 — même demande, même mode : le palier reste RAPIDE (aucune
        # dépense engagée sous prétexte que le mode est insuffisant), la
        # notice n'est qu'une information ajoutée à côté.
        context = ChatTierContext(requested_mode="rapide")
        decision = choose_chat_tier("Quoi de neuf chez Thales ?", context)
        notice = mode_insufficiency_notice("Quoi de neuf chez Thales ?", context)
        assert decision.tier == "fast"
        assert notice is not None


class TestChatModePolicies:
    """#2450.2 (épopée #2882) — la plus petite tranche RÉELLE de la policy par
    mode (`CHAT_MODE_POLICIES`) : elle NOMME ce qui est déjà vrai ailleurs
    (`MODE_TIER`, l'exclusion d'outil ci-dessous), elle n'invente ni budget ni
    evidence graph — ces derniers restent un système à concevoir."""

    def test_auto_na_aucune_policy_forcee(self):
        # `auto` reste décidé par l'heuristique seule — aucune entrée ici,
        # la même garantie que `MODE_TIER` porte déjà.
        assert "auto" not in routing.CHAT_MODE_POLICIES

    def test_chaque_policy_porte_le_meme_palier_que_mode_tier(self):
        for mode, policy in routing.CHAT_MODE_POLICIES.items():
            assert policy.tier == routing.MODE_TIER[mode]

    def test_seul_rapide_exclut_la_recherche_publique(self):
        assert routing.CHAT_MODE_POLICIES["rapide"].excludes_web_search is True
        assert routing.CHAT_MODE_POLICIES["verifie"].excludes_web_search is False
        assert routing.CHAT_MODE_POLICIES["approfondi"].excludes_web_search is False


class TestModeExcludedToolNames:
    """#2450.4 / #2448.5 (épopée #2882) — RAPIDE retire `web_search` de son
    catalogue : sa promesse est de répondre à partir de ce qui est déjà su,
    jamais d'aller chercher sur le web public."""

    def test_rapide_exclut_web_search(self):
        assert routing.mode_excluded_tool_names("rapide") == frozenset({"web_search"})

    def test_verifie_et_approfondi_nexcluent_rien(self):
        assert routing.mode_excluded_tool_names("verifie") == frozenset()
        assert routing.mode_excluded_tool_names("approfondi") == frozenset()

    def test_sans_mode_rien_nest_retire(self):
        # `None`/`"auto"` : chemin byte-identique à avant cette fonction.
        assert routing.mode_excluded_tool_names(None) == frozenset()
        assert routing.mode_excluded_tool_names("auto") == frozenset()


class TestExplainTierDecision:
    """#2448.4 (épopée #2882) — « AUTO n'est pas un mode opaque » : une phrase
    par raison, dans les deux langues, jamais un nom de fournisseur ni de
    modèle."""

    @pytest.mark.parametrize("reason", routing.TIER_REASONS)
    def test_chaque_raison_du_banc_a_une_explication_fr_et_en(self, reason):
        fr = routing.explain_tier_decision(reason, interface_language="fr")
        en = routing.explain_tier_decision(reason, interface_language="en")
        assert fr, reason
        assert en, reason
        assert fr != en

    def test_une_raison_inconnue_ne_casse_rien(self):
        assert routing.explain_tier_decision("raison_qui_nexiste_pas") == ""

    def test_defaut_langue_est_le_francais(self):
        assert routing.explain_tier_decision("default") == routing.explain_tier_decision(
            "default", interface_language="fr"
        )

    def test_aucun_nom_de_fournisseur_ni_de_modele(self):
        # Doctrine : nos fournisseurs ne se nomment jamais à l'écran.
        banned = ("anthropic", "claude", "openai", "gpt", "haiku", "opus", "sonnet")
        for reason in routing.TIER_REASONS:
            for lang in ("fr", "en"):
                text = routing.explain_tier_decision(reason, interface_language=lang).lower()
                for word in banned:
                    assert word not in text, (reason, lang, word)


# ── 5. #2443.9 (#2899) — la cohorte canary reçoit le modèle CANDIDAT ─────────

CANARY_MODEL = "claude-opus-4-6"


def test_canary_sans_modele_candidat_le_chemin_est_celui_d_avant(monkeypatch):
    monkeypatch.setenv("CHAT_CANARY_WORKSPACE_ALLOWLIST", "ws-beta")
    assert resolve_chat_route("bellum_chat", "Bonjour", ChatTierContext(canary=True)) == ("bellum_chat", "bellum_chat", None)


def test_canary_modele_candidat_pose_mais_espace_hors_cohorte_rien_ne_change(monkeypatch):
    monkeypatch.setenv("LLM_ROUTE_CHAT_CANARY", f"anthropic:{CANARY_MODEL}")
    route = resolve_chat_route("bellum_chat", "Bonjour", ChatTierContext(canary=False))
    assert route.task == "bellum_chat"


def test_canary_espace_de_la_cohorte_part_vers_le_candidat_et_le_dit_dans_le_cout(monkeypatch):
    monkeypatch.setenv("LLM_ROUTE_CHAT_CANARY", f"anthropic:{CANARY_MODEL}")
    route = resolve_chat_route("bellum_chat", "Bonjour", ChatTierContext(canary=True))
    assert (route.task, route.cost_name) == ("chat_canary", "bellum_chat_canary")
    assert llm_gateway.resolve_dispatch(route.task, model_for("bellum_chat"))[1] == CANARY_MODEL


def test_canary_le_coupe_circuit_du_routage_l_eteint(monkeypatch):
    monkeypatch.setenv("LLM_ROUTE_CHAT_CANARY", f"anthropic:{CANARY_MODEL}")
    monkeypatch.setenv("CHAT_MODEL_ROUTING_DISABLED", "true")
    assert resolve_chat_route("bellum_chat", "Bonjour", ChatTierContext(canary=True)).task == "bellum_chat"


def test_canary_sans_demande_l_appelant_d_avant_n_est_pas_route(monkeypatch):
    monkeypatch.setenv("LLM_ROUTE_CHAT_CANARY", f"anthropic:{CANARY_MODEL}")
    assert resolve_chat_route("bellum_chat", None, ChatTierContext(canary=True)).task == "bellum_chat"


def test_canary_le_tour_http_lit_la_cohorte_de_l_espace(monkeypatch):
    from app.eval.chat_canary import is_workspace_in_canary_cohort

    monkeypatch.setenv("CHAT_CANARY_WORKSPACE_ALLOWLIST", "ws-beta")
    assert is_workspace_in_canary_cohort("WS-Beta") and not is_workspace_in_canary_cohort("ws-prod")
    from app.routers import chat as chat_router

    assert chat_router.is_workspace_in_canary_cohort is is_workspace_in_canary_cohort
