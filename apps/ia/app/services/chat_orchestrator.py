"""Boucle d'orchestration du Copilote (restitution V2 §12-14).

Le chat classique (`call_claude`) renvoie du TEXTE. Ici on ajoute une boucle
`tool_use` Anthropic : le modèle peut appeler un outil (`chat_tools.CHAT_TOOLS`),
on l'exécute, on lui renvoie le résultat, et on recommence jusqu'à une réponse
finale — puis on renvoie le texte + la liste des actions réellement exécutées.

Isolé du chemin `claude_service._call_text` par design : quand le flag est OFF,
`/chat/message` n'importe même pas ce module et reste byte-identique. Réutilise
le MÊME modèle / client / throttle / cache système que le reste de l'IA.

Un tour de copilote a un BUDGET (16/08/2026). Il n'en avait aucun : quatre tours
d'outils plus un tour final, à 60 s de délai *par appel*, plafonnaient à 300 s
face à un appelant NestJS qui coupe à 120 s. Un budget intérieur plus large que
le budget extérieur ne produit pas une réponse tardive — il produit un 500, et
c'est ce qu'ont vu les trois seuls messages de copilote du 15-16/08. Le budget
est donc borné ici, sous celui de l'appelant, et ce qui déborde dégrade la
réponse au lieu de l'annuler.

DEUX PROTOCOLES D'OUTILS, UNE SEULE BOUCLE (28/08/2026)
------------------------------------------------------

``bellum_chat`` est la première ligne annoncée de la facture IA : jusqu'à trois
appels par tour, la conversation entière renvoyée à chaque aller-retour.
``gpt-5.6-luna`` est à ÷10 sur l'entrée et ÷8,3 sur la sortie.

Pourquoi un changement de CODE était nécessaire, et pas une variable : la boucle
appelle le client Anthropic en direct, donc hors de ``call_claude`` et hors de la
passerelle — **aucun ``LLM_ROUTE_*`` ne pouvait l'atteindre.** Et le protocole
d'outils d'Anthropic (``stop_reason == "tool_use"``, blocs ``tool_use`` puis
``tool_result``) n'est pas celui d'OpenAI.

Pourquoi ``/v1/responses`` et pas ``/v1/chat/completions`` — mesuré en direct sur
les identifiants de production le 28/08/2026 :

* ``/v1/chat/completions`` + outils → **400** : « Function tools with
  reasoning_effort are not supported for gpt-5.6-luna … use /v1/responses or set
  reasoning_effort to 'none' » ;
* le même, avec ``reasoning_effort='none'`` → passe, mais le modèle NE RAISONNE
  PLUS (c'est le contournement que porte ``llm_gateway`` pour les sorties
  structurées, et son coût de qualité y est écrit) ;
* ``/v1/responses`` + outils + ``reasoning={"effort": "low"}`` → passe, outils ET
  raisonnement. C'est le seul chemin qui garde les deux, donc le seul acceptable
  pour un copilote conversationnel.

La forme retenue : **une boucle, deux transports.** Le filtrage de capacité, la
borne de clarification, le budget, l'exécution des outils, la liste ``actions``,
les spans et le comptage vivent une seule fois ; seule la mise sur le fil change.
Ce qui ne change pas non plus : Laura PROPOSE et n'envoie jamais — le catalogue
d'outils est le MÊME objet des deux côtés, simplement traduit, si bien que la
branche OpenAI ne peut structurellement pas atteindre un outil que la branche
Anthropic n'a pas.

Par défaut (aucun ``LLM_ROUTE_CHAT``, aucun ``OPENAI_API_KEY``), la destination
résolue est Anthropic + le modèle de ``model_policy`` : le chemin est celui
d'avant, à l'octet.

LOT STREAM — LAURA NE DIFFUSE RIEN (12/09/2026)
------------------------------------------------

Chaque aller-retour modèle (round d'outils COMPRIS, pas seulement le tour
final) part désormais par le SDK streamé (``messages.stream()`` côté
Anthropic, ``responses.create(..., stream=True)`` côté OpenAI) au lieu de
``.create()`` bufferisé. Un ``emit`` (callback async, no-op par défaut)
reçoit chaque delta de texte AU FUR ET À MESURE qu'il arrive, et un
événement ``step`` avant l'exécution de chaque outil.

Pourquoi TOUS les rounds et pas seulement le tour final garanti
(``tools=None``) : la mesure du 16/08 dit qu'aucun tour de production
n'appelle un outil plus d'une fois — donc la réponse la plus fréquente est
déjà celle du PREMIER aller-retour (`if not turn.tool_calls: return
turn.text, actions`), jamais celle du tour final bufferisé en bas de la
boucle. Ne diffuser QUE ce dernier aurait laissé le cas le plus courant
— et le plus lent — sans aucun signal, ce qui est exactement le défaut que
ce lot corrige.

Le SDK Anthropic livre les blocs de contenu dans l'ORDRE (un bloc texte
complet avant qu'un ``tool_use`` suivant ne démarre) : le texte d'un round
qui finit par appeler un outil peut donc avoir été diffusé AVANT qu'on sache
qu'un outil serait appelé. Ce n'est jamais persisté ni renvoyé comme réponse
(seul le texte du tour qui n'appelle aucun outil l'est, exactement comme
avant ce lot) — c'est un supplément de transparence, jamais un changement du
contrat `(reply, actions)`. ``emit`` par défaut ne fait rien : un appelant
qui ne diffuse pas (tous les tests existants) obtient un `_ModelTurn`
strictement identique à celui d'avant ce lot.

Deux gardes tiennent ce lot, toutes deux dans ``tests/test_chat_orchestrator.py`` :

* **GA-307** — l'ORDRE, jamais une durée : au moins un ``delta`` a été observé
  par ``emit`` AVANT que le tour ne rende sa réponse complète
  (``test_deltas_arrive_before_the_turn_completes_and_concatenate_to_the_reply``).
* **GA-308** — le REPLI : un flux qui casse EN COURS (une coupure réelle, pas
  un timeout SDK nommé) se propage tel quel plutôt que de pendre ou de rendre
  un succès inventé — c'est `chat.py` qui la transforme en réponse honnête
  (``test_a_broken_stream_propagates_instead_of_hanging_or_swallowing``, et
  côté routeur ``tests/test_chat.py::test_a_broken_stream_falls_back_to_an_honest_terminal_event``).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import time
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, NamedTuple, cast

import anthropic

from app.access.rights_matrix import is_spending_tool
from app.middleware.correlation_id import get_correlation_id
from app.prompts.bellum_advisor import append_before_language_reminder
from app.prompts.fencing import fence
from app.prompts.laura_acts import (
    announce_line_from_output,
    ensure_announce_line,
    ensure_continues_line,
    ensure_offer_dates,
    ensure_widening_line,
    offer_dates_from_output,
    strip_relaunch_tail,
    widening_line_from_output,
)
from app.prompts.registry import prompt_version_for
from app.services import (
    chat_accounts_cascade as accounts_cascade,
)
from app.services import (
    chat_deepen_job_report,
    chat_resume_checkpoint,
    cost_ledger,
    langfuse_client,
    llm_gateway,
)
from app.services.account_next_steps import with_account_next_steps
from app.services.account_read_first import (
    account_contact_function_note,
    account_signals_note,
    city_company_search_city,
    city_company_search_note,
    contacts_at_named_company_note,
    expertise_people_at_company_note,
    framed_prospecting_note,
    is_account_signals_question,
    is_framed_prospecting_request,
    name_geo_codes,
    requested_contact_function,
    requested_contacts_at_named_company,
    requested_people_by_expertise_at_company,
)
from app.services.chat_content_guards import (
    violates_manual_navigation_instruction,
    violates_manual_redirect_instruction,
)
from app.services.chat_model_routing import ChatTierContext, mode_excluded_tool_names, resolve_chat_route
from app.services.chat_next_step import forced_next_step_kwargs, next_step, next_step_note
from app.services.chat_requested_mode import current_turn_thread
from app.services.chat_step_labels import step_label  # #3491
from app.services.chat_thread_state import ThreadStateCollector
from app.services.chat_tools import (
    NOTE_THREAD_CONTEXT_TOOL_NAME,
    PLAN_BRIEF_STATUS,
    PLAN_BRIEF_TOOL_NAME,
    REPLY_OPTIONS_STATUS,
    REPLY_OPTIONS_TOOL,
    REPLY_OPTIONS_TOOL_NAME,
    WRITE_TOOL_NAMES,
    cited_sources,
    execute_chat_tool,
    execution_id_hint,
    mail_thread_hints,
    missing_capabilities,
    profile_version_hint,
    scope_question_answered_by_acceptance,
    tools_for,
)
from app.services.chat_turn_plan import (
    TurnObservability,
    TurnPlan,
    build_turn_observability,
    call_signature,
    continues_alone,
    duplicate_call_names,
    is_economic_model,
    is_mail_reply_request,
    keeps_widening_after_sterile_round,
    numbers_missing_unit,
    plan_turn,
    record_turn_observability,
    requires_large_inspection,
    requires_multiple_searches,
    round_is_critical,
    tool_output_text,
    unjustified_absolute_claims,
    unverified_figures,
)
from app.services.claude_service import (
    PROVIDER_OPENAI,
    CallMetadata,
    TokenUsage,
    _build_usage,
    _cached_system,
    _get_api_key,
    _log_usage,
    _sampling_kwargs,
)
from app.services.commercial_verifier import LIMIT_ADDED, VerifierResult, repair_addendum, verify_response
from app.services.compilers.intent_router import (
    asks_alternatives_to_a_group,
    asks_contacts_by_zone,
    asks_for_a_closed_records_listing,
    asks_known_people_by_expertise,
    asks_projects_in_documents,
    asks_reverse_market_for_talent,
    asks_to_analyze_named_list,
    asks_to_launch_account_analysis,
    asks_to_prepare_an_action,
    asks_to_qualify_a_named_account,
    asks_what_to_do_this_week,
    asks_where_is_the_pain,
    asks_which_account_to_attack_first,
)
from app.services.constraint_graph import constraint_turn_addendum, split_constraint_turn_addendum
from app.services.contact_card_fallback import CONTACT_TOOL_NAMES, contact_block_from_tool_output
from app.services.deepening_engine import (
    DeepeningPass,
    decide_next_pass,
    delivers_result,
    has_open_conflict,
    pass_note,
    pass_step_label,
)
from app.services.deepening_gain import fresh_evidence, marginal_gain, record_round_gain
from app.services.direct_approach_guard import strip_redirect_question_when_direct  # #4060
from app.services.draft_prepared_sentence_guard import fix_unprepared_draft_sentence  # #4060.R12
from app.services.explicit_question_first import (
    answer_first_note,
    closest_role_first_note,
    is_explicit_lookup_form,
    is_high_level_contact_request,
    one_answer_per_turn,
)
from app.services.foreign_script_guard import strip_stray_foreign_script  # R40 (Thales)
from app.services.homonym_options import homonym_account_options, homonym_question
from app.services.internal_knowledge_digest import with_domain_knowledge
from app.services.json_safe import dumps_json_safe
from app.services.known_shape_gate import (
    manager_review_block_from_tool,
    meeting_recap_block_from_account_briefing,
    route_known_shapes,
    shape_read_from_tool,
)
from app.services.compare_card_tool import COMPARE_ACCOUNTS_TOOL_NAME, comparison_block_from_output
from app.services.laura_job_tool import LAURA_JOB_STATUS
from app.services.laura_no_money import strip_money
from app.services.laura_router import LauraAction, RoutingSignals, decide_action
from app.services.work_progress_tool import (
    GET_WORK_PROGRESS_TOOL_NAME,
    asks_work_progress,
    progress_answer_gate,
    progress_block_from_output,
)
from app.services.light_structure_request import light_scope_note
from app.services.mail_reply_request import mail_reply_note
from app.services.mailbox_triage_request import asks_to_triage_mailbox, mailbox_triage_note
from app.services.market_memory_citation import market_memory_citation_codes
from app.services.market_memory_group_addendum import group_reading_addendum
from app.services.model_policy import REASONING as REASONING_MODEL
from app.services.model_policy import model_for
from app.services.objection_first import approved_objection_note, ensure_approved_objection
from app.services.portfolio_geo_refine import portfolio_geo_refine_note, portfolio_geo_refinement
from app.services.prompt_cache_layout import ONE_HOUR, cache_ordered_tools, with_history_breakpoint
from app.services.prose_card_consistency import drop_prose_contradicting_cards, drop_prose_promising_missing_list
from app.services.purchasing_process_filter import light_purchasing_asked
from app.services.rate_limiter import SCOPE_SEPARATOR, RateLimitTimeout, throttle, wait_deadline
from app.services.search_universe import broad_request_instruction_block
from app.services.secret_redaction import StreamingRedactor
from app.services.skill_accounts_request import requested_skill, skill_accounts_note
from app.services.space_boundary_guard import market_memory_boundary_codes
from app.services.stale_need_formula import apply_stale_need_formula
from app.services.tool_call_leak import StreamingToolCallFilter, strip_tool_call_text
from app.services.tool_planner import summarize_and_record_round
from app.services.tool_resilience import execute_chat_tool_resilient
from app.services.tool_selection import SEARCH_TOOL_NAME, ToolSelection, tool_selection_enabled
from app.services.unrouted_intent import NOTED_STATUS, UNROUTED_INTENT_TOOL_NAME
from app.services.verdict_card_fallback import (
    VERDICT_TOOL_NAME,
    verdict_block_from_tool_output,
    verdict_status_of,
)

# #2268.1 / #2268.5 / #2268.10 — les outils SILENCIEUX : ils n'affichent aucune
# étape (`_execute_one_tool`) et, à côté d'un texte déjà écrit, terminent le
# tour sans payer un aller-retour de modèle de plus (comme
# `note_unrouted_request` depuis #1949.23).
# #2679 — `offer_reply_options` en est un aussi, et c'est TOUTE sa raison d'être :
# la précision posée dans le texte de la réponse ne doit pas coûter un tour de
# modèle de plus que la phrase qui la pose. Appelé à côté d'un texte déjà écrit,
# il termine donc le tour comme les deux autres.
# #1950.4 / .7 / .12 / .13 — `describe_plan` aussi : résumer un plan ne coûte
# pas un tour de modèle de plus que la réponse qui le propose.
_SILENT_TOOL_NAMES = (
    UNROUTED_INTENT_TOOL_NAME,
    NOTE_THREAD_CONTEXT_TOOL_NAME,
    REPLY_OPTIONS_TOOL_NAME,
    PLAN_BRIEF_TOOL_NAME,
)

# #2679 — recette prod du 23/09 (sha servi ed9d0881e) : après épuisement des
# `_MAX_TOOL_ROUNDS`, le tour final forcé passait `tools=None` — TOUS les
# outils disparaissaient, y compris `offer_reply_options`, alors que lui seul
# ne coûte ni un round ni un aller-retour de modèle de plus (c'est TOUTE sa
# raison d'être, voir plus haut). Un « Prépare-moi un message pour relancer »
# qui épuise ses deux rounds sur du travail réel (retrouver le contact, lire
# son historique) rendait alors sa précision de canal en texte nu, sans AUCUN
# moyen de la rendre cliquable : l'outil n'était même plus proposé au modèle.
# Le tour final continue de refuser tout AUTRE outil (aucune recherche, aucune
# écriture de plus — c'est la garantie que `_PARTIAL_TRANCHE_NOTE` promet), mais
# offre encore celui-ci, silencieux et gratuit par construction.
_FINAL_CALL_TOOLS = [REPLY_OPTIONS_TOOL]

# SDK OpenAI — importé sous garde, exactement comme dans ``llm_gateway`` : il
# n'est pas une dépendance dure de ce module, et son absence ne doit pas empêcher
# le service de démarrer. Absent ⇒ ``OpenAIProvider.is_available()`` vaut False
# ⇒ la route retombe sur Anthropic, donc on n'arrive jamais ici sans lui.
try:  # pragma: no cover - garde d'import
    import openai
except Exception:  # pragma: no cover - SDK absent
    openai = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

# Borne dure : au-delà, on force une réponse texte finale sans outils. Ramenée de
# 4 à 2 le 16/08 — chaque tour est un aller-retour Anthropic complet, et aucun des
# tours mesurés en production n'appelait deux fois un outil. Quatre tours, c'était
# surtout quatre occasions de dépasser le budget de l'appelant.
# #4438.1 / #4482 — ce n'est QUE le budget d'un tour SIMPLE (`SIMPLE_TURN_PLAN`). La boucle lit
# `plan.tool_rounds` : une recherche ou un croisement reçoit `RESEARCH_TOOL_ROUNDS` (8, décision Louis 21/10).
_MAX_TOOL_ROUNDS = 2

# #1943.3 — 3 cartes au plus par réponse, 1 principale (décision de Louis du
# 13/09). Une garde dans le CODE : la consigne du prompt est un conseil, pas un
# plafond. Au-delà, la proposition est abandonnée à la source (voir
# `_run_tool_round`) ; l'API refait la même coupe à la persistance. La valeur
# est lue par `packages/contracts/src/schemas/copilot-card.test.ts`
# (`MAX_CARDS_PER_REPLY`) : les deux langages ne peuvent pas diverger.
_MAX_CARDS_PER_REPLY = 3

# Ce que le modèle reçoit à la place d'une proposition abandonnée : il doit
# SAVOIR qu'elle ne s'affichera pas, sinon il annonce une carte absente.
_NOT_PROPOSED_OUTPUT: dict[str, Any] = {
    "status": "not_proposed",
    "message": (
        f"Plafond atteint : {_MAX_CARDS_PER_REPLY} actions au plus par réponse. Cette action n'est PAS "
        "proposée à l'utilisateur et n'apparaîtra pas : ne l'annonce pas."
    ),
}

# Budget d'un tour entier, en secondes. `CHAT_TURN_BUDGET_S` pour tuner sans
# redéploiement. Le plafond dur réellement observable est `budget +
# _MIN_CALL_TIMEOUT_S` : il doit rester SOUS le budget de l'appelant (120 s côté
# NestJS), sinon l'utilisateur voit une panne au lieu d'une réponse.
_DEFAULT_TURN_BUDGET_S = 90.0

# Délai d'un aller-retour Anthropic quand le budget ne le contraint pas.
_PER_CALL_TIMEOUT_S = 60.0

# En dessous de ce reste, on n'ouvre plus de tour d'outils : un tour, c'est un
# appel modèle PLUS l'exécution de l'outil PLUS le tour final. Le tenter avec
# trop peu de temps ne fait que garantir le dépassement.
_TOOL_ROUND_RESERVE_S = 25.0

# Plancher du tour final. Un tour final à 2 s ne rendrait rien : mieux vaut
# dépasser le budget de quelques secondes que rendre une réponse vide.
_MIN_CALL_TIMEOUT_S = 10.0

# #2269.14 / #2269.15 / #2269.16 — la demande est parfois plus large que ce
# qu'UN tour de copilote peut couvrir (« sors-moi tous les comptes du secteur
# banque avec leurs interlocuteurs »). Deux chemins mènent ici, et les deux
# sont le MÊME symptôme vu du modèle : le budget de TEMPS qui manque, ou
# `_MAX_TOOL_ROUNDS` épuisé alors qu'un appel d'outil restait en attente —
# dans les deux cas la boucle force une réponse SANS que le modèle ait fini
# son travail. Avant ce lot, seul le premier chemin recevait une note ;
# l'épuisement des rounds forçait une réponse muette sur la coupe.
#
# Trois règles tiennent ce texte, non négociables :
#   * une TRANCHE se dit comme telle, jamais comme un résultat complet
#     (2269.14) ;
#   * sa couverture se dit à partir de ce qui a été RÉELLEMENT lu — jamais un
#     total qu'on n'a pas mesuré (GA-18/GA-19 : « non mesuré » n'est jamais
#     « 0 », et n'est jamais « tout » non plus) (2269.15) ;
#   * ~~la suite se PROPOSE, elle ne part jamais toute seule (2269.16)~~ —
#     RENVERSÉ par #4438.2 (décision Louis 21/10, audit : 37 % des réponses
#     ratées étaient une tranche qui proposait la suite, 21 suites sur 277
#     acceptées). La suite part SEULE (`continues_alone`, tâche de fond de
#     reprise) : la réponse rend ce qu'elle a, dit en UNE ligne ce qui
#     continue, et ne pose aucune question.
_PARTIAL_TRANCHE_NOTE = (
    "Tu n'as plus de tour d'outil disponible pour cette réponse. Rends ce que tu as MAINTENANT, résultat "
    "d'abord, sans préambule. Ne le présente jamais comme un résultat complet : dis ce que cette réponse "
    "couvre à partir de ce que tu as RÉELLEMENT lu (un compte mesuré, ex. « 8 comptes lus » — jamais un "
    "total que tu n'as pas mesuré : si le total réel t'échappe, dis que le total est inconnu, ne dis jamais "
    "que c'est tout). Puis dis en une ligne ce qui continue (« Je poursuis sur le reste. »). Ne pose pas de "
    "question, ne propose pas de continuer, ne demande aucune confirmation. Ta réponse ne finit jamais sur "
    "« reste à faire » ni « restent à faire » : ce qui n'est pas encore là continue seul."
)

# R22-LG (recette prod 22/10, #4438.1 / #4408.1) — le tour final quand RIEN ne continue derrière lui (geste
# simple, ou recherche arrêtée après ses paliers stériles) : `_PARTIAL_TRANCHE_NOTE` y faisait promettre
# « Je poursuis sur le reste » — faux — et la réponse finissait sur « recherche externe… restent à faire ».
_FINAL_DELIVERY_NOTE = (
    "Tu n'as plus de tour d'outil disponible pour cette réponse. Rends ce que tu as MAINTENANT, résultat "
    "d'abord, sans préambule, à partir de ce que tu as RÉELLEMENT lu ; ne le présente jamais comme un résultat "
    "complet si tu n'as pas tout lu — jamais un total que tu n'as pas mesuré. "
    "Rien ne continue après cette réponse : n'écris jamais « je poursuis », « reste à faire » ni « restent à "
    "faire », ne dis jamais qu'un outil est indisponible ou « sera disponible », ne propose aucune suite, ne pose aucune question. Si un outil a échoué ou n'a rien rendu, dis en "
    "une ligne ce qui manque, puis livre le reste."
)

# R22-LG — un round de recherche STÉRILE (zéro résultat, outil en échec) n'est pas une fin
# (`keeps_widening_after_sterile_round`) : le modèle passe au palier suivant DANS ce tour (#4421, #4433).
_WIDEN_AFTER_STERILE_NOTE = (
    "Ce dernier appel n'a rien rendu (zéro résultat ou outil en échec). Ce n'est pas une fin : passe MAINTENANT "
    "au palier suivant, dans ce tour, sans demander — recherche externe (`run_account_search`, "
    "`find_accounts_for_talent` pour un consultant), secteur voisin, zone voisine (ville, puis 100 km autour, "
    "puis le département, puis la région et STOP — jamais la France toute seule, c144 —, un palier à la fois), compétence voisine. Un outil en échec : "
    "continue avec les autres. Dans la réponse, UNE phrase courte nomme le palier "
    "(« Rien à Toulouse en aéronautique : élargi au spatial et à l'Occitanie. »)."
)

# #4462.6 (retour Exteam 22/10) — « Je poursuis sur le reste. » écrit alors que rien ne continuait : la ligne
# n'est promise que si un travail continue RÉELLEMENT (`continue_alone`, tâche de fond de reprise) ; sinon le
# tour final est `_FINAL_DELIVERY_NOTE` (R22-LG), qui interdit aussi de dire qu'un outil est indisponible.


def _partial_tranche_note(*, continues: bool) -> str:
    return _PARTIAL_TRANCHE_NOTE if continues else _FINAL_DELIVERY_NOTE


# BELLUM-IA-M — le modèle a terminé son tour sans rédiger après avoir appelé des outils : le tour final
# lui demande d'écrire, sans nouvel outil, et de dire ce qui n'a pas abouti plutôt que de se taire.
_EMPTY_AFTER_TOOLS_NOTE = (
    "Tu as appelé des outils puis terminé ton tour sans écrire de réponse. Réponds maintenant, sans nouvel "
    "outil, à partir de ce que tu as RÉELLEMENT lu ; si un outil a échoué ou n'a rien rendu, dis-le "
    "explicitement — jamais un résultat que tu n'as pas obtenu."
)


def _analysis_outcomes(results: list[tuple[Any, Any, bool]]) -> tuple[list[str], list[str]]:
    """#4397 (N1) — (comptes dont l'analyse est PARTIE, comptes dont le lancement a échoué) sur un round.

    Partie = l'outil n'a rendu ni erreur ni ``launched: false`` : un lancement refusé n'est jamais compté."""
    started: list[str] = []
    failed: list[str] = []
    for call, output, is_error in results:
        if getattr(call, "name", None) == _NAMED_COMPANIES_TOOL_NAME and isinstance(output, dict) and not is_error:
            # #4462.1 — le lot nomme lui-même ce qui est parti et ce qui ne l'est pas.
            started.extend(str(row.get("company")) for row in output.get("launched") or () if isinstance(row, dict))
            failed.extend(str(row.get("company")) for row in output.get("not_launched") or () if isinstance(row, dict))
            continue
        if getattr(call, "name", None) != _START_ANALYSIS_TOOL_NAME:
            continue
        company = str((getattr(call, "input", None) or {}).get("company") or "").strip()
        if not company:
            continue
        refused = (
            is_error or not isinstance(output, dict) or bool(output.get("error")) or output.get("launched") is False
        )
        (failed if refused else started).append(company)
    return started, failed


def _launched_analyses_note(started: list[str], failed: list[str], language: str) -> str:
    """#4397 (N1) — la réponse forcée sans outil, après des lancements d'analyses, dit EN CLAIR lesquelles
    sont parties (noms, nombre) et qu'elles tournent seules — et rien d'autre. "" sans lancement."""
    if not started and not failed:
        return ""
    english = (language or "").lower().startswith("en")
    started_names = ", ".join(dict.fromkeys(started))
    failed_names = ", ".join(dict.fromkeys(failed))
    if english:
        parts = [
            "ANALYSES LAUNCHED THIS TURN — your answer is a plain summary of what the tools really did, nothing else."
        ]
        parts.append(
            f"Started ({len(dict.fromkeys(started))} analyse(s)): {started_names}."
            if started
            else "No analysis started."
        )
        if failed:
            parts.append(f"Not started (failed): {failed_names} — say so, never announce them as running.")
        # R22-LG — jamais « what is left to do » ni une offre de continuer : une analyse lancée tourne seule.
        parts.append(
            "Then say in one line that they run on their own and land on the account page. No question, no other content."
        )
        return " ".join(parts)
    parts = [
        "ANALYSES LANCÉES CE TOUR — ta réponse est un résumé net de ce que les outils ont RÉELLEMENT fait, rien d'autre."
    ]
    parts.append(
        f"Parties ({len(dict.fromkeys(started))} analyse(s)) : {started_names}."
        if started
        else "Aucune analyse n'est partie."
    )
    if failed:
        parts.append(f"Non parties (échec) : {failed_names} — dis-le, ne les annonce jamais en cours.")
    parts.append(
        "Dis ensuite en une ligne qu'elles tournent seules et arrivent sur la fiche du compte. Aucune question, "
        "aucun autre contenu."
    )
    return " ".join(parts)


_PROMPT_NAME = "bellum_chat"

# ── LOT 3, Défaut B — parallélisation des outils d'un même round ────────────
#
# `for call in turn.tool_calls: await execute_chat_tool(...)` payait la SOMME
# des latences au lieu du MAXIMUM quand le modèle demande plusieurs outils
# indépendants dans un seul message `tool_use`. Avec `_PER_CALL_TIMEOUT_S = 60`
# et `_TOOL_ROUND_RESERVE_S = 25`, un round à trois outils lents épuisait la
# réserve à lui seul.
#
# ⚠️ On ne parallélise PAS aveuglément. Deux catégories, EXHAUSTIVES et
# vérifiables — jamais devinées :
#   - ÉCRITURE : `WRITE_TOOL_NAMES` (les six propositions d'origine + les
#     bascules de réglages/routines/mémoire, toutes verrouillées par
#     `test_chat_write_tools.py` / `test_chat_settings_write_tool.py` /
#     `test_chat_pin_memory_fact_tool.py`) PLUS `start_account_analysis`, qui
#     n'y figure pas — il ne rend pas une `_proposal()`, il débite un crédit et
#     lance un job réel (`copilot-bridge.controller.ts::analysisStart` →
#     `AnalysisService.start`). Un outil qu'on ne peut pas PROUVER en lecture
#     seule reste séquentiel : c'est la règle, pas un oubli.
#   - LECTURE : tout le reste du catalogue.
#
# Une écriture n'est JAMAIS mêlée à un autre appel — lecture ou écriture —
# dans le même `asyncio.gather` : elle ouvre son propre lot d'UN SEUL appel,
# à sa place exacte dans `turn.tool_calls`. Les lectures adjacentes, elles,
# partent ensemble. Garde GA-296 (tests/test_chat_tool_round_concurrency.py).
# #4462.1 — `analyze_named_companies` lance une liste d'analyses : une écriture, jamais en lot de lectures.
_EXTRA_WRITE_TOOLS = frozenset({"start_account_analysis", "analyze_named_companies"})

# Largeur maximale d'un lot de lectures concurrentes. « Tout d'un coup »
# sature le pont interne et retiendrait N connexions Supabase/HTTP à la fois —
# un round réaliste appelle rarement plus de deux ou trois outils, cette borne
# est donc large sans ouvrir une rafale non maîtrisée.
_TOOL_FANOUT_LIMIT = 5


def _is_read_only_tool(name: str) -> bool:
    """Un outil est parallélisable SEULEMENT s'il n'est PROUVÉ nulle part comme
    une écriture. Voir la doc de `_EXTRA_WRITE_TOOLS` ci-dessus.

    #2445.4 (#2766) — filet DÉRIVÉ de `app/access/rights_matrix.py` : un outil
    de DÉPENSE (`SPENDING_TOOLS`) n'est JAMAIS lisible-en-lot, même si un futur
    outil de dépense oubliait d'entrer dans `WRITE_TOOL_NAMES`/
    `_EXTRA_WRITE_TOOLS` — sans changer le résultat d'aujourd'hui, où l'unique
    outil de dépense (`start_account_analysis`) est déjà dans les deux."""
    return name not in WRITE_TOOL_NAMES and name not in _EXTRA_WRITE_TOOLS and not is_spending_tool(name)


# Le client Anthropic REJOUE de lui-même (défaut du SDK : 2 tentatives de plus).
# Un délai de 60 s valait donc 180 s de temps réel, et quatre tours d'outils
# plafonnaient à 12 minutes — sans qu'aucune ligne de code ne le dise. Un budget
# qu'une bibliothèque peut multiplier par trois n'est pas un budget. Même
# arbitrage que `maxAttempts: 1` côté NestJS : un tour de copilote n'est pas
# idempotent, le rejouer triple la dépense sans changer le verdict, et un
# fournisseur momentanément saturé doit se dire au lieu de se cacher derrière
# trois minutes d'attente.
_CLIENT_MAX_RETRIES = 0

# Seau de jetons PROPRE au copilote (16/08). Il partageait `claude` avec le
# fan-out d'analyse : pendant un run, chaque appel du tour attendait son jeton
# derrière des lots de fond de 60 à 105 s, et le clic d'un commercial se réglait
# sur le rythme d'un traitement par lots. La latence de l'interactif ne doit
# jamais dépendre du travail de fond.
_THROTTLE_PROVIDER = "claude_chat"
# #3085.1 (18/10) — le seau ci-dessus est celui d'UN utilisateur : deux membres d'un même espace ne s'attendent plus.
# Le plafond du compte fournisseur reste tenu, par ce seau GLOBAL posé au-dessus.
_THROTTLE_GLOBAL = "claude_chat_global"


class _ChatTurnThrottle:
    """Un appel du tour : le jeton de l'UTILISATEUR d'abord (il ne tient aucun créneau global pendant qu'il
    attend le sien), puis le jeton GLOBAL du fournisseur."""

    def __init__(self, user_id: str) -> None:
        self._user = throttle(f"{_THROTTLE_PROVIDER}{SCOPE_SEPARATOR}{user_id}")
        self._global = throttle(_THROTTLE_GLOBAL)

    async def __aenter__(self) -> _ChatTurnThrottle:
        await self._user.__aenter__()
        try:
            await self._global.__aenter__()
        except BaseException:
            await self._user.__aexit__(*sys.exc_info())
            raise
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        try:
            await self._global.__aexit__(*exc_info)
        finally:
            await self._user.__aexit__(*exc_info)


# ── Le raisonnement, du côté OpenAI ──────────────────────────────────────────
#
# ``/v1/responses`` est justement l'endpoint qui accepte outils ET raisonnement.
# L'effort est donc un RÉGLAGE, pas une constante : « low » est le défaut mesuré
# comme suffisant sur un tour de copilote (28/08/2026), « medium » existe pour
# les tours qui arbitrent.
#
# ⚠️ Deux mots pour deux choses, comme dans ``llm_gateway`` : ``off`` est NOTRE
# interrupteur (« n'envoie pas le paramètre »), à poser si la route désigne un
# modèle OpenAI qui ne raisonne pas — lui envoyer ``reasoning`` serait un 400 tout
# neuf. Ce n'est pas une valeur de l'API.
#
# ⚠️ Le nom est écrit EN CLAIR dans ``_reasoning_kwargs`` et non passé par une
# constante : ``tests/test_suite_hermeticity.py`` balaie ``app/`` à la recherche
# de ``os.environ.get("…")`` littéraux pour refuser un réglage que personne n'a
# déclaré. Une constante le rendrait invisible à cette garde.
#
# ⚠️ #4016 L7 — décision Louis 11/10/2026 : le défaut passe de ``low`` à
# ``medium`` (effort de raisonnement relevé). Il ne vaut que sur la route
# OpenAI (``/v1/responses``) ; la route Anthropic ne porte pas ce paramètre.
# Le tour reste borné par ``CHAT_TURN_BUDGET_S`` (90 s) et ``CHAT_TURN_CEILING_S``
# (105 s), sous l'attente de 120 s de l'appelant NestJS : un tour plus long est
# coupé, jamais laissé pendre. ``CHAT_REASONING_EFFORT=low`` revient à l'avant.
_DEFAULT_REASONING_EFFORT = "medium"
#: #2276.37 — l'effort du palier PROFOND (#2248, `choose_chat_tier`). Le palier
#: rapide et l'absence de palier gardent `_DEFAULT_REASONING_EFFORT`. Depuis
#: #4016 L7 les deux valent `medium` : monter le profond à `high` est un réglage
#: à mesurer contre le budget du tour, pas une décision prise ici.
_DEEP_TIER_REASONING_EFFORT = "medium"
_REASONING_OFF = "off"


# ── LOT STREAM — la diffusion, en un seul type ───────────────────────────────
#
# Un événement est un `dict` JSON-sérialisable simple ({"type": "delta", "text":
# …} / {"type": "step", "label": …}) — pas un objet dédié : `chat.py` le pousse
# tel quel sur son flux SSE, exactement comme `graph_analyze.py` le fait pour
# les événements du graphe. `EventSink` reste un alias léger, pas un contrat
# exporté : rien en dehors de ce module et de `chat.py` n'a besoin de le nommer.
EventSink = Callable[[dict[str, Any]], Awaitable[None]]


async def _noop_emit(_event: dict[str, Any]) -> None:
    """L'émetteur par défaut. Un appelant qui ne diffuse pas — tous les tests
    existants, un futur appelant non-HTTP — obtient un comportement strictement
    identique à celui d'avant ce lot : le flux fournisseur est bien consommé en
    interne (c'est ce qui permet de diffuser QUAND un `emit` réel est fourni),
    mais rien n'est poussé nulle part."""
    return None


class _ToolCall(NamedTuple):
    """Un appel d'outil, dans la forme COMMUNE aux deux protocoles.

    ``id`` est l'identifiant à renvoyer avec le résultat (``tool_use_id`` côté
    Anthropic, ``call_id`` côté OpenAI). Il ne sort jamais de ce module.
    """

    id: str
    name: str
    input: dict[str, Any]


class _ModelTurn(NamedTuple):
    """Ce qu'un aller-retour modèle rend, quel que soit le protocole.

    ``raw`` est la réponse du fournisseur : la boucle ne la lit pas, elle la rend
    à son transport pour que celui-ci sache rejouer le tour assistant dans SA
    forme."""

    text: str
    tool_calls: list[_ToolCall]
    usage: TokenUsage | None
    raw: Any


class _RoundTimeout(Exception):
    """Un aller-retour n'a pas répondu dans son délai — quel que soit le SDK.

    Chaque transport traduit ici le dépassement de SON fournisseur, pour que la
    boucle n'ait pas à connaître deux hiérarchies d'exceptions (et pour qu'un
    nouveau transport ne puisse pas oublier de dégrader)."""


class ProviderOverloaded(Exception):
    """#R10B-FIX.2 — le fournisseur est resté surchargé (5xx / « overloaded ») après une
    nouvelle tentative, et aucun repli n'était disponible. Type dédié pour que l'appelant
    DISE « Laura est momentanément saturée » plutôt que « une erreur est survenue »."""


# #R10B-FIX.2 — attente avant l'UNE nouvelle tentative : courte, elle se paie sur le budget du tour.
_TRANSIENT_RETRY_BACKOFF_S = 1.0


def _is_transient_provider_error(exc: BaseException) -> bool:
    """Surcharge ou 5xx du fournisseur — jamais un 4xx (requête invalide), un 429 de
    débit/crédit (déjà traité) ni un dépassement de délai (`_RoundTimeout`)."""
    if isinstance(exc, (openai.RateLimitError, openai.APITimeoutError)):
        return False
    if isinstance(exc, openai.APIStatusError):
        return exc.status_code >= 500
    if isinstance(exc, openai.APIError):
        return "overloaded" in str(exc).lower()
    return False


class ChatTurnTimeout(Exception):
    """Le tour n'a pas tenu dans son budget, tour final compris.

    Type dédié pour que l'appelant DISE le temps plutôt que « une erreur est
    survenue » — cette phrase-là envoie l'utilisateur relancer, ce qui repaie un
    tour complet pour retomber sur le même mur."""


def _monotonic() -> float:
    """Horloge du tour — indirection volontaire : les tests avancent le temps
    plutôt que de dormir."""
    return time.monotonic()


def _turn_budget_s() -> float:
    """Budget d'un tour, en secondes. Une valeur non numérique, nulle ou négative
    retombe sur le défaut (avec un warning) : un réglage cassé ne doit pas
    supprimer le budget en silence — c'est l'absence de budget qui a causé la
    panne. Même mode de sûreté que le rate limiter et la cascade d'enrichissement."""
    raw = os.environ.get("CHAT_TURN_BUDGET_S")
    if raw is None or raw == "":
        return _DEFAULT_TURN_BUDGET_S
    try:
        value = float(raw)
    except ValueError:
        logger.warning(
            "invalid CHAT_TURN_BUDGET_S=%r, using default %.0fs",
            raw,
            _DEFAULT_TURN_BUDGET_S,
        )
        return _DEFAULT_TURN_BUDGET_S
    if value <= 0:
        logger.warning(
            "CHAT_TURN_BUDGET_S=%r would remove the copilot turn budget, using default %.0fs",
            raw,
            _DEFAULT_TURN_BUDGET_S,
        )
        return _DEFAULT_TURN_BUDGET_S
    return value


def _observe(
    usage: TokenUsage | None,
    *,
    duration_s: float | None = None,
    prompt_name: str = _PROMPT_NAME,
) -> None:
    """Compte ce que CET aller-retour a consommé (coût + registre + ligne de log).

    L'orchestrateur appelle le client du fournisseur en direct, donc hors de
    `call_claude` : jusqu'au 16/08 le copilote — premier poste de la facture —
    n'apparaissait ni dans les compteurs, ni dans le registre par run, ni dans
    une seule ligne de log. On ne pouvait pas répondre à « combien coûte le
    copilote ? » autrement qu'en lisant la console du fournisseur.

    ``_log_usage`` est le goulot commun aux deux transports : compteurs
    (`GET /metrics/cost`), registre par run (`provider_costs`, qui lit le
    fournisseur SUR l'usage), ligne de log et génération Langfuse. Déplacer le
    copilote vers un autre fournisseur sans passer par ici l'aurait rendu
    invisible — ce qui défait exactement l'objectif du déplacement.

    Best-effort et APRÈS la réponse : mesurer ne retarde, n'empêche ni ne casse
    ce qu'on mesure (une réponse sans bloc `usage` reste une réponse valide).

    ``prompt_name`` (#2248) : le nom de coût du tour, porté par le transport —
    ``bellum_chat`` sans routage par palier, ``bellum_chat_fast`` /
    ``bellum_chat_deep`` avec. Compteurs, ``provider_costs``, ligne de log et
    Langfuse séparent donc ce que coûte chaque palier."""
    if usage is None:
        return
    try:
        _log_usage(
            usage,
            CallMetadata(prompt_name=prompt_name, correlation_id=get_correlation_id()),
            duration_s=duration_s,
        )
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais un tour
        logger.warning("Comptage du tour de copilote indisponible: %s", exc)


def _reasoning_kwargs(tier: str | None = None) -> dict[str, dict[str, str]]:
    """``{"reasoning": {"effort": …}}``, ou ``{}`` si l'opérateur l'a coupé.

    Réglé par ``CHAT_REASONING_EFFORT`` quand l'opérateur le pose explicitement
    (``off`` pour retirer le paramètre) — c'est le disjoncteur, prioritaire dans
    tous les cas, ``réglable à chaud``. Sans lui, ``tier`` (#2276.37 — le palier
    résolu par ``resolve_chat_route``, #2248) choisit l'effort PAR DEMANDE :
    ``deep`` le lève à ``_DEEP_TIER_REASONING_EFFORT`` ; ``fast`` ou l'absence de
    palier gardent ``_DEFAULT_REASONING_EFFORT`` — le comportement d'avant, à
    l'octet, pour tout appelant qui ne classe pas encore sa demande."""
    raw = os.environ.get("CHAT_REASONING_EFFORT")
    if raw is not None:
        effort = raw.strip()
    elif tier == "deep":
        effort = _DEEP_TIER_REASONING_EFFORT
    else:
        effort = _DEFAULT_REASONING_EFFORT
    if not effort or effort.lower() == _REASONING_OFF:
        return {}
    return {"reasoning": {"effort": effort}}


def _as_openai_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Traduit le catalogue d'outils vers la forme d'un outil de fonction Responses.

    ⚠️ C'est une TRADUCTION, pas une seconde source : la liste d'entrée est celle
    que ``tools_for`` a déjà filtrée. La branche OpenAI ne peut donc pas atteindre
    un outil que la branche Anthropic n'a pas — ce n'est pas une convention, c'est
    l'absence d'un autre chemin.

    ``strict=False`` : le mode strict d'OpenAI exige ``additionalProperties:
    false`` et tous les champs requis sur CHAQUE schéma. Nos schémas ont des
    champs optionnels par dessein (un outil qu'on peut appeler avec ce qu'on a).
    Le déclarer strict rejetterait la moitié du catalogue à l'appel.
    """
    return [
        {
            "type": "function",
            "name": str(tool["name"]),
            "description": str(tool.get("description") or ""),
            "parameters": tool.get("input_schema") or {},
            "strict": False,
        }
        for tool in tools
    ]


def _tool_arguments(raw: Any) -> dict[str, Any]:
    """Les arguments d'un appel d'outil OpenAI (une CHAÎNE JSON) en dictionnaire.

    Illisible ⇒ ``{}``, comme un bloc ``tool_use`` Anthropic sans ``input`` : la
    validation de l'outil rendra alors une erreur claire, qui se retrouve dans
    ``actions`` avec ``status="error"``. On ne devine JAMAIS un argument — un
    argument inventé ferait agir l'outil sur autre chose que ce qui a été
    demandé."""
    if isinstance(raw, dict):
        return dict(raw)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Arguments d'outil illisibles rendus par le modèle: %r", raw)
        return {}
    return dict(parsed) if isinstance(parsed, dict) else {}


class _AnthropicTurns:
    """Le transport historique — protocole d'outils d'Anthropic, inchangé.

    Les paramètres mis sur le fil sont exactement ceux d'avant ce lot (modèle,
    ``max_tokens``, échantillonnage, system mis en cache, ``tools``, ``timeout``,
    ``max_retries=0``) : c'est ce qui rend le chemin par défaut byte-identique.
    """

    provider = llm_gateway.PROVIDER_ANTHROPIC

    def __init__(
        self,
        *,
        model: str,
        system_prompt: str,
        max_tokens: int,
        prompt_name: str = _PROMPT_NAME,
    ) -> None:
        self.model = model
        # #2248 — le nom sous lequel CE tour compte son coût (voir `_observe`).
        self.prompt_name = prompt_name
        self._system_prompt = system_prompt
        self._max_tokens = max_tokens
        # Le client REJOUE de lui-même (défaut du SDK : 2 tentatives de plus). Un
        # budget qu'une bibliothèque peut multiplier par trois n'est pas un budget.
        self._client = anthropic.AsyncAnthropic(api_key=_get_api_key(), max_retries=_CLIENT_MAX_RETRIES)
        self._messages: list[dict[str, Any]] = []

    def begin(self, user_prompt: str) -> None:
        self._messages = [{"role": "user", "content": user_prompt}]

    async def send(
        self,
        *,
        tools: list[dict[str, Any]] | None,
        timeout: float,
        emit: EventSink = _noop_emit,
        force_tool: str | None = None,
    ) -> _ModelTurn:
        """Un aller-retour Anthropic — DIFFUSÉ.

        Le SDK Messages livre les blocs de contenu dans l'ORDRE : un bloc TEXTE
        complet (start → deltas → stop) avant qu'un ``tool_use`` suivant ne
        démarre. On relaie donc chaque delta de texte à ``emit`` au fur et à
        mesure qu'il arrive — que ce round se termine par un appel d'outil ou
        par la réponse finale — au lieu d'attendre le tour entier. Les
        paramètres mis sur le fil restent exactement ceux d'avant ce lot
        (modèle, ``max_tokens``, échantillonnage, system mis en cache, tools,
        timeout, ``max_retries=0``) : seule la MISE SUR LE FIL change.
        """
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self._max_tokens,
            **_sampling_kwargs(self.model),
            # #3586 (W2) — le digest du Drive interne en tête du system prompt de
            # Laura ; absent ⇒ system byte-identique (lu en cache, 10 min).
            # LOT (15/10) DATA-C — outils, system ET historique en cache 1 h : un
            # utilisateur qui répond après 5 min relit le préfixe au lieu de le
            # repayer. Quatre coupures au plus (outils 1, system 2, historique 1).
            "system": _cached_system(await with_domain_knowledge(self._system_prompt), ttl=ONE_HOUR),
            "messages": with_history_breakpoint(self._messages, ttl=ONE_HOUR),
            "timeout": timeout,
        }
        if tools is not None:
            # CACHE-LLM (15/10) — outils STABLES d'abord, coupure de cache sur le
            # dernier : un outil retiré pour ce tour (connexion, clarification,
            # mode rapide, SourcePlan) ne fait plus rater les ~80 k jetons du
            # catalogue commun. Voir `prompt_cache_layout`.
            kwargs["tools"] = cache_ordered_tools(tools, ttl=ONE_HOUR)
        if force_tool:
            # #3513 — le modèle DOIT appeler cet outil (absent ⇒ rien sur le fil).
            kwargs["tool_choice"] = {"type": "tool", "name": force_tool}
        # ⚠️ Un secret peut être coupé entre deux `event.text` : le SDK
        # découpe sur ses propres frontières de streaming, jamais sur celles
        # d'un motif de `secret_redaction`. `StreamingRedactor` retient donc
        # le mot en cours plutôt que de masquer chaque fragment isolément —
        # voir son docstring pour le scénario que ça évite. `flush()` à la
        # fin du round rend ce qui restait en attente : à ce point le round
        # est terminé, rien ne peut plus l'allonger.
        redactor = StreamingRedactor()
        # #3218 — un appel d'outil recopié en texte ne sort jamais en delta.
        leak = StreamingToolCallFilter()
        try:
            async with self._client.messages.stream(**kwargs) as stream:
                async for event in stream:
                    if getattr(event, "type", None) == "text":
                        settled = leak.feed(redactor.feed(event.text))
                        if settled:
                            await emit({"type": "delta", "text": settled})
                response = await stream.get_final_message()
            remainder = leak.feed(redactor.flush()) + leak.flush()
            if remainder:
                await emit({"type": "delta", "text": remainder})
        except anthropic.APITimeoutError as exc:
            raise _RoundTimeout from exc
        calls: list[_ToolCall] = []
        if response.stop_reason == "tool_use":
            calls = [
                _ToolCall(
                    id=str(getattr(block, "id", "") or ""),
                    name=str(getattr(block, "name", "") or ""),
                    input=dict(getattr(block, "input", None) or {}),
                )
                for block in response.content
                if getattr(block, "type", None) == "tool_use"
            ]
        return _ModelTurn(
            text=strip_tool_call_text(_text_of(response)),
            tool_calls=calls,
            usage=self._usage(response),
            raw=response,
        )

    def _usage(self, response: Any) -> TokenUsage | None:
        if getattr(response, "usage", None) is None:
            return None
        try:
            return _build_usage(response, self.model)
        except Exception as exc:  # noqa: BLE001 — mesurer ne casse pas ce qu'on mesure
            logger.warning("Usage Anthropic illisible sur un tour de copilote: %s", exc)
            return None

    def record_round(self, turn: _ModelTurn, results: list[tuple[_ToolCall, Any, bool]]) -> None:
        """Rejoue le tour assistant complet (blocs text + tool_use), puis renvoie
        tous les ``tool_result`` dans un seul tour user."""
        self._messages.append({"role": "assistant", "content": turn.raw.content})
        self._messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": call.id,
                        "content": _tool_payload(output),
                        "is_error": is_error,
                    }
                    for call, output, is_error in results
                ],
            }
        )

    def append_note(self, note: str) -> None:
        _append_user_note(self._messages, note)


class _OpenAITurns:
    """Le second transport — API Responses d'OpenAI (outils ET raisonnement).

    Trois détails de forme, chacun avec sa raison :

    * ``store=False`` — un tour de copilote transporte le contexte commercial d'un
      espace ; il n'a aucune raison de vivre dans l'historique d'un fournisseur
      au-delà de l'appel.
    * ``max_output_tokens`` — le nom du plafond de sortie sur cet endpoint
      (``max_tokens`` n'y existe pas).
    * ``temperature`` passe par ``llm_gateway._openai_sampling_kwargs``, LA
      décision OpenAI sur le sujet : l'allow-list d'Anthropic répond « non » à
      tout identifiant OpenAI, et un modèle de raisonnement refuse le paramètre.

    ⚠️ Ce qui est REJOUÉ d'un tour à l'autre : les items ``function_call`` et
    ``message``. Les items ``reasoning`` sont écartés — sans ``store=True`` ni
    ``include=["reasoning.encrypted_content"]`` leur contenu ne nous est pas
    rendu, et renvoyer une coquille vide est le genre de forme qu'une API refuse.
    On perd la chaîne de raisonnement ENTRE deux tours d'outils ; on la garde
    entière DANS chaque appel, qui est là où elle sert.
    """

    provider = PROVIDER_OPENAI

    def __init__(
        self,
        *,
        model: str,
        system_prompt: str,
        max_tokens: int,
        prompt_name: str = _PROMPT_NAME,
        tier: str | None = None,
    ) -> None:
        self.model = model
        # #2248 — le nom sous lequel CE tour compte son coût (voir `_observe`).
        self.prompt_name = prompt_name
        # #2276.37 — le palier de CE tour (#2248), lu par `_reasoning_kwargs`
        # dans `send`. `None` : aucun routage par palier, comportement d'avant.
        self._tier = tier
        self._system_prompt = system_prompt
        self._max_tokens = max_tokens
        self._client = openai.AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=_CLIENT_MAX_RETRIES)
        self._input: list[Any] = []
        # #3495 — transport Anthropic de repli, posé quand le crédit du fournisseur
        # est épuisé : tout le reste du tour (send, record_round, append_note) lui
        # est alors délégué.
        self._delegate: _AnthropicTurns | None = None
        self._user_prompt = ""
        # #3495.6 — ce qui s'est passé APRÈS le prompt (tours d'outils, notes), dans
        # une forme neutre : c'est ce qui se rejoue chez Anthropic si le crédit
        # tombe en milieu de tour. Les items OpenAI ne se convertissent pas.
        self._journal: list[tuple[str, Any]] = []

    def begin(self, user_prompt: str) -> None:
        self._user_prompt = user_prompt
        self._journal = []
        self._input = [{"role": "user", "content": user_prompt}]

    async def _fail_over_to_anthropic(self, *, quota_exhausted: bool = True) -> _AnthropicTurns:
        """#3495 — crédit épuisé : CE tour repart chez Anthropic (le modèle suit son
        fournisseur), le fournisseur épuisé est écarté pour une durée bornée et
        l'alerte part à l'opérateur. Jamais un message technique à la personne."""
        # #R10B-FIX.2 — une simple surcharge n'écarte PAS le fournisseur et n'alerte personne.
        if quota_exhausted:
            llm_gateway.report_quota_exhausted(self.provider)
        fallback = _AnthropicTurns(
            model=model_for(_PROMPT_NAME),
            system_prompt=self._system_prompt,
            max_tokens=self._max_tokens,
            prompt_name=self.prompt_name,
        )
        fallback.begin(self._user_prompt)
        for kind, payload in self._journal:
            if kind == "note":
                fallback.append_note(payload)
                continue
            text, results = payload
            fallback._messages.append(
                {
                    "role": "assistant",
                    "content": [
                        *([{"type": "text", "text": text}] if text else []),
                        *(
                            {"type": "tool_use", "id": call.id, "name": call.name, "input": call.input}
                            for call, _output, _is_error in results
                        ),
                    ],
                }
            )
            fallback._messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": call.id,
                            "content": _tool_payload(output),
                            "is_error": is_error,
                        }
                        for call, output, is_error in results
                    ],
                }
            )
        self._delegate = fallback
        return fallback

    async def send(
        self,
        *,
        tools: list[dict[str, Any]] | None,
        timeout: float,
        emit: EventSink = _noop_emit,
        force_tool: str | None = None,
    ) -> _ModelTurn:
        if self._delegate is not None:
            return await self._delegate.send(tools=tools, timeout=timeout, emit=emit, force_tool=force_tool)
        streamed = False

        async def tracking_emit(event: dict[str, Any]) -> None:
            nonlocal streamed
            streamed = True
            await emit(event)

        try:
            try:
                return await self._send_openai(tools=tools, timeout=timeout, emit=tracking_emit, force_tool=force_tool)
            except Exception as first:  # noqa: BLE001 — filtré par `_is_transient_provider_error`
                # #R10B-FIX.2 — surcharge AVANT tout jeton diffusé : UNE nouvelle tentative.
                # Après un jeton, jamais : le texte déjà parti serait dupliqué.
                if streamed or not _is_transient_provider_error(first):
                    raise
                logger.warning("Fournisseur surchargé (%s) — une nouvelle tentative", type(first).__name__)
                await asyncio.sleep(_TRANSIENT_RETRY_BACKOFF_S)
                try:
                    return await self._send_openai(
                        tools=tools, timeout=timeout, emit=tracking_emit, force_tool=force_tool
                    )
                except Exception as second:  # noqa: BLE001
                    if streamed or not _is_transient_provider_error(second):
                        raise
                    # Repli de modèle existant (#3495) : le tour repart chez Anthropic.
                    try:
                        fallback = await self._fail_over_to_anthropic(quota_exhausted=False)
                    except Exception as unavailable:  # noqa: BLE001 — pas de repli : on le DIT
                        raise ProviderOverloaded("fournisseur surchargé, aucun repli") from unavailable
                    return await fallback.send(tools=tools, timeout=timeout, emit=emit, force_tool=force_tool)
        except openai.RateLimitError as exc:
            # Un 429 de débit ordinaire n'est jamais concerné. Un crédit épuisé bascule
            # même après des tours d'outils (#3495.6) : le journal neutre est rejoué.
            if not llm_gateway.is_quota_exhausted(exc):
                raise
            fallback = await self._fail_over_to_anthropic()
            return await fallback.send(tools=tools, timeout=timeout, emit=emit, force_tool=force_tool)

    async def _send_openai(
        self,
        *,
        tools: list[dict[str, Any]] | None,
        timeout: float,
        emit: EventSink = _noop_emit,
        force_tool: str | None = None,
    ) -> _ModelTurn:
        """Un aller-retour ``/v1/responses`` — DIFFUSÉ.

        ``stream=True`` rend un itérateur asynchrone d'événements : chaque
        ``response.output_text.delta`` relaie son fragment à ``emit`` au fur
        et à mesure, et ``response.completed`` porte la réponse complète —
        analysée exactement comme avant ce lot (mêmes items rejoués, même
        usage)."""
        kwargs: dict[str, Any] = {
            "model": self.model,
            "instructions": self._system_prompt,
            "input": list(self._input),
            "max_output_tokens": self._max_tokens,
            "store": False,
            "timeout": timeout,
            **llm_gateway._openai_sampling_kwargs(self.model),
            **_reasoning_kwargs(self._tier),
        }
        if tools is not None:
            kwargs["tools"] = _as_openai_tools(tools)
        if force_tool:
            kwargs["tool_choice"] = {"type": "function", "name": force_tool}
        response: Any = None
        # Même piège que côté Anthropic (voir `_AnthropicTurns.send`) : un
        # secret peut être coupé entre deux `event.delta`, donc masqué
        # fragment par fragment ne le voit pas. Même remède.
        redactor = StreamingRedactor()
        leak = StreamingToolCallFilter()  # #3218
        try:
            stream = await self._client.responses.create(**kwargs, stream=True)
            async for event in stream:
                kind = getattr(event, "type", None)
                if kind == "response.output_text.delta":
                    settled = leak.feed(redactor.feed(event.delta))
                    if settled:
                        await emit({"type": "delta", "text": settled})
                elif kind == "response.completed":
                    response = event.response
            remainder = leak.feed(redactor.flush()) + leak.flush()
            if remainder:
                await emit({"type": "delta", "text": remainder})
        except openai.APITimeoutError as exc:
            raise _RoundTimeout from exc
        if response is None:
            # Le flux s'est terminé sans l'événement terminal — traité comme un
            # dépassement, exactement comme un timeout SDK : la boucle dégrade
            # (tour d'outils ignoré, ou `ChatTurnTimeout` si c'est le tour final).
            raise _RoundTimeout
        text_parts: list[str] = []
        calls: list[_ToolCall] = []
        for item in getattr(response, "output", None) or []:
            kind = getattr(item, "type", None)
            if kind == "function_call":
                calls.append(
                    _ToolCall(
                        id=str(getattr(item, "call_id", "") or ""),
                        name=str(getattr(item, "name", "") or ""),
                        input=_tool_arguments(getattr(item, "arguments", None)),
                    )
                )
            elif kind == "message":
                text_parts.extend(
                    str(getattr(part, "text", "") or "")
                    for part in (getattr(item, "content", None) or [])
                    if getattr(part, "type", None) == "output_text"
                )
        return _ModelTurn(
            text=strip_tool_call_text("".join(text_parts)),
            tool_calls=calls,
            usage=self._usage(response),
            raw=response,
        )

    def _usage(self, response: Any) -> TokenUsage | None:
        """L'usage d'un appel Responses, dans la forme partagée ``TokenUsage``.

        OpenAI compte les jetons servis par le cache DANS ``input_tokens`` ; on
        les sort pour que ``input_tokens`` soit le reliquat NON caché, exactement
        comme ``llm_gateway._usage_from_openai``. Sans ça, l'entrée mise en cache
        serait facturée au plein tarif — dix fois son prix chez Luna.

        Le tarif vient de la table du gateway (une dérivation, un endroit). Un
        modèle dont le prix est inconnu est enregistré « non tarifé » : jamais
        « gratuit », jamais « au tarif d'un autre modèle ».
        """
        raw = getattr(response, "usage", None)
        if raw is None:
            return None
        try:
            total_in = int(getattr(raw, "input_tokens", 0) or 0)
            output_tokens = int(getattr(raw, "output_tokens", 0) or 0)
            details = getattr(raw, "input_tokens_details", None)
            cached = int(getattr(details, "cached_tokens", 0) or 0) if details is not None else 0
            uncached = max(total_in - cached, 0)
            cost = llm_gateway._openai_compute_cost(uncached, output_tokens, self.model, cached)
            return TokenUsage(
                input_tokens=uncached,
                output_tokens=output_tokens,
                model=self.model,
                cost_usd=cost if cost is not None else 0.0,
                cache_read_tokens=cached,
                cache_creation_tokens=0,
                provider=PROVIDER_OPENAI,
                cost_known=cost is not None,
            )
        except Exception as exc:  # noqa: BLE001 — mesurer ne casse pas ce qu'on mesure
            logger.warning("Usage OpenAI illisible sur un tour de copilote: %s", exc)
            return None

    def record_round(self, turn: _ModelTurn, results: list[tuple[_ToolCall, Any, bool]]) -> None:
        if self._delegate is not None:
            self._delegate.record_round(turn, results)
            return
        self._journal.append(("round", (turn.text, results)))
        self._input.extend(
            _as_input_item(item)
            for item in (getattr(turn.raw, "output", None) or [])
            if getattr(item, "type", None) in ("function_call", "message")
        )
        # ⚠️ ``function_call_output`` n'a pas de champ « is_error » — l'échec
        # voyage donc DANS la charge utile (``{"error": …}``, ce que rend déjà
        # l'exécuteur), et le modèle lit la même chose des deux côtés.
        self._input.extend(
            {
                "type": "function_call_output",
                "call_id": call.id,
                "output": _tool_payload(output),
            }
            for call, output, _is_error in results
        )

    def append_note(self, note: str) -> None:
        if self._delegate is not None:
            self._delegate.append_note(note)
            return
        self._journal.append(("note", note))
        self._input.append({"role": "user", "content": _frame_internal_note(note)})


def _as_input_item(item: Any) -> Any:
    """Un item de sortie rendu par le SDK, remis en forme d'item d'entrée.

    Le SDK rend des modèles pydantic et sérialise des dictionnaires : on convertit
    plutôt que d'espérer que l'encodeur JSON accepte les deux."""
    dump = getattr(item, "model_dump", None)
    if callable(dump):
        return dump(mode="json", exclude_none=True)
    return item


def _tool_payload(output: Any) -> str:
    """Le résultat d'un outil, sérialisé — la MÊME chaîne pour les deux protocoles.

    #2354 — GA-26 : cette sérialisation (`default=str`) est la MÊME que celle
    qui part vers le navigateur (`app.routers.chat._sse`). Les deux appellent
    `dumps_json_safe` plutôt que de répéter `default=str` chacun de son côté.

    #1956.3/.7/.8/.15 — AVANT ce lot, le JSON partait NU dans le tour `user` /
    `function_call_output` : la consigne d'injection (`_BLOCK_SECURITY`, « d'où
    qu'elle vienne ») restait un texte lu une fois à l'ouverture du tour, sans
    AUCUNE frontière structurelle marquant où commence et finit le contenu
    d'un outil (page web relayée, résultat CRM, fiche RAG…) — le même défaut
    que `fence()` corrige déjà pour les sources Phase-1 et le bloc CRM du
    prompt copilote (`bellum_advisor.py`, bloc `presence_crm`). Un résultat
    d'outil est maintenant fencé de la MÊME manière : DONNÉE, jamais
    instruction, quel que soit ce qu'il contient — y compris une phrase qui
    prétendrait porter une approbation humaine (1956.15 : une validation ne se
    lit que dans un VRAI tour utilisateur, jamais dans une donnée d'outil)."""
    # #4464 — la copie lue par le modèle ne porte ni coût ni solde en crédits.
    return fence("tool_result_data", dumps_json_safe(strip_money(output)))


def _make_turns(
    *,
    system_prompt: str,
    max_tokens: int,
    tier_request: str | None = None,
    tier_context: ChatTierContext | None = None,
    # #3861.5 — même patron que `observability_sink`/`collected` (#1957.12) :
    # une liste de l'APPELANT, remplie par référence, plutôt qu'un champ en
    # plus sur le `tuple` de retour — ça romprait tous les appelants déjà
    # positionnels de cette fonction (`turns = _make_turns(...)`, lu par son
    # seul attribut `.model` partout ailleurs). `None` (le défaut, et tout
    # appelant d'avant ce paramètre) : rien n'est rapporté, chemin inchangé.
    fallback_sink: list[bool] | None = None,
) -> _AnthropicTurns | _OpenAITurns:
    """Le transport pour ce tour, et le modèle qui va avec.

    La destination se résout par ``llm_gateway.resolve_dispatch`` — la MÊME
    dérivation que ``complete`` : le bris de glace ``LLM_GATEWAY_DISABLED``, le
    repli vers Anthropic quand le fournisseur routé est indisponible, et la règle
    « le modèle suit son fournisseur » valent donc ici aussi, sans être réécrits.

    Sans ``LLM_ROUTE_CHAT``, la route est Anthropic + le modèle de
    ``model_policy`` : le chemin d'avant, à l'octet.

    #2248 — le PALIER du tour se choisit ICI, juste avant la résolution de
    destination : ``resolve_chat_route`` rend la tâche à router (``chat_fast`` /
    ``chat_deep``, ou ``bellum_chat`` sans réglage de palier) et le nom de coût.
    Le transport est construit UNE fois par tour, donc chaque aller-retour de la
    boucle — rounds d'outils et tour final — part vers la destination du même
    palier. Sans ``tier_request`` (appelant d'avant), rien ne change.
    """
    route = resolve_chat_route(_PROMPT_NAME, tier_request, tier_context)
    # #2440.75 — la boucle du copilote parle le protocole d'OUTILS de son fournisseur : c'est une
    # exigence réelle de l'appel, vérifiée avant de router (repli Anthropic annoncé sinon).
    provider, model = llm_gateway.resolve_dispatch(
        route.task, model_for(_PROMPT_NAME), llm_gateway.default_requirements(needs_tools=True)
    )
    # #2276.43 — une demande COMPLEXE (palier fort) ne part jamais sur un modèle
    # économique, quoi que dise un réglage : on retombe sur la route du chat
    # entier, puis, si elle aussi est économique, sur le modèle de raisonnement
    # d'Anthropic. Le palier rapide reste libre d'être économique.
    if route.decision is not None and route.decision.tier == "deep" and is_economic_model(model):
        logger.warning(
            "Laura palier fort routé vers un modèle économique — repli (reason=%s)",
            route.decision.reason,
        )
        # #3861.5 (BEL-LAU-1008-010) — ce repli ne doit pas se masquer comme une
        # exécution équivalente : il atteint l'observabilité du TOUR (vérifiable
        # à l'API), pas seulement ce `logger.warning` qu'il fallait grepper en
        # prod pour le découvrir.
        if fallback_sink is not None:
            fallback_sink.append(True)
        provider, model = llm_gateway.resolve_dispatch(_PROMPT_NAME, model_for(_PROMPT_NAME))
        if is_economic_model(model):
            provider, model = (
                llm_gateway._select_provider(llm_gateway._FALLBACK_ROUTE),
                REASONING_MODEL,
            )
    if provider.name == PROVIDER_OPENAI and openai is not None:
        return _OpenAITurns(
            model=model,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            prompt_name=route.cost_name,
            # #2276.37 — seul le transport OpenAI porte `reasoning` ; le palier
            # choisi ici est celui que `_reasoning_kwargs` lira dans `send`.
            tier=route.decision.tier if route.decision else None,
        )
    return _AnthropicTurns(
        model=model,
        system_prompt=system_prompt,
        max_tokens=max_tokens,
        prompt_name=route.cost_name,
    )


_VERDICT_TOOL_NAME = "get_account_suitability_verdict"


def _forced_verdict_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#3513 — « Faut-il aller chez LVMH ? » : la consigne du prompt ne
    suffisait pas (le modèle répondait en texte, sans carte). Au PREMIER round
    d'une qualification de compte nommé, l'outil de verdict est FORCÉ ; les
    rounds suivants restent libres pour que le modèle puisse conclure. Outil
    non exposé ce tour, ou autre demande ⇒ ``{}`` : chemin byte-identique."""
    if round_index != 0 or not user_message or not asks_to_qualify_a_named_account(user_message):
        return {}
    if not any(tool.get("name") == _VERDICT_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _VERDICT_TOOL_NAME}


_PORTFOLIO_PRIORITIES_TOOL_NAME = "get_portfolio_priorities"


def _forced_portfolio_priorities_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#3399 (lot RAW, recette G4 prod 11/10) — « Quel compte attaquer en premier ? » : prose, 0 carte,
    AUCUN outil ; le routeur l'envoyait vers `compare_accounts` (comptes NOMMÉS). Comme #3513 : au
    PREMIER round, `get_portfolio_priorities` est FORCÉ (la carte du portefeuille, comme « Où
    investir ») ; les rounds suivants restent libres. Autre demande ou outil non exposé ⇒ ``{}``."""
    if round_index != 0 or not user_message or not asks_which_account_to_attack_first(user_message):
        return {}
    if not any(tool.get("name") == _PORTFOLIO_PRIORITIES_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _PORTFOLIO_PRIORITIES_TOOL_NAME}


_ACTION_PLAN_TOOL_NAME = "get_action_plan"
_DOCUMENT_PROJECTS_TOOL_NAME = "search_document_projects"


def _forced_action_plan_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#2887 (recette prod R15, 15/10) — « que faire cette semaine ? » : prose, sans le groupement
    « proche de signer » par stade que rend `get_action_plan`. Comme #3513/#3399/#3939 : au PREMIER
    round, l'outil est FORCÉ ; les rounds suivants restent libres. Autre demande ou outil non
    exposé ⇒ ``{}``."""
    if round_index != 0 or not user_message or not asks_what_to_do_this_week(user_message):
        return {}
    if not any(tool.get("name") == _ACTION_PLAN_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _ACTION_PLAN_TOOL_NAME}


def _forced_document_projects_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#3889 (recette prod R15, 15/10) — « Quels projets a Sanofi dans nos documents ? » recevait
    « Je n'ai pas de nouvelle demande à traiter » : aucun outil appelé. Au PREMIER round, la lecture
    des documents (`search_document_projects`) est FORCÉE ; le tour final dit « aucun document »
    quand l'outil rend `message`. Autre demande ou outil non exposé ⇒ ``{}``."""
    if round_index != 0 or not user_message or not asks_projects_in_documents(user_message):
        return {}
    if not any(tool.get("name") == _DOCUMENT_PROJECTS_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _DOCUMENT_PROJECTS_TOOL_NAME}


_CONTACTS_TOOL_NAME = "get_account_contacts"
_PREPARE_MESSAGE_TOOL_NAME = "prepare_message_for_contact"


def _forced_default_gesture_kwargs(
    round_index: int,
    user_message: str | None,
    available_tools: list[dict[str, Any]],
    *,
    account_in_scope: bool,
    called: Sequence[str],
) -> dict[str, Any]:
    """#3243.r41 (recette prod 17/10, ARCHI LOGICIEL) — « prépare une action sur <compte> » : texte seul, aucun
    geste préparé (le prompt disait de le faire, le modèle redemandait). Avec un compte en portée : round 0 →
    `get_account_contacts` FORCÉ (le contact le plus pertinent), puis `prepare_message_for_contact` FORCÉ — la
    carte d'action part À VALIDER, rien ne part seul (le commercial envoie). Autre demande, aucun compte, outil
    non exposé ou geste déjà préparé ⇒ ``{}``."""
    if not account_in_scope or not user_message or not asks_to_prepare_an_action(user_message):
        return {}
    if _PREPARE_MESSAGE_TOOL_NAME in called:
        return {}
    wanted = _PREPARE_MESSAGE_TOOL_NAME if _CONTACTS_TOOL_NAME in called else _CONTACTS_TOOL_NAME
    if wanted == _CONTACTS_TOOL_NAME and round_index != 0:
        return {}
    if not any(tool.get("name") == wanted for tool in available_tools):
        return {}
    return {"force_tool": wanted}


_ALTERNATIVES_TOOL_NAME = "suggest_account_alternatives"


def _forced_alternatives_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#3247.r41 (recette prod 17/10) — « quelles alternatives à Safran ? » (groupe HORS portefeuille) :
    UNE phrase « Airbus, Thales et Renault… à qualifier », ni relation CRM, ni présence marché, ni
    partenaire écarté. L'outil existait (r40) ; la consigne du prompt ne suffisait pas. Au PREMIER round
    il est FORCÉ (le modèle renseigne `company_name` + `sectors`), la carte part de ses lignes
    (`known_shape_gate`). Autre demande ou outil non exposé ⇒ ``{}``."""
    if round_index != 0 or not user_message or not asks_alternatives_to_a_group(user_message):
        return {}
    if not any(tool.get("name") == _ALTERNATIVES_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _ALTERNATIVES_TOOL_NAME}


_WORKSPACE_CONTACTS_TOOL_NAME = "search_workspace_contacts"


def _forced_work_progress_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#4611.10 (prod 26/10, « où en est la carte ? ») — l'état du travail lancé se LIT, il ne se raconte pas :
    Laura décrivait « les analyses des 15 comptes sont toujours en cours » sans aucun résultat d'outil. Au
    PREMIER round d'une question d'avancement, `get_work_progress` est FORCÉ. Autre demande ou outil non
    exposé ⇒ ``{}`` (et la garde `progress_answer_gate` refuse alors de raconter)."""
    if round_index != 0 or not user_message or not asks_work_progress(user_message):
        return {}
    if not any(tool.get("name") == GET_WORK_PROGRESS_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": GET_WORK_PROGRESS_TOOL_NAME}


def _forced_known_people_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#4057 / #4058 (recette prod R15, 15/10) — « interlocuteurs cyber GRC de EDF » concluait « aucun
    interlocuteur, recherche élargie pas menée » sans lire la base. Au PREMIER round, la lecture de
    l'espace (`search_workspace_contacts`, gratuite) est FORCÉE : les contacts déjà connus sont cités
    d'abord, la recherche élargie ne vient qu'ensuite (`people_search_directive`). Autre demande ou
    outil non exposé ⇒ ``{}``."""
    if round_index != 0 or not user_message or not asks_known_people_by_expertise(user_message):
        return {}
    if not any(tool.get("name") == _WORKSPACE_CONTACTS_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _WORKSPACE_CONTACTS_TOOL_NAME}


def _forced_contacts_by_zone_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#4982.3 (prod 60a0aae5) — « Répartis mes contacts par région » concluait « la répartition régionale reste non
    mesurée » sans appeler l'agrégat. Au PREMIER round, `search_workspace_contacts` est FORCÉ ; ses arguments
    (`by_zone: true`) sont imposés à l'exécution par `_with_zone_breakdown`. Autre demande ou outil non exposé ⇒ ``{}``."""
    if round_index != 0 or not user_message or not asks_contacts_by_zone(user_message):
        return {}
    if not any(tool.get("name") == _WORKSPACE_CONTACTS_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _WORKSPACE_CONTACTS_TOOL_NAME}


def _with_zone_breakdown(call: _ToolCall, user_message: str | None) -> _ToolCall:
    """#4982.3 — le forçage d'outil ne fixe pas les arguments : sur une demande de répartition par zone, l'appel à
    `search_workspace_contacts` part TOUJOURS avec `by_zone: true` (et sans `sort_by`, qui rendrait des lignes).
    Même chemin d'exécution que l'outil : rien n'est dupliqué. Autre appel ⇒ le MÊME objet."""
    if call.name != _WORKSPACE_CONTACTS_TOOL_NAME or not user_message or not asks_contacts_by_zone(user_message):
        return call
    imposed = {k: v for k, v in call.input.items() if k != "sort_by"}
    imposed["by_zone"] = True
    return call._replace(input=imposed)


def _forced_find_accounts_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    # #3905.5/.6 (18/10) — la CASCADE : comptes de l'espace d'abord, API branchées ensuite, web en dernier.
    return accounts_cascade.forced_first_step(round_index, user_message, available_tools)


_TALENT_ACCOUNTS_TOOL_NAME = "find_accounts_for_talent"
_JOB_OFFERS_TOOL_NAME = "search_job_offers"


def _forced_talent_accounts_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#4421.3 (mesure prod 29/10) — « trouve-moi des missions pour ce consultant » : au PREMIER round,
    `find_accounts_for_talent` est FORCÉ (comptes, offres datées, contacts, « Préparer le mail »), comme
    #3513/#3399. Avant, seule la consigne du prompt le conseillait et le modèle prenait l'outil d'offres.
    Autre demande ou outil non exposé ⇒ ``{}`` : chemin byte-identique."""
    if round_index != 0 or not user_message or not asks_reverse_market_for_talent(user_message):
        return {}
    if not any(tool.get("name") == _TALENT_ACCOUNTS_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _TALENT_ACCOUNTS_TOOL_NAME}


def _without_offers_search_for_talent(user_message: str | None, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#4421.3 — sur un marché inversé, l'outil d'OFFRES quitte le catalogue du tour : il rendait 30 lignes d'offres
    là où la demande attend des comptes. La recherche d'offres sans consultant le garde (liste inchangée)."""
    if not user_message or not asks_reverse_market_for_talent(user_message):
        return tools
    return [tool for tool in tools if tool.get("name") != _JOB_OFFERS_TOOL_NAME]


_LIST_RECORDS_TOOL_NAME = "list_records"


def _forced_closed_records_kwargs(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """#4288.4/.5 (recette prod 19/10) — « liste mes affaires perdues en 2026 » / « candidats vus en entretien » :
    au PREMIER round, `list_records` est forcé — la liste se lit à la source (CRM, ATS), elle ne se remplace
    ni par une question de cadrage ni par une réponse générique. Autre demande ou outil non exposé ⇒ ``{}``."""
    if round_index != 0 or not user_message or not asks_for_a_closed_records_listing(user_message):
        return {}
    if not any(tool.get("name") == _LIST_RECORDS_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _LIST_RECORDS_TOOL_NAME}


_BRIEFING_TOOL_NAME = "get_account_briefing"


def _forced_pain_briefing_kwargs(
    round_index: int,
    user_message: str | None,
    available_tools: list[dict[str, Any]],
    *,
    account_in_scope: bool,
) -> dict[str, Any]:
    """#3939 (recette prod 13/10, Renault) — « où est la douleur sur ce compte ? » : une phrase + 4 puces,
    sans source, « aucun résultat d'outil ce tour ». Le compte étant déjà dans le prompt (#2271.16), le
    modèle répondait sans lire le dossier. Comme #3513/#3399 : au PREMIER round, avec un compte en
    portée, `get_account_briefing` est FORCÉ (l'identifiant est dans le prompt, ligne « Fiche ») ; les
    rounds suivants restent libres. Autre demande, aucun compte ou outil non exposé ⇒ ``{}``."""
    if round_index != 0 or not account_in_scope or not user_message or not asks_where_is_the_pain(user_message):
        return {}
    if not any(tool.get("name") == _BRIEFING_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _BRIEFING_TOOL_NAME}


_PLAN_ANALYSIS_TOOL_NAME = "plan_account_analysis"
_START_ANALYSIS_TOOL_NAME = "start_account_analysis"
_NAMED_COMPANIES_TOOL_NAME = "analyze_named_companies"


def _forced_scope_acceptance_kwargs(
    round_index: int,
    available_tools: list[dict[str, Any]],
    *,
    planned_token: bool,
    started: bool,
) -> dict[str, Any]:
    """#3218 (lot RAT, recette NF 10/10) — « lance-la » après la question de périmètre.

    Journal IA prod 10/10 19:52:44 (cid 81f373ad) : `tools_called: ()`. Le modèle n'appelait
    AUCUN outil et reposait la question ; la branche `scope_accepted_default` de
    `plan_account_analysis` (RAL puis RAN) ne tournait donc jamais — le test RAN appelait
    `_analysis_card` directement, jamais le tour. Comme #3513 : la règle vit dans le CHEMIN.
    Premier round → `plan_account_analysis` forcé ; dès que la préparation rend un jeton (et
    tant que rien n'est lancé) → `start_account_analysis` forcé. Hors acquiescement, outil non
    exposé, ou analyse déjà lancée : ``{}``, chemin byte-identique."""
    if started or not scope_question_answered_by_acceptance():
        return {}
    wanted = _START_ANALYSIS_TOOL_NAME if planned_token else _PLAN_ANALYSIS_TOOL_NAME
    if round_index != 0 and not planned_token:
        return {}
    if not any(tool.get("name") == wanted for tool in available_tools):
        return {}
    return {"force_tool": wanted}


def _forced_named_list_kwargs(
    round_index: int,
    user_message: str | None,
    available_tools: list[dict[str, Any]],
    *,
    called: list[str],
) -> dict[str, Any]:
    """#4462.2 (prod 23/10) — « Analyse ces comptes : A, B, C… » : le fil repris par la prose masquait la
    liste (« Je reprends le fil avec Thales… Que veux-tu ? », rien de lancé). Premier round →
    `analyze_named_companies` forcé, UNE fois ; le plafond de 20 noms et le reste nommé sont dans l'outil."""
    # #4462.2
    if round_index != 0 or not user_message or _NAMED_COMPANIES_TOOL_NAME in called:
        return {}
    if not asks_to_analyze_named_list(user_message):
        return {}
    if not any(tool.get("name") == _NAMED_COMPANIES_TOOL_NAME for tool in available_tools):
        return {}
    return {"force_tool": _NAMED_COMPANIES_TOOL_NAME}


def _forced_launch_analysis_kwargs(
    round_index: int,
    user_message: str | None,
    available_tools: list[dict[str, Any]],
    *,
    planned_token: bool,
    started: bool,
) -> dict[str, Any]:
    """#4397 (prod, Simon) — « lance l'analyse de X » : le modèle finissait sur un tour sans texte humain
    (les notes internes repartent en rôle user, d'où « Je n'ai pas de nouvelle demande à traiter »).
    Premier round → `plan_account_analysis` forcé ; dès qu'il rend un jeton → `start_account_analysis`
    forcé (il exige ce jeton). Autre demande, outil non exposé ou analyse déjà lancée ⇒ ``{}``."""
    # #4397
    if started or not user_message or not asks_to_launch_account_analysis(user_message):
        return {}
    wanted = _START_ANALYSIS_TOOL_NAME if planned_token else _PLAN_ANALYSIS_TOOL_NAME
    if round_index != 0 and not planned_token:
        return {}
    if not any(tool.get("name") == wanted for tool in available_tools):
        return {}
    return {"force_tool": wanted}


def _homonym_options_action(
    results: list[tuple[Any, Any, bool]],
    already: list[dict[str, Any]],
    *,
    thread: ThreadStateCollector | None,
    language: str | None,
) -> dict[str, Any] | None:
    """#3857 (lot RBJ) — l'entrée d'action « options de réponse » des fiches homonymes, ou ``None``.

    Part d'une recherche par nom (`search_workspace_accounts`) qui rend ≥ 2 fiches du même nom que
    RIEN d'autre n'a déjà transformées en boutons (le modèle a pu appeler `offer_reply_options` ou
    `ask_clarification` lui-même : jamais deux jeux). Le résultat renvoyé au modèle l'annonce, pour
    qu'il ne les énumère pas ni ne les rappelle."""
    if any(a.get("reply_options") or a.get("clarification") for a in already):
        return None
    for call, output, is_error in results:
        if call.name != "search_workspace_accounts" or is_error or not isinstance(output, dict):
            continue
        query = str(call.input.get("query") or "") if isinstance(call.input, dict) else ""
        offer = homonym_account_options(query, output.get("accounts"))
        if offer is None:
            continue
        name = offer.objects[0].label.split(" — ", 1)[0]
        output["options_offered"] = (
            "Les boutons (une fiche par bouton, nommée par ce qui la distingue) sont DÉJÀ posés sous ta "
            "réponse : pose seulement la question, n'énumère pas les fiches et n'appelle pas "
            "`offer_reply_options`."
        )
        if thread is not None:
            thread.remember_offered_choices(offer.objects)
        return {
            "tool": REPLY_OPTIONS_TOOL_NAME,
            "input": {"query": query},
            "status": NOTED_STATUS,
            "reply_options": [{"question": homonym_question(name, language), "options": offer.options}],
        }
    return None


async def ensure_offered_choice_card(
    user_message: str | None,
    actions: list[dict[str, Any]],
    *,
    thread: ThreadStateCollector | None,
    user_id: str,
    profile_data: dict | None,
    context_mode: str | None = None,
) -> None:
    """#3857 (lot W2) — le clic sur un bouton de fiche homonyme OUVRE la fiche retenue.

    Le message est EXACTEMENT le libellé d'un bouton offert au tour précédent (`offer_reply_options`,
    retenu avec son id par `remember_offered_choices`) : la carte « ouvrir cette fiche » est posée ICI,
    par l'identifiant, sans dépendre que le modèle relise la liste. Une phrase libre, une liste qui n'était
    pas des boutons, une carte déjà proposée ou deux fiches de même libellé : rien n'est ajouté."""
    if thread is None or not user_message:
        return
    previous = thread.previous
    if previous.last_list_tool != "offer_reply_options":
        return
    wanted = " ".join(user_message.split()).casefold()
    matched = [
        obj for obj in previous.last_list if obj.kind == "account" and " ".join(obj.label.split()).casefold() == wanted
    ]
    if len(matched) != 1 or any(a.get("proposal") is not None for a in actions):
        return
    chosen = matched[0]
    tool_input = {"route": f"/accounts/{chosen.id}", "label": chosen.label[:120]}
    output = await execute_chat_tool(
        "propose_guided_action", tool_input, user_id=user_id, profile_data=profile_data, context_mode=context_mode
    )
    if isinstance(output, dict) and output.get("status") == "pending_confirmation" and output.get("proposal"):
        actions.append(
            {
                "tool": "propose_guided_action",
                "input": tool_input,
                "status": "pending_confirmation",
                "proposal": output["proposal"],
            }
        )


_STARTUP_WORD = re.compile(r"(?i)\bstart-?ups?\b")


async def ensure_city_search_card(
    user_message: str | None,
    actions: list[dict[str, Any]],
    *,
    user_id: str,
    profile_data: dict | None,
    context_mode: str | None = None,
) -> None:
    """#3876.5 (lot Q06, recette prod 10/10) — « ESN à Marseille » : texte seul, aucune carte.

    Quand la demande est « entreprises/ESN dans <ville> » (``city_company_search_city``), la carte
    « Action à valider » qui ouvre Découvrir filtré sur la ville est posée ICI, de façon
    DÉTERMINISTE : le modèle n'a pas appelé l'outil, ou son appel (secteur + effectif…) est revenu
    à zéro. La carte ne porte que la commune (résolue par la source officielle, jamais devinée) :
    aucune entreprise n'est nommée, aucun crédit n'est consommé. Une carte déjà proposée par le
    modèle, une commune non reconnue ou un outil en erreur : rien n'est ajouté."""
    city = city_company_search_city(user_message)
    if not city:
        return
    if (
        requested_contact_function(user_message)
        or requested_contacts_at_named_company(user_message)
        or requested_people_by_expertise_at_company(user_message)
    ):
        return
    proposals = [a for a in actions if a.get("proposal") is not None]
    if any(a.get("tool") == "find_accounts" for a in proposals) or len(proposals) >= _MAX_CARDS_PER_REPLY:
        return
    tool_input: dict[str, Any] = {"city": city}
    # #3941.1 (18/10) — « startups fintech à Paris » : la carte ne portait que la ville, et le clic
    # ouvrait Découvrir sans le chip « Startup » que Laura venait d'annoncer comme contrainte retenue.
    if _STARTUP_WORD.search(user_message or ""):
        tool_input["company_profile"] = "startup"
    output = await execute_chat_tool(
        "find_accounts", tool_input, user_id=user_id, profile_data=profile_data, context_mode=context_mode
    )
    if isinstance(output, dict) and output.get("status") == "pending_confirmation" and output.get("proposal"):
        actions.append(
            {
                "tool": "find_accounts",
                "input": tool_input,
                "status": "pending_confirmation",
                "proposal": output["proposal"],
            }
        )


async def run_chat_with_tools(
    system_prompt: str,
    user_prompt: str,
    *,
    user_id: str,
    profile_data: dict | None,
    max_tokens: int = 4000,
    crm_connected: bool = False,
    crm_provider: str = "",
    connected_families: list[str] | None = None,
    # #3708.2 — les familles EXCLUES par la personne pour CE fil (« Outils et
    # sources »), déjà retirées de `connected_families` (`ChatRequest`) mais
    # transmises à nouveau ICI pour que ce qui manque PAR CHOIX ne soit jamais
    # nommé comme une capacité absente (voir plus bas, le routeur EXPLAIN_LIMIT).
    excluded_families: list[str] | None = None,
    clarification_already_asked: bool = False,
    emit: EventSink | None = None,
    reply_cost_ceiling: int | None = None,
    collected: list[dict[str, Any]] | None = None,
    thread: ThreadStateCollector | None = None,
    person_timezone: str | None = None,
    workspace_timezone: str | None = None,
    tier_request: str | None = None,
    tier_context: ChatTierContext | None = None,
    context_mode: str | None = None,
    # #3853 (recette prod 09/10) — la portée « Sans les données de l'espace »
    # (`req.exclude_workspace_data`) : relayée jusqu'à `run_account_search`,
    # qui N'EST PAS un outil de portefeuille (il reste au catalogue sous
    # exclusion stricte) mais dont le rapprochement par SIREN lisait quand
    # même la table `accounts`. `False` (le défaut) : comportement byte-identique.
    exclude_workspace_data: bool = False,
    source_plan_forbidden_tools: frozenset[str] = frozenset(),
    interface_language: str = "fr",
    observability_sink: list[TurnObservability] | None = None,
    verifier_status_sink: list[str] | None = None,
    verifier_reasons_sink: list[tuple[str, ...]] | None = None,
    reply_notes_sink: list[str] | None = None,
    coverage_sink: list[dict[str, Any]] | None = None,
    user_message: str | None = None,
    evidence_requirement: str | None = None,
    conversation_id: str | None = None,
    stale_need_line: str | None = None,
    prior_card_family: str | None = None,
    proposed_actions: tuple[str, ...] = (),
) -> tuple[str, list[dict[str, Any]]]:
    """Un tour de copilote = une trace Langfuse (env-gated, no-op sans clés) :
    les allers-retours modèle y sont des générations, chaque outil un span.
    C'est exactement l'angle mort des trois 500 du 15-16/08 — un tour qui ne
    finit pas n'écrivait AUCUNE ligne nulle part. Délègue tel quel à la boucle
    réelle ci-dessous, qui porte le contrat détaillé.

    Le tour porte aussi son ISSUE (``acted`` / ``answered`` / ``no_outcome`` /
    ``failed``) : c'est la métadonnée « outcome vérifié » des exigences
    d'observabilité, et c'est elle qui rend l'alerte « no-outcome » possible.

    Il porte aussi sa VERSION de prompt (Défaut A — Théo p.15) : le système du
    tour est TOUJOURS le prompt ``advisor`` (``chat.py`` construit ``system``
    via ``bellum_advisor.build_system_prompt`` avant d'appeler cette fonction),
    donc la trace stampe la même empreinte que celle exposée dans la réponse
    HTTP (``chat.py`` — ``ChatResponse.data["prompt_version"]``). Sans elle,
    rien ne dit QUELLE version du prompt a produit une trace dégradée — ni
    comparaison entre versions, ni retour en arrière certain.

    ``emit`` (LOT STREAM) : callback async recevant les événements
    ``{"type": "delta", "text": …}`` (texte du modèle, au fur et à mesure) et
    ``{"type": "step", "label": …}`` (un outil démarre). ``None`` — le défaut,
    et le choix de tous les appelants qui existaient avant ce lot — retombe
    sur un émetteur qui ne fait rien : le contrat `(reply, actions)` ne change
    pas d'un octet.

    ``collected`` (#1957.12) : la liste de l'APPELANT, remplie au fil des rounds
    — c'est elle qui sert d'accumulateur d'actions. Le plafond du tour
    (``chat.py``) annule cette coroutine par ``asyncio.wait_for`` : sans elle,
    l'accumulateur partait avec la coroutine et ce que les outils avaient DÉJÀ
    lu était perdu. Un round interrompu en cours n'y entre pas — seul ce qui
    est terminé y figure. ``None`` (le défaut) : accumulateur interne, contrat
    inchangé.

    ``tier_request`` / ``tier_context`` (#2248) : la demande brute de la
    personne et ce qui l'entoure, lus par le palier de modèle
    (``chat_model_routing``) au moment où ``_make_turns`` résout la
    destination. ``None`` (le défaut) ou aucun palier réglé : destination et
    nom de coût d'avant, à l'octet.

    ``context_mode`` (#2454.4/.5/.9) : le mode de contexte déjà RÉSOLU par
    ``chat.py`` (``req.context_mode``, ``apply_context_mode``) pour ce tour —
    ce module ne le calcule ni ne le devine, il le RELAIE jusqu'à la
    proposition ``find_accounts`` (voir ``chat_tools.py``), pour que le clic
    vers Découvrir ne perde pas le mode que la personne avait choisi. ``None``
    (le défaut) : aucune clé ``context_mode`` sur la proposition, comportement
    byte-identique à avant ce lot.

    ``source_plan_forbidden_tools`` (#3176.3, épopée #3216) : les noms d'outil
    qu'un ``SourcePlan`` INTERDIT pour ce tour (ex. ``{"web_search"}`` sous
    INTERNAL_ONLY) — retirés du catalogue AVANT l'appel modèle, même porte que
    ``mode_excluded_tool_names``. ``frozenset()`` (le défaut) : catalogue
    inchangé, comportement byte-identique à avant ce lot.

    ``interface_language`` (#214.6, épopée #3229) : la langue déjà résolue par
    ``chat.py`` (``_interface_key(req)``), lue par le bloc LAUNCH_JOB de la
    demande trop large (``search_universe.broad_request_instruction_block``).
    ``"fr"`` (le défaut) : même langue que tous les blocs volatils voisins
    sans elle.

    ``verifier_status_sink`` (#3198, épopée #3223, ``ReasoningTrace.verifier_status``) :
    même patron que ``observability_sink`` — la liste de l'APPELANT, remplie
    par référence à CHAQUE appel de ``commercial_verifier.verify_response``,
    jamais un ajout au tuple ``(reply, actions)``. ``None`` (le défaut) : rien
    n'est collecté, comportement byte-identique à avant cette tranche.

    ``user_message`` (#3192, LAU-FINAL-198) : le texte brut de la question de
    la personne pour ce tour (``chat.py`` — ``req.message``), relayé jusqu'à
    ``commercial_verifier.verify_response`` pour son contrôle de densité.
    ``None`` (le défaut, et le choix de tout appelant d'avant ce contrôle) :
    comportement byte-identique à avant cette tranche.
    """
    sink = emit or _noop_emit
    with langfuse_client.bind_trace(
        "chat_turn",
        user_id=user_id,
        session_id=get_correlation_id() or None,
        metadata={"prompt_version": prompt_version_for("advisor")},
    ):
        try:
            reply, actions = await _run_chat_with_tools(
                system_prompt,
                user_prompt,
                user_id=user_id,
                profile_data=profile_data,
                max_tokens=max_tokens,
                crm_connected=crm_connected,
                crm_provider=crm_provider,
                connected_families=connected_families,
                excluded_families=excluded_families,
                clarification_already_asked=clarification_already_asked,
                reply_cost_ceiling=reply_cost_ceiling,
                emit=sink,
                collected=collected,
                thread=thread,
                person_timezone=person_timezone,
                workspace_timezone=workspace_timezone,
                tier_request=tier_request,
                tier_context=tier_context,
                context_mode=context_mode,
                exclude_workspace_data=exclude_workspace_data,
                source_plan_forbidden_tools=source_plan_forbidden_tools,
                interface_language=interface_language,
                observability_sink=observability_sink,
                verifier_status_sink=verifier_status_sink,
                verifier_reasons_sink=verifier_reasons_sink,
                reply_notes_sink=reply_notes_sink,
                coverage_sink=coverage_sink,
                user_message=user_message,
                evidence_requirement=evidence_requirement,
                conversation_id=conversation_id,
            )
        except BaseException:
            langfuse_client.set_trace_outcome("failed")
            raise
        # #3876.5 (lot Q06) — la carte « ville » ne dépend plus de l'appel d'outil du modèle.
        await ensure_city_search_card(
            user_message, actions, user_id=user_id, profile_data=profile_data, context_mode=context_mode
        )
        # #3857 (lot W2) — le clic sur un bouton de fiche ouvre CETTE fiche, par son id.
        await ensure_offered_choice_card(
            user_message, actions, thread=thread, user_id=user_id, profile_data=profile_data, context_mode=context_mode
        )
        # #3395 (V02) / #3229 / lot L1 07/10 — LA PORTE DE FORME, unique : les cartes bâties des sorties
        # d'outils voyagent sur l'entrée d'action (jamais vers l'écran) ; la porte les retire et pose la carte
        # quand la réponse n'en porte aucune de la forme attendue (`known_shape_gate`, diagnostic en tête).
        # R22-LG (recette prod 22/10) — jamais la phrase « Et derrière ta question… » ni une relance en fin
        # de réponse ; une précision posée en carte reste (`strip_relaunch_tail`).
        reply = strip_relaunch_tail(
            ensure_approved_objection(one_answer_per_turn(reply), user_message), actions=actions
        )
        # Les lignes posées par le CODE d'après les sorties d'outils (palier, date des offres, « j'ai retenu »).
        reply = ensure_widening_line(reply, actions)
        reply = ensure_offer_dates(reply, actions)
        reply = ensure_announce_line(reply, actions)
        reply = route_known_shapes(
            reply,
            actions,
            user_message=user_message,
            language=interface_language,
            # #3704 (re-lotée G03) — la dernière région/département connus du fil pour
            # `run_account_search`, même si ce tour ne l'a pas rappelé (`ThreadStateCollector`,
            # tenu par `thread.record` à chaque appel de cet outil) : seul repli qui permette de
            # restaurer la géographie d'une carte réécrite de mémoire, sans lecture fraîche.
            remembered_run_account_search=(thread.state.searches.get("run_account_search") if thread else None),
            # RV4-E-FIX 4287.4 — la forme déjà adoptée du fil : un vide garde sa famille de rendu.
            prior_card_family=prior_card_family,
            proposed_actions=proposed_actions,
        )
        # #AM.46 / #AM.68 — les suites cliquables d'un compte (contacts, organigramme, signaux ; tour d'horizon et
        # analyse de fond avec ses filiales) : posées par le code sur la carte du compte déjà au portefeuille.
        reply = with_account_next_steps(reply, user_message=user_message, language=interface_language, actions=actions)
        # #4438.3 — la prose ne contredit jamais le décompte de la carte posée juste au-dessus.
        reply = drop_prose_contradicting_cards(reply)
        # #4631 — la prose n'annonce jamais N comptes / « ci-dessous » quand rien n'est rendu (carte, tableau, puces).
        reply = drop_prose_promising_missing_list(reply, language=interface_language)
        # #2547 (recette prod 07/10) — « Région : 27 » : jamais un code INSEE brut, texte et cartes.
        reply = name_geo_codes(reply)
        # #4060 (R13) — approche directe / décideur : jamais de question « à qui m'adresser ? » dans le brouillon.
        reply = strip_redirect_question_when_direct(reply, user_message=user_message)
        # #4060 (R12) — un brouillon rendu est dit préparé, jamais « pas préparé ni envoyé ».
        reply = fix_unprepared_draft_sentence(reply, actions)
        # #3243.r41 — « besoin à confirmer » (signaux tous archivés) : posé par le CODE, jamais laissé au modèle.
        reply = apply_stale_need_formula(reply, stale_need_line)
        # R40 (Thales) — jamais un mot d'un autre script (hébreu « בלבד »…) glissé dans une réponse FR/EN.
        reply = strip_stray_foreign_script(
            reply, user_message=user_message, known_text=json.dumps(actions, ensure_ascii=False, default=str)
        )
        _record_turn_outcome(reply, actions)
        return reply, actions


#: Les statuts d'action qui prouvent qu'il s'est passé QUELQUE CHOSE. Un outil en
#: échec n'en fait pas partie : il a été appelé, il n'a rien produit.
_PRODUCTIVE_ACTION_STATUSES = frozenset({"done", "pending_confirmation", "clarification"})


def turn_outcome(reply: str, actions: list[dict[str, Any]]) -> str:
    """Ce que ce tour a produit — ``acted``, ``answered`` ou ``no_outcome``.

    ⚠️ ``answered`` dit qu'un texte est revenu, jamais qu'il était juste : une
    sortie de modèle ne prouve pas un outcome. Seul ``acted`` s'appuie sur des
    appels d'outils RÉELLEMENT exécutés — la même règle que le panneau de
    transparence, qui n'affiche jamais un texte que le modèle pourrait inventer.
    """
    if any(action.get("status") in _PRODUCTIVE_ACTION_STATUSES for action in actions):
        return "acted"
    return "answered" if reply.strip() else "no_outcome"


def _record_turn_outcome(reply: str, actions: list[dict[str, Any]]) -> None:
    """Pose l'issue sur la trace, et ALERTE quand il n'y en a aucune.

    Un tour sans issue est un tour où l'utilisateur n'a rien reçu : ni action, ni
    texte. C'est un défaut, pas une statistique — d'où le ``logger.error``, qui
    est le chemin de capture Sentry du dépôt (jamais ``capture_exception`` en
    direct). Il ne dépend d'aucune clé Langfuse : l'alerte doit partir même quand
    l'observabilité est éteinte.
    """
    outcome = turn_outcome(reply, actions)
    langfuse_client.set_trace_outcome(outcome)
    if outcome == "no_outcome":
        logger.error(
            "Tour de copilote SANS ISSUE — ni action, ni réponse (cid=%s, %d outil(s) appelé(s))",
            get_correlation_id() or "?",
            len(actions),
        )
    # #2146.13 (via #2898) — LE SEUL point par lequel toute réponse de Laura
    # passe, quel que soit le chemin qui l'a produite : la garde de contenu
    # tourne ICI, jamais dans un sous-chemin qu'un futur appelant pourrait
    # oublier. Mesure, ne bloque pas (le prompt porte déjà l'interdiction,
    # `tests/test_copilote_prompt_blocks.py`) — un texte qui la franchit quand
    # même doit rester VISIBLE, jamais avalé en silence.
    if violates_manual_navigation_instruction(reply):
        logger.error(
            "Laura a répondu avec une instruction de navigation manuelle multi-étapes "
            "(cid=%s) — #2146.13 : jamais « va dans X, puis Y », toujours l'outil ou "
            "la surface directe",
            get_correlation_id() or "?",
        )
    # #3189.4 — même discipline que #2146.13 juste au-dessus : mesure, ne
    # bloque pas (le prompt porte déjà l'interdiction, `_BLOCK_TOOLS`).
    if violates_manual_redirect_instruction(reply):
        logger.error(
            "Laura a renvoyé vers une recherche manuelle (site externe ou « tu peux "
            "rechercher ») au lieu d'appeler l'outil (cid=%s) — #3189.4 : DO THE WORK, "
            "DO NOT TEACH THE WORK",
            get_correlation_id() or "?",
        )


async def _run_chat_with_tools(
    system_prompt: str,
    user_prompt: str,
    *,
    user_id: str,
    profile_data: dict | None,
    max_tokens: int = 4000,
    crm_connected: bool = False,
    crm_provider: str = "",
    connected_families: list[str] | None = None,
    excluded_families: list[str] | None = None,
    clarification_already_asked: bool = False,
    emit: EventSink = _noop_emit,
    reply_cost_ceiling: int | None = None,
    collected: list[dict[str, Any]] | None = None,
    thread: ThreadStateCollector | None = None,
    person_timezone: str | None = None,
    workspace_timezone: str | None = None,
    tier_request: str | None = None,
    tier_context: ChatTierContext | None = None,
    context_mode: str | None = None,
    exclude_workspace_data: bool = False,
    source_plan_forbidden_tools: frozenset[str] = frozenset(),
    interface_language: str = "fr",
    observability_sink: list[TurnObservability] | None = None,
    verifier_status_sink: list[str] | None = None,
    verifier_reasons_sink: list[tuple[str, ...]] | None = None,
    reply_notes_sink: list[str] | None = None,
    coverage_sink: list[dict[str, Any]] | None = None,
    user_message: str | None = None,
    evidence_requirement: str | None = None,
    conversation_id: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Fait tourner la boucle outils et renvoie (réponse_texte, actions[]).

    ``observability_sink`` (#3196.6, reste) : la liste de l'APPELANT, remplie
    par référence — même patron que ``collected`` — d'UNE `TurnObservability`
    à CHAQUE sortie du tour (réponse propre, clarification, signal silencieux,
    budget épuisé). ``None`` (le défaut) : rien n'est collecté, comportement
    byte-identique à avant cette tranche.

    `thread` (#1927) : l'état du fil à prolonger. La boucle y AFFINE une
    recherche marquée `refine: true` avant de l'exécuter, et y projette chaque
    sortie d'outil après. `None` — le défaut de tous les appelants d'avant
    #1927 — ne change rien, à l'octet.

    `actions` = une entrée par outil réellement exécuté, {tool, input, status},
    pour alimenter le panneau de transparence « ce que Bellum a fait » (jamais un
    texte que le modèle pourrait inventer — piloté par les vrais appels).

    Cas particulier des outils d'écriture : leur exécuteur ne fait que préparer.
    L'entrée porte alors `status="pending_confirmation"` + `proposal` — ce que
    l'action FERA, à valider d'un clic. Rien n'a été écrit ni débité.

    `crm_connected` / `crm_provider` : l'état d'intégration réel, transmis tel
    quel aux outils. Sans lui, `export_contact_to_crm` proposerait un export vers
    un CRM que l'utilisateur n'a jamais branché.

    Lève `ChatTurnTimeout` quand même le tour final déborde. Tout le reste
    dégrade : un aller-retour d'outil qui déborde ne tue plus la réponse, il
    force le tour final avec ce qui a déjà été récolté.

    Le TRANSPORT (Anthropic ou OpenAI Responses) est résolu par
    ``_make_turns`` ; tout ce qui suit — filtrage de capacité, borne de
    clarification, budget, exécution, ``actions``, spans — est commun aux deux,
    et c'est ce qui garantit qu'ils rendent le même observable.

    ``verifier_status_sink`` (#3198, épopée #3223) : rempli par référence à
    CHAQUE appel de ``_commercial_verify`` — un tour qui s'arrête sur une
    clarification n'en appelle aucun (le vérificateur ne juge jamais une
    question), donc le sink reste vide sur ce chemin : une absence RÉELLE,
    jamais devinée. ``None`` (le défaut) : comportement byte-identique à avant
    cette tranche.
    """
    # ── Routeur, étape 3 : la vérification de capacité, en CODE ──────────────
    #
    # Un outil dont le connecteur manque n'est pas présenté au modèle. La règle
    # vivait dans le prompt (« tiens compte des outils connectés ») et n'était
    # donc qu'un conseil : le copilote proposait des relances par messagerie à
    # des utilisateurs qui n'en avaient aucune.
    #
    # Ce qui est retiré est DIT, parce qu'un copilote qui « ne sait plus faire »
    # sans expliquer pourquoi est pire qu'un copilote qui propose trop.
    available_tools = tools_for(connected_families)
    absent = missing_capabilities(connected_families)
    # #3708.2 — une famille EXCLUE pour ce fil n'est pas « absente » : c'est un
    # CHOIX réversible, déjà nommé tel quel par `excluded_sources_block`
    # (`chat.py`, injecté dans `system_prompt` AVANT cet appel). La confondre
    # avec une capacité jamais branchée produisait DEUX messages contradictoires
    # dans le même prompt — « exclue pour ce fil » et « capacité absente… » —
    # et le modèle suivait le second, plus bas dans le texte : recette prod
    # 08/10, « l'accès à ton CRM n'est pas disponible… rétablir l'accès depuis
    # Intégrations » au lieu de « source exclue pour ce fil ».
    _excluded_set = frozenset(excluded_families or ())
    # #2276.39-.42 — le plan du tour, calculé ICI (avant le routeur) parce que
    # #2146.9 (via #2898) lui emprunte son SEUL signal réel déjà mesuré avant
    # le premier appel outil : le palier de la demande (#2248). Un seul appel,
    # jamais deux — le routeur et le budget d'outils lisent le même plan.
    plan = plan_turn(tier_request, tier_context)
    # #2146.2 / #2146.9 / #2146.10 / #2146.12 — LE SOCLE NOMMÉ
    # (`laura_router.decide_action`) décide ici s'il faut EXPLIQUER UNE
    # LIMITE, LANCER UN JOB ou OUVRIR UNE SURFACE, sur les trois seuls signaux
    # que ce point de l'orchestrateur mesure déjà réellement (une capacité
    # absente, et le palier de la demande, dont dérivent à la fois
    # `requires_multiple_searches` et `requires_large_inspection` — deux
    # ensembles de raisons DISJOINTS, jamais les deux à la fois) — le signal
    # d'ambiguïté du routeur n'est pas encore mesuré À CET ENDROIT et n'est
    # donc jamais inventé ici : c'est la RÉPONSE PARTIELLE que #2146.18
    # réclame plutôt qu'un routeur qui prétendrait tout savoir d'un coup.
    routing = decide_action(
        RoutingSignals(
            capability_available=not absent,
            ambiguous_and_material=False,
            requires_multiple_searches=requires_multiple_searches(plan),
            requires_large_inspection=requires_large_inspection(plan),
            data_already_known=True,
        )
    )
    if routing.action == LauraAction.EXPLAIN_LIMIT:
        # #3708.2 — seules les familles GENUINEMENT absentes (jamais branchées)
        # entrent dans ce bloc ; une famille exclue pour ce fil reste UNIQUEMENT
        # dans `excluded_sources_block`, avec sa vraie raison (voir plus haut).
        genuinely_absent = [family for family in absent if family not in _excluded_set]
        # Recette du 13/09 — posée AVANT le rappel de langue du prompt, jamais
        # derrière : en production l'API envoie toujours `connected_families`,
        # donc cette mention française devenait le dernier texte lu par le
        # modèle d'un utilisateur en interface anglaise. Sans rappel (français),
        # la concaténation est celle d'avant, octet pour octet.
        if genuinely_absent:
            system_prompt = append_before_language_reminder(
                system_prompt,
                f"\n\nCAPACITÉS ABSENTES POUR CET UTILISATEUR : {', '.join(genuinely_absent)}. "
                "Les outils qui en dépendent ne te sont pas proposés. Si la demande en a besoin, "
                "fais ce qui est possible sans eux et DIS ce qui manque — ne promets rien que tu ne "
                "peux pas faire, et ne nomme jamais un éditeur : parle de « ta messagerie », « ton "
                "agenda », « ton CRM ».",
            )
    elif routing.action == LauraAction.LAUNCH_JOB:
        # #2146.9 — la demande suppose plusieurs recherches croisées : le
        # routeur ne remplace pas la boucle d'outils (Claude choisit toujours
        # ses appels tour par tour), mais lui DIT ce que le palier a déjà
        # mesuré, pour qu'un tour ne conclue pas sur une seule lecture.
        system_prompt = append_before_language_reminder(
            system_prompt,
            "\n\nCETTE DEMANDE SUPPOSE PLUSIEURS RECHERCHES CROISÉES avant de répondre "
            "(analyse de compte, plan à plusieurs étapes, ou plusieurs familles d'outils). "
            "Prends le temps d'appeler tous les outils nécessaires — plusieurs si besoin — "
            "avant de conclure, plutôt que de répondre sur des données partielles.",
        )
        # #214.6 (épopée #3229) — LA MÊME branche sert la demande TROP LARGE du
        # ticket LAU-FINAL-214 : « plusieurs recherches croisées » est déjà,
        # dans ce dépôt, le signal qu'une seule réponse ne peut pas couvrir la
        # demande — jamais un second système de détection. Consigne : les
        # meilleurs vérifiés, le reste en job, la couverture NOMMÉE par palier,
        # ce qui exige un approfondissement — et « tous »/« exhaustif »/
        # « complet » réservés à une couverture qui le prouve.
        system_prompt = append_before_language_reminder(
            system_prompt, broad_request_instruction_block(interface_language)
        )
    elif routing.action == LauraAction.OPEN_SURFACE:
        # #2146.10 — la demande est une inspection VOLUMINEUSE (longue, à
        # plusieurs questions, ou en liste de plusieurs volets), pas une
        # recherche croisée : plus à PARCOURIR qu'à répondre en une bulle de
        # texte. #2146.13 interdit de nommer l'interface et de dire « va
        # dans » — la consigne pointe donc vers l'outil qui ouvre l'écran
        # prérempli (`propose_guided_action`), jamais vers une navigation
        # manuelle décrite en texte (même règle que #2146.14, « pour faire
        # agir, tu appelles l'outil »). L'écran s'ouvre déjà PRÉREMPLI (le
        # filtre voyage dans la route), jamais vide.
        system_prompt = append_before_language_reminder(
            system_prompt,
            "\n\nCETTE DEMANDE SUPPOSE UNE INSPECTION VOLUMINEUSE (une liste longue, ou "
            "plusieurs volets à parcourir) plutôt qu'une recherche croisée. Si un écran de "
            "l'application peut la montrer déjà filtrée, propose-le avec l'outil "
            "`propose_guided_action` plutôt que de tout réciter en texte — ne dis jamais à la "
            "personne d'aller cliquer quelque part elle-même.",
        )

    # #3854 (BEL-LAU-1008-003) — la clarification est bornée au tour qui SUIT
    # celle où elle a été posée, plus pour toute la vie de la conversation
    # (une tâche neuve, plus tard dans le même fil, peut en recevoir une
    # autre — `ThreadState.has_open_question`). Le compteur ne peut pas vivre
    # ici (l'orchestrateur ne voit qu'un tour) : il est passé par l'appelant,
    # qui lit l'historique. Retirer l'outil est plus sûr que de demander au
    # modèle de se retenir.
    if clarification_already_asked:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]

    # #3393 — « Qui est le DSI de X ? » se RÉPOND d'abord : pas de
    # désambiguïsation devant une demande qui nomme déjà son objet.
    if is_explicit_lookup_form(user_message):
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, answer_first_note())

    # #3444 — une objection de prospect : texte approuvé verbatim + règle d'or, jamais « quelle ESN ? ».
    objection_note = approved_objection_note(user_message)
    if objection_note:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, objection_note)

    # #2770.2 (recette prod 12/10) — « traite ma boîte mail, ne rien envoyer » : on TRIE (ou on dit en
    # une phrase qu'aucune messagerie n'est branchée), on ne cadre pas. Jamais d'envoi (doctrine).
    if asks_to_triage_mailbox(user_message) and "email" not in _excluded_set:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(
            system_prompt,
            mailbox_triage_note(mailbox_connected=connected_families is None or "email" in connected_families),
        )

    # #4417.1 (FAIL prod 25/10) — « réponds au dernier mail de X » : le chemin (recherche, lecture, brouillon rattaché
    # au fil) est nommé, jamais une réponse rédigée dans le chat.
    if is_mail_reply_request(user_message) and "email" not in _excluded_set:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, mail_reply_note())

    # #3430 — « écris au CTO » : le rôle le plus proche du problème d'abord, jamais « quel CTO ? ».
    if is_high_level_contact_request(user_message):
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, closest_role_first_note())

    # #2547 / #2533 (recette prod 07/10) — une question sur UN compte nommé se
    # répond après avoir lu SA fiche (signaux datés et sourcés, contact de la
    # fonction demandée en clair) ; une demande qui nomme déjà zone + type +
    # livrable ne se recadre pas. Même geste : l'outil de clarification retiré.
    contact_function = requested_contact_function(user_message)
    contacts_at_company = requested_contacts_at_named_company(user_message)
    # #4058/#4057 (recette R8a, 14/10) — « donne-moi les interlocuteurs cyber
    # GRC de EDF » : pas de « qui », pas de nombre, donc hors des deux
    # détecteurs voisins ci-dessous.
    expertise_at_company = requested_people_by_expertise_at_company(user_message)
    if contact_function:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, account_contact_function_note(contact_function))
    # #3859 (recette prod 08/10) — « trouve-moi 5 décideurs IT chez Kiabi » :
    # pas de « qui », donc hors de `requested_contact_function` ci-dessus.
    # Même geste : l'outil de clarification retiré, la consigne dit de LANCER
    # la recherche plutôt que de la renvoyer à l'utilisateur.
    elif contacts_at_company:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(
            system_prompt, contacts_at_named_company_note(*contacts_at_company)
        )
    elif expertise_at_company:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(
            system_prompt, expertise_people_at_company_note(*expertise_at_company)
        )
    elif is_account_signals_question(user_message):
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, account_signals_note())
    if is_framed_prospecting_request(user_message):
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, framed_prospecting_note(user_message))
    # #3876.5 (lot Q02) — « ESN à Marseille » : le geste promis (carte « ville de Marseille » →
    # Découvrir) part au lieu d'une réponse texte ; la consigne nomme l'appel, aucune question.
    searched_city = city_company_search_city(user_message)
    if searched_city and not contact_function and not contacts_at_company and not expertise_at_company:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, city_company_search_note(searched_city))
    # #4434.3 (recette prod 23/10) — « Quels comptes cherchent du React ? » : aucune question de périmètre ;
    # celui du profil (sinon la France) est posé et dit, la compétence élargie seule à ses voisines nommées.
    asked_skill = requested_skill(user_message)
    if asked_skill and not (contact_function or contacts_at_company or expertise_at_company or searched_city):
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(
            system_prompt, skill_accounts_note(asked_skill, user_message, profile_data)
        )
    # #4408.1 (recette prod 26/10) — « des petites structures sans gros process achat » : aucune question de
    # territoire ; celui du profil (sinon la France) est posé et dit, la tranche de départ posée par l'outil.
    turn_thread = current_turn_thread()
    if light_purchasing_asked(user_message or "", turn_thread[1] if turn_thread else ()) and not (
        contact_function or contacts_at_company or expertise_at_company or searched_city or asked_skill
    ):
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, light_scope_note(user_message, profile_data))
    # #3769.2 — « seulement en Occitanie » juste après une priorisation se RÉSOUT :
    # l'outil filtre sur le siège réel, la consigne nomme l'appel, aucune question.
    geo_refinement = portfolio_geo_refinement(user_message, thread.previous.last_list_tool if thread else None)
    if geo_refinement:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, portfolio_geo_refine_note(geo_refinement))

    # #AM.20 (#4054.5) — « la suite » après une priorité : la liste des personnes du compte, puis un brouillon.
    chained_step = next_step(user_message, thread.previous) if thread else None
    if chained_step is not None:
        available_tools = [tool for tool in available_tools if tool["name"] != "ask_clarification"]
        system_prompt = append_before_language_reminder(system_prompt, next_step_note(chained_step))

    # #2450.4 / #2448.5 (épopée #2882) — RAPIDE choisi EXPLICITEMENT retire la
    # recherche publique du catalogue : sa promesse (« répondre avec ce que
    # BellumAI sait déjà ») exclut par construction d'aller chercher sur le
    # web, gratuit ou non. `frozenset()` pour tout autre mode (ou aucun) —
    # chemin byte-identique à avant cette ligne.
    excluded = mode_excluded_tool_names(tier_context.requested_mode if tier_context else None)
    if excluded:
        available_tools = [tool for tool in available_tools if tool["name"] not in excluded]

    # #3176.3 (épopée #3216) — même geste, second appelant : le `SourcePlan`
    # d'un marqueur détecté (`chat.py::source_plan_forbidden_tools`) retire ses
    # couches INTERDITES du catalogue. `frozenset()` (le défaut) : rien ne
    # change.
    if source_plan_forbidden_tools:
        available_tools = [tool for tool in available_tools if tool["name"] not in source_plan_forbidden_tools]

    # #4421.3 — marché inversé d'un talent : des COMPTES, pas 30 offres (appelant de `_without_offers_search_for_talent`).
    available_tools = _without_offers_search_for_talent(user_message, available_tools)

    # #4112 — sélection d'outils (`LAURA_TOOL_SELECTION_ENABLED`, éteint par défaut) : le
    # catalogue DÉJÀ filtré ci-dessus devient le champ de `chercher_un_outil` ; le modèle ne
    # voit que le noyau stable. Éteint : `tool_selection` reste `None`, chemin byte-identique.
    tool_selection = ToolSelection(available_tools) if tool_selection_enabled() else None
    if tool_selection is not None:
        available_tools = tool_selection.current()

    # Le transport se construit APRÈS le prompt système : la mention des capacités
    # absentes en fait partie, et un transport qui aurait capturé le prompt d'avant
    # la présenterait au modèle… sans elle.
    # #2248 — `tier_request` : la demande BRUTE de la personne (pas le prompt
    # utilisateur, qui porte l'historique) — c'est elle que le palier lit.
    # #3861.5 — même patron que `collected`/`observability_sink` (#1957.12) :
    # rempli par référence dans `_make_turns`, lu par `_note_turn_observability`.
    capability_fallback_sink: list[bool] = []
    turns = _make_turns(
        system_prompt=system_prompt,
        max_tokens=max_tokens,
        tier_request=tier_request,
        tier_context=tier_context,
        fallback_sink=capability_fallback_sink,
    )
    turns.begin(user_prompt)

    deadline = _monotonic() + _turn_budget_s()
    # #1957.12 — l'accumulateur de l'appelant quand il en passe un : ce qui est
    # étendu ici survit à une annulation par le plafond du tour.
    actions: list[dict[str, Any]] = collected if collected is not None else []
    # #1950.17 — UN budget pour toute la RÉPONSE, partagé par ses tours d'outils :
    # un plafond remis à zéro à chaque tour se contournerait en trois tours.
    cost_budget = _ReplyCostBudget(ceiling=reply_cost_ceiling) if reply_cost_ceiling is not None else None
    # `plan` (rounds d'outils, largeur des lots de lectures) est déjà calculé
    # plus haut, avant le routeur (#2146.9) — pas un second appel ici.
    # Contrôles et self-check se décident au fil des rounds, sur la nature des
    # appels (`round_is_critical`).
    critical = False
    tool_outputs: list[str] = []
    # #4397 (N1) — les analyses réellement parties (ou refusées) pendant CE tour, pour la réponse forcée.
    analyses_started: list[str] = []
    analyses_failed: list[str] = []
    # #3196.5 — signatures (nom + arguments) déjà appelées, TOUS rounds de ce
    # tour confondus. Détection (voir `duplicate_call_names`, journalisée
    # ci-dessous) ET rejeu (`replay_cache`, `_run_tool_round`) : une lecture
    # dupliquée est repérée ici, son résultat vit dans `replay_cache`.
    called_signatures: set[tuple[str, str]] = set()
    # #3196.5 — le résultat de chaque LECTURE déjà exécutée dans ce tour, par
    # signature : `_run_tool_round` le lit pour rejouer un doublon sans
    # ré-appeler la source, et l'alimente au fil des rounds.
    replay_cache: dict[tuple[str, str], tuple[dict[str, Any], Any, bool]] = {}
    # #3236.2 (b, tranche) — la REPRISE : les lectures qu'un tour Approfondi
    # précédent de CETTE conversation a mises de côté en manquant de budget
    # (voir `chat_resume_checkpoint`) repartent dans le rejeu — le budget sert à
    # avancer, pas à relire. Consommé une fois ; sans Redis, sans conversation,
    # ou hors Approfondi : rien n'est lu, chemin identique à avant.
    # #4438.1 — et toute recherche/croisement qui continue seule (`continues_alone`).
    if continues_alone(plan):
        replay_cache.update(await chat_resume_checkpoint.load(user_id, conversation_id))
    # #3196.6 — le nombre de rounds RÉELLEMENT allés au bout, pour
    # l'observabilité du tour (`build_turn_observability`) au cas où le
    # budget manque avant que le modèle n'ait fini.
    rounds_completed = 0
    # #189.1/#189.7 — le gain marginal de chaque round terminé (moteur
    # d'approfondissement, `deepening_engine`). Vide sans état de fil.
    round_gains: list[int] = []
    # #3218 — la trace durable des décisions du moteur (passes annoncées, arrêt).
    deepening_trace: list[dict[str, object]] = []
    deepening_stopped = False
    account_report_seen = False
    # #3218 (RAT) — une préparation d'analyse de CE tour a rendu un jeton : sur un « lance-la »,
    # le round suivant force `start_account_analysis` (voir `_forced_scope_acceptance_kwargs`).
    scope_plan_token_seen = False

    # #3196.6 (reste) — la couverture à CHAQUE sortie du tour, pas SEULEMENT
    # quand le budget manque (voir plus bas, l'ancien seul point d'appel).
    # Fail-soft de bout en bout (voir `record_turn_observability`) et
    # exposition hors des journaux Python (`observability_sink`, lu par
    # `app/routers/chat.py` vers `context["turn_observability"]`).
    def _note_turn_observability(*, budget_exhausted: bool, degraded_answer: bool, job_created: bool = False) -> None:
        observability = build_turn_observability(
            plan=plan,
            completed_steps=rounds_completed,
            parallel_calls=len(actions),
            # #3218 — un arrêt DÉCIDÉ par le moteur (gain nul) n'est ni un délai
            # atteint ni un mode dégradé : le dire contredisait l'écran.
            budget_exhausted=budget_exhausted and not deepening_stopped,
            degraded_answer=degraded_answer and not deepening_stopped,
            job_created=job_created,
            deepening=tuple(deepening_trace),
            capability_fallback=bool(capability_fallback_sink),
        )
        record_turn_observability(observability, correlation_id=get_correlation_id() or "?")
        # Hors des journaux Python : même patron que `collected` ci-dessus
        # (#1957.12) — une liste de l'APPELANT, remplie par référence, plutôt
        # qu'un ajout au tuple `(reply, actions)` qui casserait le contrat
        # documenté d'`actions` (« une entrée par outil RÉELLEMENT exécuté »,
        # lu par `turn_outcome`/les tests de tout le dépôt).
        if observability_sink is not None:
            observability_sink.append(observability)

    tool_rounds_exhausted = False
    empty_after_tools = False
    # #4611.10 — une question d'avancement dont l'outil n'est pas exposé (droits, mode, sélection d'outils) ne
    # reçoit PAS un récit de mémoire : elle reçoit « je n'ai pas pu lire », sans rappeler le modèle.
    if asks_work_progress(user_message) and not any(
        tool.get("name") == GET_WORK_PROGRESS_TOOL_NAME for tool in available_tools
    ):
        _note_turn_observability(budget_exhausted=False, degraded_answer=True)
        return progress_answer_gate(user_message, read=None, language=interface_language) or "", actions
    for _round_index in range(plan.tool_rounds):
        remaining = deadline - _monotonic()
        if remaining <= _TOOL_ROUND_RESERVE_S:
            # #2269.14/.15/.16 — plus de temps pour un round de plus : on sort
            # de la boucle, le code après elle porte la consigne de tranche.
            break
        call_started = _monotonic()
        if tool_selection is not None:
            # #4112 — les outils découverts au round d'avant sont appelables maintenant.
            available_tools = tool_selection.current()
        try:
            # #3085 — le seau `claude_chat` est PARTAGÉ (Découvrir y puise aussi) :
            # à deux membres actifs en même temps, une attente de jeton qui
            # dépasse son échéance ne doit pas se distinguer d'un tour d'outils
            # trop long — même filet, même repli sur ce qui a déjà été récolté.
            # Sans `wait_deadline`, `throttle()` attendait un jeton jusqu'à SON
            # propre plafond fixe (30 s par défaut), sans savoir combien il
            # restait au TOUR — une saturation passagère de deux personnes qui
            # parlent à Laura en même temps faisait alors échouer tout le tour
            # au lieu de simplement patienter dans son propre budget.
            with wait_deadline(deadline):
                async with _ChatTurnThrottle(user_id):
                    turn = await turns.send(
                        # #3905.5/.6 (18/10) — le web ne passe jamais avant les comptes (chat_accounts_cascade).
                        tools=accounts_cascade.tools_for_round(
                            user_message, [str(a.get("tool") or "") for a in actions], available_tools
                        ),
                        timeout=min(_PER_CALL_TIMEOUT_S, remaining),
                        emit=emit,
                        **(
                            _forced_talent_accounts_kwargs(_round_index, user_message, available_tools)
                            or _forced_work_progress_kwargs(_round_index, user_message, available_tools)
                            or _forced_verdict_kwargs(_round_index, user_message, available_tools)
                            or _forced_portfolio_priorities_kwargs(_round_index, user_message, available_tools)
                            or _forced_action_plan_kwargs(_round_index, user_message, available_tools)
                            or _forced_document_projects_kwargs(_round_index, user_message, available_tools)
                            or _forced_contacts_by_zone_kwargs(_round_index, user_message, available_tools)
                            or _forced_known_people_kwargs(_round_index, user_message, available_tools)
                            or _forced_alternatives_kwargs(_round_index, user_message, available_tools)
                            or forced_next_step_kwargs(
                                chained_step,
                                _round_index,
                                available_tools,
                                called=[str(a.get("tool") or "") for a in actions],
                            )
                            or _forced_find_accounts_kwargs(_round_index, user_message, available_tools)
                            or _forced_closed_records_kwargs(_round_index, user_message, available_tools)
                            or _forced_default_gesture_kwargs(
                                _round_index,
                                user_message,
                                available_tools,
                                account_in_scope=bool(tier_context and tier_context.account_in_scope),
                                called=[str(a.get("tool") or "") for a in actions],
                            )
                            or _forced_pain_briefing_kwargs(
                                _round_index,
                                user_message,
                                available_tools,
                                account_in_scope=bool(tier_context and tier_context.account_in_scope),
                            )
                            or _forced_scope_acceptance_kwargs(
                                _round_index,
                                available_tools,
                                planned_token=scope_plan_token_seen,
                                started=any(a.get("tool") == _START_ANALYSIS_TOOL_NAME for a in actions),
                            )
                            or _forced_named_list_kwargs(
                                _round_index,
                                user_message,
                                available_tools,
                                called=[str(a.get("tool") or "") for a in actions],
                            )
                            or _forced_launch_analysis_kwargs(
                                _round_index,
                                user_message,
                                available_tools,
                                planned_token=scope_plan_token_seen,
                                started=any(a.get("tool") == _START_ANALYSIS_TOOL_NAME for a in actions),
                            )
                        ),
                    )
        except (_RoundTimeout, RateLimitTimeout):
            # Un tour d'outils qui déborde (ou un seau saturé) n'annule pas la
            # réponse : on passe au tour final avec ce qu'on a. Rendre 500 ici
            # jetterait le travail des outils déjà exécutés.
            logger.warning(
                "Tour d'outils du copilote dépassé (ou seau claude_chat saturé) — réponse finale sans outils"
            )
            break
        _observe(
            turn.usage,
            duration_s=_monotonic() - call_started,
            prompt_name=turns.prompt_name,
        )

        if not turn.tool_calls and not turn.text.strip() and actions:
            # BELLUM-IA-M — des outils ont tourné, puis le modèle a TERMINÉ son tour sans écrire un mot :
            # rendre cette sortie vide serait un tour sans issue (`no_outcome`). Ce n'est pas une fin : on
            # passe au tour final sans outil de travail, qui force la rédaction à partir de ce qui a été lu.
            empty_after_tools = True
            break
        if not turn.tool_calls:
            _self_check(turn.text, critical=critical, tool_outputs=tool_outputs, plan=plan)
            repaired = await _verify_and_repair(
                turn.text,
                emit=emit,
                interface_language=interface_language,
                tool_outputs=tool_outputs,
                status_sink=verifier_status_sink,
                reasons_sink=verifier_reasons_sink,
                notes_sink=reply_notes_sink,
                connected_families=connected_families,
                user_message=user_message,
                evidence_requirement=evidence_requirement,
                thread=thread,
            )
            _self_check(turn.text, critical=critical, tool_outputs=tool_outputs, plan=plan)
            _note_turn_observability(budget_exhausted=False, degraded_answer=False)
            # #3862.1 — une réponse complète en Approfondi referme l'étude
            # interrompue du fil (best-effort : jamais retarder ni faire tomber le tour).
            if continues_alone(plan):
                await chat_deepen_job_report.report_resolved(user_id=user_id, conversation_id=conversation_id)
            return repaired, actions

        # #3196.5 — un outil rappelé avec les MÊMES arguments qu'un round
        # précédent du même tour est un budget mal dépensé, jamais une
        # exécution qu'on bloque ici (voir le docstring de
        # `duplicate_call_names` — le rejeu du résultat reste hors tranche).
        _round_signatures = [call_signature(call.name, call.input) for call in turn.tool_calls]
        duplicate_names = duplicate_call_names(
            ((call.name, call.input) for call in turn.tool_calls),
            already_called=frozenset(called_signatures),
        )
        if duplicate_names:
            logger.warning(
                "Laura : appel(s) dupliqué(s) dans le même tour (mêmes arguments) duplicates=%s (cid=%s)",
                duplicate_names,
                get_correlation_id() or "?",
            )
        # Recette prod 07/10 (fix/demo-0810-r2b-laura) — ce qui était déjà
        # appelé AVANT ce round : une lecture neuve compte dans le gain.
        _called_before_round = frozenset(called_signatures)
        called_signatures.update(_round_signatures)

        # Exécute les appels d'outils de ce round — les LECTURES indépendantes
        # PARTENT ENSEMBLE, les ÉCRITURES restent séquentielles et à leur
        # place (voir `_batches_for_round`) — puis rend au transport le tour
        # assistant ET tous les résultats, dans l'ordre de `turn.tool_calls` :
        # c'est lui qui sait les rejouer dans SA forme.
        round_started = _monotonic()
        # #189.7 (épopée #3218, lot E3 28/09 suite) — instantané AVANT le
        # round, pour mesurer ce qu'IL a réellement changé (`deepening_gain.
        # marginal_gain`). Observation seule, comme le journal du Tool Planner
        # juste en dessous : ce module ne livre PAS #189.1 (le moteur qui
        # déciderait d'enchaîner un niveau de plus SUR cette mesure) — voir
        # `deepening_gain.py` et le commentaire de clôture sur #3218.
        thread_state_before = thread.state.copy() if thread is not None else None
        round_actions, results, stop = await _run_tool_round(
            turn.tool_calls,
            user_id=user_id,
            profile_data=profile_data,
            crm_connected=crm_connected,
            crm_provider=crm_provider,
            emit=emit,
            # #1943.3 — le plafond court sur le TOUR, pas sur le round : deux
            # rounds de deux propositions font quatre cartes sans ce compte.
            proposals_kept=sum(1 for action in actions if action.get("proposal") is not None),
            cost_budget=cost_budget,
            thread=thread,
            person_timezone=person_timezone,
            workspace_timezone=workspace_timezone,
            context_mode=context_mode,
            exclude_workspace_data=exclude_workspace_data,
            interface_language=interface_language,
            fanout_limit=plan.fanout_limit,
            # #3196.5 — traverse les rounds de CE tour : un round 2 qui répète
            # une lecture du round 1 la rejoue sans ré-appeler la source.
            replay_cache=replay_cache,
            excluded_families=excluded_families,
            tool_selection=tool_selection,
            user_message=user_message,
        )
        # #2281 / épopée #2969 — journal du Tool Planner (#2281.36-.44).
        # Observation SEULE : ne filtre ni ne réordonne `turn.tool_calls`, donc
        # aucun comportement de la boucle ne change. Fail-soft de bout en bout
        # (voir `tool_planner.summarize_and_record_round`), même geste que
        # `tool_call_audit` — un incident de journal ne doit jamais faire
        # planter un tour de chat par ailleurs correct.
        summarize_and_record_round(
            goal=tier_request or "",
            available_tool_names=tuple(dict.fromkeys(str(t["name"]) for t in available_tools)),
            chosen_tool_names=tuple(dict.fromkeys(call.name for call in turn.tool_calls)),
            latency_s=_monotonic() - round_started,
            result=(
                "error"
                if results and all(is_error for _c, _o, is_error in results)
                else ("partial" if any(is_error for _c, _o, is_error in results) else "success")
            ),
        )
        # #189.7 (épopée #3218, lot E3 28/09 suite) — le gain marginal RÉEL de
        # CE round (entités nouvellement résolues, décisions prises, pistes
        # tranchées — `thread.state` a déjà été mis à jour par `_run_tool_round`
        # via `thread.record`). Fail-soft, n'influence AUCUN comportement de
        # la boucle : aucun round n'est arrêté par cette mesure.
        if thread_state_before is not None:
            # Recette prod 07/10 (fix/demo-0810-r2b-laura) — `marginal_gain`
            # ne voit que `cited_objects` : un round qui a résolu un compte par
            # son nom ou posé une note de fil valait 0 et ARRÊTAIT le tour avant
            # la vraie lecture (Arquus : signaux jamais lus ; BFC : aucune
            # recherche). Une lecture neuve qui rend des données est un apport.
            # `max`, pas `+` : un compte résolu PAR une lecture ne compte qu'une fois.
            _gain = max(
                marginal_gain(thread_state_before, thread.state),
                fresh_evidence(
                    (
                        (call_signature(_call.name, _call.input), _output, _is_error)
                        for _call, _output, _is_error in results
                    ),
                    already_called=_called_before_round,
                ),
            )
            record_round_gain(round_index=_round_index, gain=_gain)
            round_gains.append(_gain)
        # #3857 (lot RBJ) — deux fiches du même nom : un bouton NOMMÉ par fiche, posé ici et non
        # laissé au modèle (recette prod 11/10 : « Laquelle veux-tu ouvrir ? » sans bouton).
        _homonym_action = _homonym_options_action(
            results, [*actions, *round_actions], thread=thread, language=interface_language
        )
        if _homonym_action is not None:
            round_actions.append(_homonym_action)
        actions.extend(round_actions)
        scope_plan_token_seen = scope_plan_token_seen or any(
            _call.name == _PLAN_ANALYSIS_TOOL_NAME
            and not _is_error
            and isinstance(_output, dict)
            and bool(_output.get("plan_token"))
            for _call, _output, _is_error in results
        )
        tool_outputs.extend(tool_output_text(output) for _call, output, _is_error in results)
        # #4611.10 — la lecture de l'avancement a répondu ? Sinon (erreur, délai) le tour S'ARRÊTE ici : le
        # modèle n'est pas rappelé pour raconter ce qu'il n'a pas lu.
        _progress_reads = [output for _call, output, _err in results if _call.name == GET_WORK_PROGRESS_TOOL_NAME]
        if _progress_reads:
            _refusal = progress_answer_gate(user_message, read=_progress_reads[-1], language=interface_language)
            if _refusal:
                _note_turn_observability(budget_exhausted=False, degraded_answer=True)
                return _refusal, actions
        _started, _failed = _analysis_outcomes(results)
        analyses_started.extend(_started)
        analyses_failed.extend(_failed)
        # #3229 — le rapport de couverture qu'un outil a construit sur ses
        # résultats réels, relayé à l'appelant par référence (jamais un ajout
        # au tuple ``(reply, actions)``). Une sortie sans rapport n'ajoute rien.
        if coverage_sink is not None:
            for _call, output, is_error in results:
                report = output.get("coverage_report") if isinstance(output, dict) and not is_error else None
                if not isinstance(report, dict):
                    continue
                # #3229 (recette prod 01/10) — le rapport d'un compte lu dans CE
                # tour fait foi : une recherche d'espace ne le remplace pas
                # (« 1959 détecté(s) » comptait tout l'espace, pas le compte).
                if _call.name == "get_account_contacts":
                    account_report_seen = True
                elif account_report_seen and _call.name == "search_workspace_contacts":
                    continue
                coverage_sink.append(report)
        if stop is not None:
            # Une clarification ARRÊTE le tour : continuer reviendrait à poser
            # la question puis à répondre quand même, ce qui la rend
            # décorative. On renvoie l'accumulateur DE CE tour (`actions`,
            # déjà étendu ci-dessus des rounds précédents ET de celui-ci) —
            # `stop[1]` ne porte que les actions du round courant.
            #
            # #1923.2-.5 — UNE QUESTION, PAS UN BLOCAGE. Le texte que le modèle
            # a écrit dans CE round est la réponse ; la question part dans la
            # CARTE (`actions[…]["clarification"]`, rendue par `chat.py` avec
            # ses options cliquables), jamais deux fois. Sans cette ligne, le
            # texte était JETÉ au profit de la question nue — donc l'hypothèse
            # par défaut que `_ONE_HYPOTHESIS` exige d'annoncer
            # (« Je pars sur Lyon. Tu peux corriger. ») n'atteignait jamais
            # l'écran, et une ambiguïté ARRÊTAIT le travail au lieu de le
            # cadrer. `stop[0]` (la question) reste le repli quand le modèle
            # n'a rien écrit : une réponse vide serait un tour sans issue.
            _note_turn_observability(budget_exhausted=False, degraded_answer=False)
            return (turn.text.strip() or stop[0]), actions
        # #1949.23 — décision Louis 13/09 batch 12 : un round qui ne porte QUE le
        # signal silencieux, À CÔTÉ d'un texte déjà écrit, est terminé. Renvoyer
        # le résultat au modèle paierait un aller-retour complet pour qu'il
        # répète ce qu'il vient de dire. Sans texte, la boucle continue : il
        # faut bien une réponse.
        if turn.text.strip() and all(call.name in _SILENT_TOOL_NAMES for call in turn.tool_calls):
            _self_check(turn.text, critical=critical, tool_outputs=tool_outputs, plan=plan)
            silent_repaired = await _verify_and_repair(
                turn.text,
                emit=emit,
                interface_language=interface_language,
                tool_outputs=tool_outputs,
                status_sink=verifier_status_sink,
                reasons_sink=verifier_reasons_sink,
                notes_sink=reply_notes_sink,
                connected_families=connected_families,
                user_message=user_message,
                evidence_requirement=evidence_requirement,
                thread=thread,
            )
        if turn.text.strip() and all(call.name in _SILENT_TOOL_NAMES for call in turn.tool_calls):
            _self_check(turn.text, critical=critical, tool_outputs=tool_outputs, plan=plan)
            _note_turn_observability(budget_exhausted=False, degraded_answer=False)
            # #3862.1 (reste) — même fermeture que la sortie « aucun outil
            # appelé » juste au-dessus : un round SILENCIEUX qui porte déjà la
            # réponse complète referme l'étude Approfondie tout autant.
            if continues_alone(plan):
                await chat_deepen_job_report.report_resolved(user_id=user_id, conversation_id=conversation_id)
            return silent_repaired, actions
        turns.record_round(turn, results)
        # #2276.41 — un round qui a touché une capacité critique impose la règle
        # des chiffres au tour suivant — une fois par tour, pas une par round.
        if not critical and round_is_critical(call.name for call in turn.tool_calls):
            critical = True
            turns.append_note(_CRITICAL_CONTROL_NOTE)
        rounds_completed += 1
        # #189.1/#189.7 — le moteur d'approfondissement : APRÈS un round
        # mesuré, il annonce le niveau suivant (PASS 0→3, note au modèle +
        # étape visible) ou ARRÊTE sur gain marginal nul. Il ne peut que
        # raccourcir le tour (le `break` mène au même tour final sans outil
        # que l'épuisement du budget), jamais le rallonger.
        if round_gains and _round_index + 1 < plan.tool_rounds:
            _decision = decide_next_pass(
                gains=round_gains,
                open_conflict=has_open_conflict(output for _c, output, _e in results),
                # #3863.4 — un seul round de résolution par tour.
                conflict_pass_spent=any(
                    t.get("kind") == "pass" and t.get("pass") == int(DeepeningPass.CONTRADICTION_RESOLUTION)
                    for t in deepening_trace
                ),
            )
            # #4438.1 — une recherche qui rend encore du neuf va jusqu'au bout de
            # SON budget : les quatre niveaux épuisés ne l'arrêtent pas, seul un
            # gain nul (ou le budget) le fait.
            if _decision.stop and _decision.reason == "passes_exhausted" and plan.research:
                continue
            # R22-LG (recette prod 22/10) — un zéro de l'espace (ou un outil en échec) n'arrête plus une
            # recherche avant la bascule externe : le palier suivant part DANS ce tour, borné.
            if (
                _decision.stop
                and _decision.reason == "marginal_gain"
                and keeps_widening_after_sterile_round(plan, round_gains)
            ):
                turns.append_note(_WIDEN_AFTER_STERILE_NOTE)
                continue
            if _decision.stop:
                logger.info("chat_orchestrator: approfondissement arrêté (%s)", _decision.reason)
                deepening_trace.append({"kind": "stop", "reason": _decision.reason})
                deepening_stopped = True
                break
            # #4421.7 — la liste demandée est rendue : aucun statut de remplissage avant le résultat.
            if _decision.next_pass is not None and not delivers_result(results):
                turns.append_note(pass_note(_decision.next_pass))
                deepening_trace.append({"kind": "pass", "pass": int(_decision.next_pass)})
                await emit({"type": "step", "label": pass_step_label(_decision.next_pass)})
    else:
        # #2442.15 — LE SEUL des deux chemins vers cette ligne qui est une
        # BOUCLE OUTIL : `for…else` ne s'exécute que si la boucle a consommé
        # TOUS ses rounds sans jamais `break` ni `return` — donc un outil a été
        # appelé à CHAQUE round jusqu'au plafond `_MAX_TOOL_ROUNDS`, sans que le
        # modèle ne s'arrête de lui-même. Le `break` d'un budget de temps épuisé
        # (ligne au-dessus) NE PASSE PAS ici : manquer de temps n'est pas
        # boucler. Même chemin de capture Sentry que `_record_turn_outcome` :
        # `logger.error`, jamais `capture_exception` en direct.
        #
        # BELLUM-IA-9 — l'épuisement SEUL n'est pas un défaut : le tour final
        # (ci-dessous, sans outil de travail) force une réponse à partir des
        # résultats déjà lus. L'erreur n'est levée que si CE dernier appel ne
        # rend aucun texte (voir plus bas) ; ici, un warning garde le fait visible.
        tool_rounds_exhausted = True
        logger.warning(
            "Boucle outil du copilote : %d round(s) d'outils consommés, réponse forcée sans outil (cid=%s)",
            plan.tool_rounds,
            get_correlation_id() or "?",
        )

    # Plus de rounds (ou plus de budget) : un dernier appel SANS outil DE
    # TRAVAIL force une réponse texte propre plutôt que de laisser la
    # conversation en suspens.
    #
    # #2269.14/.15/.16 — atteindre CE point (par `break` faute de temps, ou
    # par épuisement naturel de `range(_MAX_TOOL_ROUNDS)`) veut TOUJOURS dire
    # qu'aucun round n'a rendu de réponse propre : ni fin naturelle
    # (`not turn.tool_calls`), ni clarification, ni signal silencieux — sinon
    # la boucle serait déjà sortie par un `return`. Le modèle doit SAVOIR
    # qu'il n'a plus le droit d'aller chercher, sinon il annonce une
    # vérification qu'il ne fera pas ou présente un sous-ensemble comme un
    # tout.
    #
    # #3236.2 (a) — un tour APPROFONDI qui n'a pas fini ne se perd pas : le fil
    # garde le travail en suspens, le tour suivant propose de le reprendre.
    #
    # #4438.1 — généralisé à toute recherche/croisement (`continues_alone`) :
    # Laura ne propose plus la suite, la tâche de fond de reprise existante
    # (`chat_deepen_jobs`, balayée par l'API) la joue SEULE. Un arrêt décidé par
    # le moteur sur gain nul n'a rien à reprendre : rien n'est signalé.
    continue_alone = (
        continues_alone(plan) and not empty_after_tools and (plan.reason == "mode_approfondi" or not deepening_stopped)
    )
    if thread is not None and continue_alone:
        thread.note_unfinished_work(user_message or tier_request, rounds_completed, plan.tool_rounds)
    # #3236.2 (b, tranche) — ET ce qui a déjà été LU est mis de côté : le tour
    # suivant le rejoue au lieu de le relire (lectures seulement, durée courte).
    # ET l'API en tient un ENREGISTREMENT persistant (`chat_deepen_jobs`), que
    # l'écran de progression relit après un rechargement de page — ce que
    # `thread_state` ne peut pas tenir (borné à 17 Ko). Best-effort : un échec
    # de ce rapport ne retire rien à la tranche déjà prête à répondre.
    job_reported = False
    if continue_alone:
        await chat_resume_checkpoint.save(user_id, conversation_id, replay_cache)
        job_reported = await chat_deepen_job_report.report_interrupted(
            user_id=user_id,
            conversation_id=conversation_id,
            label=user_message or tier_request or "Approfondissement",
            completed_steps=rounds_completed,
            current_step=f"Budget du tour épuisé après {rounds_completed} tour(s) d'outils sur {plan.tool_rounds}",
        )
    # #3196.6 — l'observabilité du tour, exactement au moment où l'issue
    # #3196 la réclame en premier : le budget a manqué (`budget_exhausted`) et
    # la réponse qui suit sera une tranche (`degraded_answer`). `job_created`
    # reflète CE rapport (#3236.2b, tranche) — jamais un job qui continuerait
    # de travailler pendant la coupure, qui reste hors tranche.
    # Une fin vide n'est pas un budget manqué : la réponse est dégradée (forcée), pas une tranche.
    _note_turn_observability(budget_exhausted=not empty_after_tools, degraded_answer=True, job_created=job_reported)
    # R22-LG — « Je poursuis sur le reste » seulement quand quelque chose continue VRAIMENT (#4462.6).
    turns.append_note(_EMPTY_AFTER_TOOLS_NOTE if empty_after_tools else _partial_tranche_note(continues=continue_alone))
    # #4397 (N1) — des analyses sont parties avant la coupe : la réponse forcée les NOMME et dit le reste.
    _analyses_note = _launched_analyses_note(analyses_started, analyses_failed, interface_language)
    if _analyses_note:
        turns.append_note(_analyses_note)
    remaining = deadline - _monotonic()
    call_started = _monotonic()
    try:
        # #3085 — même filet que la boucle d'outils ci-dessus : un jeton
        # `claude_chat` qui n'arrive pas dans l'échéance du TOUR (et non dans
        # le plafond fixe du seau) dit la même chose qu'un tour final trop
        # long — le temps a manqué — jamais une panne générique.
        with wait_deadline(deadline):
            async with _ChatTurnThrottle(user_id):
                # #2679 — `_FINAL_CALL_TOOLS` (juste `offer_reply_options`), jamais
                # `tools=None` : voir le commentaire à sa définition.
                final = await turns.send(
                    tools=_FINAL_CALL_TOOLS,
                    timeout=max(_MIN_CALL_TIMEOUT_S, remaining),
                    emit=emit,
                )
    except (_RoundTimeout, RateLimitTimeout) as exc:
        raise ChatTurnTimeout("le tour de copilote a dépassé son budget") from exc
    _observe(
        final.usage,
        duration_s=_monotonic() - call_started,
        prompt_name=turns.prompt_name,
    )
    # #4453 (BELLUM-IA-9) — des outils ont tourné et le tour final forcé ne rend AUCUN texte : on redemande UNE
    # fois la rédaction (même consigne que BELLUM-IA-M), tant qu'il reste du temps au tour. Seul un second
    # silence reste un `logger.error` plus bas.
    remaining = deadline - _monotonic()
    if tool_rounds_exhausted and not final.text.strip() and remaining > _MIN_CALL_TIMEOUT_S:
        turns.append_note(_EMPTY_AFTER_TOOLS_NOTE)
        retry_started = _monotonic()
        try:
            with wait_deadline(deadline):
                async with _ChatTurnThrottle(user_id):
                    final = await turns.send(tools=_FINAL_CALL_TOOLS, timeout=remaining, emit=emit)
        except (_RoundTimeout, RateLimitTimeout) as exc:
            raise ChatTurnTimeout("le tour de copilote a dépassé son budget") from exc
        _observe(final.usage, duration_s=_monotonic() - retry_started, prompt_name=turns.prompt_name)
    # #2679 — le SEUL outil offert ici est silencieux et gratuit (pas de step,
    # pas de round de plus) : on l'exécute comme n'importe quel appel silencieux
    # pour que sa précision atterrisse dans `actions`, exactement comme dans la
    # boucle plus haut.
    if final.tool_calls:
        final_semaphore = asyncio.Semaphore(_TOOL_FANOUT_LIMIT)
        for call in final.tool_calls:
            entry, _output, _is_error = await _execute_one_tool(
                call,
                user_id=user_id,
                profile_data=profile_data,
                crm_connected=crm_connected,
                crm_provider=crm_provider,
                semaphore=final_semaphore,
                emit=emit,
                person_timezone=person_timezone,
                workspace_timezone=workspace_timezone,
                context_mode=context_mode,
                exclude_workspace_data=exclude_workspace_data,
                interface_language=interface_language,
                excluded_families=excluded_families,
            )
            actions.append(entry)
    if tool_rounds_exhausted and not final.text.strip():
        # Même le tour final forcé n'a rien rendu : l'utilisateur ne reçoit rien.
        logger.error(
            "Boucle outil du copilote : %d round(s) d'outils consommés sans réponse (cid=%s)",
            plan.tool_rounds,
            get_correlation_id() or "?",
        )
    _self_check(final.text, critical=critical, tool_outputs=tool_outputs, plan=plan)
    repaired_final = await _verify_and_repair(
        final.text,
        emit=emit,
        interface_language=interface_language,
        tool_outputs=tool_outputs,
        status_sink=verifier_status_sink,
        reasons_sink=verifier_reasons_sink,
        notes_sink=reply_notes_sink,
        connected_families=connected_families,
        user_message=user_message,
        evidence_requirement=evidence_requirement,
        thread=thread,
    )
    # #4438.2 — la ligne « ce qui continue » est posée par le code, jamais laissée au seul modèle.
    return ensure_continues_line(repaired_final, continue_alone), actions


#: #2276.41 — le contrôle d'un tour qui a lu de l'argent ou touché une capacité
#: critique. Posé APRÈS les résultats d'outils, avant l'appel suivant.
_CRITICAL_CONTROL_NOTE = (
    "CONTRÔLE — tu viens de lire des données critiques (argent, facturation, écriture hors de Bellum). "
    "Chaque chiffre de ta réponse doit venir TEL QUEL d'un résultat d'outil de ce tour, avec sa période. "
    "N'extrapole pas, ne calcule pas de tendance que les données ne donnent pas, et dis « non mesuré » "
    "plutôt que d'estimer. Une écriture reste une proposition à valider."
)


def _self_check(text: str, *, critical: bool, tool_outputs: list[str], plan: TurnPlan) -> None:
    """#2276.42 — le self-check se CHOISIT : il tourne sur un tour critique.

    Déterministe (aucun appel de modèle) : les chiffres de la réponse qu'aucun
    outil n'a rendus, les chiffres sans unité (#3207, #213.1/.3/.7) et les
    réclamations d'exhaustivité non nuancées (#3208, #214.4/.7) sont COMPTÉS
    dans une ligne de log — jamais cités (le texte de la réponse ne sort pas
    vers les journaux). Il ne réécrit pas la réponse : elle a déjà été affichée
    au fil de l'eau, et deux versions d'une même réponse seraient pires qu'une
    réponse mesurée.

    #214.4/.7 (épopée #3229) — la réclamation d'exhaustivité NON NUANCÉE se
    mesure sur TOUT tour (jamais réservée aux tours critiques : « tous les
    décideurs » n'a besoin ni d'argent ni d'écriture pour poser un problème).
    Aucun ``CoverageReport`` construit encore pour un tour de chat arbitraire
    ⇒ le ban reste INCONDITIONNEL, comme avant ce contrat.
    """
    # #3208 (#214.4, #214.7) — filet APRÈS coup : `COPILOT_FORBIDDEN_PHRASINGS`
    # bannit déjà « voici une analyse exhaustive » au niveau du prompt ; ceci
    # généralise aux formes que le prompt ne couvre pas encore. #3229 : mesuré
    # sur TOUT tour, donc une seule ligne, avant le filtre des tours critiques.
    claims = unjustified_absolute_claims(text)
    if claims:
        logger.warning(
            "Laura self-check : réclamations d'exhaustivité non justifiées claims=%d complex=%s (cid=%s)",
            len(claims),
            plan.complex,
            get_correlation_id() or "?",
        )
    if not critical:
        return
    missing = unverified_figures(text, tool_outputs)
    if missing:
        logger.warning(
            "Laura self-check : chiffres sans source dans un tour critique unverified=%d complex=%s (cid=%s)",
            len(missing),
            plan.complex,
            get_correlation_id() or "?",
        )
    # #3207 (#213.1, #213.3, #213.7) — un chiffre peut être ANCRÉ (ci-dessus) et
    # rester ambigu : « 41 consultants » est dans une sortie d'outil sans dire
    # si ce sont 41 personnes, 41 CV ou 41 observations.
    sans_unite = numbers_missing_unit(text)
    if sans_unite:
        logger.warning(
            "Laura self-check : chiffres sans unité dans un tour critique sans_unite=%d complex=%s (cid=%s)",
            len(sans_unite),
            plan.complex,
            get_correlation_id() or "?",
        )


def _commercial_verify(
    text: str,
    *,
    tool_outputs: list[str],
    status_sink: list[str] | None = None,
    reasons_sink: list[tuple[str, ...]] | None = None,
    connected_families: list[str] | None = None,
    user_message: str | None = None,
    evidence_requirement: str | None = None,
) -> VerifierResult:
    """#3190 — le PRE-RESPONSE COMMERCIAL VERIFIER, tranche déterministe
    (``commercial_verifier.verify_response``) : VÉRITÉ (chiffres sans source)
    et STYLE (formulation de template d'IA). Tourne sur TOUT tour, pas
    seulement les critiques (contrairement à ``_self_check``) : la spec ne
    réserve la checklist à aucun sous-ensemble de réponses.

    Même discipline que ``_self_check`` et ``chat_content_guards`` : un verdict
    JOURNALISÉ, jamais une réécriture — le texte a déjà été diffusé au fil de
    l'eau. ``repair`` reste un signal d'observabilité (#3190 ``verifier_status``
    / ``repair_reasons``), pas un blocage.

    ``status_sink`` (#3198, épopée #3223) : même patron que
    ``observability_sink`` — la liste de l'APPELANT, remplie par référence de
    ``result.status`` (``"pass"``/``"repair"``), pour exposer le verdict déjà
    calculé ici sans jamais le recalculer (GA-26) ni changer le contrat de
    retour de ``run_chat_with_tools``.

    ``connected_families`` (#3190.11 reste, épopée #3241) : relayé tel quel
    vers ``verify_response`` pour son volet RÉALISTE — jamais un second calcul
    de la même donnée que ``chat_tools.tools_for`` lit déjà pour retirer les
    outils non connectés du catalogue.

    ``user_message`` (#3192, LAU-FINAL-198) : le texte brut de la question de
    CE tour, relayé tel quel vers ``verify_response`` pour son contrôle de
    densité. ``None`` (le défaut) : ce contrôle ne tourne pas, comportement
    inchangé.
    """
    result = verify_response(
        text,
        tool_outputs=tool_outputs,
        connected_families=connected_families,
        user_message=user_message,
        evidence_requirement=evidence_requirement,
    )
    if status_sink is not None:
        status_sink.append(result.status)
    # #2879 (X17, #2442.15) — les MOTIFS (codes stables, jamais le texte) suivent le statut.
    if reasons_sink is not None:
        # #3223 (E12) — codes OBSERVATIONNELS en plus : la mémoire marché lue est-elle citée ?
        # #4183 — la réponse nomme-t-elle un fournisseur ou l'espace contributeur ? (observationnel)
        reasons_sink.append(
            (
                *result.repair_reasons,
                *market_memory_citation_codes(text, tool_outputs),
                *market_memory_boundary_codes(text, tool_outputs),
            )
        )
    if result.status == "repair":
        logger.warning(
            "Laura commercial verifier : REPAIR — motifs=%s (cid=%s)",
            ",".join(result.repair_reasons),
            get_correlation_id() or "?",
        )
    return result


async def _verify_and_repair(
    text: str,
    *,
    emit: EventSink,
    interface_language: str,
    **verify_kwargs: Any,
) -> str:
    """#3241 (#3190.2/.12/.13, lot P11 30/09) — verdict PUIS réparation active :
    le texte est déjà diffusé (pas de buffer, latence inchangée), la précision
    déterministe est donc émise ET renvoyée — jamais un texte affiché ≠ stocké.
    Sans motif réparable, le texte revient byte-identique."""
    thread = verify_kwargs.pop("thread", None)
    notes_sink: list[str] | None = verify_kwargs.pop("notes_sink", None)
    notes_before = len(notes_sink) if notes_sink is not None else 0
    result = _commercial_verify(text, **verify_kwargs)
    tools_answered = any(str(output).strip() for output in verify_kwargs.get("tool_outputs") or ())
    addendum = repair_addendum(result.repair_reasons, interface_language, tools_answered=tools_answered)
    if notes_sink is not None:
        # #5086 — « Précision : … » (revient sur #3241 : la limite ne s'ajoute plus au CORPS) va au panneau
        # Sources de la réponse ; le texte exact est tenu (#3190.2/.12 : rien n'est perdu, l'endroit change).
        notes_sink.extend(line for line in addendum.split("\n") if line.strip())
        addendum = ""
    # #3225 (Y14 02/10) — la ligne par entité d'une lecture de groupe, posée si le modèle l'a omise.
    if thread is not None:
        # #3224 (Y14 02/10) — contraintes nommées + arbitrage des contradictions nées CE tour.
        constraint_args = (text + addendum, thread.state.constraints)
        constraint_kwargs = {"turn": thread.state.turns, "language": interface_language}
        if notes_sink is None:
            addendum += constraint_turn_addendum(*constraint_args, **constraint_kwargs)
        else:
            # #5086 — « Contrainte retenue » (#3224) va au panneau Sources ; l'arbitrage reste dans le corps.
            note, arbitration = split_constraint_turn_addendum(*constraint_args, **constraint_kwargs)
            if note:
                notes_sink.append(note)
            addendum += "\n\n" + "\n".join(arbitration) if arbitration else ""
    addendum += group_reading_addendum(text + addendum, verify_kwargs.get("tool_outputs") or (), interface_language)
    moved_to_sources = notes_sink is not None and len(notes_sink) > notes_before
    if not addendum and not moved_to_sources:
        return text
    logger.warning(
        "Laura commercial verifier : %s — motifs=%s (cid=%s)",
        LIMIT_ADDED,
        ",".join(result.repair_reasons),
        get_correlation_id() or "?",
    )
    if not addendum:
        return text
    await emit({"type": "delta", "text": addendum})
    return text + addendum


# #3177/#3225 (D02, 30/09) — recette prod : « le groupe La Poste et ses
# filiales » ne rapportait aucun résultat malgré l'ancrage livré le 30/09 au
# matin (`_anchor_market_memory_on_persistent_scope`, lot Q02). Root cause :
# le geste naturel pour cette question est d'appeler `note_thread_context`
# (qui pose `group_scope_root`) ET `search_market_memory` dans le MÊME round.
# Les deux sont des LECTURES pour `_is_read_only_tool` (aucune n'écrit nulle
# part) donc elles partaient dans le MÊME lot concurrent ci-dessous —
# `_prepared_call` (l'ancrage) prépare TOUT le lot AVANT d'exécuter quoi que
# ce soit (voir `_run_tool_round`, `prepared = [_prepared_call(call, thread)
# for call in batch]`), donc `search_market_memory` était préparé avant que
# `note_thread_context` n'ait été exécuté et `thread.record()`é : l'ancrage
# lisait encore l'ancien `persistent_scope` (souvent `None`), l'appel
# repartait sans `company_id`, retombait sur l'axe critères (refusé faute de
# filtre, ou hors périmètre) — « filiales non couvertes ».
# `note_thread_context` est la SEULE lecture du catalogue dont la sortie
# change ce qu'un AUTRE outil du même round doit recevoir en entrée
# (l'ancrage de #3177.5) : elle ferme donc son lot comme une écriture, sans
# en devenir une pour le reste (retry, coupe-circuit — `_is_read_only_tool`
# ne change pas, seul l'ORDONNANCEMENT change).
_ROUND_ORDER_ISOLATED_TOOL_NAMES = frozenset({NOTE_THREAD_CONTEXT_TOOL_NAME})


def _batches_for_round(tool_calls: list[_ToolCall]) -> list[list[_ToolCall]]:
    """Regroupe les appels d'UN round en lots exécutables ENSEMBLE.

    Une LECTURE rejoint le lot de lectures en cours. Une ÉCRITURE ferme ce
    lot et ouvre le SIEN, à UN appel — jamais mêlée à un voisin, lecture ou
    écriture. `_ROUND_ORDER_ISOLATED_TOOL_NAMES` (#3177/#3225) suit la même
    règle qu'une écriture, pour la même raison : sa sortie doit être
    `record()`ée avant que le lot SUIVANT ne soit préparé, sinon un ancrage
    qui la lit (ex. `search_market_memory` sur `persistent_scope`) verrait un
    état périmé. L'ordre des lots, et l'ordre DANS chaque lot, restent celui
    de `tool_calls` : c'est ce qui garantit que les résultats reviennent dans
    le même ordre, quelle que soit l'ordonnance d'exécution."""
    batches: list[list[_ToolCall]] = []
    current_reads: list[_ToolCall] = []
    for call in tool_calls:
        if _is_read_only_tool(call.name) and call.name not in _ROUND_ORDER_ISOLATED_TOOL_NAMES:
            current_reads.append(call)
            continue
        if current_reads:
            batches.append(current_reads)
            current_reads = []
        batches.append([call])
    if current_reads:
        batches.append(current_reads)
    return batches


def tool_call_span_metadata(name: str, tool_input: Any) -> dict[str, Any]:
    """#3391.5 — POURQUOI un outil part : mode, CLÉS posées par le modèle, silence.

    Réservé au diagnostic interne (trace d'exploitation). Jamais une VALEUR :
    l'entrée d'un outil recopie la demande de la personne (#2442.3)."""
    keys = sorted(str(k) for k in tool_input) if isinstance(tool_input, dict) else []
    return {
        "tool": name,
        "mode": "read" if _is_read_only_tool(name) else "write",
        "input_keys": keys,
        "silent": name in _SILENT_TOOL_NAMES,
    }


def tools_detail_from_actions(actions: list[Any]) -> list[dict[str, Any]]:
    """#3391 — la raison des outils, PERSISTÉE (`reasoning_trace.tools_detail`) :
    la même forme que le span Langfuse, lisible dans le DM sans Langfuse.
    Clés d'entrée seulement, jamais une valeur (#2442.3)."""
    return [
        tool_call_span_metadata(str(a["tool"]), a.get("input"))
        for a in actions
        if isinstance(a, dict) and a.get("tool")
    ]


async def _execute_one_tool(
    call: _ToolCall,
    *,
    user_id: str,
    profile_data: dict | None,
    crm_connected: bool,
    crm_provider: str,
    semaphore: asyncio.Semaphore,
    emit: EventSink,
    person_timezone: str | None = None,
    workspace_timezone: str | None = None,
    context_mode: str | None = None,
    exclude_workspace_data: bool = False,
    interface_language: str = "fr",
    excluded_families: list[str] | None = None,
    tool_selection: ToolSelection | None = None,
) -> tuple[dict[str, Any], Any, bool]:
    """Exécute UN appel d'outil et rend (entrée pour `actions`, sortie brute,
    est-une-erreur). Extrait tel quel de l'ancienne boucle séquentielle — le
    comportement par appel ne change pas, seule l'ORDONNANCE change.

    Le ``step`` part AVANT le sémaphore (donc avant même de savoir si le lot
    est plein) : annoncer « je m'y mets » dès que le modèle a décidé l'appel,
    plutôt qu'une fois la place libre, est le signal le plus honnête pour un
    outil dans une file d'attente.

    #1949.23 / #2268 — les outils SILENCIEUX (`note_unrouted_request`,
    `note_thread_context`) n'annoncent aucune étape : ils ne font rien que la
    personne attende, et « Action en cours… » promettrait un travail qui n'a
    pas lieu."""
    if call.name not in _SILENT_TOOL_NAMES:
        await emit({"type": "step", "label": step_label(call.name, interface_language)})
    tool_input = call.input
    # #4112 — `chercher_un_outil` et le refus d'un outil non chargé se jouent ICI, sans réseau :
    # rien d'autre ne les connaît. Sélection éteinte (`None`) : jamais atteint, chemin identique.
    selection_output: dict[str, Any] | None = None
    if tool_selection is not None:
        selection_output = (
            tool_selection.run_search(tool_input)
            if call.name == SEARCH_TOOL_NAME
            else tool_selection.reject_unavailable(call.name)
        )
    async with semaphore:
        try:
            # #2442.12 (épopée #2879) — LE point d'entrée de CHAQUE outil de chat :
            # tout ce que l'outil déclare à `cost_ledger.record` (modèle,
            # recherche, scraping, enrichissement) porte son nom. Aucun outil
            # n'a à le savoir.
            with (
                langfuse_client.span(f"tool:{call.name}", metadata=tool_call_span_metadata(call.name, tool_input)),
                cost_ledger.bind_tool(call.name),
            ):
                # #2283 (épopée #2983) — retry typé + circuit breaker + dédup
                # autour du SEUL appel réel, `execute_chat_tool` (passé en
                # exécuteur plutôt qu'importé en dur dans `tool_resilience`,
                # pour que `monkeypatch.setattr(chat_orchestrator,
                # "execute_chat_tool", ...)` — déjà utilisé par
                # `test_chat_tool_round_concurrency.py` — continue de
                # s'appliquer sans modification de cette suite).
                output = (
                    selection_output
                    if selection_output is not None
                    else await execute_chat_tool_resilient(
                        call.name,
                        tool_input,
                        user_id=user_id,
                        executor=execute_chat_tool,
                        is_write_tool=not _is_read_only_tool(call.name),
                        profile_data=profile_data,
                        crm_connected=crm_connected,
                        crm_provider=crm_provider,
                        person_timezone=person_timezone,
                        workspace_timezone=workspace_timezone,
                        context_mode=context_mode,
                        excluded_families=excluded_families,
                        exclude_workspace_data=exclude_workspace_data,
                    )
                )
            if isinstance(output, dict) and output.get("outcome") == "unknown":
                # #2879/#2983 (28/09/2026) — un timeout sur un outil d'écriture
                # n'est pas un échec : `unknown` arrête la reprise (doctrine),
                # jamais peint comme `error`/`failed`.
                status = "unknown"
            elif isinstance(output, dict) and output.get("error"):
                status = "error"
            else:
                status = "done"
        except Exception as exc:  # noqa: BLE001 — on ne fait jamais planter le chat
            logger.error("Échec de l'outil de chat %s: %s", call.name, exc)
            output = {"error": str(exc)}
            status = "failed"
    entry: dict[str, Any] = {"tool": call.name, "input": tool_input, "status": status}
    # #4705 — combien de comptes la recherche par nom a RENDUS : seule preuve qu'un compte est (ou n'est pas) dans l'espace.
    if call.name == "search_workspace_accounts" and isinstance(output, dict) and isinstance(output.get("accounts"), list):
        entry["workspace_found"] = len(output["accounts"])
    # Outil d'écriture : l'exécuteur n'a RIEN fait, il a préparé. On remonte
    # la proposition telle quelle pour que l'interface l'affiche avec son
    # bouton de validation — c'est le clic qui exécute.
    if isinstance(output, dict) and output.get("status") == "pending_confirmation":
        entry["status"] = "pending_confirmation"
        entry["proposal"] = output.get("proposal")
    # #1949.23 — un signal NOTÉ n'est pas un outil « fait » : `turn_outcome`
    # ne doit pas compter un tour qui n'a fait que le signaler comme `acted`.
    if isinstance(output, dict) and output.get("status") == NOTED_STATUS:
        entry["status"] = NOTED_STATUS
    # #2679 — les réponses possibles d'une précision posée en TEXTE. Elles
    # voyagent sur l'entrée d'action, comme la carte juste en dessous, pour que
    # `chat.py` les pose dans le contexte du tour.
    #
    # Deux différences avec la carte, et elles sont le point : le tour n'est PAS
    # arrêté (`False` en troisième valeur comme ici, mais aucun `stop` plus
    # haut : l'outil est silencieux, pas bloquant), et le statut est NOTÉ — rien
    # n'a été fait, donc `turn_outcome` ne doit pas compter ce tour comme `acted`.
    # #1950.4 / .7 / .12 / .13 — le résumé du plan voyage sur l'entrée
    # d'action, comme les réponses possibles juste en dessous ; rien n'a été
    # fait, donc le statut est NOTÉ.
    if isinstance(output, dict) and output.get("status") == PLAN_BRIEF_STATUS:
        entry["status"] = NOTED_STATUS
        entry["plan_brief"] = output["plan_brief"]
        return entry, output, False
    if isinstance(output, dict) and output.get("status") == REPLY_OPTIONS_STATUS:
        entry["status"] = NOTED_STATUS
        entry["reply_options"] = output["reply_options"]
        return entry, output, False
    # #2276.1 — une fiche de job posée : rien n'est fait (statut NOTÉ, comme une
    # précision), la fiche voyage sur l'entrée pour que `chat.py` la pose dans le
    # contexte du tour. Le tour continue : Laura annonce le plan à confirmer.
    if isinstance(output, dict) and output.get("status") == LAURA_JOB_STATUS:
        entry["status"] = NOTED_STATUS
        entry["laura_job"] = output["laura_job"]
        return entry, output, False
    if isinstance(output, dict) and output.get("status") == "clarification":
        entry["status"] = "clarification"
        # #1927.3 / #1927.4 — la carte porte aussi ce que Laura a écarté et ce
        # qu'elle suppose. Les clés ne sont posées que si le modèle les a
        # NOMMÉES : une clé absente vaut « rien à dire », jamais une section vide
        # à l'écran.
        clarification: dict[str, Any] = {
            "question": output.get("question"),
            "options": output.get("options"),
        }
        if output.get("ruled_out"):
            clarification["ruled_out"] = output["ruled_out"]
        if output.get("assumptions"):
            clarification["assumptions"] = output["assumptions"]
        entry["clarification"] = clarification
        return entry, output, False
    try:
        _attach_output_hints(entry, call, output, interface_language=interface_language)
    except Exception as exc:  # noqa: BLE001 — R22-LG : une mise en forme en échec ne fait jamais tomber le tour
        logger.error("Mise en forme de la sortie de l'outil de chat %s en échec: %s", call.name, exc)
    return entry, output, status != "done"


def _attach_output_hints(entry: dict[str, Any], call: Any, output: Any, *, interface_language: str | None) -> None:
    """Ce que la sortie d'un outil pose sur son entrée d'action (sources, cartes, lectures de forme).

    R22-LG (recette prod 22/10, 1 erreur assistant sur 6 messages) — sorti de `_execute_one_tool` pour être
    PROTÉGÉ : une exception ici traversait `asyncio.gather` et faisait tomber le tour entier, au lieu de
    laisser Laura continuer avec les autres outils."""
    # Ce que cet outil est allé LIRE, avec sa date : le panneau de
    # transparence doit citer le dossier consulté au même titre qu'un
    # document, sinon la réponse la plus outillée est la moins sourcée.
    sources = cited_sources(call.name, output)
    if sources:
        entry["sources"] = sources
    # #3198 (épopée #3223) — `ReasoningTrace.profile_version`, relayé tel quel
    # depuis le dossier consulté ce tour, jamais un second calcul (GA-26).
    profile_version = profile_version_hint(call.name, output)
    if profile_version:
        entry["profile_version"] = profile_version
    # #3777 / #3717.7 (reste du lot W9) — même relais que `profile_version`
    # ci-dessus, pour que le replay du tour (back-office) porte l'identifiant
    # d'exécution du dossier consulté.
    execution_id = execution_id_hint(call.name, output)
    if execution_id:
        entry["execution_id"] = execution_id
    # #3395 (V02) — la carte verdict bâtie du résultat de l'outil, posée par
    # `run_chat_with_tools` si le modèle n'en a pas écrit (jamais doublée).
    if call.name == VERDICT_TOOL_NAME:
        # #3223.7 (#3198) — le statut rendu, pour la trace de raisonnement.
        account_verdict = verdict_status_of(output)
        if account_verdict:
            entry["account_verdict"] = account_verdict
        verdict_block = verdict_block_from_tool_output(output)
        if verdict_block:
            entry["verdict_block"] = verdict_block
        # #3223 (lot R17) — `GO_AFTER_PROOF` sur un grand compte, déjà nommé
        # par `compute_account_suitability` (GA-26, jamais un second calcul).
        if isinstance(output, dict) and output.get("large_account_without_access"):
            entry["large_account_without_access"] = True
    # #3229 (recette Y11 02/10) — la carte contacts bâtie du résultat de l'outil, posée par
    # `run_chat_with_tools` si le modèle n'en a pas écrit (jamais doublée).
    if call.name in CONTACT_TOOL_NAMES:
        contact_block = contact_block_from_tool_output(output, call.input)
        if contact_block:
            entry["contact_block"] = contact_block
    # #3707 / #3762 / #3767 / #3771 (lot L1 07/10) — la LECTURE d'un outil de forme connue, posée pour la
    # porte de forme (`known_shape_gate.route_known_shapes`, dans `run_chat_with_tools`) ; retirée avant l'écran.
    shape_read = shape_read_from_tool(call.name, output, language=interface_language)
    if shape_read:
        entry["shape_read"] = shape_read
    # #3758 (reste du lot J14) — la carte `post_meeting_summary`, bâtie du SEUL
    # compte rendu réellement enregistré que `get_account_briefing` vient de
    # lire (`last_meeting_recap`). Hors de `shape_read` : voir le docstring de
    # `meeting_recap_block_from_account_briefing` (même famille de traitement
    # que `verdict_block` / `contact_block`, jamais le registre générique).
    if call.name == "get_account_briefing":
        meeting_recap_block = meeting_recap_block_from_account_briefing(output, language=interface_language)
        if meeting_recap_block:
            entry["meeting_recap_block"] = meeting_recap_block
    # #2985 (lot E07 08/10) — la carte `manager_review`, bâtie du SEUL résultat de
    # `get_account_manager_review` (hors du registre générique, même famille de
    # traitement que `meeting_recap_block` ci-dessus : voir son docstring).
    if call.name == "get_account_manager_review":
        manager_review_block = manager_review_block_from_tool(output)
        if manager_review_block:
            entry["manager_review_block"] = manager_review_block
    # #4611.3 — la carte d'avancement, bâtie du SEUL résultat de `get_work_progress` (hors du registre
    # générique, même famille de traitement que `manager_review_block` ci-dessus). Retirée avant l'écran.
    if call.name == GET_WORK_PROGRESS_TOOL_NAME:
        progress_block = progress_block_from_output(output, language=interface_language)
        if progress_block:
            entry["progress_block"] = progress_block
    # #4705.2 — la carte de comparaison, bâtie du SEUL résultat de `compare_accounts` (retirée avant l'écran).
    if call.name == COMPARE_ACCOUNTS_TOOL_NAME:
        comparison_block = comparison_block_from_output(output, language=interface_language)
        if comparison_block:
            entry["comparison_block"] = comparison_block
    # #2955 (#2394.57, décision Louis 28/09) — les participants d'un fil lu par
    # `search_mailbox` CE tour : l'état de conversation que `chat.py` fusionne
    # dans `context["mail_threads"]`, jamais une nouvelle lecture de la
    # messagerie côté NestJS.
    mail_threads = mail_thread_hints(call.name, output)
    if mail_threads:
        entry["mail_threads"] = mail_threads
    # R22-LG (#4429.3) — le palier d'élargissement que la réponse doit nommer ; retiré par
    # `ensure_widening_line` avant l'écran, comme `shape_read`.
    widening_line = widening_line_from_output(output)
    if widening_line:
        entry["widening_line"] = widening_line
    # #4421.1 — « J'ai retenu… » (compétences, zone, dispo) : posé par le CODE, retiré avant l'écran.
    announce_line = announce_line_from_output(call.name, output)
    if announce_line:
        entry["announce_line"] = announce_line
    # #4430.9 — les offres datées que la réponse peut citer : leur date est posée par le CODE, retirée avant l'écran.
    offer_dates = offer_dates_from_output(call.name, output)
    if offer_dates:
        entry["offer_dates"] = offer_dates


class _ReplyCostBudget:
    """#1950.17 — le plafond de coût AGRÉGÉ d'une réponse, en crédits.

    Décision du 12/09/2026 : formaliser les cartes indépendantes que Laura
    propose déjà, avec un plafond agrégé. Il se calcule sur les coûts ANNONCÉS
    par les propositions (``cost_credits``) — la valeur du plafond vient de la
    grille (``LAURA_REPLY_COST_CEILING_CREDITS``, packages/contracts), lue par
    l'API et transmise ici : aucun chiffre n'est écrit dans ce service.

    Une carte qui franchirait le plafond n'atteint PAS l'écran, et le modèle lit
    à sa place une consigne qui lui fait proposer moins d'étapes et le DIRE. Rien
    n'est exécuté dans un sens ou dans l'autre : une proposition n'a jamais rien
    débité, elle attend un clic.

    Un coût absent ou nul ne s'additionne pas : « non annoncé » n'a rien à
    borner, et « gratuit » ne rapproche pas du plafond.
    """

    def __init__(self, *, ceiling: int) -> None:
        self.ceiling = ceiling
        self.spent = 0

    def admit(self, entry: dict[str, Any], output: Any, is_error: bool) -> tuple[Any, bool]:
        proposal = entry.get("proposal")
        if not isinstance(proposal, dict):
            return output, is_error
        cost = proposal.get("cost_credits")
        if isinstance(cost, bool) or not isinstance(cost, (int, float)) or cost <= 0:
            return output, is_error
        if self.spent + cost <= self.ceiling:
            self.spent += cost
            return output, is_error
        entry.pop("proposal", None)
        entry["status"] = "error"
        refusal = {
            "error": (
                "Plafond de cette réponse atteint : cette étape irait au-delà de ce qu'une seule réponse "
                "peut proposer. Ne la propose pas maintenant : propose moins d'étapes, et DIS à la personne "
                "que tu t'es arrêtée au plafond de cette réponse et ce qui resterait à faire ensuite."
            )
        }
        return refusal, True


def _stabilise_declared_dependencies(proposal: Any, *, own_index: int) -> None:
    """#1950.22 — réduit `proposal["depends_on"]` (déclaré côté `chat_tools.py`,
    déjà des entiers positifs dédupliqués) aux rangs qui existent RÉELLEMENT :
    ceux d'une proposition DÉJÀ gardée plus tôt dans ce même tour, donc
    strictement inférieurs à ``own_index``.

    Une référence à ``own_index`` lui-même (auto-référence) ou à un rang plus
    grand (une étape que le modèle n'a pas encore proposée) est REJETÉE — elle
    désignerait un pas encore né, jamais un résultat déjà là. Un
    ``depends_on`` qui devient vide après ce filtre est RETIRÉ (absent = aucune
    dépendance), plutôt que laissé à `[]` : le contrat (`copilot-card.ts`,
    `PLAN_DEPENDS_ON = z.array(...).optional()`, sans `.nullable()`) n'accepte
    qu'une clé absente, jamais `null`.
    """
    if not isinstance(proposal, dict):
        return
    raw = proposal.get("depends_on")
    if not isinstance(raw, list):
        return
    stable = [
        value for value in raw if isinstance(value, int) and not isinstance(value, bool) and 0 <= value < own_index
    ]
    if stable:
        proposal["depends_on"] = stable
    else:
        proposal.pop("depends_on", None)


async def _run_tool_round(
    tool_calls: list[_ToolCall],
    *,
    user_id: str,
    profile_data: dict | None,
    crm_connected: bool,
    crm_provider: str,
    emit: EventSink,
    proposals_kept: int = 0,
    cost_budget: _ReplyCostBudget | None = None,
    thread: ThreadStateCollector | None = None,
    person_timezone: str | None = None,
    workspace_timezone: str | None = None,
    context_mode: str | None = None,
    exclude_workspace_data: bool = False,
    fanout_limit: int = _TOOL_FANOUT_LIMIT,
    interface_language: str = "fr",
    replay_cache: dict[tuple[str, str], tuple[dict[str, Any], Any, bool]] | None = None,
    excluded_families: list[str] | None = None,
    tool_selection: ToolSelection | None = None,
    user_message: str | None = None,
) -> tuple[
    list[dict[str, Any]],
    list[tuple[_ToolCall, Any, bool]],
    tuple[str, list[dict[str, Any]]] | None,
]:
    """Exécute tous les appels d'UN round et rend (actions, results, arrêt?).

    #1943.3 — ``proposals_kept`` = les propositions déjà retenues dans les rounds
    PRÉCÉDENTS du même tour. Au-delà de ``_MAX_CARDS_PER_REPLY``, une proposition
    est abandonnée ICI, dans l'ordre de ``tool_calls`` (donc de façon
    déterministe) : son entrée perd ``proposal`` (``chat.py`` ne la met pas dans
    ``pending_actions``) et le modèle reçoit ``_NOT_PROPOSED_OUTPUT``.

    `arrêt` n'est pas `None` quand une clarification a été rencontrée : la
    conversation doit s'arrêter LÀ, avec (texte de la question, actions) à
    renvoyer immédiatement — exactement comme l'ancienne boucle, qui
    `return`ait au milieu du `for`. Les appels programmés APRÈS la
    clarification dans un même lot de lectures concurrentes ont pu, eux,
    déjà s'exécuter (ils sont partis ensemble) : tous sont des LECTURES par
    construction, donc cela ne produit ni écriture ni effet en trop — un
    compromis documenté, pas un oubli.

    `thread` (#1927) : l'affinage d'une recherche (`refine: true`) se résout
    AVANT l'exécution, LOT PAR LOT — un `refine` lancé dans le même lot de
    lectures concurrentes que la recherche qu'il affine lit l'état d'avant ce
    lot (même compromis que ci-dessus, et `find_accounts`, écriture, a
    toujours son lot à lui). Les sorties sont projetées sur l'état dans l'ORDRE
    des appels du modèle, jamais dans l'ordre d'arrivée.
    """
    actions: list[dict[str, Any]] = []
    results: list[tuple[_ToolCall, Any, bool]] = []
    # #2276.40 — la largeur d'un lot de lectures suit le plan du tour.
    semaphore = asyncio.Semaphore(fanout_limit)
    dropped = 0
    # #3196.5 (LAU-FINAL-202) — le REJEU : une LECTURE dont la signature
    # (nom + arguments, `call_signature`) a déjà un résultat dans CE tour ne
    # repart jamais sur le réseau — elle reprend le résultat déjà obtenu.
    # Restreint aux lectures (`_is_read_only_tool`) : une écriture n'est
    # JAMAIS idempotente par construction (crédit débité, job lancé,
    # proposition émise), la rejouer sans ré-exécuter changerait son sens.
    # `replay_cache` est tenu par l'APPELANT (`chat_orchestrator._chat_turns`
    # boucle principale) et traverse les rounds d'un même tour — un dict vide
    # ici (appelant qui ne le passe pas, ex. tests existants) garde le
    # comportement d'avant cette tranche à l'octet : tout est ré-exécuté.
    cache = {} if replay_cache is None else replay_cache
    for batch in _batches_for_round(tool_calls):
        prepared = [_prepared_call(_with_zone_breakdown(call, user_message), thread) for call in batch]
        signatures = [call_signature(call.name, call.input) for call in batch]
        to_execute = [
            i for i, call in enumerate(batch) if not (_is_read_only_tool(call.name) and signatures[i] in cache)
        ]
        # `asyncio.gather` rend ses résultats dans l'ORDRE des coroutines
        # passées, jamais celui de la première terminée — c'est ce qui
        # garantit l'invariant d'ordre sans bookkeeping supplémentaire.
        executed_outcomes = await asyncio.gather(
            *(
                _execute_one_tool(
                    prepared[i][0],
                    user_id=user_id,
                    profile_data=profile_data,
                    crm_connected=crm_connected,
                    crm_provider=crm_provider,
                    semaphore=semaphore,
                    emit=emit,
                    person_timezone=person_timezone,
                    workspace_timezone=workspace_timezone,
                    context_mode=context_mode,
                    exclude_workspace_data=exclude_workspace_data,
                    interface_language=interface_language,
                    excluded_families=excluded_families,
                    tool_selection=tool_selection,
                )
                for i in to_execute
            )
        )
        outcomes: list[tuple[dict[str, Any], Any, bool] | None] = [None] * len(batch)
        for i, outcome in zip(to_execute, executed_outcomes, strict=True):
            outcomes[i] = outcome
        for i in range(len(batch)):
            if outcomes[i] is None:
                cached_entry, cached_output, cached_is_error = cache[signatures[i]]
                # `replayed: True` : le SEUL marqueur ajouté — `chat.py` et
                # l'écran ignorent une clé inconnue, aucun contrat existant
                # ne change. Le nom reste cherchable tel quel (même règle que
                # `TurnObservability`, #3196.6).
                outcomes[i] = ({**cached_entry, "replayed": True}, cached_output, cached_is_error)
        # Chaque case a été remplie ci-dessus (exécutée ou rejouée) — le
        # `cast` est pour le vérificateur de types, pas un nouveau chemin.
        resolved_outcomes = cast("list[tuple[dict[str, Any], Any, bool]]", outcomes)
        for i, (call, (executed, refinement), (entry, output, is_error)) in enumerate(
            zip(batch, prepared, resolved_outcomes, strict=True)
        ):
            if _is_read_only_tool(call.name) and not entry.get("replayed"):
                cache.setdefault(signatures[i], (entry, output, is_error))
            if entry.get("proposal") is not None:
                # #1943.3 — 3 cartes au plus par réponse : la quatrième ne part pas.
                if proposals_kept >= _MAX_CARDS_PER_REPLY:
                    entry.pop("proposal", None)
                    entry["status"] = "not_proposed"
                    output = _NOT_PROPOSED_OUTPUT
                    dropped += 1
                else:
                    # #1950.17 — le plafond de COÛT se juge APRÈS celui des
                    # CARTES, et seulement sur une proposition qui atteindrait
                    # l'écran : une carte déjà écartée n'annonce aucun crédit,
                    # donc elle ne doit ni consommer un rang ni entamer le
                    # plafond de coût de la réponse.
                    if cost_budget is not None:
                        output, is_error = cost_budget.admit(entry, output, is_error)
                    if entry.get("proposal") is not None:
                        # #1950.22 — LA NUMÉROTATION QUI REND LES RÉFÉRENCES STABLES.
                        #
                        # `proposals_kept` (AVANT cet incrément) EST le rang que cette
                        # proposition va recevoir dans `pending_actions` — `chat.py`
                        # construit cette liste dans le même ordre, filtrée sur les
                        # mêmes entrées gardées (`[a["proposal"] for a in tool_actions
                        # if a.get("proposal")]`). C'est donc le SEUL endroit qui connaît
                        # ce rang : une dépendance déclarée par le modèle vers un rang qui
                        # n'existe pas ENCORE (elle-même, ou une étape plus tardive) est
                        # REJETÉE ici plutôt que relayée — une référence stable ne peut
                        # désigner qu'une étape déjà proposée dans ce même tour.
                        _stabilise_declared_dependencies(entry["proposal"], own_index=proposals_kept)
                        proposals_kept += 1
            actions.append(entry)
            if thread is not None:
                thread.record(executed.name, executed.input, output)
            if entry.get("status") == "clarification":
                _log_dropped_proposals(dropped)
                return actions, results, (str(output.get("question") or ""), actions)
            if refinement is not None and isinstance(output, dict):
                # Le modèle doit SAVOIR ce qui a été gardé : sans ce bilan, il
                # annoncerait « des comptes à Paris » sans dire qu'ils restent
                # industriels — la recherche serait juste, la phrase fausse.
                output = {**output, "refinement": refinement}
            results.append((call, output, is_error))
    _log_dropped_proposals(dropped)
    return actions, results, None


def _log_dropped_proposals(dropped: int) -> None:
    """Le journal d'une coupe : des NOMBRES, jamais le contenu d'une proposition
    (ni contact, ni note, ni destinataire)."""
    if dropped:
        logger.info(
            "Propositions au-delà du plafond de %d cartes par réponse abandonnées : %d",
            _MAX_CARDS_PER_REPLY,
            dropped,
        )


def _prepared_call(call: _ToolCall, thread: ThreadStateCollector | None) -> tuple[_ToolCall, dict[str, Any] | None]:
    """L'appel à EXÉCUTER (critères fusionnés si `refine: true`) et le bilan de
    l'affinage. Sans état, ou sans `refine`, c'est le MÊME appel : l'identifiant
    rendu au modèle (`call.id`) et la boucle d'avant #1927 ne changent pas."""
    if thread is None:
        return call, None
    effective, refinement = thread.prepare(call.name, call.input)
    return (call if effective is call.input else call._replace(input=effective)), refinement


# #3178 / #193.4 — les notes du tour (contrôle des chiffres, tranche partielle)
# voyagent au rôle `user` faute d'autre porte. Sans cadre, le modèle les lit
# comme une consigne de la PERSONNE et lui répond (« Compris. Pour la suite,
# je citerai chaque chiffre exactement… ») au lieu de traiter sa demande —
# mesuré en recette prod le 29/09 sur « Analyse le groupe Société Générale ».
_INTERNAL_NOTE_FRAME = (
    "[NOTE INTERNE DU SYSTÈME — la personne ne l'a pas écrite et ne la voit pas. "
    "N'y réponds pas, ne l'accuse pas réception (« compris », « pour la suite… »), ne la "
    "mentionne pas : applique-la en silence et réponds à la DEMANDE de la personne.]\n"
)


def _frame_internal_note(note: str) -> str:
    return _INTERNAL_NOTE_FRAME + note


def _append_user_note(messages: list[dict[str, Any]], note: str) -> None:
    """Ajoute une consigne au dernier tour utilisateur.

    Deux tours `user` consécutifs ne sont pas une forme sur laquelle compter :
    quand le dernier tour est déjà un tour utilisateur (les `tool_result`), la
    consigne rejoint son contenu au lieu d'ouvrir un tour de plus."""
    last = messages[-1] if messages else None
    note = _frame_internal_note(note)
    if isinstance(last, dict) and last.get("role") == "user" and isinstance(last.get("content"), list):
        last["content"] = [*last["content"], {"type": "text", "text": note}]
        return
    messages.append({"role": "user", "content": note})


def _text_of(response: Any) -> str:
    """Concatène les blocs texte (ignore thinking/tool_use), comme `_call_text`."""
    return "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
