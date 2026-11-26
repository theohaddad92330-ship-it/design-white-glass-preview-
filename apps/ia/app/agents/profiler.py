from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

import app.models.agent_error_adapters  # noqa: F401
from app.middleware.correlation_id import get_correlation_id
from app.models.agent_envelope import (
    AgentEnvelope,
    AgentError,
    AgentMeta,
    AgentStatus,
    ErrorService,
    ErrorSeverity,
    SourceHealth,
)
from app.models.profile_context import ProfileContext, ProfilerAnswers
from app.models.progress import ProfilerProgressCallback
from app.prompts.bellum_profiler import BELLUM_PROFILER_SYSTEM, build_profiler_user_prompt
from app.prompts.registry import prompt_version_for
from app.services import welcome_account_suggestions
from app.services.claude_service import CLAUDE_PROFILER_MODEL, ClaudeError, call_claude_sync
from app.services.progress import emit_profiler_progress

logger = logging.getLogger(__name__)


AGENT_NAME = "profiler"
AGENT_VERSION = "3.3.0"
PROMPT_NAME = "bellum_profiler"

# #2012.12 / épopée #2776 — la mémoire marché (`welcome_account_suggestions`)
# est une source FACULTATIVE : sa `RealAccountsRead.status` dit déjà, en toutes
# lettres, ce qui s'est passé (lue, illisible, ou jamais interrogée), mais rien
# ne traversait jusqu'à `ProfilerEnvelope` — l'enveloppe rendait un `SUCCESS`
# identique, que le corpus ait répondu ou soit tombé. Cette table est la SEULE
# traduction (GA-26) : `_market_memory_source_health` en est le seul appelant.
#
# "empty" reste OK : le corpus a RÉPONDU, il n'a juste rien trouvé — ce n'est
# pas une dégradation, c'est un fait. "no_caller"/"no_filter"/"not_configured"
# sont des SKIPPED : rien n'a été demandé, ce n'est pas une panne à signaler.
_MARKET_MEMORY_HEALTH: dict[str, SourceHealth] = {
    "ok": SourceHealth.OK,
    "empty": SourceHealth.OK,
    "unavailable": SourceHealth.DOWN,
    "no_caller": SourceHealth.SKIPPED,
    "no_filter": SourceHealth.SKIPPED,
    "not_configured": SourceHealth.SKIPPED,
}


def _market_memory_source_health(status: str | None) -> dict[str, SourceHealth] | None:
    if status is None:
        return None
    return {"market_memory": _MARKET_MEMORY_HEALTH.get(status, SourceHealth.SKIPPED)}


def _first(values: object, fallback: str = "") -> str:
    if isinstance(values, list) and values:
        return str(values[0])
    if isinstance(values, str) and values:
        return values
    return fallback


def _join(values: object, limit: int = 2, fallback: str = "") -> str:
    if isinstance(values, list) and values:
        return ", ".join(str(v) for v in values[:limit])
    if isinstance(values, str) and values:
        return values
    return fallback


def _identification_message(answers: ProfilerAnswers) -> str:
    esn = _first(answers.get("esn_name"), "")
    sectors = _join(answers.get("target_sectors"), 5, "tes secteurs cibles")
    return (
        f"À partir de tes réponses, j'identifie l'archétype et la posture commerciale "
        f"de ton ESN \"{esn}\" et je profile ton ICP sur \"{sectors}\"."
    )


def _personalization_message(answers: ProfilerAnswers) -> str:
    expertise = _join(answers.get("expertise_areas"),5, "tes expertises")
    sectors = _first(answers.get("target_sectors"), "ton secteur cible")
    return (
        f"Je règle la profondeur des recherches autour de \"{expertise}\", le "
        f"volume de contacts à extraire, le ton et la longueur des messages, et "
        f"les critères de scoring — calibrés pour {sectors}."
    )


def _coaching_message(answers: ProfilerAnswers) -> str:
    pain = _first(answers.get("main_sales_pain"), "ta douleur commerciale principale")
    positioning = _first(answers.get("positioning"), "ton positionnement")
    # #2007 — `user_role` (profil progressif §21-30) est désormais déclaré sur
    # `OnboardingAnswers` (voir routers/profiler.py) et atteint donc ce dict ;
    # LU ici pour de vrai, pas seulement transporté. Absent = phrase inchangée,
    # à l'octet près (comportement d'avant) ; présent = le conseil se
    # personnalise au rôle de la personne qui répond.
    role = _first(answers.get("user_role"), "")
    role_clause = f" — pensé pour ton rôle de {role}" if role else ""
    return (
        f"Je formule un point de vigilance sur \"{pain}\", un conseil direct "
        f"adapté à \"{positioning}\"{role_clause}, et des objectifs réalistes "
        "(cadence hebdo, KPI mensuels)."
    )


def _suggestions_message(answers: ProfilerAnswers) -> str:
    sectors = _join(answers.get("target_sectors"), 5, "tes secteurs")
    company_types = _first(answers.get("target_company_types"), "tes types de comptes")
    geo = _first(answers.get("geo_zones"), "ta zone")
    return (
        f"Je sélectionne 3/4 entreprises réelles à analyser en priorité - des "
        f"\"{company_types}\" dans {sectors}, sur {geo}."
    )


class ProfilerAgent:
    async def run(
        self,
        answers: ProfilerAnswers,
        *,
        progress_callback: ProfilerProgressCallback | None = None,
        user_id: str | None = None,
    ) -> AgentEnvelope[ProfileContext]:
        # #2069 — `user_id` est ce qui CLOISONNE la lecture des comptes réels : la
        # mémoire marché se lit au nom de l'appelant, jamais « au nom de
        # personne ». Accepté en argument nommé ET relu dans `answers`, pour que
        # le routeur puisse le passer de l'une ou l'autre façon. Absent des deux :
        # aucun appel réseau, aucune suggestion — jamais un nom deviné.
        started_at = datetime.now(timezone.utc)
        t0 = time.monotonic()
        correlation_id = get_correlation_id() or ""
        # #2012.12 / épopée #2776 — posé par `_generate` une fois la mémoire
        # marché lue ; `None` tant que la lecture n'a pas eu lieu (réponses
        # manquantes, ou une exception levée avant que `_generate` ne l'atteigne).
        market_memory_status: str | None = None

        def _meta() -> AgentMeta:
            return AgentMeta(
                agent_name=AGENT_NAME,
                agent_version=AGENT_VERSION,
                correlation_id=correlation_id,
                started_at=started_at.isoformat(),
                finished_at=datetime.now(timezone.utc).isoformat(),
                duration_ms=int((time.monotonic() - t0) * 1000),
                prompt_name=PROMPT_NAME,
                prompt_version=prompt_version_for("profiler"),
                model=CLAUDE_PROFILER_MODEL,
                source_health=_market_memory_source_health(market_memory_status),
            )

        if not answers:
            await emit_profiler_progress(
                progress_callback, "reading", "error",
                message="Réponses d'onboarding manquantes.",
            )
            return AgentEnvelope[ProfileContext](
                status=AgentStatus.TERMINAL_FAILURE,
                data=None,
                error=AgentError(
                    code="AGENT_PRECONDITION_FAILED",
                    service=ErrorService.PRECONDITION,
                    severity=ErrorSeverity.TERMINAL,
                    retryable=False,
                    user_message="Réponses d'onboarding manquantes.",
                    debug_message="ProfilerAgent.run requires non-empty `answers`; got an empty dict.",
                    context={"missing": "answers", "agent": AGENT_NAME},
                ),
                meta=_meta(),
            )

        try:
            await emit_profiler_progress(
                progress_callback, "reading", "started",
                message=_identification_message(answers),
            )

            context, accounts_read = await self._generate(answers, progress_callback, user_id=user_id)
            market_memory_status = accounts_read.status

            return AgentEnvelope[ProfileContext](
                status=AgentStatus.SUCCESS,
                data=context,
                error=None,
                meta=_meta(),
            )

        except asyncio.CancelledError:
            return AgentEnvelope[ProfileContext](
                status=AgentStatus.CANCELLED,
                data=None,
                error=None,
                meta=_meta(),
            )

        except ClaudeError as exc:
            logger.warning("ProfilerAgent: Claude error: %s", exc)
            await emit_profiler_progress(
                progress_callback, "thinking", "error",
                message=exc.user_message,
            )
            return AgentEnvelope[ProfileContext](
                status=AgentStatus.TERMINAL_FAILURE,
                data=None,
                error=AgentError.from_claude_error(
                    exc, context={"correlation_id": correlation_id}
                ),
                meta=_meta(),
            )

        except Exception as exc:  # noqa: BLE001
            logger.error("ProfilerAgent failed: %s", exc, exc_info=True)
            await emit_profiler_progress(
                progress_callback, "writing", "error",
                message="Une erreur est survenue.",
            )
            return AgentEnvelope[ProfileContext](
                status=AgentStatus.TERMINAL_FAILURE,
                data=None,
                error=AgentError.from_unexpected(exc, agent_name=AGENT_NAME),
                meta=_meta(),
            )

    async def _generate(
        self,
        answers: ProfilerAnswers,
        progress_callback: ProfilerProgressCallback | None,
        *,
        user_id: str | None = None,
    ) -> tuple[ProfileContext, welcome_account_suggestions.RealAccountsRead]:
        # #2069 — les entreprises proposées sur `/welcome` viennent de comptes
        # RÉELS (la mémoire marché de l'espace), ou elles n'existent pas. Le
        # prompt ne contient plus aucune consigne de génération de noms : sans
        # bloc à ajouter ici, `prompt_block` rend `""` et le prompt utilisateur
        # est byte-identique à celui d'avant l'injection. Le repli n'est jamais
        # d'inventer — une liste vide est un résultat juste.
        #
        # Ajouté ICI plutôt que dans `build_profiler_user_prompt` : la lecture est
        # asynchrone et réseau, et le constructeur de prompt reste une fonction
        # pure de `answers`, testable sans pont ni identité d'appelant.
        accounts = await welcome_account_suggestions.real_accounts_for(answers, user_id=user_id)
        user_prompt = build_profiler_user_prompt(answers) + welcome_account_suggestions.prompt_block(accounts)

        context, _usage = await asyncio.to_thread(
            call_claude_sync,
            BELLUM_PROFILER_SYSTEM,
            user_prompt,
            response_model=ProfileContext,
            max_tokens=4096,
            model=CLAUDE_PROFILER_MODEL,
            prompt_name=PROMPT_NAME,
        )

        # #2069.1 — les suggestions viennent d'une source, jamais du modèle.
        # Le bloc ci-dessus DEMANDE de ne reprendre que les noms injectés ; ici
        # on le VÉRIFIE. Mesuré en production le 15/09/2026 : quatre noms
        # cliquables (« BNP Paribas · Stellantis · Airbus · LVMH ») qu'aucune
        # source n'avait rendus, chacun lançant une analyse — une hallucination
        # devenue une dépense. Sans source lue, la liste sort VIDE : l'écran
        # tait alors sa section et « Analyser un compte » ouvre la recherche
        # libre (#1921.11).
        context.welcome_summary.first_analysis_suggestions = welcome_account_suggestions.keep_sourced(
            context.welcome_summary.first_analysis_suggestions, accounts
        )

        await emit_profiler_progress(progress_callback, "reading", "complete")

        await emit_profiler_progress(
            progress_callback, "thinking", "started",
            message=_personalization_message(answers),
        )
        await asyncio.sleep(3.0)
        await emit_profiler_progress(progress_callback, "thinking", "complete")

        await emit_profiler_progress(
            progress_callback, "writing", "started",
            message=_coaching_message(answers),
        )
        await asyncio.sleep(3.0)
        await emit_profiler_progress(progress_callback, "writing", "complete")

        await emit_profiler_progress(
            progress_callback, "done", "started",
            message=_suggestions_message(answers),
        )
        await asyncio.sleep(3.0)
        await emit_profiler_progress(progress_callback, "done", "complete")
        return context, accounts
