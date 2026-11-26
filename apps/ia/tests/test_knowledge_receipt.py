"""#3193.2/.3 (épopée #3217) — le reçu de connaissance structuré, onze couches.

Pure projection du `context` déjà construit par `build_context_transparency`
(et déjà complété par les sources citées par les outils exécutés ce tour) :
aucun second appel, une couche n'est `consulted` que sur une preuve réelle
déjà présente ailleurs dans `context`.
"""

from __future__ import annotations

from app.prompts.context_transparency import (
    KNOWLEDGE_RECEIPT_LAYERS,
    build_context_transparency,
    build_knowledge_receipt,
)


def _base_context(**overrides) -> dict:
    base = dict(
        profile_data={"esn_name": "Skaizen"},
        account_data={"company_name": "SNCF", "updated_at": "2026-09-10T00:00:00Z"},
        contacts_summary="Alice - DSI - decideur",
        plan_summary="",
        knowledge_docs=[],
        accounts_summary="",
    )
    base.update(overrides)
    return build_context_transparency(**base)


def test_names_all_eleven_layers_even_the_ones_never_consulted():
    receipt = build_knowledge_receipt(_base_context())
    assert set(receipt.keys()) == set(KNOWLEDGE_RECEIPT_LAYERS)
    for layer in receipt.values():
        assert layer["status"] in {"consulted", "unavailable", "not_requested", "forbidden_by_mode", "excluded"}


def test_workspace_is_consulted_when_profile_or_account_was_provided():
    receipt = build_knowledge_receipt(_base_context())
    assert receipt["workspace"]["status"] == "consulted"
    assert receipt["workspace"]["result_count"] == 1


def test_workspace_is_not_requested_without_any_active_context():
    context = _base_context(profile_data={}, account_data={}, contacts_summary="")
    receipt = build_knowledge_receipt(context)
    assert receipt["workspace"] == {"status": "not_requested"}


def test_agenda_and_dataforge_are_not_requested_without_a_real_result():
    """#3193.6 — sans preuve réelle (aucune source `calendar`/`dataforge` dans
    `context["sources"]`), les deux couches restent `not_requested` : leur
    outil peut exister sans avoir tourné CE tour."""
    receipt = build_knowledge_receipt(_base_context())
    assert receipt["agenda"] == {"status": "not_requested"}
    assert receipt["dataforge"] == {"status": "not_requested"}


def test_agenda_is_consulted_when_list_agenda_or_find_free_slots_read_the_calendar():
    """Lot E3 28/09 (suite) — `list_agenda`/`find_free_slots`/`prepare_day_brief`
    lisaient déjà le calendrier connecté (`chat_tools.py`) sans jamais le dire
    ici : `cited_sources` pose maintenant `kind: "calendar"` sur un résultat
    réel, et cette couche le lit."""
    context = _base_context()
    context["sources"] = [{"kind": "calendar", "label": "Agenda"}]
    receipt = build_knowledge_receipt(context)
    assert receipt["agenda"] == {"status": "consulted"}


def test_dataforge_is_consulted_when_a_sector_referential_hit_is_cited():
    context = _base_context()
    context["sources"] = [{"kind": "dataforge", "label": "Repère A"}]
    receipt = build_knowledge_receipt(context)
    assert receipt["dataforge"] == {"status": "consulted"}


def test_crm_crossed_this_turn_is_consulted_with_freshness():
    context = _base_context()
    context["sources"] = [
        {"kind": "crm", "label": "Votre CRM — présence du compte croisée", "as_of": "2026-09-28T10:00:00Z"}
    ]
    receipt = build_knowledge_receipt(context, crm_connected=True)
    assert receipt["crm"] == {"status": "consulted", "freshness": "2026-09-28T10:00:00Z"}


def test_crm_connected_but_failed_read_is_unavailable_not_not_requested():
    """#1915.11 étendu au reçu — une panne de lecture n'est jamais confondue avec
    « non demandé » : le commercial doit voir qu'on a ESSAYÉ et échoué."""
    receipt = build_knowledge_receipt(_base_context(), crm_connected=True, crm_unavailable=True)
    assert receipt["crm"]["status"] == "unavailable"
    assert receipt["crm"]["caveat"]


def test_crm_not_connected_is_not_requested():
    receipt = build_knowledge_receipt(_base_context(), crm_connected=False)
    assert receipt["crm"] == {"status": "not_requested"}


def test_crm_excluded_for_this_thread_is_its_own_state_never_not_requested_or_unavailable():
    """#3708 (recette prod 09/10) — un CRM EXCLU pour ce fil sortait ici en
    `not_requested` (« Non demandé »), EN MÊME TEMPS que `_not_consulted_entries`
    (liste « NON CONSULTÉ ») le disait « exclu par toi » : la même source sous
    deux formes contradictoires dans le même reçu. L'exclusion prime, même
    connecté, même une source CRM citée par erreur ce tour."""
    receipt = build_knowledge_receipt(_base_context(), crm_connected=True, excluded_families=frozenset({"crm"}))
    assert receipt["crm"] == {"status": "excluded"}

    context = _base_context()
    context["sources"] = [{"kind": "crm", "label": "Votre CRM — présence du compte croisée"}]
    receipt_with_source = build_knowledge_receipt(
        context, crm_connected=True, excluded_families=frozenset({"crm"})
    )
    assert receipt_with_source["crm"] == {"status": "excluded"}


def test_crm_excluded_only_applies_to_crm_never_to_other_layers():
    receipt = build_knowledge_receipt(_base_context(), crm_connected=False, excluded_families=frozenset({"crm"}))
    assert receipt["messaging"]["status"] == "not_requested"
    assert receipt["agenda"]["status"] == "not_requested"


def test_messaging_consulted_only_with_real_mail_threads_read_this_turn():
    context = _base_context()
    context["mail_threads"] = [{"thread_id": "th-1", "participants": ["dsi@sncf.fr"]}]
    receipt = build_knowledge_receipt(context, email_connected=True)
    assert receipt["messaging"] == {"status": "consulted", "result_count": 1}


def test_messaging_not_requested_when_connected_but_not_searched_this_turn():
    receipt = build_knowledge_receipt(_base_context(), email_connected=True)
    assert receipt["messaging"] == {"status": "not_requested"}


def test_documents_consulted_only_on_a_real_result_never_on_bare_availability():
    """#3193.6 — ne pas prétendre avoir consulté une couche simplement parce
    qu'elle était disponible : sans document réellement injecté, `documents`
    reste `not_requested`, jamais `consulted` avec un résultat à 0 deviné."""
    receipt = build_knowledge_receipt(_base_context(knowledge_docs=[]))
    assert receipt["documents"] == {"status": "not_requested"}

    context = _base_context(knowledge_docs=[{"title": "Playbook SNCF", "content": "budget cyber voté"}])
    receipt = build_knowledge_receipt(context)
    assert receipt["documents"] == {"status": "consulted", "result_count": 1}


def test_market_memory_and_current_public_sources_come_from_cited_sources():
    context = _base_context()
    context["sources"] = [
        {"kind": "market_observation", "label": "Renault"},
        {"kind": "market_signal", "label": "SNCF — appel d'offres ouvert", "as_of": "2026-09-20"},
    ]
    receipt = build_knowledge_receipt(context)
    assert receipt["market_memory"] == {"status": "consulted", "result_count": 1}
    assert receipt["current_public_sources"] == {"status": "consulted", "result_count": 1}


def test_market_memory_is_unavailable_not_not_requested_when_search_market_memory_errored():
    """#3177.5 (recette prod 29 puis 30/09) — « qu'est-ce que la mémoire marché
    sait du groupe La Poste et de ses filiales ? » : Laura appelait bien
    `search_market_memory`, le pont échouait (délai dépassé même à 20 s), et le
    reçu affichait quand même « Mémoire marché Bellum — Non demandé », comme si
    rien n'avait été tenté. Un outil APPELÉ ce tour et ressorti en erreur doit
    se lire `unavailable`, jamais `not_requested`."""
    context = _base_context()
    receipt = build_knowledge_receipt(context, failed_tools=frozenset({"search_market_memory"}))
    assert receipt["market_memory"]["status"] == "unavailable"
    assert receipt["market_memory"]["caveat"]


def test_dataforge_agenda_and_current_public_sources_are_also_unavailable_on_a_real_tool_failure():
    """#3193.10 — même défaut que #3177.5 pour les trois autres couches
    adossées à un outil de chat : sans ce lien, `unavailable` n'était jamais
    atteignable pour elles en pratique (seul le kill switch global rend
    `forbidden_by_mode`), donc la recette ne voyait jamais que deux états sur
    quatre."""
    context = _base_context()
    receipt = build_knowledge_receipt(
        context,
        failed_tools=frozenset({"search_sector_referential", "list_agenda", "run_account_search"}),
    )
    assert receipt["dataforge"]["status"] == "unavailable"
    assert receipt["agenda"]["status"] == "unavailable"
    assert receipt["current_public_sources"]["status"] == "unavailable"


def test_a_real_result_always_wins_over_a_failed_attempt_on_the_same_layer():
    """Un outil peut échouer une fois dans le tour puis réussir (retry) : une
    source RÉELLEMENT citée prime toujours sur la trace d'échec — jamais
    `unavailable` sur une couche qui a, en fait, livré un résultat."""
    context = _base_context()
    context["sources"] = [{"kind": "market_observation", "label": "La Poste"}]
    receipt = build_knowledge_receipt(context, failed_tools=frozenset({"search_market_memory"}))
    assert receipt["market_memory"]["status"] == "consulted"


def test_tool_backed_layers_are_forbidden_by_mode_not_not_requested_when_tools_are_cut():
    """D169/D243 — le kill switch rend une couche INTERDITE par le réglage du
    tour, une distinction plus précise que « non demandée » (l'outil existe,
    il n'a simplement pas eu le droit de tourner)."""
    receipt = build_knowledge_receipt(
        _base_context(), crm_connected=True, email_connected=True, copilot_tools_enabled=False
    )
    assert receipt["crm"]["status"] == "forbidden_by_mode"
    assert receipt["messaging"]["status"] == "forbidden_by_mode"
    assert receipt["market_memory"]["status"] == "forbidden_by_mode"
    assert receipt["current_public_sources"]["status"] == "forbidden_by_mode"
    # Lot E3 28/09 (suite) — `agenda`/`dataforge` suivent maintenant le même
    # interrupteur D169/D243 que les autres couches outillées.
    assert receipt["agenda"]["status"] == "forbidden_by_mode"
    assert receipt["dataforge"]["status"] == "forbidden_by_mode"


def test_bellum_method_consulted_only_when_a_rule_actually_matched():
    context = _base_context()
    context["sources"] = [{"kind": "method_rule", "label": "Objection budget"}]
    receipt = build_knowledge_receipt(context)
    assert receipt["bellum_method"] == {"status": "consulted", "result_count": 1}
    assert build_knowledge_receipt(_base_context())["bellum_method"] == {"status": "not_requested"}


def test_inference_is_always_consulted_with_an_honest_caveat_never_a_bare_fact():
    receipt_fr = build_knowledge_receipt(_base_context())
    assert receipt_fr["inference"]["status"] == "consulted"
    assert "raisonnement" in receipt_fr["inference"]["caveat"]

    receipt_en = build_knowledge_receipt(_base_context(), language="en")
    assert "reasoning" in receipt_en["inference"]["caveat"]


def test_no_layer_ever_carries_a_null_placeholder_field():
    """« On n'affiche pas ce qu'on n'a pas » — une couche sans résultat/fraîcheur/
    couverture/réserve réels ne porte AUCUNE de ces clés, jamais `None`."""
    receipt = build_knowledge_receipt(_base_context(knowledge_docs=[]))
    for layer in receipt.values():
        for key in ("result_count", "coverage", "freshness", "caveat"):
            assert key not in layer or layer[key] is not None
