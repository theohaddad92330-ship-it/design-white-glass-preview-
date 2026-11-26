from __future__ import annotations

import asyncio
import json
import contextlib
import logging
import os
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, date, datetime

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.services.chat_requested_mode import (
    set_requested_mode,
    set_turn_connected_families,
    set_turn_excluded_providers,
    set_turn_thread,
)

from app.eval.chat_reasoning_trace import post_turn_diagnostic_fields, pre_turn_diagnostic_fields
from app.middleware.correlation_id import get_correlation_id
from app.models.chat import ChatRequest, ChatResponse
from app.models.request_intent_contract import (
    build_request_intent_contract,
    geo_and_sector_from_reading,
    request_intent_contract_for_log,
)
from app.prompts import current_time as current_time_module
from app.services.foreign_script_guard import strip_stray_foreign_script  # #4656
from app.services.attached_document_role import attached_documents_note
from app.services.stale_need_formula import stale_need_line
from app.prompts.bellum_advisor import append_before_language_reminder, build_system_prompt, build_user_prompt
from app.prompts.chat_scope_object import scope_object_block
from app.prompts.laura_acts import market_missions_turn_block
from app.prompts.access_route_turn import access_route_comparison_turn_block
from app.prompts.commercial_method_turn import (
    account_completion_turn_block,
    account_projects_turn_block,
    recent_contacts_follow_up_turn_block,
    approach_preparation_turn_block,
    thread_aware_request,
    cold_call_turn_block,
    decision_maker_search_turn_block,
    entry_route_turn_block,
    method_turn_block,
)
from app.prompts.strategy_turn import full_strategy_turn_block
from app.prompts.context_transparency import (
    build_context_transparency,
    build_knowledge_receipt,
    merge_mail_thread_hints,
    merge_sources,
)
from app.prompts.current_time import current_time_block, resolve_applicable_timezone
from app.prompts.identity_context import identity_context_block
from app.prompts.intent_route import intent_route_block
from app.prompts.intent_route import (
    account_qualification_widening_block,
    company_archetype_block,
    constraint_consistency_block,
    internal_only_block,
    long_read_block,
    message_prep_block,
    need_discovery_block,
    public_news_block,
)
from app.prompts.laura_operating_context import weekly_actions_turn_block, weekly_priority_turn_block
from app.prompts.registry import prompt_version_for
from app.prompts.excluded_sources import excluded_sources_block
from app.prompts.follow_up_ref import follow_up_ref_block
from app.prompts.reply_transform import reply_transform_block
from app.prompts.reply_style_continuity import derive_reply_style, reply_style_block
from app.prompts.research_mode import research_mode_block
from app.prompts.temporal_grounding import temporal_grounding_block
from app.prompts.thread_state import (
    clarification_spent_block,
    correction_not_repeated_block,
    format_thread_state_block,
    interrupted_work_block,
    topic_shift_block,
)
from app.services.commercial_verifier import states_no_tool_result
from app.services import bellum_api, conversation_service, cost_ledger, langfuse_client, method_knowledge, rag_knowledge, rag_service
from app.services.chat_model_routing import (
    ChatTierContext,
    choose_chat_tier,
    explain_tier_decision,
    mode_insufficiency_notice,
    resolve_chat_route,
)
from app.services import (
    conversation_service,
    langfuse_client,
    method_knowledge,
    provider_pricing,
    rag_knowledge,
    rag_service,
    run_metrics,
)
from app.eval.chat_canary import is_workspace_in_canary_cohort
from app.services.chat_model_routing import ChatTierContext, mode_insufficiency_notice, resolve_chat_route
from app.services.chat_orchestrator import EventSink, ProviderOverloaded, tools_detail_from_actions
from app.services.chat_thread_state import ThreadStateCollector, contacts_shown_in_context, thread_state_from_wire
from app.services.chat_turn_plan import TurnObservability, turn_observability_as_dict
from app.services.claude_service import call_claude
from app.services.compilers.intent_markers import (
    detail_level_from_message,
    horizon_from_message,
    urgency_from_message,
)
from app.services.reply_layout_classifier import classify_reply_layout, reply_layout_directive
from app.services.response_density import classify_expected_density
from app.services.compilers.commercial_intent import build_commercial_intent, commercial_intent_for_log
from app.services.compilers.intent_router import (
    UNDECLARED_CHAT_INTENT,
    asks_for_internal_only_scope,
    asks_to_qualify_a_named_account,
    available_inputs_from_thread,
    chat_intent_route_for_log,
    route_chat_intent,
)
from app.services.context_mode import (
    apply_context_mode,
    context_mode_block,
    knowledge_base_allowed,
    workspace_data_exclusion_block,
    older_answers_block,
    workspace_data_excluded_tool_names,
)
from app.services.sales_context import contract_mode_turn_block, missing_contract_mode_proposal
from app.services.search_universe import build_search_universe, detect_broad_population_marker
from app.services.source_plan import (
    LAYER_TOOL_NAMES,
    build_source_plan,
    detect_search_mode,
    mentions_own_contacts,
    observe_source_plan,
    source_plan_block,
)
from app.services.discover_request_reading import read_request
from app.services.json_safe import describe_unserializable, dumps_json_safe
from app.services.kill_switch import CHAT_TOOLS_KILL_SWITCH, disabled
from app.services.laura_job_tool import laura_job_of_turn
from app.services.model_policy import model_for
from app.services.person_relation_proof import declared_relations_context_block
from app.services.chat_accounts_cascade import announce_order as announce_cascade_order
from app.services.record_listing import begin_turn_listing, graft_listing_cards
from app.services.reply_blocks import compact_history_blocks, normalize_reply_blocks, reply_card
from app.services.reply_family import classify_reply_family, reply_family_directive, reply_family_outcome
from app.services.secret_redaction import redact_secrets
from app.services.chat_turn_context import set_current_turn_id
from app.services.status_preamble import strip_slice_preamble, strip_status_preamble
from app.services.options_announcement import has_clickable_options, strip_unbacked_options_announcement
from app.services.unnamed_account_closing import strip_unnamed_account_closing
from app.services.turn_trace import TURN_HEADER, parse_turn_header, turn_identity
from app.services.unrouted_intent import build_unrouted_intent, without_unrouted_actions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


def _pinned_memory(req: ChatRequest) -> list:
    """#1962.8 — LA mémoire épinglée que le tour lit, résolue UNE fois pour ses
    deux lecteurs (le prompt et l'objet de transparence) : deux lectures qui la
    refont divergent.

    Compatibilité de déploiement : l'API d'après #1962 envoie la nature et
    l'origine sous ``pinned_memory`` et garde ``pinned_facts`` en chaînes nues —
    la forme qu'un service IA pas encore redéployé valide. Une API d'avant
    n'envoie que ``pinned_facts`` : on retombe dessus, lu comme avant (un fait
    manuel)."""
    return list(req.pinned_memory) or list(req.pinned_facts)


# Ce qu'on affiche quand le tour a dépassé son budget. Nomme la cause (le temps)
# et ce qui n'a PAS eu lieu : sans ça, l'utilisateur relance, repaie un tour et
# retombe sur le même mur — trois fois de suite les 15 et 16/08.
#
# #1914.9 — les deux replis de ce service sont des CARTES « donnée manquante »,
# plus des phrases : ce qui a échoué, puis le geste qui suit, séparés à l'œil.
# Elles voyagent dans `reply` comme toute carte, donc l'app web les persiste avec
# le fil et les relit pareilles. `reply_card` les valide contre le contrat à
# l'import : une carte refusée casse le démarrage, jamais un écran.
_TIMEOUT_REPLY = reply_card(
    {
        "type": "missing_data",
        "title": "Réponse interrompue",
        "failed": [
            "Je n'ai pas réussi à terminer cette réponse dans le temps imparti. Rien n'a été envoyé ni modifié."
        ],
        "missing": [
            {
                "what": "Le temps de finir cette réponse",
                "how": "Reformule en une question plus ciblée, ou réessaie dans un instant.",
            }
        ],
    }
)

# Ce que l'utilisateur voit quand le tour tombe pour une raison IMPRÉVUE (pas
# le budget nommé ci-dessus). Extrait ici pour rester le MÊME texte, que la
# panne survienne dans `_run_chat_turn` (son propre filet) ou dans le pompage
# du flux SSE lui-même (`chat_message`, filet du filet).
# ⚠️ Elle ne dit PAS « rien n'a été modifié » : une panne imprévue peut survenir
# après un outil, et ce filet n'a aucun moyen de le vérifier.
_GENERIC_FAILURE_REPLY = reply_card(
    {
        "type": "missing_data",
        "title": "Réponse indisponible",
        "failed": ["Une erreur est survenue côté assistant."],
        "missing": [{"what": "La réponse à ta question", "how": "Réessaie dans un instant."}],
    }
)
# #1950.1 — la MÊME carte pour une interface anglaise (#1958.8). Elle était
# française pour tout le monde : une personne dont l'interface est en anglais
# lisait la seule phrase que le produit lui adressait dans une autre langue.
_GENERIC_FAILURE_REPLY_EN = reply_card(
    {
        "type": "missing_data",
        "title": "Answer unavailable",
        "failed": ["Something went wrong on the assistant's side."],
        "missing": [{"what": "The answer to your question", "how": "Try again in a moment."}],
    }
)

# #R10B-FIX.2 — le fournisseur est resté surchargé après une nouvelle tentative : on le DIT
# (« saturée »), au lieu de la panne générique qui laisse croire à un défaut du produit.
_OVERLOAD_REPLY = reply_card(
    {
        "type": "missing_data",
        "title": "Laura est momentanément saturée",
        "failed": ["Laura est momentanément saturée, réessaie dans un instant."],
        "missing": [{"what": "La réponse à ta question", "how": "Réessaie dans un instant."}],
    }
)
_OVERLOAD_REPLY_EN = reply_card(
    {
        "type": "missing_data",
        "title": "Laura is temporarily busy",
        "failed": ["Laura is temporarily overloaded, please try again in a moment."],
        "missing": [{"what": "The answer to your question", "how": "Try again in a moment."}],
    }
)

# #1957.12 — le MÊME dépassement, quand des outils avaient DÉJÀ lu quelque chose.
# La phrase dit le temps, ce qui n'a PAS eu lieu, puis montre ce qui a été
# récupéré — daté, et nommé partiel. Jamais « aucun résultat » : le travail fait
# était perdu avec la coroutine annulée, et la personne relançait un tour complet
# pour le refaire.
#
# ⚠️ Coordination (#1957, lot « formats de réponse ») : ces constantes restent du
# TEXTE et le contrat reste `data.reply` + `data.context` ; le repère machine du
# partiel est `context.partial = {"reason": "turn_timeout", "as_of": …}`. Un rendu
# structuré du dépassement lit ces deux clés, il n'a rien à reparser du texte.
_TIMEOUT_PARTIAL_REPLY = (
    "Le travail a dépassé le temps prévu. Rien n'a été envoyé ni modifié. "
    "Voici ce qui a déjà été récupéré — un résultat partiel :"
)
_TIMEOUT_PARTIAL_TAIL = "Pour la suite, reformule en une question plus ciblée."

# #1957.11 — la langue de l'INTERFACE (#1958.8), pas celle du message : une
# interface anglaise lisait ces deux phrases en français.
_TIMEOUT_REPLY_EN = (
    "I couldn't finish this answer within the time allowed. "
    "Rephrase it as a more targeted question, or try again in a moment — "
    "nothing was sent or changed."
)
_TIMEOUT_PARTIAL_REPLY_EN = (
    "The work took longer than planned. Nothing was sent or changed. "
    "Here is what had already been retrieved — a partial result:"
)
_TIMEOUT_PARTIAL_TAIL_EN = "To go further, rephrase it as a more targeted question."

# #1950.1 / #1950.21 / #1950.28 — LA MÊME RÈGLE, APPLIQUÉE À SON JUMEAU.
#
# #1957.11/.12 a corrigé UNE branche : le dépassement de temps montre ce que les
# outils avaient déjà lu. La branche d'à côté — une panne IMPRÉVUE — jetait le
# même accumulateur et rendait la phrase d'échec SEULE. C'est le défaut
# « une règle écrite pour un cas et pas pour son jumeau » : le travail était
# fait, payé, et perdu, et la personne relançait un tour complet pour le refaire.
#
# ⚠️ Aucune de ces deux phrases ne dit « rien n'a été envoyé ni modifié » : une
# panne imprévue peut survenir APRÈS un outil, et ce filet n'a aucun moyen de le
# vérifier (c'est déjà la raison écrite sur `_GENERIC_FAILURE_REPLY`). Le
# dépassement de temps, lui, a le droit de le dire : `wait_for` coupe avant
# qu'un tour ait pu conclure quoi que ce soit d'externe.
_FAILURE_PARTIAL_REPLY = (
    "Une erreur m'a arrêtée avant la fin de cette réponse. Voici ce qui avait déjà été récupéré — un résultat partiel :"
)
_FAILURE_PARTIAL_TAIL = "Ces éléments restent valables : relance seulement ce qui manque."
_FAILURE_PARTIAL_REPLY_EN = (
    "An error stopped me before I could finish this answer. Here is what had already been retrieved — a partial result:"
)
_FAILURE_PARTIAL_TAIL_EN = "These results still stand: relaunch only what is missing."


@dataclass(frozen=True)
class _PartialWording:
    """Les quatre pièces d'un tour qui s'arrête — une par langue d'interface.

    `reason` est le repère MACHINE posé sur `context.partial` : un rendu
    structuré le lit, il n'a rien à reparser du texte. `whole` est la carte
    rendue quand RIEN n'a été lu — on ne fabrique pas un résultat partiel à
    partir de rien, ce serait une donnée fictive.
    """

    reason: str
    whole: str
    lead: str
    tail: str


_TIMEOUT_WORDING: dict[str, _PartialWording] = {
    "fr": _PartialWording("turn_timeout", _TIMEOUT_REPLY, _TIMEOUT_PARTIAL_REPLY, _TIMEOUT_PARTIAL_TAIL),
    "en": _PartialWording("turn_timeout", _TIMEOUT_REPLY_EN, _TIMEOUT_PARTIAL_REPLY_EN, _TIMEOUT_PARTIAL_TAIL_EN),
}
_OVERLOAD_WORDING: dict[str, _PartialWording] = {
    "fr": _PartialWording("provider_overloaded", _OVERLOAD_REPLY, _FAILURE_PARTIAL_REPLY, _FAILURE_PARTIAL_TAIL),
    "en": _PartialWording(
        "provider_overloaded", _OVERLOAD_REPLY_EN, _FAILURE_PARTIAL_REPLY_EN, _FAILURE_PARTIAL_TAIL_EN
    ),
}
_FAILURE_WORDING: dict[str, _PartialWording] = {
    "fr": _PartialWording("turn_error", _GENERIC_FAILURE_REPLY, _FAILURE_PARTIAL_REPLY, _FAILURE_PARTIAL_TAIL),
    "en": _PartialWording("turn_error", _GENERIC_FAILURE_REPLY_EN, _FAILURE_PARTIAL_REPLY_EN, _FAILURE_PARTIAL_TAIL_EN),
}


def _retrieved_sources(collected: list[dict]) -> list[dict]:
    """#1957.12 — ce que les outils TERMINÉS ont lu, dédoublonné.

    Un outil en erreur n'a rien lu ; une proposition PRÉPARE sans consulter ;
    une clarification pose une question. Aucun des trois ne se présente comme
    « récupéré »."""
    done = [action for action in collected if isinstance(action, dict) and action.get("status") == "done"]
    return merge_sources(None, [source for action in done for source in (action.get("sources") or [])])


#: #3436 / #3562.1 — outils qui ne LISENT rien : un contrôle du texte soumis, une
#: question posée, des réponses proposées. Aucune source n'a servi à leur sortie.
_TEXT_ONLY_TOOLS = frozenset({"check_message_before_send", "ask_clarification", "offer_reply_options"})


def sources_that_served(context_sources: list[dict] | None, tool_actions: list[dict]) -> list[dict]:
    """Le pied « Source du 18 septembre · 7 sources » ne sort que si un outil a
    RENDU quelque chose CE tour (#3562.1, recette Y9 ; #3436.2, #3215) : un simple
    conseil (« Pour l'objet… », aucun outil) ou un contrôle de texte n'a lu aucune
    source, et les documents injectés au prompt ne sont pas des sources d'un
    résultat. La Précision « aucun résultat d'outil » et ce pied disent ainsi la
    MÊME chose — jamais « 3 sources » sous « aucun résultat d'outil ». Dès qu'un
    outil de lecture a répondu : sources inchangées."""
    called = [str(action.get("tool") or "") for action in tool_actions if isinstance(action, dict)]
    if not called or all(name in _TEXT_ONLY_TOOLS for name in called):
        return []
    return list(context_sources or [])


def sources_consistent_with_reply(context_sources: list[dict] | None, reply: str) -> list[dict]:
    """#3215 (recette 02/10) — « aucun résultat d'outil ce tour » et « 3 sources »
    au pied se contredisaient. Une réponse qui dit n'avoir aucun résultat d'outil
    ne présente pas de sources comme ayant servi : le bloc ne s'affiche pas."""
    if states_no_tool_result(reply):
        return []
    return list(context_sources or [])


def _retrieved_mail_threads(collected: list[dict]) -> list[dict]:
    """#2955 (#2394.57) — même garde que `_retrieved_sources` ci-dessus, pour
    les fils de messagerie : un tour interrompu APRÈS une lecture de fil garde
    quand même cet état, pour que la vérification du destinataire reste
    possible même quand la réponse elle-même s'est arrêtée avant la fin."""
    done = [action for action in collected if isinstance(action, dict) and action.get("status") == "done"]
    return merge_mail_thread_hints(None, [t for action in done for t in (action.get("mail_threads") or [])])


def _source_date(as_of: object, *, english: bool) -> str:
    """La date d'une source récupérée, ou « date inconnue » — jamais une date
    devinée. Jour seul : pas de fuseau à inventer côté serveur."""
    try:
        day = date.fromisoformat(str(as_of or "")[:10])
    except ValueError:
        return "date unknown" if english else "date inconnue"
    return day.isoformat() if english else day.strftime("%d/%m/%Y")


#: #2983 — nombre maximal de sources nommées dans le repli d'un texte final vide.
_EMPTY_REPLY_MAX_SOURCES = 3


def _empty_reply_fallback(req: ChatRequest, actions: list[dict]) -> str:
    """#3202 — le texte final est VIDE : on dit ce qui a été lu, ou qu'rien ne l'a été.

    Recette prod 29/09 : le modèle a terminé sur un round d'outils sans rédiger,
    l'écran posait alors « Pas de réponse. » nu, avec des sources en dessous.
    Jamais une synthèse inventée : seulement les sources RÉELLEMENT lues (datées)
    ou l'absence de lecture, et le geste qui suit."""
    english = _interface_key(req) == "en"
    sources = _retrieved_sources(actions)
    if not sources:
        if english:
            return (
                "I could not write an answer this turn, and no source was read for it. "
                "Nothing was found to report. Rephrase or narrow the request and I will retry."
            )
        return (
            "Je n'ai pas pu rédiger de réponse ce tour, et aucune source n'a été lue pour elle. "
            "Rien n'est ressorti à te rapporter. Reformule ou précise la demande, je relance."
        )
    # #2983 (recette prod 01/10) — « Aucun résultat » suivi de 26 puces hors
    # sujet : un texte vide ne dérive PAS une liste de tout ce qui a été lu.
    # Dédoublonné, au plus trois noms ; le reste se COMPTE, il ne s'étale pas
    # (la liste complète reste dans « Ce qui a servi à cette réponse »).
    labels: list[str] = []
    for source in sources:
        label = " ".join(str(source.get("label") or "").split())
        if label and label not in labels:
            labels.append(label)
    shown, rest = labels[:_EMPTY_REPLY_MAX_SOURCES], len(labels) - _EMPTY_REPLY_MAX_SOURCES
    dates = {
        label: _source_date(source.get("as_of"), english=english)
        for source in sources
        if (label := " ".join(str(source.get("label") or "").split()))
    }
    lead = (
        "I read sources but could not write a summary of them, so I report nothing from them. Among them:"
        if english
        else "J'ai lu des sources sans pouvoir en rédiger la synthèse : je ne t'en rapporte donc rien. Parmi elles :"
    )
    tail = (
        "Ask again, or name a source to cover, and I will retry."
        if english
        else "Redemande, ou nomme une source à couvrir, et je relance."
    )
    lines = [lead, ""] + [f"- {label} ({dates[label]})" for label in shown]
    if rest > 0:
        lines.append(
            f"(+ {rest} other source(s) listed under « What this answer used »)"
            if english
            else f"(+ {rest} autre(s) source(s), listées dans « Ce qui a servi à cette réponse »)"
        )
    return "\n".join(lines + ["", tail])


def _interface_key(req: ChatRequest) -> str:
    """#1958.8 — la langue de l'INTERFACE, ramenée aux deux seules clés de
    formulation. Toute autre valeur retombe sur le français, comme le prompt."""
    return "en" if (getattr(req, "interface_language", "fr") or "fr") == "en" else "fr"


def _partial_response(
    req: ChatRequest, context: dict, collected: list[dict], wording: dict[str, _PartialWording]
) -> ChatResponse:
    """#1957.11 / #1957.12 / #1950.1 — la réponse d'un tour qui s'ARRÊTE.

    Rien de lu (ou rien de montrable) : la carte du motif SEULE, byte-identique
    à avant. Des sources lues : la phrase, la liste datée, et le repère
    `context.partial` — le panneau de transparence cite les mêmes sources, et le
    fil relu (le contexte n'est pas persisté) garde la liste parce qu'elle est
    dans le texte.

    Une SEULE dérivation pour les deux motifs d'arrêt (le temps, une panne
    imprévue) : deux chemins qui la refont divergent, et c'est précisément
    comment la branche « panne » avait raté la correction de sa jumelle."""
    key = _interface_key(req)
    english = key == "en"
    said = wording[key]
    sources = _retrieved_sources(collected)
    if not sources:
        return ChatResponse(success=False, data={"reply": said.whole})
    lines = [said.lead, ""]
    for source in sources:
        label = " ".join(str(source.get("label") or "").split())
        lines.append(f"- {label} ({_source_date(source.get('as_of'), english=english)})")
    lines += ["", said.tail]
    partial_context = {
        **context,
        "sources": merge_sources(context.get("sources"), sources),
        "actions": [action for action in collected if action.get("status") == "done"],
        "partial": {"reason": said.reason, "as_of": datetime.now(UTC).isoformat()},
    }
    # #2955 (#2394.57) — même geste que la branche normale plus bas : un tour
    # interrompu qui a quand même lu un fil garde cet état, pour que la
    # vérification du destinataire reste possible plus tard dans la
    # conversation. Omis quand vide — jamais une liste inventée.
    retrieved_mail_threads = merge_mail_thread_hints(context.get("mail_threads"), _retrieved_mail_threads(collected))
    if retrieved_mail_threads:
        partial_context["mail_threads"] = retrieved_mail_threads
    return ChatResponse(success=False, data={"reply": "\n".join(lines), "context": partial_context})


def _timeout_response(req: ChatRequest, context: dict, collected: list[dict]) -> ChatResponse:
    return _partial_response(req, context, collected, _TIMEOUT_WORDING)


# ── Plafond DUR d'un tour, mesuré à l'entrée du handler (#1191) ──────────────
#
# `chat_orchestrator.py` annonce dans son en-tête : « Le plafond dur réellement
# observable est `budget + _MIN_CALL_TIMEOUT_S` » — 100 s, sous les 120 s de
# l'appelant NestJS. C'était FAUX sur deux segments, et le retour bêta #1191 les
# a mis en évidence : un 502 à 120 076 ms, c'est-à-dire le budget de l'APPELANT,
# jamais celui du tour.
#
#   1. L'exécution d'un outil n'est bornée par rien. `_TOOL_ROUND_RESERVE_S`
#      (25 s) RÉSERVE du temps avant d'ouvrir un tour ; il ne borne pas ce que le
#      tour consomme. `execute_chat_tool` est attendu sans délai — un outil lent
#      (enrichissement, lecture de messagerie) fait déborder tout le tour.
#   2. Tout ce qui PRÉCÈDE `run_chat_with_tools` est hors budget : l'échéance
#      naît à l'intérieur de cette fonction, tandis que la récupération RAG
#      (embedding HTTP + pgvector), les documents joints et le chargement de
#      l'historique la précèdent — et aucun n'est borné.
#
# Ce plafond ne remplace pas le budget du tour : il le rend VRAI. Il court depuis
# l'entrée du handler, donc la préparation se paie SUR le tour au lieu de s'y
# ajouter, et il rend `_TIMEOUT_REPLY` — une phrase qui dit le temps — plutôt
# qu'un 502 qui ne dit rien et invite à relancer.
#
# 105 s : au-dessus du plafond que l'orchestrateur s'autorise (90 + 10 = 100 s),
# pour ne jamais couper un tour qui allait aboutir ; 45 s sous le budget de
# l'appelant (150 s, #3706.1), pour que la réponse ait RÉELLEMENT le temps de
# revenir — réseau Node↔IA ET déroulement de l'annulation des appels d'outils
# en vol compris. 15 s ne suffisait pas : la recette prod du 08/10 a mesuré
# le premier envoi de chaque recherche de comptes neuve (aucun cache chaud)
# finir en « erreur côté assistant » générique, Node coupant le flux avant que
# cette phrase-ci (`_TIMEOUT_REPLY`) n'ait pu le traverser. La garde
# `chat-turn-budget.spec.ts` (côté NestJS) tient la chaîne des trois nombres
# ET un minimum de marge, pour que ce défaut ne puisse plus revenir en silence.
#
# ⚠️ LOT STREAM (12/09/2026) : ce plafond reste posé ICI, à l'entrée du
# handler HTTP — AVANT toute diffusion — et continue de border TOUT ce que
# fait l'orchestrateur via le même `asyncio.wait_for`. Un flux ne change rien
# à cette garantie : diffuser le texte au fur et à mesure ne repousse le
# ceiling nulle part, il s'applique au générateur d'événements comme il
# s'appliquait à l'ancien appel bufferisé.
_DEFAULT_TURN_CEILING_S = 105.0

# Cadence de garde entre deux événements du flux — LA MÊME que
# `graph_analyze.py` et pour la MÊME raison : un silence de plusieurs
# secondes (préparation RAG, outil lent) ne doit jamais ressembler à un flux
# mort pour un proxy qui idle-close une connexion silencieuse (Railway,
# 30-60 s typiques). Un commentaire SSE (pas de ligne `data:`) ne compte pas
# comme un événement pour le client — `IaClient.chatStream` (NestJS) et
# `laura-turn.ts` (web) l'ignorent tous deux.
_KEEPALIVE_SECONDS = 15.0


def _turn_ceiling_s() -> float:
    """Plafond d'un tour, en secondes. `CHAT_TURN_CEILING_S` pour tuner sans
    redéploiement.

    Une valeur non numérique, nulle ou négative retombe sur le défaut : c'est
    l'ABSENCE de borne qui a causé la panne, un réglage cassé ne doit pas la
    recréer en silence. Même mode de sûreté que `_turn_budget_s`."""
    raw = os.environ.get("CHAT_TURN_CEILING_S")
    if raw is None or raw == "":
        return _DEFAULT_TURN_CEILING_S
    try:
        value = float(raw)
    except ValueError:
        logger.warning("invalid CHAT_TURN_CEILING_S=%r, using default %.0fs", raw, _DEFAULT_TURN_CEILING_S)
        return _DEFAULT_TURN_CEILING_S
    if value <= 0:
        logger.warning(
            "CHAT_TURN_CEILING_S=%r would remove the copilot turn ceiling, using default %.0fs",
            raw,
            _DEFAULT_TURN_CEILING_S,
        )
        return _DEFAULT_TURN_CEILING_S
    return value


def _chat_tools_enabled() -> bool:
    """Orchestration outils du Copilote (restitution V2 §12/§14).

    **ON par défaut**, comme les autres axes v2 : le rapport tient tout entier sur
    un copilote qui agit, et deux outils de lecture plus deux propositions
    d'action écrits, testés et branchés sur une UI de confirmation ne servaient à
    rien tant qu'une variable d'environnement absente les laissait dormir.

    Break-glass : ``CHAT_TOOLS_DISABLED=true`` ⇒ l'orchestrateur n'est même pas
    importé et la réponse redevient du texte seul.
    """
    return not disabled(CHAT_TOOLS_KILL_SWITCH)


def _sse(payload: dict) -> str:
    """#2354 — la MÊME sérialisation que `_tool_payload()` (`chat_orchestrator.py`) :
    les deux dérivent la même chose (`default=str`) via `dumps_json_safe`
    (GA-26), là où seul `_tool_payload` l'avait avant ce lot. Une valeur non
    JSON-native dans `context["actions"]` (:626) cassait ce flux-ci en cours
    — jamais l'autre — et rendait `STREAM_FAILURE_REPLY` côté Node."""
    return f"data: {dumps_json_safe(payload)}\n\n"


async def _run_chat_turn(req: ChatRequest, emit: EventSink) -> ChatResponse:
    """Conversational AI agent — context-aware per account.

    LOT STREAM (12/09/2026) : c'est le corps EXACT du handler d'avant ce lot —
    même préparation RAG, même plafond dur (#1191), même orchestrateur, même
    persistance, mêmes DEUX filets (budget nommé, panne générique). Le SEUL
    changement est `emit`, threadé jusqu'à `run_chat_with_tools` pour que le
    texte du modèle et les étapes d'outils partent au fur et à mesure ; un
    appelant qui passe un `emit` no-op (aucun n'existait avant ce lot) obtient
    un `ChatResponse` byte-identique.
    """
    # Le plafond court d'ICI, pas du premier appel Anthropic : la préparation du
    # contexte (RAG, documents joints, historique) est du temps réel que
    # l'appelant décompte, et elle vivait hors de tout budget. Voir
    # `_turn_ceiling_s`.
    turn_started = time.monotonic()
    # #3218 — le mode choisi, lu par `plan_account_analysis` (Approfondi sur un
    # dossier déjà analysé = on lance, on ne redemande pas l'entité).
    set_requested_mode(req.mode)
    begin_turn_listing()  # #4065 — la carte complète d'un listing est greffée en fin de tour
    set_turn_thread(req.message, req.history)  # #3218 — « lance-la » après la question de périmètre
    # #3973 — les outils décochés pour ce fil : la messagerie ou l'agenda décoché
    # n'est jamais lu, même quand un autre outil de la même famille reste branché.
    set_turn_excluded_providers(req.excluded_providers)
    # #2770.35 — les outils RÉELLEMENT branchés (familles décochées déjà retirées) : le plan de
    # journée/semaine les lit et les nomme ; `None` (ancien client) = comportement d'avant.
    set_turn_connected_families(req.connected_families)
    # #1950.1 — LES DEUX SURVIVENT AU FILET GÉNÉRIQUE, donc ils naissent AVANT
    # lui. L'accumulateur vivait dans le `try` intérieur (#1957.12, hors de la
    # coroutine que `wait_for` annule) : il y survivait au TEMPS, mais le filet
    # d'en dessous ne pouvait pas le lire — une panne imprévue y aurait levé un
    # `NameError`, et c'est ce qui rendait le refus global inévitable.
    collected: list[dict] = []
    # #3196.6 (reste) — même patron que `collected` juste au-dessus : rempli
    # par référence à CHAQUE sortie du tour, survit à l'annulation par
    # `wait_for` exactement comme lui.
    turn_observability_sink: list[TurnObservability] = []
    # #3198 (épopée #3223) — même patron : rempli par référence par
    # `_commercial_verify`, jamais un ajout au tuple `(reply, actions)`.
    verifier_status_sink: list[str] = []
    # #2879 (X17) — les motifs du même verdict, même patron.
    verifier_reasons_sink: list[tuple[str, ...]] = []
    # #5086 — « Précision : … » et « Contrainte retenue : … » : sortis du corps, ils voyagent dans
    # `context["reply_notes"]` jusqu'au panneau Sources. Même patron (par référence).
    reply_notes_sink: list[str] = []
    # #3229 — le rapport de couverture qu'un outil construit sur ses résultats
    # réels ; même patron (par référence), lu après l'attente.
    coverage_sink: list[dict] = []
    context: dict = {}
    # #2453 — LE MODE DE CONTEXTE s'applique AVANT toute lecture : une couche
    # exclue est vidée dans une copie de la requête, donc absente du prompt, des
    # outils (`profile_data`) et de la transparence. Sans mode : même requête.
    req, context_mode_trace = apply_context_mode(req)
    try:
        # RAG grounding: pull the user's relevant knowledge docs and inject them
        # into the advisor system prompt (degradable — [] when none / on error).
        # We keep the raw docs (not just the formatted string) so the transparency
        # object can list their titles as the « sources utilisées ».
        # ⚠️ Le copilote refaisait ces trois gestes À LA MAIN — récupérer,
        # formater, tracer — en SAUTANT le reclassement. `retrieve_reranked_citations`
        # fait exactement la même chose, plus le reclassement, et n'avait aucun
        # appelant : le seul consommateur de tout l'étage de reclassement du
        # tome 7 était son propre test. Le copilote lisait donc les documents dans
        # l'ordre brut de la similarité, sans pondération de fraîcheur ni de
        # secteur.
        #
        # La trace (M2) part avec, posée au même endroit qu'avant : dans `_inject`,
        # c'est-à-dire au seul point du code où l'on sait qu'un document a ATTEINT
        # le prompt.
        # #2453 — en Neutre / Mission ponctuelle, la base documentaire de l'espace
        # n'est même pas interrogée (les documents JOINTS, eux, restent lus).
        if knowledge_base_allowed(req.context_mode or ""):
            # #3887 (lot V13, recette prod 08/10) — fil « espace entier » (aucun
            # compte ancré) : `req.account_id` reste `null`, donc une question qui
            # NOMME un compte du portefeuille en texte libre ne retrouvait jamais
            # ses documents. Résolu UNIQUEMENT pour CETTE récupération — jamais
            # écrit sur `req.account_id`, qui resterait sinon « ancré » pour tout
            # le reste du tour (système, outils, transparence) sur un simple nom
            # mentionné, bien plus large que ce que corrige ce point.
            resolved_account_id = req.account_id or await rag_knowledge.resolve_message_account_id(
                req.message, req.user_id
            )
            # #2442.4 — chaque étape du tour est un span nommé de SA trace
            # (récupération, mémoire, persistance ; modèle et outils le sont déjà) :
            # durée et échec seulement, jamais ce qui a été lu.
            with langfuse_client.span("retrieval"):
                knowledge, used_sources, docs = await rag_knowledge.retrieve_reranked_citations(
                    req.message,
                    req.user_id,
                    workspace_id=req.workspace_id or None,
                    feature="chat",
                    # #2779 — le compte du fil, sinon celui résolu ci-dessus : seul
                    # lui rend visibles les documents `account`.
                    account_id=resolved_account_id or None,
                )
        else:
            knowledge, docs = "", []
        # #3586 — savoir métier du Drive interne Bellum : bloc DÉDIÉ, commun à tous
        # les espaces, hors du bloc « documents de l'utilisateur ». Ce n'est PAS la
        # base documentaire de l'utilisateur ⇒ HORS de la garde : injecté dans TOUS
        # les modes (Neutre / Mission ponctuelle compris). Un seul appel par tour :
        # `system` sert la boucle streamée ET le repli.
        drive_context = await rag_knowledge.retrieve_drive_context(
            req.message, account_id=req.account_id or None
        )
        # Les documents JOINTS sont lus en entier (budget dédié), pas retrouvés
        # par similarité : l'utilisateur vient de les déposer en disant « lis
        # ça ». #1954 — ceux « fil seul » sont relus à CHAQUE question du fil.
        # Aucun identifiant ni fil ⇒ [] ⇒ bloc absent ⇒ prompt inchangé.
        with langfuse_client.span("retrieval"):
            attached_docs = await rag_service.fetch_documents_by_ids(
                req.document_ids,
                req.user_id,
                workspace_id=req.workspace_id or None,
                # #1954.7 — sans elle, un document `scope="conversation"` ne peut
                # jamais matcher (fail closed) : voir la note sur `conversation_id`
                # dans `ChatRequest`.
                conversation_id=req.conversation_id or None,
                # #2779 — un document `account` d'un AUTRE compte n'est jamais lu ici.
                account_id=req.account_id or None,
            )
        # #2148.16 — la pièce jointe de CONVERSATION (cas a) : du texte déjà
        # extrait par `/rag/extract`, jamais une ligne de `rag_documents`.
        # Ajoutée APRÈS les documents joints réels : ce que l'utilisateur vient
        # de déposer MAINTENANT (`document_ids`, souvent vide pour ce cas)
        # passe devant, le budget commun (`ATTACHED_DOC_MAX`) tranche le reste.
        ephemeral_docs = rag_service.ephemeral_attached_documents(req.attached_files)
        attached_documents = rag_service.format_attached_documents(attached_docs + ephemeral_docs)
        # Méthode built-in citable (annexe p29) : les objections / playbooks /
        # règles métier vivent en config du pipeline et n'étaient JAMAIS
        # récupérables par le copilote. Sélection déterministe sur la question
        # (aucun appel réseau, aucune clé) ; [] quand la question ne porte sur
        # aucune règle → prompt inchangé au byte près.
        # #3382.a — le canal du tour filtre les règles gouvernées qui en déclarent un.
        turn_channel = method_knowledge.detect_turn_channel(req.message)
        # #3857 (BEL-LAU-1008-006) — la méthode se sélectionne sur LE TRAVAIL EN
        # COURS, pas seulement le dernier message : un « GO » de relance n'a
        # aucun token ≥4 lettres et perdait silencieusement la méthode retrouvée
        # au tour précédent (ex. l'ouverture d'un compte froid). `current_job` /
        # `current_step` sont déjà tenus par `chat_thread_state.py` à CHAQUE
        # tour — jamais une nouvelle lecture (GA-26). Sans travail en cours
        # déclaré, `method_query` reste byte-identique à `req.message`.
        _thread_for_method = thread_state_from_wire(req.thread_state)
        method_query = method_knowledge.method_query_text(
            req.message,
            current_job=_thread_for_method.current_job,
            current_step=_thread_for_method.current_step,
        )
        method_chunks, method_rule_ids = method_knowledge.retrieve_method_chunks_with_rules(
            method_query, sector=req.account_data.get("sector"), channel=turn_channel
        )
        # #3289 (suivi #3264.41) — une règle que CET espace a contredite par ses
        # résultats n'est plus citée. Le pont n'est interrogé QUE si une règle de
        # discipline vient d'être retrouvée : zéro appel réseau sinon, et pont
        # éteint ⇒ aucune exclusion (comportement d'avant, byte-identique).
        if method_rule_ids:
            contradicted = await bellum_api.contradicted_method_rules(req.user_id)
            if contradicted & method_rule_ids:
                method_chunks, _ = method_knowledge.retrieve_method_chunks_with_rules(
                    method_query,
                    sector=req.account_data.get("sector"),
                    excluded_rule_ids=contradicted,
                    channel=turn_channel,
                )
        # Structured transparency: what WAS fed to the model (profil/compte/sources)
        # and what was NOT consulted (CRM/LinkedIn/…), driven by real state — never
        # a text the model could hallucinate.
        context = build_context_transparency(
            profile_data=req.profile_data,
            account_data=req.account_data,
            contacts_summary=req.contacts_summary,
            plan_summary=req.plan_summary,
            # Les documents joints comptent parmi les sources utilisées : sans
            # cela, l'utilisateur qui vient de déposer un CV ne voit nulle part
            # qu'il a été lu, ce qui est précisément ce qu'il cherche à vérifier.
            knowledge_docs=attached_docs + ephemeral_docs + docs,
            accounts_summary=req.accounts_summary,
            crm_connected=req.crm_connected,
            crm_provider=req.crm_provider,
            # #2145.23 (via #2925) — même famille que `tools_for`/`missing_capabilities`
            # (`chat_tools.py`) : `connected_families` absent (client d'avant #2146,
            # ou appelant qui ne le mesure pas) veut dire « on ne sait pas », jamais
            # « absente » — la ligne ne s'affiche que sur un ÉTAT RÉEL mesuré.
            email_connected=req.connected_families is None or "email" in req.connected_families,
            pinned_facts=_pinned_memory(req),
            conversation_summary=req.conversation_summary,
            crm_presence=req.crm_presence,
            # #1915.11 — panne de lecture ≠ « rien trouvé » : le panneau le dit.
            crm_unavailable=req.crm_unavailable,
            # #3708.exclusion — un CRM exclu pour ce fil reste `crm_connected`
            # (rien n'a été déconnecté) : sans cette famille, le panneau le
            # confondait avec « non croisé » et poussait Laura à suggérer de
            # rétablir un accès que la personne vient d'exclure elle-même.
            excluded_families=req.excluded_families,
            # W-G (13/10) — le bloc des faits du compte que le prompt reçoit, listé à l'écran.
            account_facts_context=req.account_facts_context,
            # #4071.3 (recette R6 14/10) — même chose pour ce que l'espace a gardé
            # (recherches enregistrées, listes de cibles, résumés de fils).
            workspace_recall_context=req.workspace_recall_context,
            # #4051.6 — « en tenant compte de mes contacts » : la base absente se dit.
            own_contacts_requested=mentions_own_contacts(req.message),
            method_chunks=method_chunks,
            # D169 — la SEULE surface client d'un interrupteur d'arrêt. Sans
            # elle, l'invite continue de décrire des outils au copilote pendant
            # que l'orchestrateur n'est même pas importé : il annonce une action
            # et rien ne part. La ligne part dans l'invite ET à l'écran, donc le
            # modèle cesse de promettre et l'utilisateur cesse de lire
            # « Bellum ne sait pas faire ».
            copilot_tools_enabled=_chat_tools_enabled(),
            # #1958.10 — même langue que le reste du prompt (#1958.8) : ce
            # panneau était rendu BRUT par `ContextDisclosure.tsx` (sans t()),
            # donc ses libellés français en dur se lisaient tels quels même sur
            # une interface anglaise.
            language=getattr(req, "interface_language", "fr") or "fr",
        )
        # #2453.9 — la trace du tour : mode, couches incluses / exclues. Clé
        # ABSENTE sans mode (appelant d'avant #2453, réponse byte-identique).
        if context_mode_trace:
            context["context_mode"] = context_mode_trace
        # #2257.1 — LE CONTRAT DE DEMANDE STRUCTURÉ, produit UNE FOIS par tour
        # à partir de ce que ce routeur a DÉJÀ reçu — jamais un second appel au
        # modèle. Seuls deux des dix-huit champs ont un producteur aujourd'hui
        # (voir `app/models/request_intent_contract.py`, GA-26 — un seul
        # contrat, miroir de `request-intent-contract.ts`). Journalisé SANS
        # CONTENU : `request_intent_contract_for_log` retire même le nom du
        # compte, ne garde que sa PRÉSENCE.
        # #2321 — LE ROUTEUR D'INTENTION, le compilateur d'ENTRÉE de /chat. Il
        # lit la demande sur des marqueurs DÉCLARÉS (FR et EN) et rend la route :
        # l'intention, l'objet canonique, le résultat attendu, le job séquencé,
        # et surtout ce qui ATTEND un humain. Pur et déterministe : pas un second
        # appel au modèle, donc pas un aller-retour de plus dans le tour.
        #
        # Les données déjà présentes viennent de l'état du FIL (objets cités aux
        # tours précédents) et du compte actif — jamais devinées dans le texte.
        intent_route = route_chat_intent(
            message=req.message,
            active_account_company_name=req.account_data.get("company_name"),
            available_inputs=available_inputs_from_thread(
                req.thread_state,
                active_account=bool(req.account_data.get("company_name")),
            ),
        )
        # #2257.7/.8/.12/.13/.14 — reste du 25/09/2026 : cinq producteurs de
        # plus, sur le même principe que le routeur (marqueurs déclarés ou
        # lecture déjà déterministe — jamais un second appel au modèle).
        # Le lieu et le secteur réutilisent la lecture de Découvrir
        # (`discover_request_reading.read_request`, #2490/#2496, GA-26) plutôt
        # que d'en refaire une deuxième.
        request_reading = read_request(req.message)
        perimetre_geographique, secteur = geo_and_sector_from_reading(request_reading)
        # #3192.8 — calculé UNE FOIS (GA-26) : avant ce lot, `detail_level_from_message`
        # n'avait qu'un seul appelant, le journal ci-dessous — jamais `build_system_prompt`,
        # donc jamais aucun effet sur la densité réellement envoyée au modèle.
        niveau_detail = detail_level_from_message(req.message)
        # #3192.10 — recette prod du 30/09 (RÉFUTÉ) : une question fermée et
        # courte SANS marqueur explicite (« SG prend des consultants ? ») ne
        # déclenchait aucun signal — `classify_expected_density` (#3192.9)
        # classait déjà MICRO, mais seul `commercial_verifier` le consommait,
        # APRÈS que le texte soit diffusé au fil de l'eau. MÊME fonction que
        # celle rejouée par le vérificateur (GA-26, jamais un second calcul de
        # la même donnée) — calculée ici pour peser AVANT génération.
        expected_density = classify_expected_density(req.message)
        # #3758 (BEL-LAU-1001) — la FAMILLE de réponse, lue une fois sur la demande
        # (déterministe, aucun appel de modèle) : la carte attendue part dans la
        # consigne du tour, et le verdict de sortie la relit plus bas.
        reply_family = classify_reply_family(req.message)
        # #3760 — la FORME attendue (texte, écran, objet ouvert, fil). Intégration
        # 06/10 : même concept que la famille #3758, qui gagne (fusionnée d'abord) ;
        # la mise en page ne parle que si la famille n'a rien reconnu — jamais deux
        # consignes de forme pour un même tour.
        reply_layout = (
            ""
            if reply_family
            else reply_layout_directive(
                classify_reply_layout(
                    req.message,
                    page_context=getattr(req, "page_context", "") or "",
                    active_account=str(req.account_data.get("company_name") or ""),
                    history=req.history,
                )
            )
        )
        intent_contract = build_request_intent_contract(
            active_account_company_name=req.account_data.get("company_name"),
            clarification_already_asked=req.clarification_asked,
            # #2321 — les quatre champs que le routeur PRODUIT enfin. Une route
            # non déclarée n'en peuple aucun : on n'écrit pas ce qu'on n'a pas.
            intention_principale=(intent_route.intent if intent_route.intent != UNDECLARED_CHAT_INTENT else None),
            resultat_attendu=intent_route.expected_result,
            objets_a_produire=list(intent_route.steps) or None,
            # Le premier outil que la route ouvre. `None` quand la capacité
            # manque — la route le DIT (`capacite_absente`) au lieu d'inventer.
            action_souhaitee=intent_route.tools[0] if intent_route.tools else None,
            perimetre_geographique=perimetre_geographique,
            secteur=secteur,
            horizon=horizon_from_message(req.message),
            urgence=urgency_from_message(req.message),
            niveau_detail=niveau_detail,
        )
        logger.info(
            "Contrat de demande structuré (#2257.1): %s",
            request_intent_contract_for_log(intent_contract),
        )
        # Journalisé SANS CONTENU : `chat_intent_route_for_log` ne laisse sortir
        # que des valeurs d'énumération et un marqueur DÉCLARÉ — jamais un
        # extrait du message, jamais le nom du compte.
        logger.info("Route d'intention (#2321): %s", chat_intent_route_for_log(intent_route))
        # #3175.1/.2 (épopée #3215) — L'OBJET `CommercialIntent` à treize champs,
        # construit UNE fois à partir de la route ci-dessus (jamais une seconde
        # lecture) et JAMAIS rendu au modèle : il alimente la télémétrie
        # (sans contenu) et le vérificateur final (`evidence_requirement`).
        commercial_intent = build_commercial_intent(
            message=req.message,
            route=intent_route,
            available_inputs=available_inputs_from_thread(
                req.thread_state,
                active_account=bool(req.account_data.get("company_name")),
            ),
            clarification_already_asked=req.clarification_asked,
            persistent_scope=thread_state_from_wire(req.thread_state).persistent_scope,
        )
        logger.info("Intention commerciale (#3175): %s", commercial_intent_for_log(commercial_intent))
        # #3176 — OBSERVABILITÉ du plan de sources : le marqueur est une valeur
        # DÉCLARÉE (jamais un extrait du message), comme `matched_marker`
        # ci-dessus. `public_search_avoided` nomme l'effet concret : ce tour
        # n'a pas poussé `web_search` alors qu'une actualité publique aurait pu
        # le faire.
        source_plan_marker = asks_for_internal_only_scope(req.message)
        if source_plan_marker:
            logger.info(
                "Plan de sources (#3176): %s",
                {
                    "source_plan_requested": "internal_only",
                    "matched_marker": source_plan_marker,
                    "public_search_avoided": True,
                },
            )
        # #3175 — même forme de trace que #3176 juste au-dessus : un marqueur
        # DÉCLARÉ, jamais un extrait du message.
        qualification_marker = asks_to_qualify_a_named_account(req.message)
        if qualification_marker:
            logger.info(
                "Élargissement de qualification (#3175): %s",
                {"matched_marker": qualification_marker},
            )
        system = build_system_prompt(
            req.profile_data,
            req.account_data,
            req.contacts_summary,
            req.plan_summary,
            knowledge,
            pinned_facts=_pinned_memory(req),
            user_preferences=req.user_preferences,
            conversation_summary=req.conversation_summary,
            accounts_summary=req.accounts_summary,
            not_consulted=context["not_consulted"],
            # #3708 (recette prod 09/10, aef69661e9) — `req.crm_presence` est RÉSOLU
            # côté API avant cette requête, hors du catalogue d'outils que
            # `ChatRequest._apply_excluded_families` filtre déjà : une famille CRM
            # décochée dans « Outils et sources » retirait bien `get_crm_presence`
            # et le sous-bloc `crm_match` de `get_account_preflight` (lot F02), mais
            # ce texte-ci entrait quand même dans le prompt — une réponse citait
            # « dernière activité CRM » SANS aucun appel d'outil ce tour. Même garde
            # que `get_account_preflight` (`crm_excluded`) : « ne les lis par aucun
            # autre chemin ».
            crm_presence=(req.crm_presence if "crm" not in (req.excluded_families or []) else ""),
            # Mémoire de corrections du compte (feedback loop A2), résolue
            # server-side par le chat-context NestJS. "" = prompt inchangé.
            account_feedback=req.account_feedback,
            # #3272.6 — REX de perte du compte actif, condensés server-side.
            # "" = prompt inchangé au byte près.
            lost_deal_rex_context=req.lost_deal_rex_context,
            # #4071.1 — les faits du compte (socle #4069). "" = prompt inchangé au byte près.
            account_facts_context=req.account_facts_context,
            # #4071.3 — ce que l'espace a gardé. "" = prompt inchangé au byte près.
            workspace_recall_context=req.workspace_recall_context,
            # #3295 — règles apprises de l'espace. "" = prompt inchangé au byte près.
            workspace_learned_rules_context=req.workspace_learned_rules_context,
            # Registre d'outils (Tool Registry v2) : outils réellement connectés
            # + coût des actions, résolus server-side. "" = prompt inchangé.
            tools_summary=req.tools_summary,
            # #2261.21-32 — capacités INTERNES (comptes, contacts, besoins,
            # vivier, missions, mémoire marché, DataForge, routines), même
            # registre que `tools_summary` ci-dessus. "" = prompt inchangé.
            internal_capabilities_summary=getattr(req, "internal_capabilities_summary", "") or "",
            # Règles métier built-in citables. "" quand rien ne matche.
            method_context=method_knowledge.format_method_context(method_chunks),
            # #3390.10/.11 — la méthode retenue par le moteur serveur, texte tel quel.
            commercial_method_context=getattr(req, "commercial_method_context", "") or "",
            # Fichiers déposés dans la conversation. "" = prompt inchangé.
            attached_documents=attached_documents,
            # #AM.57 / #AM.58 — un document joint est lu pour ce qu'il est : besoin entrant ou CV.
            attached_documents_note=attached_documents_note(attached_docs + ephemeral_docs),
            # Le prénom, résolu server-side par le chat-context. "" = le bloc
            # n'apparaît pas : mieux vaut pas de prénom qu'un prénom vide.
            first_name=getattr(req, "first_name", "") or "",
            # L'écran ouvert, tel que l'app web le DÉCLARE et que l'API le rend.
            # "" = prompt inchangé au byte près.
            page_context=getattr(req, "page_context", "") or "",
            # #1960.20 — en marque blanche, aucune adresse Bellum dans le prompt.
            white_label=bool(getattr(req, "white_label", False)),
            # #1958.8 — la langue de l'INTERFACE, résolue côté navigateur et
            # transmise telle quelle : `build_system_prompt` retombe sur "fr"
            # pour toute valeur absente ou inconnue (client plus ancien).
            interface_language=getattr(req, "interface_language", "fr") or "fr",
            # #1919.15 — les retours de la personne sur les réponses de Laura,
            # condensés par l'API. "" = prompt inchangé au byte près.
            reply_feedback=getattr(req, "reply_feedback", "") or "",
            # #3192.8 — le signal de densité calculé ci-dessus, MÊME valeur que
            # celle journalisée dans le contrat de demande structuré (GA-26).
            niveau_detail=niveau_detail,
            # #3192.10 — le classement implicite calculé ci-dessus.
            expected_density=expected_density,
            reply_layout=reply_layout,
            # #3243 (#186.10) — la demande du tour, pour le challenge « message
            # trop générique » (envoi identique à plusieurs personnes).
            request_text=req.message or "",
        )
        # #1951.2 — la fiche du consultant ou du besoin, relue par l'API. Elle
        # partait en simple concaténation ; elle passe par la MÊME porte que
        # l'état du fil ci-dessous, pour la même raison (#1980) : le rappel de
        # langue doit rester le DERNIER texte lu par le modèle. Sans rappel (en
        # français), la concaténation est byte-identique à celle d'avant.
        system = append_before_language_reminder(system, scope_object_block(getattr(req, "scope_object", "") or ""))
        # R22-LG (#4421.2) — « trouve-moi des missions » sans consultant désigné : le marché, sans question.
        system = append_before_language_reminder(
            system,
            market_missions_turn_block(
                req.message,
                scope_object=getattr(req, "scope_object", "") or "",
                page_context=getattr(req, "page_context", "") or "",
            ),
        )
        # #3231 (#219.8, recette prod 05/10) — la relation déclarée atteint le
        # prompt MÊME quand le modèle n'appelle aucun outil ce tour : jusqu'ici
        # `introduction_capability`/`collision_risk` n'existaient que dans les
        # retours d'outils (`with_relation_proof`). Lu depuis `contacts_summary`
        # (contexte de BASE, pas un outil). "" = prompt inchangé au byte près.
        system = append_before_language_reminder(system, declared_relations_context_block(req.contacts_summary))
        # #3385.12 — la consigne du tour « ma priorité cette semaine » : stade et
        # taille déclarés NOMMÉS dans la réponse. "" pour toute autre question.
        system = append_before_language_reminder(
            system, weekly_priority_turn_block(req.profile_data or {}, req.message)
        )
        # #2887.2 — « qu'est-ce que je dois faire cette semaine ? » : décisions et indicateurs de la
        # combinaison rôle × stade (la matrice que /briefing lit). "" pour toute autre question.
        system = append_before_language_reminder(
            system, weekly_actions_turn_block(req.profile_data or {}, req.message)
        )
        # #3390.10 — « Quelle approche pour ce compte ? » : le bloc Méthode ouvre la réponse.
        system = append_before_language_reminder(
            system,
            method_turn_block(
                getattr(req, "commercial_method_context", "") or "", req.message, _interface_key(req) == "en"
            ),
        )
        # #3423.8 — « Par où j'ouvre ce compte ? » : la voie d'entrée de l'onglet Plan.
        system = append_before_language_reminder(system, entry_route_turn_block(req.plan_summary or "", req.message))
        # #3443 — « Prépare-moi un appel à froid pour X » ouvre le dialogue d'appel (carte), pas un script.
        system = append_before_language_reminder(system, cold_call_turn_block(req.message))
        # #3869.3 — une approche demandée (message/mail/discours) est préparée MAINTENANT, jamais
        # reportée par « je peux maintenant préparer un message ».
        system = append_before_language_reminder(system, approach_preparation_turn_block(thread_aware_request(req.message, req.history)))
        # #3869.1 (recette prod 14/10, Renault) — un décideur achats introuvable ou mal identifié
        # propose la carte `propose_people_search`, jamais une offre en texte seul.
        system = append_before_language_reminder(system, decision_maker_search_turn_block(thread_aware_request(req.message, req.history)))
        # #4055 (R20) — « complète ce compte » : base / hors base / à rapprocher, CRM répondant ou non.
        system = append_before_language_reminder(system, account_completion_turn_block(req.message))
        # #3889 (R26) — besoins ouverts / anciens besoins / missions en cours : toutes les lectures avant la réponse.
        system = append_before_language_reminder(system, account_projects_turn_block(req.message))
        # #3894 (R26) — « relance les N derniers contacts vus » : tri par date, une carte par destinataire.
        system = append_before_language_reminder(system, recent_contacts_follow_up_turn_block(req.message))
        # #3867.1 / #3867.2 / #3867.3 / #3867.4 / #3867.5 — « fais-moi toute la stratégie » : recommandation + vrais arbitrages, les cinq
        # dimensions, calée sur le délai/les moyens déclarés, aucun délai de démarrage garanti.
        system = append_before_language_reminder(
            system,
            full_strategy_turn_block(
                req.message, (req.account_data or {}).get("strategy5p"), _interface_key(req) == "en"
            ),
        )
        # #3868.1 / #3868.3 / #3868.4 / #3868.5 — comparer les voies d'accès sans mélanger client final, partenaire, titulaire de
        # marché et centrale d'achat, ni inventer un référencement (#3868.2 déjà tenu par NO-GO
        # PARTENAIRE / GOUVERNANCE RANG 2, bellum_advisor.py).
        system = append_before_language_reminder(
            system, access_route_comparison_turn_block(req.message, _interface_key(req) == "en")
        )
        # #3186 — le mode Régie / Forfait n'est pas déclaré : Laura le DIT (jamais
        # supposé) ; la carte vers Réglages › Profil est posée plus bas, par le serveur.
        system = append_before_language_reminder(system, contract_mode_turn_block(req.profile_data, req.message))
        # #3586 — le bloc Drive (vide ⇒ `system` inchangé au byte près).
        system = append_before_language_reminder(system, f"\n\n{drive_context}" if drive_context else "")
        # #2453 — le mode de contexte et la hiérarchie unique. Sans mode : "".
        system = append_before_language_reminder(
            system,
            context_mode_block(req.context_mode or "", getattr(req, "interface_language", "fr") or "fr"),
        )
        # #3772.5 — l'exclusion stricte, dite au modèle EN PLUS d'être appliquée en code.
        system = append_before_language_reminder(
            system, workspace_data_exclusion_block(req, getattr(req, "interface_language", "fr") or "fr")
        )
        # #3703 — ce que Laura peut reprendre d'un ancien échange écrit avec le profil.
        system = append_before_language_reminder(
            system,
            older_answers_block(req.context_mode or "", getattr(req, "interface_language", "fr") or "fr"),
        )
        # #2259.4 / #2259.6 / #2259.11 / #2259.13 — IDENTITÉ ET ENTOURAGE,
        # bloc NEUF (jamais un ajout dans `build_system_prompt`, édité par un
        # autre lot en ce moment) : nom de famille, fonction d'espace,
        # propriétaire du compte, collègue cité. Vide des quatre champs ⇒
        # chaîne vide ⇒ prompt byte-identique (même contrat que les blocs
        # voisins de cette porte).
        system = append_before_language_reminder(
            system,
            identity_context_block(
                last_name=getattr(req, "last_name", "") or "",
                workspace_role=getattr(req, "workspace_role", "") or "",
                is_account_owner=bool(getattr(req, "is_account_owner", False)),
                mentioned_colleague=getattr(req, "mentioned_colleague", "") or "",
                # #2259.30-.35 — la ou les BU portées, résolues server-side.
                business_units=getattr(req, "business_units", None) or None,
            ),
        )
        # #1995 — LA DATE COURANTE, avec son fuseau. Mesuré en production le
        # 14/09/2026 : « je n'ai pas accès à la date courante dans ce fil ».
        # Laura disait vrai — aucune invite du chat ne portait de date, alors que
        # la description de `schedule_reminder_for_contact` lui ORDONNE de
        # résoudre « lundi » et « dans 15 jours » elle-même, et que
        # `_normalise_iso_utc` refuse (à raison) tout ce qui n'est pas absolu.
        # Aucune demande datée relativement ne pouvait aboutir.
        # Même porte que le bloc ci-dessus, et pour une raison de PLUS :
        # une date change à chaque tour, donc elle doit vivre dans le segment
        # VOLATIL — posée plus haut, elle ferait rater le cache du prompt
        # système à CHAQUE message (GA-293).
        # AVANT l'état du fil, qui reste le DERNIER texte du prompt : c'est le
        # témoin de #1980 (`test_chat_thread_state_turn.py`), et l'état du fil
        # porte le contact que la personne vient de désigner — le fait le plus
        # frais se lit en dernier.
        # Décision de Louis du 14/09/2026 — « ajouter un fuseau par
        # utilisateur » : la date part dans le fuseau de la PERSONNE, lu sur son
        # profil par l'API. Vide (route MCP, ancien appelant, profil sans
        # fuseau) ⇒ `REFERENCE_TIMEZONE` : bloc byte-identique à celui d'avant.
        # #1958.14/.15 — même langue que le reste du prompt (#1958.8) : une
        # interface anglaise ne doit pas lire ce bloc en français.
        # #1958.2 — AUCUN rendez-vous n'est visé ici (ce bloc est GÉNÉRAL, pas
        # attaché à un contact) : l'escalier saute directement à l'espace,
        # `resolve_applicable_timezone(person, None, workspace)`. Vide des deux
        # côtés (route MCP, ancien appelant, rien de réglé) ⇒ `None` ⇒
        # `REFERENCE_TIMEZONE`, comportement d'avant ce lot au bit près.
        _applicable_timezone = resolve_applicable_timezone(
            person_timezone=req.timezone or None,
            workspace_timezone=getattr(req, "workspace_timezone", "") or None,
        )
        # Le MÊME instant nourrit les deux blocs (ci-dessous) : un second appel
        # à `datetime.now()` pourrait tomber de l'autre côté de minuit entre les
        # deux, et le jour férié annoncé daterait alors d'un instant différent
        # de celui affiché juste au-dessus.
        # `current_time_module.now_in_reference_timezone` — jamais un import
        # direct du nom : `test_chat_reminder_from_a_name.py` fige l'instant en
        # patchant l'ATTRIBUT du module (`patch("app.prompts.current_time.
        # now_in_reference_timezone", …)`), ce qu'un `from … import
        # now_in_reference_timezone` local rendrait invisible ici (le nom
        # capturé à l'import ne bougerait plus).
        _moment = current_time_module.now_in_reference_timezone(_applicable_timezone)
        system = append_before_language_reminder(
            system,
            current_time_block(
                now=_moment,
                language=getattr(req, "interface_language", "fr") or "fr",
            ),
        )
        # #2266.7/.8/.10 (épopée #2920) — jours fériés utiles, période du
        # workspace et dernière collecte connue, MÊME porte et MÊME raison que
        # le bloc au-dessus (segment VOLATIL, GA-293 : un jour férié change de
        # pertinence à chaque tour). `workspace_created_at`/`workspace_last_sync_at`
        # viennent de l'API (`ChatContextService`) ; absents ⇒ seul ce qui est
        # connu apparaît, jamais une période ou une fraîcheur inventée.
        system = append_before_language_reminder(
            system,
            temporal_grounding_block(
                _moment,
                workspace_created_at=getattr(req, "workspace_created_at", "") or None,
                # #2266.10 — même porte, même raison : absent ⇒ aucune collecte
                # connue nulle part dans l'espace, jamais une date inventée.
                workspace_last_sync_at=getattr(req, "workspace_last_sync_at", "") or None,
                language=getattr(req, "interface_language", "fr") or "fr",
            ),
        )
        # #1927 — L'ÉTAT DU FIL, relu du corps (tolérant, entrée par entrée) et
        # prolongé par CE tour : la boucle d'outils y projette ce que les
        # outils rendent, le routeur le renvoie à l'API qui le stocke.
        # #1995 — le contact que Laura NOMME dans ses options doit survivre au
        # tour suivant. `contacts_summary` n'arrive QUE lorsque l'API a résolu un
        # compte dans le message : au tour d'après, « Sandrine Pata a 9h30 » ne
        # nomme plus THALES, le résumé est nul, et l'identifiant qu'elle avait
        # sous les yeux au tour d'avant a disparu. On le lui fait reconnaître ici
        # — sur ce qu'elle a elle-même proposé, jamais par une recherche de nom.
        thread = ThreadStateCollector(
            thread_state_from_wire(req.thread_state),
            shown_objects=contacts_shown_in_context(req.contacts_summary),
        )
        thread.observe_user_message(req.message)  # #3224 — contraintes nommées dans le message
        # #3198 (épopée #3223) — LE BRANCHEMENT LIVE, sur sa plus petite
        # tranche PROUVABLE : quatre des sept champs SUPPORT_VISIBLE de
        # `ReasoningTrace`, dérivés d'un vrai tour AVANT l'appel modèle — sur
        # ce qui est déjà calculé ci-dessus (#2321 `route_chat_intent`, le
        # Facet Ledger, `method_knowledge`), jamais un second calcul (GA-26).
        # `tools_called` (exécution réelle), `profile_version` et
        # `verifier_status` restent hors de cette tranche — voir le docstring
        # de `pre_turn_diagnostic_fields`.
        _persistent_scope = thread.state.persistent_scope
        _entity_scope = (
            f"{_persistent_scope.root_entity.label} "
            f"({len(_persistent_scope.included_entities)} filiale(s) incluse(s), "
            f"{len(_persistent_scope.excluded_entities)} exclue(s))"
            if _persistent_scope is not None
            else "aucun périmètre persistant nommé"
        )
        logger.info(
            "Trace de raisonnement — champs pré-tour (#3198, épopée #3223): %s",
            pre_turn_diagnostic_fields(
                detected_intent=intent_route.intent,
                source_plan=intent_route.steps,
                entity_scope=_entity_scope,
                method_rules_used=tuple(chunk["title"] for chunk in method_chunks),
            ),
        )
        # #1927.8 — le bloc part en QUEUE du prompt système, donc dans le
        # segment VOLATIL que `_cached_system` ne met jamais en cache : collé
        # plus haut, il ferait rater le cache à chaque tour (GA-293). Vide ⇒ ""
        # ⇒ prompt byte-identique à celui d'avant.
        # #2536.1 — LA MÊME BORNE que celle passée à l'orchestrateur plus bas
        # (drapeau du navigateur OU question encore OUVERTE dans le fil),
        # calculée UNE SEULE FOIS ici pour ne jamais diverger entre le texte du
        # prompt et le retrait de l'outil `ask_clarification`. Volatile, jamais
        # mis en cache (GA-293), posée AVANT l'état du fil pour que celui-ci
        # reste le DERNIER texte du segment volatil (témoin #1980 inchangé) :
        # vide ⇒ "" ⇒ prompt inchangé au bit près.
        # #3854 (BEL-LAU-1008-003) — `has_questions()` (vrai à vie dès la
        # première clarification) a été remplacé par `has_open_question()`
        # (vrai seulement le tour qui suit celle-ci) : une tâche neuve, plus
        # tard dans le même fil, peut recevoir sa propre clarification.
        clarification_already_asked = req.clarification_asked or thread.previous.has_open_question()
        system = append_before_language_reminder(system, clarification_spent_block(clarification_already_asked))
        # #1980 — mais AVANT le rappel de langue quand le prompt en porte un
        # (interface hors français) : ce rappel doit rester le DERNIER texte lu
        # par le modèle. En français, aucun rappel : concaténation d'avant.
        # #2321 — CE QUE LE SERVEUR A COMPRIS de la demande. Sans ce bloc, le
        # routeur décidait dans le vide : la route était calculée, journalisée,
        # et le modèle choisissait ses outils tout seul. Posé ici, dans le
        # segment volatil et AVANT l'état du fil pour que celui-ci reste le
        # DERNIER texte lu (témoin #1980 inchangé). Demande non routée ⇒ ""
        # ⇒ prompt byte-identique à celui d'avant ce lot.
        system = append_before_language_reminder(
            system,
            intent_route_block(intent_route, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #3175 (LAU-FINAL-181) — recette du ticket : une question littérale
        # sur UN compte nommé (« SG travaille avec des consultants ? ») a une
        # réponse ponctuelle, mais la décision commerciale sous-jacente est
        # plus large. Même zone volatile, même ordre que le bloc de route ;
        # aucun compte nommé qualifié littéralement ⇒ "" ⇒ prompt inchangé.
        system = append_before_language_reminder(
            system,
            account_qualification_widening_block(req.message, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #3864.1 (BEL-LAU-1008-013) — même zone volatile, même ordre que le
        # bloc de qualification de compte juste au-dessus ; aucun marqueur de
        # recherche de besoins ⇒ "" ⇒ prompt inchangé au bit près.
        system = append_before_language_reminder(
            system,
            need_discovery_block(req.message, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #3176 (LAU-FINAL-182) — mode INTERNAL_ONLY : la personne demande
        # explicitement de NE PAS aller sur le web ce tour. Calculé UNE SEULE
        # FOIS pour ne jamais diverger entre le texte du prompt et la
        # journalisation ci-dessous. Aucun marqueur ⇒ "" ⇒ prompt inchangé.
        internal_only_marker = asks_for_internal_only_scope(req.message)
        # #3201 — CONTRAINTES COMBINÉES : même zone volatile, même ordre que le
        # bloc de route juste au-dessus (dont il reprend l'intent) ; hors
        # recherche de comptes ⇒ "" ⇒ prompt inchangé au bit près.
        system = append_before_language_reminder(
            system,
            constraint_consistency_block(intent_route, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #3202 — ARCHÉTYPE D'ENTREPRISE : même zone volatile, même ordre ;
        # aucun marqueur d'archétype dans le message ⇒ "" ⇒ prompt inchangé.
        system = append_before_language_reminder(
            system,
            company_archetype_block(req.message, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #2721 / #2678 — une question d'ACTUALITÉ PUBLIQUE part sur `web_search`
        # (recette prod du 23/09 : réponse de mémoire, zéro source, outil exposé
        # mais jamais choisi). Même zone volatile, même ordre que le bloc de
        # route ; aucune actualité ⇒ "" ⇒ prompt inchangé au bit près.
        # #3176 — sauf mode INTERNAL_ONLY : les deux consignes seraient
        # contradictoires (l'une pousse `web_search`, l'autre l'interdit), et
        # une demande explicite de rester en interne l'emporte.
        system = append_before_language_reminder(
            system,
            ""
            if internal_only_marker
            else public_news_block(req.message, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #3176 — la consigne du mode INTERNAL_ONLY elle-même : interdit
        # `web_search`, pointe vers les outils internes réels. Même zone
        # volatile, même ordre que les blocs ci-dessus ; aucun marqueur ⇒ ""
        # ⇒ prompt inchangé au bit près.
        system = append_before_language_reminder(
            system,
            internal_only_block(req.message, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #2679 (famille) — préparer un message pour RELANCER un contact n'est
        # l'intention de personne dans `CHAT_INTENT_ROUTING_TABLE` (aucune des
        # dix) : recette prod du 23/09 (sha servi 4a4e9e07d), sans compte
        # actif, « Prépare-moi un message pour relancer » recevait sa
        # précision de canal en markdown inerte. Même zone volatile, même
        # ordre que le bloc d'actualité ; aucune relance ⇒ "" ⇒ prompt
        # inchangé au bit près.
        system = append_before_language_reminder(
            system,
            message_prep_block(req.message, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #2434.51 — recette prod du 25/09 : une demande de LECTURE INTÉGRALE
        # (« Lis-moi tout mon pipeline ») recevait tout le texte agrégé,
        # jamais un résumé ni une proposition d'afficher le détail à l'écran.
        # Même zone volatile, même ordre que les blocs ci-dessus ; aucune
        # demande de lecture intégrale ⇒ "" ⇒ prompt inchangé au bit près.
        system = append_before_language_reminder(
            system,
            long_read_block(req.message, getattr(req, "interface_language", "fr") or "fr"),
        )
        # #2268.29 / #2268.30 — AVANT l'état du fil (témoin #1980 : celui-ci
        # reste le DERNIER texte du segment volatil) : vide dès qu'aucun job
        # n'est en cours ⇒ prompt inchangé au bit près.
        system = append_before_language_reminder(system, interrupted_work_block(thread.previous))
        # #2268.31 / #2268.32 / #2268.33 / #2268.34 — même ordre, même raison :
        # vide dès qu'aucun sujet n'est encore établi dans ce fil.
        system = append_before_language_reminder(system, topic_shift_block(thread.previous))
        # #194.3 — même ordre, même raison : vide dès qu'aucune correction
        # n'est active dans ce fil.
        system = append_before_language_reminder(system, correction_not_repeated_block(thread.previous))
        # Continuous memory (Théo #7): fall back to the stored conversation when the
        # client sends no history, so the advisor remembers across sessions.
        with langfuse_client.span("memory"):
            history = req.history or await conversation_service.load_recent_history(req.user_id, req.account_id)
        # #3769 (BEL-LAU-1015) — la FORME déjà adoptée dans le fil, lue sur
        # l'historique BRUT (la compaction ci-dessous rend les cartes en texte).
        # Vide sans réponse à carte ; AVANT l'état du fil (témoin #1980).
        reply_style = derive_reply_style(history)
        system = append_before_language_reminder(system, reply_style_block(history, message=req.message))
        system = append_before_language_reminder(system, format_thread_state_block(thread.previous))
        # #1914.14 — une carte déjà rendue revient au modèle en TEXTE : son JSON,
        # tronqué à `_HISTORY_MSG_MAX`, lui apprendrait une forme cassée.
        user = build_user_prompt(
            req.message,
            compact_history_blocks(history),
            expected_density=expected_density,
            reply_family_directive=reply_family_directive(reply_family),
        )
        # #1949.23 — décision Louis 13/09 batch 12 : le signal d'une demande que
        # Laura n'a pas su router. `None` = aucune clé dans `data`, l'enveloppe
        # d'avant au bit près.
        unrouted_intent: dict[str, str] | None = None
        # #2248 — ce que le palier de modèle lit autour de la demande : un compte
        # actif fait de « fais-moi une analyse » une analyse de CE compte. Les
        # deux chemins ci-dessous résolvent leur palier par la même fonction
        # (`resolve_chat_route`) ; sans réglage de palier, aucun ne classe rien.
        #
        # #2450.1 (reste partiel, épopée #2882) — `req.mode`, validé par l'API
        # contre le même contrat que `RequestedMode` : `choose_chat_tier` ignore
        # déjà `None`/`"auto"`, donc le passer tel quel n'engage rien de plus
        # sur un appelant d'avant ce champ.
        tier_context = ChatTierContext(
            account_in_scope=bool(req.account_id),
            requested_mode=req.mode,
            # #2440.56/.60/.61 (épopée #2975) — MODEL POLICY : « choisir selon
            # […] le risque […] ». Un FAIT déjà mesuré, jamais un texte
            # analysé : `thread.previous.proposals` est projeté par #1927
            # depuis un vrai statut `pending_confirmation` d'un tour
            # précédent — une action d'ÉCRITURE préparée, encore en attente
            # de confirmation dans ce fil. Aucune proposition en attente
            # (l'immense majorité des tours) ⇒ `risk="unknown"` ⇒ chemin
            # BYTE-IDENTIQUE à avant ce champ (voir `choose_chat_tier`).
            risk="elevated" if thread.previous.proposals else "unknown",
            # #2443.9 (#2899) — cohorte canary de l'espace (liste vide = personne).
            canary=is_workspace_in_canary_cohort(req.workspace_id or ""),
        )
        # #2450.8/.9/.12 (épopée #2882) — calculée AVANT l'appel modèle, sur la
        # MÊME demande : un mode explicite (#2450.1) gagne déjà sur toute règle
        # ci-dessous (jamais de dépense forcée, NO-GO respecté) ; ceci ajoute la
        # partie qui manquait — LE DIRE, plutôt que de laisser la limite muette.
        mode_notice = mode_insufficiency_notice(req.message, tier_context, interface_language=_interface_key(req))
        # #2450.5/.6 / #2448.7/.16 (épopée #2882) — la consigne de comportement
        # du mode choisi (VOLATILE, comme les blocs ci-dessus) : sans elle,
        # `verifie` et `approfondi` ne se distinguaient que par le palier de
        # modèle, jamais dans ce qui est demandé au modèle — exactement le
        # NO-GO que #2448 nomme. Vide pour `None`/`"auto"`, prompt inchangé.
        system = append_before_language_reminder(system, research_mode_block(tier_context.requested_mode))
        # #3708 — les sources exclues dans « Outils et sources » : DIT, pas seulement
        # retiré (`ChatRequest._apply_excluded_families` les a déjà ôtées du catalogue).
        system = append_before_language_reminder(
            system, excluded_sources_block(req.excluded_families, _interface_key(req))
        )
        # #3768 (BEL-LAU-1014) — un geste « retravailler cette réponse » : la
        # réponse source, sa forme, ses comptes et ses réserves entrent dans le
        # prompt de CE tour (VOLATIL, même porte). Aucun geste : "" — inchangé.
        system = append_before_language_reminder(system, reply_transform_block(req.reply_transform))
        # #4397 (N1) — l'objet d'une suite cliquée (consultant du vivier), lu en métadonnée : "" sans suite.
        system = append_before_language_reminder(system, follow_up_ref_block(req.follow_up_ref))
        # #3176.3-.6 (épopée #3216) — LE PLANIFICATEUR DE SOURCES : un marqueur
        # DÉCLARÉ dans le message (« dans ta mémoire », « poste actuel »,
        # « quelle stratégie »…) produit un `SourcePlan` qui borne les couches
        # à appeler pour CE tour — VOLATIL, même porte que `research_mode_block`
        # juste au-dessus. Sans marqueur : `source_plan_match` est `None`,
        # `source_plan_block(None, …)` rend "" — prompt inchangé au byte près.
        source_plan_match = detect_search_mode(req.message)
        source_plan = build_source_plan(source_plan_match.mode if source_plan_match else None)
        system = append_before_language_reminder(
            system, source_plan_block(source_plan_match.mode if source_plan_match else None, _interface_key(req))
        )
        # #3176.3 — INTERNAL_ONLY interdit la recherche publique EN CODE, pas
        # seulement dans la consigne : un mode qui ne ferait que le DEMANDER au
        # modèle ne serait pas une garantie (même raisonnement que
        # `context_mode.py`, voir son docstring). Aucun plan / aucune couche
        # interdite ⇒ `frozenset()` ⇒ catalogue d'outils inchangé.
        source_plan_forbidden_tools: frozenset[str] = frozenset()
        if source_plan is not None:
            for layer in source_plan.forbidden_layers:
                source_plan_forbidden_tools |= LAYER_TOOL_NAMES.get(layer, frozenset())
        # #3772.5 — l'exclusion stricte retire EN CODE les outils qui lisent l'espace.
        source_plan_forbidden_tools |= workspace_data_excluded_tool_names(req)
        # #214.1 (réel, épopée #3229) — un marqueur de POPULATION LARGE
        # (« tous les… », « toutes les… », « les cinquante… ») construit un
        # SearchUniverse déterministe à partir du message — ADDITIF, même
        # porte que `source_plan` juste au-dessus : sans marqueur,
        # `search_universe` reste `None`, `context` byte-identique à avant.
        search_universe = build_search_universe(req.message) if detect_broad_population_marker(req.message) else None
        # #2448.4 (épopée #2882) — « AUTO n'est pas un mode opaque » : LA raison
        # qui a choisi le palier de CE tour, calculée ici pour la transparence
        # (jamais pour re-router — `resolve_chat_route`/l'orchestrateur
        # décident seuls, ce calcul est une LECTURE de la même fonction pure).
        tier_decision = choose_chat_tier(req.message, tier_context)
        mode_explanation = explain_tier_decision(tier_decision.reason, interface_language=_interface_key(req))

        if _chat_tools_enabled():
            # Orchestration : le Copilote peut EXÉCUTER une action (compare, …) et
            # pas seulement en parler. Les actions réellement exécutées enrichissent
            # la transparence (« ce que Bellum a fait »), pilotées par de vrais appels.
            from app.services.chat_orchestrator import ChatTurnTimeout, run_chat_with_tools

            # Ce qui reste du plafond une fois la préparation payée. `wait_for`
            # borne TOUT ce que fait l'orchestrateur — y compris l'exécution d'un
            # outil, que rien d'autre ne borne (#1191). La diffusion ne change
            # rien à cette garantie : `run_chat_with_tools` reste UNE coroutine
            # que `wait_for` peut annuler, `emit` n'ouvre aucun chemin qui la
            # contournerait.
            # #1957.12 / #1950.1 — l'accumulateur des actions est né AVANT le
            # filet générique (voir en tête de cette fonction), donc hors de la
            # coroutine que `wait_for` annule ET lisible par les deux filets :
            # ce que les outils ont déjà lu survit au temps comme à la panne.
            remaining = _turn_ceiling_s() - (time.monotonic() - turn_started)
            try:
                if remaining <= 0:
                    # La préparation a mangé le plafond : appeler le modèle
                    # maintenant garantirait le 502 au lieu de l'éviter.
                    raise TimeoutError
                reply, tool_actions = await asyncio.wait_for(
                    run_chat_with_tools(
                        system,
                        user,
                        user_id=req.user_id,
                        profile_data=req.profile_data,
                        max_tokens=4000,
                        # État d'intégration RÉEL (résolu server-side) : sans lui,
                        # l'outil d'export proposerait un CRM que l'utilisateur n'a pas.
                        crm_connected=req.crm_connected,
                        crm_provider=req.crm_provider,
                        # Routeur étape 3 : les outils dont le connecteur manque ne
                        # sont pas présentés au modèle. On ne propose pas ce qu'on
                        # ne voit pas.
                        connected_families=req.connected_families,
                        # #3708.2 — les familles EXCLUES pour ce fil : jamais nommées
                        # « absentes » dans le bloc de capacités (voir orchestrateur).
                        excluded_families=req.excluded_families,
                        # Une seule clarification par conversation. Le compteur se
                        # lit sur l'historique, seul endroit qui voie les tours
                        # précédents — l'orchestrateur n'en voit qu'un.
                        #
                        # #1927.6 — GÉNÉRALISÉ : une question posée dans un tour
                        # précédent est désormais un fait SERVEUR (l'état du
                        # fil), plus seulement un drapeau du navigateur. Les
                        # deux sont lus — on élargit, on ne retire rien.
                        # #2536.1 — même valeur que celle qui a déjà posé (ou
                        # non) `CLARIFICATION_SPENT_BLOCK` dans le prompt
                        # ci-dessus : calculée une seule fois, jamais recalculée.
                        clarification_already_asked=clarification_already_asked,
                        # #1950.17 — le plafond agrégé de la réponse, lu par l'API
                        # dans la grille ; `None` = aucun plafond (appelant ancien).
                        reply_cost_ceiling=req.reply_cost_ceiling,
                        # LOT STREAM : le texte final et les étapes d'outils
                        # partent au fur et à mesure via CE callback.
                        emit=emit,
                        collected=collected,
                        # #1927 — l'état du fil que la boucle prolonge.
                        thread=thread,
                        # #1958.2/.3 — les deux marches de l'escalier que
                        # `schedule_reminder_for_contact` ne peut pas déjà lire
                        # depuis le contact lui-même : personne → (rendez-vous,
                        # résolu dans l'outil) → espace → défaut produit.
                        person_timezone=req.timezone or None,
                        workspace_timezone=getattr(req, "workspace_timezone", "") or None,
                        # #2248 — la demande BRUTE, lue par le palier de modèle.
                        tier_request=req.message,
                        tier_context=tier_context,
                        # #2454.4/.5/.9 — le mode DÉJÀ résolu par `apply_context_mode`
                        # ci-dessus (`req.context_mode`), relayé jusqu'à la proposition
                        # `find_accounts` pour que le handoff vers Découvrir le conserve.
                        context_mode=req.context_mode,
                        # #3853 (recette prod 09/10) — la portée « Sans les données de
                        # l'espace » : relayée jusqu'à `run_account_search`, qui reste au
                        # catalogue sous exclusion stricte mais ne doit NI lire le
                        # portefeuille NI marquer un compte « déjà dans ton espace ».
                        exclude_workspace_data=req.exclude_workspace_data,
                        # #3176.3 (épopée #3216) — les outils qu'un SourcePlan
                        # INTERDIT pour ce tour (`frozenset()` sans plan : catalogue
                        # inchangé, même contrat que `mode_excluded_tool_names`).
                        source_plan_forbidden_tools=source_plan_forbidden_tools,
                        # #214.6 (épopée #3229) — la langue du bloc LAUNCH_JOB
                        # « demande trop large », déjà résolue ci-dessus.
                        interface_language=_interface_key(req),
                        # #3196.6 (reste) — rempli par référence, lu après l'attente.
                        observability_sink=turn_observability_sink,
                        # #3198 (épopée #3223) — même patron, lu après l'attente.
                        verifier_status_sink=verifier_status_sink,
                        verifier_reasons_sink=verifier_reasons_sink,
                        reply_notes_sink=reply_notes_sink,
                        coverage_sink=coverage_sink,
                        # #3192 (LAU-FINAL-198) — la question BRUTE, lue par le
                        # contrôle de densité (`commercial_verifier.verify_response`),
                        # même donnée que `tier_request` ci-dessus, jamais un second
                        # calcul (GA-26).
                        user_message=req.message,
                        # #3175.4/.6 — le niveau de PREUVE de l'objet `CommercialIntent` :
                        # une question commerciale sans résultat d'outil se signale.
                        evidence_requirement=commercial_intent.evidence_requirement,
                        # #3236.2 (b, tranche) — la conversation, pour reprendre les lectures d'un tour coupé.
                        conversation_id=req.conversation_id or None,
                        # #3243.r41 — la formule « besoin à confirmer » (signaux tous archivés), bâtie du MÊME détecteur.
                        stale_need_line=stale_need_line(
                            (req.account_data or {}).get("raw_analysis"),
                            _interface_key(req),
                        ),
                        # RV4-E-FIX 4287.4 — la forme déjà adoptée du fil (même lecture que le rappel de style).
                        prior_card_family=reply_style.family,
                        proposed_actions=reply_style.actions_proposed,
                    ),
                    timeout=remaining,
                )
            except (ChatTurnTimeout, TimeoutError):
                # Dire LE TEMPS. « Une erreur est survenue » envoie l'utilisateur
                # relancer, ce qui repaie un tour complet pour retomber sur le
                # même mur — c'est exactement ce qu'ont fait les trois messages
                # du 15-16/08. Rien n'est persisté : le tour n'a pas eu lieu.
                #
                # `TimeoutError` est le plafond du handler (#1191) : le budget
                # intérieur de l'orchestrateur ne couvre ni l'exécution d'un outil
                # ni la préparation du contexte, donc il pouvait ne jamais rendre
                # la main. Les deux causes disent la même chose à l'utilisateur —
                # c'est le temps — et méritent donc la même phrase.
                logger.warning(
                    "Chat turn budget exceeded for user %s (%.1fs elapsed)",
                    req.user_id,
                    time.monotonic() - turn_started,
                )
                # #1957.11 / #1957.12 — le temps, et ce qui a déjà été récupéré.
                langfuse_client.note_turn_status("timeout")  # #2442.11
                return _timeout_response(req, context, collected)
            # #1949.23 — décision Louis 13/09 batch 12 : l'outil silencieux
            # `note_unrouted_request` devient `data["unrouted_intent"]` (texte de
            # la demande MASQUÉ et tronqué), et sort du panneau « ce que Bellum a
            # fait » — ce n'est ni une action faite, ni une action à valider.
            # L'API l'écrit sans identité et ne le relaie jamais au navigateur.
            unrouted_intent = build_unrouted_intent(req.message, tool_actions)
            tool_actions = without_unrouted_actions(tool_actions)
            # #3196.6 (reste, LAU-FINAL-202) — l'observabilité du tour, hors
            # des journaux Python : `turn_observability_sink` (rempli par
            # référence dans `run_chat_with_tools`, jamais le tuple
            # `(reply, actions)`) porte une entrée par sortie du tour — la
            # DERNIÈRE est celle qui a produit CETTE réponse.
            if turn_observability_sink:
                context = {**context, "turn_observability": turn_observability_as_dict(turn_observability_sink[-1])}
            # #3198 (épopée #3223) — LE BRANCHEMENT LIVE, suite : les trois
            # champs SUPPORT_VISIBLE connus seulement APRÈS la boucle
            # d'outils. `tools_called` se lit dans `tool_actions` (déjà
            # renvoyé ci-dessus, jamais un second calcul — GA-26).
            # `verifier_status` : la DERNIÈRE entrée de `verifier_status_sink`
            # est celle du tour qui a produit CETTE réponse (même règle que
            # `turn_observability_sink` ci-dessus) ; un tour arrêté sur une
            # clarification n'appelle jamais le vérificateur (voir le
            # docstring de `run_chat_with_tools`) — absence RÉELLE, jamais 0.
            # `profile_version` : la version relayée par `get_account_briefing`
            # quand un dossier a été consulté ce tour (#3212.3(b)) — absente
            # sans dossier consulté, jamais devinée.
            post_turn_fields = post_turn_diagnostic_fields(
                tools_called=tuple(a.get("tool", "") for a in tool_actions),
                verifier_status=verifier_status_sink[-1] if verifier_status_sink else "non vérifié ce tour",
                profile_version=next(
                    (a["profile_version"] for a in tool_actions if a.get("profile_version")),
                    "aucun dossier de compte consulté ce tour",
                ),
            )
            logger.info("Trace de raisonnement — champs post-tour (#3198, épopée #3223): %s", post_turn_fields)
            # #3223.1 — la même trace, SORTIE des journaux : l'API la range
            # (liste blanche) et le tableau de pilotage la lit sur le trafic
            # réel. Diagnostic seulement — jamais un corps de message ni une
            # chaîne de pensée ; `tools_planned` = les outils de la route
            # d'intention, pour mesurer ceux qu'on a ignorés.
            # #3223 (lot X17) — la correction reconnue CE tour (le modèle l'a
            # nommée via `note_thread_context`, jamais devinée) et si elle a été
            # SUIVIE d'un rerun : au moins un des outils qu'elle invalide a été
            # réellement rappelé. Sans invalidation nommée, le rerun n'est pas
            # décidable : le champ est absent (non mesuré), jamais un `False`.
            _new_correction = (
                thread.state.active_correction
                if thread.state.active_correction != thread.previous.active_correction
                else None
            )
            # #3223 (lot R17) — même condition que `correction_rerun` ci-dessous,
            # calculée UNE fois pour être réutilisée par « correction sans
            # changement de résultat » sans la deviner deux fois (GA-26).
            _correction_invalidates = _new_correction.invalidates if _new_correction is not None else ()
            _rerun_happened = bool(_correction_invalidates) and any(
                t in _correction_invalidates for t in post_turn_fields["tools_called"]
            )
            context = {
                **context,
                "reasoning_trace": {
                    "detected_intent": intent_route.intent,
                    "tools_planned": list(intent_route.tools),
                    "tools_called": list(post_turn_fields["tools_called"]),
                    # #3391 — la raison de chaque outil (mode, CLÉS d'entrée,
                    # silence), jusqu'ici seulement dans Langfuse : le DM la lit.
                    "tools_detail": tools_detail_from_actions(tool_actions),
                    "verifier_status": post_turn_fields["verifier_status"],
                    "correction_recognized": _new_correction is not None,
                    # #2879 (X17, #2442.15) — les codes de motif du vérificateur
                    # (« fausse réussite » = action_declaree_sans_preuve, « mauvais
                    # zéro » = inconnue_convertie_en_zero) : `[]` = vérifié sans
                    # motif, absent = non vérifié ce tour (jamais « aucun motif »).
                    **({"verifier_reasons": list(verifier_reasons_sink[-1])} if verifier_reasons_sink else {}),
                    **({"correction_rerun": _rerun_happened} if _correction_invalidates else {}),
                    # #3223.7 — le verdict rendu par l'outil CE tour (absent sans
                    # lui : jamais un verdict deviné, jamais « GO » par défaut).
                    **(
                        {"account_verdict": account_verdict}
                        if (account_verdict := next((a["account_verdict"] for a in tool_actions if a.get("account_verdict")), None))
                        else {}
                    ),
                    # #3777 / #3717.7 (reste du lot W9) — l'identifiant d'exécution du
                    # dossier consulté ce tour (`execution_id_hint`), pour que le replay
                    # du tour de Laura (back-office) lise la même piste que le dossier.
                    # Absent sans dossier consulté, jamais deviné.
                    **(
                        {"execution_id": execution_id}
                        if (execution_id := next((a["execution_id"] for a in tool_actions if a.get("execution_id")), None))
                        else {}
                    ),
                    # #3223 (lot R17, épopée #3223) — la correction a été SUIVIE
                    # d'un rerun (outil invalidé réellement rappelé), mais le
                    # verdict de compte rendu ce tour est le MÊME que le dernier
                    # connu (`ThreadState.last_account_verdict`, même patron que
                    # `active_correction` #194.1) : décidable seulement quand les
                    # deux verdicts sont connus ET qu'un rerun a eu lieu, jamais
                    # deviné sinon (absent, pas `False`).
                    **(
                        {"correction_without_result_change": account_verdict == thread.previous.last_account_verdict}
                        if _rerun_happened
                        and account_verdict is not None
                        and thread.previous.last_account_verdict is not None
                        else {}
                    ),
                    # #3223 (lot R17, épopée #3223) — `GO_AFTER_PROOF` sur un
                    # grand compte (5000 salariés et plus, même seuil que
                    # `analysisScopeGuardrailFor` en TS, GA-26) : l'absence
                    # d'accès EST déjà la raison du verdict — jamais un second
                    # calcul, lu dans le résultat de l'outil de verdict.
                    **(
                        {"large_account_without_access": True}
                        if any(a.get("large_account_without_access") for a in tool_actions)
                        else {}
                    ),
                },
            }
            # #3223 (lot R17) — le dernier verdict de compte connu dans ce fil,
            # pour que le TOUR SUIVANT puisse dire si une correction a changé le
            # résultat. Un tour sans nouveau verdict garde celui d'avant (copié
            # par `ThreadStateCollector.__init__`), jamais remis à zéro.
            if account_verdict:
                thread.state.last_account_verdict = account_verdict
            if tool_actions:
                context = {**context, "actions": tool_actions}
                # Les dossiers que les outils sont allés lire deviennent des
                # sources citées et datées, à côté des documents et de la
                # méthode. Sans ça, la réponse la plus outillée serait la seule
                # à ne rien sourcer.
                tool_sources = [s for a in tool_actions for s in (a.get("sources") or [])]
                if tool_sources:
                    context["sources"] = merge_sources(context.get("sources"), tool_sources)
                context["sources"] = sources_that_served(context.get("sources"), tool_actions)
                # #2955 (#2394.57, décision Louis 28/09) — les fils de
                # messagerie lus ce tour entrent dans l'état de conversation
                # persisté (`chat_messages.context.mail_threads`), pour que
                # `MailboxService` puisse vérifier plus tard un destinataire
                # SANS jamais relire la messagerie elle-même.
                tool_mail_threads = [t for a in tool_actions for t in (a.get("mail_threads") or [])]
                if tool_mail_threads:
                    context["mail_threads"] = merge_mail_thread_hints(context.get("mail_threads"), tool_mail_threads)
                # Actions PRÉPARÉES, pas faites : le copilote propose, l'utilisateur
                # exécute au clic. Elles sortent de la liste des actions faites pour
                # que l'interface ne puisse pas les confondre.
                pending = [a["proposal"] for a in tool_actions if a.get("proposal")]
                if pending:
                    context["pending_actions"] = pending
                # #2276.1 — la demande complexe devenue un JOB : la fiche posée
                # par `plan_laura_job`, avec la demande VERBATIM. L'API la valide,
                # la persiste « À confirmer » et la remplace par la vue du job.
                laura_job = laura_job_of_turn(tool_actions, req.message)
                if laura_job:
                    context["laura_job"] = laura_job
                # La clarification demandée, avec ses options CLIQUABLES. Elle
                # est portée à part des actions : ce n'est ni quelque chose de
                # fait, ni quelque chose à valider — c'est une question, et
                # l'écran doit pouvoir la rendre comme telle.
                clarification = next(
                    (a["clarification"] for a in tool_actions if a.get("clarification")),
                    None,
                )
                if clarification:
                    context["clarification"] = clarification
                # #2679 — les réponses possibles des précisions posées DANS le
                # texte. Champ FRÈRE de `clarification`, jamais rangé dedans :
                # sa présence, elle, décide la borne d'une clarification par fil
                # et l'exonération du plafond du copilote (`chat-quota.ts`,
                # GA-90). Une précision en texte n'ouvre ni l'une ni l'autre —
                # elle propose des réponses, c'est tout. Clé absente quand le
                # modèle n'a rien émis de structuré : l'écran ne rend alors
                # AUCUN bouton, et rien n'est deviné de la prose.
                reply_options = [
                    precision for action in tool_actions for precision in (action.get("reply_options") or [])
                ]
                if reply_options:
                    context["reply_options"] = reply_options
                # #1950.4 / .7 / .12 / .13 — le résumé du plan (objectif,
                # résultats attendus, données manquantes, impossibles). Champ
                # FRÈRE, absent quand le modèle n'a rien résumé : l'écran ne
                # rend alors aucune ligne, rien n'est deviné de la prose.
                plan_brief = next((a["plan_brief"] for a in tool_actions if a.get("plan_brief")), None)
                if plan_brief:
                    context["plan_brief"] = plan_brief
            # #3186 — la carte « Renseigner le mode contractuel » est posée par le
            # serveur, avec ou sans outil appelé ce tour (le modèle ne la proposait pas).
            missing_mode_card = missing_contract_mode_proposal(req.profile_data, req.message)
            if missing_mode_card:
                pending_cards = list(context.get("pending_actions") or [])
                if not any(c.get("route") == missing_mode_card["route"] for c in pending_cards):
                    context["pending_actions"] = [*pending_cards, missing_mode_card]
        else:
            # Kill-switch : pas d'orchestrateur, donc pas de streaming — le
            # texte revient bufferisé, exactement comme avant ce lot. C'est le
            # chemin dégradé, pas le chemin nominal.
            # #2248 — le repli suit le MÊME palier que la boucle : même
            # résolution, même nom de coût. Sans réglage de palier, `task` et
            # `prompt_name` valent tous deux `bellum_chat` — l'appel d'avant.
            chat_route = resolve_chat_route("bellum_chat", req.message, tier_context)
            reply, _usage = await call_claude(
                system,
                user,
                max_tokens=4000,
                prompt_name=chat_route.cost_name,
                task=chat_route.task,
                model=model_for("bellum_chat"),
            )

        # Second verrou sur ce qui SORT (COP-SEC, audit terrain du 17/08). Le
        # prompt interdit de restituer une clé, un jeton ou un webhook ; une
        # consigne est précisément ce qu'une injection cherche à retourner. Le
        # filtre lit la FORME du texte et masque avant persistance — sinon le
        # secret vivrait dans l'historique et repartirait dans les prompts
        # suivants, longtemps après que l'écran l'a affiché une fois.
        # #1914 — une carte (bloc `bellum-block`) sort VALIDÉE ou redevient du
        # texte, AVANT la persistance ci-dessous et avant l'événement `done` :
        # ni l'écran ni la mémoire de fil ne voient un JSON refusé.
        # #3202 — un texte final vide ne sort jamais nu (l'écran y posait « Pas de réponse. »).
        # #2770 (recette prod 08/10) — SAUF quand une carte (`pending_actions`, ex.
        # `propose_focus_plan`) sort déjà de ce tour : elle EST la réponse, le repli
        # d'échec ne se pose jamais par-dessus (un second envoi dans le même fil
        # affichait la carte ET « Je n'ai pas pu rédiger de réponse ce tour »).
        if not reply.strip() and not context.get("pending_actions"):
            reply = _empty_reply_fallback(req, context.get("actions") or [])
        reply = normalize_reply_blocks(graft_listing_cards(redact_secrets(reply)))
        # #4288.1 (#3905.5) — l'ordre de la cascade comptes (espace → registre → web) est annoncé en une ligne.
        reply = announce_cascade_order(reply, req.message, context.get("actions") or [])
        # #3758 — ce que le tour a RÉELLEMENT rendu pour sa famille : un repli en
        # texte d'une famille connue est le défaut du retour, il se mesure et
        # voyage jusqu'à l'écran (qui propose de le relancer en carte). Journalisé
        # SANS CONTENU : deux valeurs d'énumération.
        family_outcome = reply_family_outcome(reply_family, reply, context.get("actions") or [])
        if reply_family and family_outcome:
            logger.info("Famille de réponse (#3758): %s", {"family": reply_family, "outcome": family_outcome})
            context = {**context, "reply_family": {"family": reply_family, "outcome": family_outcome}}
        # #3482 — la phrase de statut d'un travail interrompu n'ouvre pas une réponse que rien n'a interrompue.
        reply = strip_status_preamble(
            reply,
            user_message=req.message,
            failed_tools=frozenset(
                a.get("tool", "") for a in (context.get("actions") or []) if a.get("status") in ("error", "failed")
            ),
        )
        # #3437 — jamais « Première tranche : » en tête d'une réponse.
        reply = strip_slice_preamble(reply)
        # #3443.1 — sans compte nommé (ni compte actif, ni outil exécuté ce tour), la clôture ne réclame pas un compte.
        reply = strip_unnamed_account_closing(
            reply,
            account_named=bool(req.account_id or (req.account_data or {}).get("company_name") or context.get("actions")),
        )
        # #3857 — « les options sont juste dessous » sans aucun bouton transmis : la promesse ne sort pas.
        reply = strip_unbacked_options_announcement(reply, has_options=has_clickable_options(context))
        # #3215 — le pied de sources ne contredit pas la précision « aucun outil ».
        if context.get("sources"):
            context = {**context, "sources": sources_consistent_with_reply(context.get("sources"), reply)}

        # #2450.8/.9/.12 (épopée #2882) — la limite se DIT, en tête de réponse
        # (donc aussi dans l'historique persisté juste en dessous) : jamais un
        # champ de métadonnées que seul un écran qui le lit rendrait visible.
        if mode_notice:
            reply = f"{mode_notice}\n\n{reply}"

        # #4656 (recette prod 27/10, EXOTEC) — jamais un mot d'un autre alphabet dans ce qui SORT, quel que soit le
        # chemin (orchestrateur OU repli `call_claude`) ; seuls les noms déjà présents dans les données du compte
        # restent. Idempotent après la garde de l'orchestrateur (R40), qui ne couvrait pas le repli.
        # Une valeur dont `str()` LÈVE (vu par `test_chat_stream_serialization`) ne doit pas faire tomber le
        # tour ICI : le filet du flux (`event_stream`, plus bas) est celui qui rend la carte honnête, et c'est
        # lui qui NOMME le type fautif. Cette garde est cosmétique : sans noms connus elle en fait moins,
        # elle ne casse rien. Le journal nomme le CHEMIN et le TYPE, jamais le contenu (D65).
        try:
            known_text = json.dumps([req.account_data, context.get("actions") or []], ensure_ascii=False, default=str)
        except Exception:
            logger.warning(
                "Garde d'alphabet : contexte non sérialisable (%s) — les noms connus viennent du seul message.",
                describe_unserializable([req.account_data, context.get("actions") or []]) or "cause non localisée",
            )
            known_text = ""
        reply = strip_stray_foreign_script(reply, user_message=req.message, known_text=known_text)

        # Persist the turn so the conversation accrues (best-effort, non-blocking).
        # #3367 — un tour qui porte une clé de fil est déjà écrit par l'app web
        # (`POST /ia/chat/messages`, SOUS cette clé) : le réécrire ici SANS clé
        # faisait de chaque question un faux « fil » d'une ligne dans la liste.
        with langfuse_client.span("persistence"):
            if not req.conversation_id:
                await conversation_service.save_turn(req.user_id, req.workspace_id, req.account_id, "user", req.message)
                await conversation_service.save_turn(req.user_id, req.workspace_id, req.account_id, "assistant", reply)

        # #3193.2/.3 (épopée #3217) — le reçu de connaissance structuré, onze
        # couches nommées, posé une seule fois ICI : après que le tour a fini
        # d'exécuter ses outils, donc `context["sources"]`/`context["mail_threads"]`
        # portent déjà tout ce qui a été RÉELLEMENT consulté ce tour (voir
        # `merge_sources`/`merge_mail_thread_hints` plus haut). Pure projection,
        # aucun second appel.
        # #3177.5/#3193.10 (recette prod 29-30/09) — les outils APPELÉS ce tour
        # et ressortis en erreur, depuis `context["actions"]` (déjà posé plus
        # haut, jamais un second calcul — GA-26) : sans ce lien, une couche
        # appelée ET tombée en panne (`search_market_memory` sur le groupe La
        # Poste après le budget élargi à 20 s, lot M01) se lisait « non
        # demandée », comme si Laura n'avait rien tenté.
        # #3193.10 suite (recette prod 30/09, après a691931572) — « Indisponible »
        # restait invisible en prod : `chat_orchestrator.py` pose `status="error"`
        # UNIQUEMENT quand l'outil répond sans lever (`{"error": ...}`), et
        # `status="failed"` quand il LÈVE (panne réseau, timeout…) — le cas le
        # plus fréquent en prod. Ne filtrer que `"error"` ratait donc la quasi-
        # totalité des pannes réelles ; les deux statuts sont un ÉCHEC RÉEL de
        # l'outil, jamais un `"unknown"` (timeout d'écriture, doctrine : n'arrête
        # jamais la reprise) ni un `"pending_confirmation"`.
        failed_tools = frozenset(
            a.get("tool", "") for a in (context.get("actions") or []) if a.get("status") in ("error", "failed")
        )
        context["knowledge_receipt"] = build_knowledge_receipt(
            context,
            crm_connected=req.crm_connected,
            crm_unavailable=req.crm_unavailable,
            email_connected=req.connected_families is None or "email" in req.connected_families,
            copilot_tools_enabled=_chat_tools_enabled(),
            failed_tools=failed_tools,
            language=getattr(req, "interface_language", "fr") or "fr",
            excluded_families=frozenset(req.excluded_families or ()),
        )

        # Reproducibility stamp (Théo p.15): expose WHICH advisor prompt version
        # produced this reply, the same way an analysis run stamps its
        # prompt_versions — so a chat answer is auditable / replayable too.
        # `context` (transparency) is additive alongside the version stamp.
        # #5086 — absent sans note : enveloppe d'avant au bit près.
        if reply_notes_sink:
            context = {**context, "reply_notes": list(dict.fromkeys(reply_notes_sink))}
        data = {
            "reply": reply,
            "context": context,
            "prompt_version": prompt_version_for("advisor"),
        }
        # #1949.23 — la trace d'une demande que Laura n'a pas su router. Absente
        # ⇒ AUCUNE clé, enveloppe d'avant au bit près (même règle que l'état).
        if unrouted_intent:
            data["unrouted_intent"] = unrouted_intent
        # #2450.8/.9/.12 — le repère MACHINE, même convention que
        # `context.partial` (`_partial_response`) : absent tant qu'aucun
        # conflit n'a été détecté, chemin byte-identique à avant cette fonction.
        if mode_notice:
            data["context"]["mode_notice"] = {"reason": "quality_floor_actuality", "requested_mode": "rapide"}
        # #3229 (recette prod 30/09) — `mode_explanation` est décidé AVANT le
        # tour, sur le seul TEXTE de la demande (`choose_chat_tier`).
        # `turn_observability` (`_note_turn_observability`,
        # `chat_orchestrator.py`) est décidé APRÈS, sur l'EXÉCUTION réelle.
        # Contradiction mesurée : Laura affichait « demande courante, donc j'ai
        # répondu directement avec ce que je savais déjà » (reason « default »)
        # sur le MÊME tour où « Approfondissement » affichait « délai du tour
        # atteint / mode dégradé » — un tour `degraded_answer=True` a justement
        # épuisé son budget en cherchant sur plusieurs passages avant de rendre
        # une tranche, l'exact opposé de « répondu directement ». Seuls
        # « default » et « mode_rapide » affirment ce « sans recherche
        # supplémentaire » (« avec ce que je savais déjà », « sans recherche
        # publique », `_TIER_REASON_EXPLANATIONS`) : les autres motifs
        # (« j'ai pris le temps de… », « j'ai vérifié… ») restent vrais même
        # dégradés, et gardent leur explication.
        turn_degraded = bool(turn_observability_sink) and turn_observability_sink[-1].degraded_answer
        explanation_contradicts_degraded_turn = turn_degraded and tier_decision.reason in (
            "default",
            "mode_rapide",
        )
        if mode_explanation and not explanation_contradicts_degraded_turn:
            # #2448.10 (reste partiel, épopée #2882) — le contrat technique de
            # traçabilité par tour que l'issue demande : `requested_mode` (le
            # geste de la personne, `None` quand aucune surface n'en a posé)
            # et `tier` (le palier RÉELLEMENT choisi, `tier_decision.tier`) —
            # les deux valeurs que CE tour a déjà calculées plus haut, jamais
            # une donnée inventée pour l'occasion. Les autres champs que
            # l'issue nomme (`tool_budget`, `reasoning_budget`, `max_duration`,
            # `estimated/reserved/actual_credits`, `sources_allowed`,
            # `freshness_requirement`, `async_allowed`, `profile_context_version`,
            # `workspace_context_version`) restent absents : aucun ne calcule
            # encore de valeur réelle ailleurs dans ce module (voir #2882.1).
            data["context"]["mode_explanation"] = {
                "reason": tier_decision.reason,
                "text": mode_explanation,
                "requested_mode": tier_context.requested_mode,
                "tier": tier_decision.tier,
            }
        # #3176.10 (épopée #3216) — l'observabilité du SourcePlan, câblée sur
        # les appels d'outils RÉELS de ce tour (`collected`, rempli par
        # l'orchestrateur — chaque entrée porte `entry["tool"]`), jamais sur la
        # seule lecture du message. Absente sans marqueur détecté : même
        # contrat additif que `mode_explanation` ci-dessus.
        source_plan_trace = observe_source_plan(
            source_plan_match, source_plan, [a["tool"] for a in collected if a.get("tool")]
        )
        if source_plan_trace is not None:
            data["context"]["source_plan"] = source_plan_trace.to_wire()
        # #214.1 (réel, épopée #3229) — même contrat additif : absent sans
        # marqueur de population large détecté dans le message.
        if search_universe is not None:
            data["context"]["search_universe"] = search_universe.to_wire()
        # #3229 — le DERNIER rapport du tour (une recherche affinée remplace la
        # précédente) ; absent quand aucun outil n'en a construit.
        if coverage_sink:
            data["context"]["coverage_report"] = coverage_sink[-1]
        # #1927.10 — l'état PROLONGÉ par ce tour repart vers l'API, qui le
        # stocke avec le résumé de la conversation (jamais relayé au
        # navigateur). Un état vide n'ajoute AUCUNE clé : la réponse d'un fil
        # sans état reste byte-identique à celle d'avant #1927.
        thread.narrow_to_reply(reply)  # #5054 r4 — « compare-les » = les comptes que la réponse NOMME
        if not thread.state.is_empty():
            data["thread_state"] = thread.state.to_wire()
        # #3227 (recette prod 01/10) — le périmètre de groupe que Laura garde pour
        # ce fil (`note_thread_context`) devient LISIBLE sous la réponse : « L'appel
        # note_thread_context n'est pas observable depuis l'UI ». Des LIBELLÉS
        # seulement — les identifiants restent dans `thread_state`, jamais relayé
        # au navigateur. Absent sans racine posée : réponse byte-identique.
        _scope = thread.state.persistent_scope
        if _scope is not None:
            data["context"]["thread_scope"] = {
                "root": _scope.root_entity.label,
                "included": [obj.label for obj in _scope.included_entities],
                "excluded": [obj.label for obj in _scope.excluded_entities],
                "unresolved": list(_scope.unresolved_entities),
            }
        return ChatResponse(success=True, data=data)

    except Exception as exc:
        # Don't dress a failure up as a successful reply, and don't leak the raw
        # exception (it would also get echoed into client-side history and pollute
        # later prompts). success=False; nothing is persisted.
        #
        # #1950.1 / #1950.21 — ET ON NE REFUSE PLUS EN BLOC : si des outils
        # avaient TERMINÉ, ce qu'ils ont lu est rendu, daté, nommé partiel —
        # exactement comme sur la branche du temps. Rien de lu ⇒ la carte
        # générique, byte-identique : un « résultat partiel » fabriqué à partir
        # de rien serait une donnée fictive.
        logger.error("Chat error: %s: %s", type(exc).__name__, exc, exc_info=exc)
        langfuse_client.note_turn_status("failed")  # #2442.11
        # #R10B-FIX.2 — surcharge persistante du fournisseur : « saturée », pas « erreur ».
        wording = _OVERLOAD_WORDING if isinstance(exc, ProviderOverloaded) else _FAILURE_WORDING
        return _partial_response(req, context, collected, wording)


@router.post("/message")
async def chat_message(req: ChatRequest, request: Request) -> StreamingResponse:
    """Diffuse la réponse du copilote en Server-Sent Events.

    LOT STREAM (12/09/2026) — Laura ne diffusait RIEN : un tour qui peut
    légitimement consommer 90 s (`CHAT_TURN_BUDGET_S`) rendait un JSON
    complet en un seul bloc, donc un indicateur générique pendant TOUTE cette
    durée. Trois types d'événements, chacun une ligne ``data: {...}`` :

    * ``{"type": "delta", "text": …}`` — un fragment du texte final, dans
      l'ordre où le modèle l'écrit (voir `_AnthropicTurns.send` /
      `_OpenAITurns.send`, qui diffusent CHAQUE aller-retour, pas seulement le
      dernier — la mesure du 16/08 dit qu'un tour de production n'appelle
      quasiment jamais un outil deux fois, donc la réponse la plus fréquente
      part dès le PREMIER aller-retour).
    * ``{"type": "step", "label": …}`` — un outil démarre (« Lecture de ta
      messagerie… »), avant son exécution.
    * ``{"type": "done", "success": …, "data": {...}}`` — la MÊME forme que
      l'ancien corps JSON de cet endpoint (`ChatResponse.model_dump()`),
      TOUJOURS le dernier événement du flux. Un client qui ignore
      `delta`/`step` et n'attend que `done` retrouve le comportement d'avant
      ce lot au bit près.

    Reprend le pompe+file+keepalive de `graph_analyze.analyze` (même raison :
    un silence de plusieurs secondes ne doit jamais ressembler à un flux mort
    pour un proxy qui idle-close). La génération tourne dans une tâche de
    fond ; le générateur SSE ne fait que lire la file — annuler une lecture en
    attente ne peut donc jamais couper le tour en cours au milieu d'un appel
    modèle.
    """

    async def event_stream() -> AsyncIterator[str]:
        queue: asyncio.Queue = asyncio.Queue()
        done = object()
        # #2442.3 — l'id du message et les étapes de l'API (`ChatTurnClock`).
        api_turn = parse_turn_header(request.headers.get(TURN_HEADER))
        # #2445.6 (#2442.16, épopée #2766) — posé AVANT la création de `pump`
        # (plus bas) : la tâche asyncio en hérite par copie de contexte, et
        # `execute_chat_tool` (`chat_tools.py`) le relit sans qu'aucune
        # fonction intermédiaire n'ait à le porter. `None` si l'en-tête est
        # absent/malformé : aucun enregistrement, comportement byte-identique.
        set_current_turn_id(api_turn.message_id)

        async def emit(event: dict) -> None:
            # #2442.11 — date le premier statut / premier jeton du tour ; le
            # TYPE de l'événement seulement, jamais son texte.
            langfuse_client.note_turn_event(str(event.get("type") or ""))
            await queue.put(event)

        async def _pump() -> None:
            # ⚠️ #2354 — `except Exception`, PAS `except BaseException` : ce
            # filet ne doit PAS attraper `asyncio.CancelledError`.
            # `pump.cancel()` (plus bas, dans le `finally` du consommateur)
            # dépend de CETTE propagation pour que `await pump` se termine —
            # une déconnexion client normale deviendrait sinon une fausse
            # « Chat stream error » journalisée pour rien. Décision : laisser
            # cette porte ouverte EXPRÈS, elle n'est pas la même que celle de
            # `_sse()` ci-dessous (une rupture de SÉRIALISATION, elle,
            # n'a aucune raison de ressembler à une annulation).
            try:
                # #2442.3 / #2442.4 — UNE trace par tour, liée ICI pour couvrir
                # récupération, mémoire et persistance ; l'orchestrateur la
                # rejoint. trace_id = correlation-id posé par l'API (#2442.2).
                identity = turn_identity(
                    user_id=req.user_id,
                    workspace_id=req.workspace_id,
                    conversation_id=req.conversation_id,
                    account_id=req.account_id,
                    message=req.message,
                    history=req.history,
                    document_ids=req.document_ids,
                    pinned_facts=req.pinned_facts,
                    crm_connected=req.crm_connected,
                    interface_language=getattr(req, "interface_language", "fr") or "fr",
                )
                # #2442.12 (épopée #2879) — le registre de coûts DU TOUR. Celui
                # du middleware repart dans l'en-tête `x-bellum-costs`, figé au
                # premier octet d'un flux : il partait vide pour le chat.
                with cost_ledger.bind_run("chat_turn"), langfuse_client.bind_trace(
                    "chat_turn",
                    user_id=identity.user,
                    session_id=get_correlation_id() or None,
                    metadata={
                        **identity.metadata,
                        **({"messageId": api_turn.message_id} if api_turn.message_id else {}),
                    },
                    summarize=True,
                ):
                    # Les étapes de l'API AVANT ce service (quota, contexte).
                    for stage, stage_ms in api_turn.stages_ms.items():
                        langfuse_client.note_turn_stage(f"api.{stage}", stage_ms)
                    result = await _run_chat_turn(req, emit)
                    if result.success:
                        langfuse_client.note_turn_status("ok")
                    else:
                        # timeout / panne l'ont déjà posé ; sinon, un échec.
                        langfuse_client.note_turn_status("failed", keep_existing=True)
                    # #2442.12 (épopée #2879) — chaque outil qui parle à un
                    # fournisseur externe (Brave…) passe par `throttle()`, qui
                    # alimente déjà `run_metrics` sous CE correlation-id ; on ne
                    # fait que le transporter vers le récapitulatif du tour.
                    turn_metrics = run_metrics.get_metrics(get_correlation_id() or "")
                    if turn_metrics:
                        langfuse_client.note_turn_provider_costs(provider_pricing.price_run(turn_metrics))
                    # #2442.12 — fournisseur par fournisseur, OUTIL par outil
                    # (`cost_ledger.bind_tool`, posé par l'orchestrateur). Rien
                    # mesuré ⇒ aucune clé, jamais une liste vide lue « gratuit ».
                    turn_costs = cost_ledger.snapshot()
                done_event = {"type": "done", **result.model_dump()}
                if turn_costs and isinstance(done_event.get("data"), dict):
                    # Retiré par l'API AVANT le navigateur (`ia-proxy.controller.ts`) :
                    # un client ne voit jamais nos coûts (D19).
                    done_event["data"] = {**done_event["data"], "turn_costs": turn_costs}
                await queue.put(done_event)
            except Exception as exc:  # filet DU filet — `_run_chat_turn` a déjà le sien
                # Un flux qui casse en cours ne doit ni pendre ni rendre une
                # réponse inventée : le client reçoit quand même un `done`
                # honnête, dans la MÊME forme que le repli nommé plus haut.
                logger.error("Chat stream error: %s: %s", type(exc).__name__, exc, exc_info=exc)
                # #1950.1 — ce filet n'a AUCUN accumulateur à lire (la panne est
                # dans le pompage du flux, pas dans le tour), donc pas de partiel
                # possible ici : seule la langue de l'interface change.
                await queue.put(
                    {
                        "type": "done",
                        "success": False,
                        "data": {"reply": _FAILURE_WORDING[_interface_key(req)].whole},
                    }
                )
            finally:
                await queue.put(done)

        pump = asyncio.create_task(_pump())
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=_KEEPALIVE_SECONDS)
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if item is done:
                    break
                try:
                    yield _sse(item)
                except Exception as exc:
                    # #2354 — filet DU filet DU filet. `_sse()` a désormais le
                    # MÊME traitement que `_tool_payload()` (`default=str`,
                    # voir `dumps_json_safe`), mais une clé non-str, un objet
                    # dont `str()` lève, ou une référence circulaire peuvent
                    # encore le faire échouer. Sans CE filet, l'exception
                    # traversait ce générateur et le flux mourait EN SILENCE
                    # après que les en-têtes 200 étaient déjà partis —
                    # exactement le symptôme mesuré sur « ouvre la veille »
                    # (12 s, `STREAM_FAILURE_REPLY` côté Node, AUCUNE ligne
                    # dans ce journal). On nomme ce qui a cassé — CHEMIN et
                    # TYPE, jamais son contenu (D65) — et on rend la carte
                    # honnête au lieu de mourir. ⚠️ On ne journalise PAS
                    # `str(exc)` : un `__str__` métier qui lève peut porter un
                    # message construit à partir de la valeur elle-même — seul
                    # le TYPE de l'exception est sûr.
                    logger.error(
                        "Chat stream serialization error: %s (%s)",
                        type(exc).__name__,
                        describe_unserializable(item) or "cause non localisée",
                    )
                    yield _sse(
                        {
                            "type": "done",
                            "success": False,
                            "data": {"reply": _FAILURE_WORDING[_interface_key(req)].whole},
                        }
                    )
                    break
        finally:
            pump.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await pump

    return StreamingResponse(event_stream(), media_type="text/event-stream")
