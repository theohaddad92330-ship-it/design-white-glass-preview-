"""#3176 (épopée #3216) — LE PLANIFICATEUR DE SOURCES : les dix couches
canoniques, les quatre modes de recherche (INTERNAL_ONLY / CURRENT_PUBLIC /
COMBINED / WORKSPACE_FIRST), le `SourcePlan` à neuf champs, et l'observabilité
câblée sur les appels d'outils RÉELS d'un tour.
"""

from __future__ import annotations

import pytest

from app.services.context_mode import CONTEXT_LAYERS
from app.services.source_plan import (
    CANONICAL_SOURCE_LAYERS,
    CONTEXT_LAYER_TO_SOURCE_LAYER,
    SEARCH_MODES,
    LAYER_TOOL_NAMES,
    build_source_plan,
    detect_search_mode,
    observe_source_plan,
    source_plan_block,
)


def test_les_dix_couches_canoniques_dans_l_ordre_du_ticket():
    assert CANONICAL_SOURCE_LAYERS == (
        "explicit_request",
        "thread_memory",
        "profile",
        "workspace",
        "connected_systems",
        "account_dossier",
        "dataforge",
        "market_memory",
        "public_sources",
        "methodological_inference",
    )


def test_quatre_modes_de_recherche():
    assert set(SEARCH_MODES) == {"internal_only", "current_public", "combined", "workspace_first"}


# ── #3176.2 — conciliation avec context_mode.CONTEXT_LAYERS (GA-26) ────────


def test_toute_couche_de_contexte_mode_se_concilie():
    # Aucune des huit couches de #2453 n'est laissée sans correspondance, et
    # aucune ne pointe vers une couche qui n'existe pas dans le ticket.
    assert set(CONTEXT_LAYER_TO_SOURCE_LAYER) == set(CONTEXT_LAYERS)
    for target in CONTEXT_LAYER_TO_SOURCE_LAYER.values():
        assert target in CANONICAL_SOURCE_LAYERS


# ── Détection des marqueurs ──────────────────────────────────────────────


def test_sans_marqueur_aucun_mode_detecte():
    assert detect_search_mode("peux-tu m'aider avec ce compte ?") is None
    assert detect_search_mode("") is None
    assert detect_search_mode(None) is None


@pytest.mark.parametrize(
    "message",
    [
        "Je ne te demande pas une source publique, dis-moi ce que tu sais dans ta mémoire.",
        "Qu'est-ce que Bellum connaît déjà sur ce compte ?",
        "Réponds sans aller sur le web.",
        "Qu'avons-nous dans nos données ?",
        "Regarde ce qu'il y a dans mon CRM.",
    ],
)
def test_les_cinq_marqueurs_internal_only_du_ticket(message):
    match = detect_search_mode(message)
    assert match is not None
    assert match.mode == "internal_only"


def test_aujourd_hui_seul_ne_declenche_pas_current_public():
    # NO-GO explicite de #3176.1 : « peux-tu m'aider aujourd'hui avec ce
    # compte ? » ne doit PAS attraper current_public.
    assert detect_search_mode("Peux-tu m'aider aujourd'hui avec ce compte ?") is None


def test_aujourd_hui_avec_un_signal_de_statut_declenche_current_public():
    match = detect_search_mode("Quel est son poste aujourd'hui ?")
    assert match is not None
    assert match.mode == "current_public"


def test_poste_actuel_declenche_current_public():
    match = detect_search_mode("Quel est son poste actuel ?")
    assert match is not None
    assert match.mode == "current_public"


def test_combined_sur_une_demande_de_strategie():
    match = detect_search_mode("Quelle stratégie adopter sur ce compte ?")
    assert match is not None
    assert match.mode == "combined"


def test_workspace_first_sur_une_demande_de_relations():
    match = detect_search_mode("Qui ai-je dans mes contacts chez ce compte ?")
    assert match is not None
    assert match.mode == "workspace_first"


def test_internal_only_gagne_sur_les_autres_marqueurs_en_cas_de_conflit():
    match = detect_search_mode("Dans mon CRM, quelle stratégie adopter ?")
    assert match is not None
    assert match.mode == "internal_only"


def test_marqueurs_anglais():
    assert detect_search_mode("Tell me what Bellum already knows.").mode == "internal_only"
    assert detect_search_mode("What is their current position?").mode == "current_public"
    assert detect_search_mode("What strategy should we adopt?").mode == "combined"
    assert detect_search_mode("Who do I have in my contacts there?").mode == "workspace_first"


# ── SourcePlan ────────────────────────────────────────────────────────────


def test_sans_mode_aucun_plan():
    assert build_source_plan(None) is None
    assert build_source_plan("ce-mode-nexiste-pas") is None


@pytest.mark.parametrize("mode", ["internal_only", "current_public", "combined", "workspace_first"])
def test_chaque_mode_a_un_plan_avec_les_neuf_champs(mode):
    plan = build_source_plan(mode)
    assert plan is not None
    assert plan.requested_scope == mode
    assert isinstance(plan.mandatory_layers, tuple)
    assert isinstance(plan.optional_layers, tuple)
    assert isinstance(plan.forbidden_layers, tuple)
    assert isinstance(plan.sequence, tuple)
    assert isinstance(plan.freshness_required, bool)
    assert plan.max_cost in ("low", "medium", "high")
    assert plan.fallback
    assert isinstance(plan.stop_conditions, tuple)


def test_internal_only_interdit_les_sources_publiques():
    plan = build_source_plan("internal_only")
    assert "public_sources" in plan.forbidden_layers
    assert "public_sources" not in plan.mandatory_layers


def test_combined_exige_toutes_les_familles_du_ticket():
    plan = build_source_plan("combined")
    # compat historique, situation actuelle, contexte privé, accessibilité.
    assert "account_dossier" in plan.mandatory_layers  # compat historique
    assert "public_sources" in plan.mandatory_layers  # situation actuelle
    assert "profile" in plan.mandatory_layers  # contexte privé
    assert "connected_systems" in plan.mandatory_layers  # accessibilité


def test_workspace_first_rend_le_reste_optionnel_jamais_interdit():
    plan = build_source_plan("workspace_first")
    assert "workspace" in plan.mandatory_layers
    assert plan.forbidden_layers == ()
    assert "public_sources" in plan.optional_layers


def test_toutes_les_couches_des_plans_sont_canoniques():
    for mode in SEARCH_MODES:
        plan = build_source_plan(mode)
        for layer in (*plan.mandatory_layers, *plan.optional_layers, *plan.forbidden_layers, *plan.sequence):
            assert layer in CANONICAL_SOURCE_LAYERS, (mode, layer)


# ── Bloc de prompt ────────────────────────────────────────────────────────


def test_sans_mode_le_bloc_est_vide():
    assert source_plan_block(None, "fr") == ""
    assert source_plan_block("inconnu", "fr") == ""


@pytest.mark.parametrize("mode", ["internal_only", "current_public", "combined", "workspace_first"])
def test_chaque_mode_a_un_bloc_fr_et_en_non_vides_et_distincts(mode):
    fr = source_plan_block(mode, "fr")
    en = source_plan_block(mode, "en")
    assert fr.strip() and en.strip()
    assert fr != en
    assert fr.startswith("\n\n")


def test_les_quatre_blocs_fr_sont_reellement_differents():
    blocks = [source_plan_block(mode, "fr") for mode in SEARCH_MODES]
    assert len(set(blocks)) == 4


def test_aucun_nom_de_fournisseur_dans_les_blocs():
    banned = ("anthropic", "claude", "openai", "gpt", "haiku", "opus", "sonnet", "brave", "firecrawl", "apollo")
    for mode in SEARCH_MODES:
        for lang in ("fr", "en"):
            lowered = source_plan_block(mode, lang).lower()
            for word in banned:
                assert word not in lowered, (mode, lang, word)


# ── Observabilité (#3176.10) — câblée sur des appels d'outils RÉELS ────────


def test_sans_match_aucune_trace():
    assert observe_source_plan(None, None, []) is None


def test_internal_only_sans_appel_public_nomme_l_evitement():
    match = detect_search_mode("Dans ta mémoire, que sais-tu ?")
    plan = build_source_plan(match.mode)
    trace = observe_source_plan(match, plan, ["get_account_briefing", "search_market_memory"])
    assert trace.source_plan_requested == "internal_only"
    assert trace.source_plan_effective == "internal_only"
    assert trace.matched_marker
    assert trace.public_search_avoided is True
    assert "account_dossier" in trace.layers_called
    assert "market_memory" in trace.layers_called
    assert "thread_memory" in trace.layers_called
    assert trace.internal_memory_used is True


def test_internal_only_avec_un_appel_public_le_dit_pas_evite():
    match = detect_search_mode("Dans ta mémoire, que sais-tu ?")
    plan = build_source_plan(match.mode)
    trace = observe_source_plan(match, plan, ["web_search"])
    assert trace.public_search_avoided is False


def test_layers_unavailable_liste_les_couches_mandatory_jamais_appelees():
    match = detect_search_mode("Dans ta mémoire, que sais-tu ?")
    plan = build_source_plan(match.mode)
    trace = observe_source_plan(match, plan, [])
    assert "account_dossier" in trace.layers_unavailable
    assert "market_memory" in trace.layers_unavailable


def test_dataforge_et_inference_methodologique_jamais_dans_layers_called():
    # Aucun outil de chat dédié : la correspondance ne les invente pas.
    assert "dataforge" not in LAYER_TOOL_NAMES
    assert "methodological_inference" not in LAYER_TOOL_NAMES


def test_to_wire_expose_les_sept_champs_d_observabilite():
    match = detect_search_mode("Quel est son poste actuel ?")
    plan = build_source_plan(match.mode)
    wire = observe_source_plan(match, plan, ["web_search"]).to_wire()
    assert set(wire) == {
        "source_plan_requested",
        "source_plan_effective",
        "matched_marker",
        "layers_called",
        "layers_unavailable",
        "internal_memory_used",
        "public_search_avoided",
        "source_plan_override_reason",
    }
