"""Single entry point for all Claude API calls.

Usage:
    # Structured output (Pydantic schema) — async
    result, usage = await call_claude("system", "user", response_model=ResearchOutput)

    # Structured output — sync (ProfilerAgent)
    result, usage = call_claude_sync("system", "user", response_model=ProfileContext)

    # Plain text (chat) — async
    text, usage = await call_claude("system", "user")

    # Free-form dict (prompts without a dedicated schema) — async
    data, usage = await call_claude("system", "user", response_model=dict)
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any, TypeVar, cast

import anthropic
import instructor
import sentry_sdk
from anthropic.types import Message
from instructor.exceptions import (
    IncompleteOutputException,
)
from pydantic import BaseModel, field_validator

from app.services import cost_ledger, langfuse_client, llm_batch, llm_response_cache, run_metrics
from app.services.prompt_cache_ttl import cache_ttl_for
from app.services.rate_limiter import throttle

logger = logging.getLogger(__name__)


# ── instructor : un seul tool_use par appel structuré ──────────────────────────
#
# En mode ANTHROPIC_TOOLS, si Claude émet plusieurs blocs ``tool_use`` en
# parallèle, la reask d'instructor n'attache un ``tool_result`` qu'à UN seul et
# Anthropic rend 400 « tool_use ids were found without tool_result blocks ».
# Jusqu'à instructor 1.13 on patchait un interne pour épingler
# ``disable_parallel_tool_use`` ; depuis 1.17 le handler v2 d'Anthropic
# (``instructor/v2/providers/anthropic/handlers.py``) l'épingle lui-même sur le
# ``tool_choice`` forcé. Plus de monkeypatch : un interne qui bouge à chaque bump
# était le défaut. La garde est ``tests/test_claude_service.py::TestSingleToolUseHardening``
# (elle échoue si un bump retire ce comportement natif).

T = TypeVar("T", bound=BaseModel)

CLAUDE_MODEL = "claude-sonnet-5"
CLAUDE_HAIKU_MODEL = "claude-haiku-4-5"
# Profiler is pure structured extraction from 10 inputs — Haiku is enough
# and ~30× cheaper than Opus.
CLAUDE_PROFILER_MODEL = CLAUDE_HAIKU_MODEL
DEFAULT_MAX_RETRIES = 2

# ── SDK transport retries: the ANTHROPIC CLIENT's own automatic replay ──────
#
# A DIFFERENT concept from ``DEFAULT_MAX_RETRIES`` above: that one is how many
# times INSTRUCTOR reasks the model when structured output fails Pydantic
# validation, passed as the ``max_retries`` kwarg of ``create_with_completion``.
# This one is the anthropic-sdk-python client's own HTTP-transport retry count
# (429 / 5xx / dropped connections) — set on ``AsyncAnthropic(...)`` itself, at
# construction. Left unset, the SDK defaults it to 2 (see
# ``anthropic._base_client.BaseClient.DEFAULT_MAX_RETRIES``): every one of this
# module's 4 client instantiations (``_call_structured``, ``_call_dict``,
# ``_call_text``, ``call_claude_with_citations``) was silently eligible to
# replay up to 3× — on top of whatever the caller already budgeted.
#
# Same arbitrage as ``chat_orchestrator._CLIENT_MAX_RETRIES`` (0), and the same
# reason, verbatim: a budget a library can multiply by three is not a budget.
# Kept as its OWN constant here rather than importing the copilote's — this
# module has no dependency on ``chat_orchestrator`` and shouldn't grow one just
# to share one integer; a follow-up could unify both under one import if that
# ever becomes worth the coupling.
_SDK_TRANSPORT_MAX_RETRIES = 0

# Sonnet 5 supports up to 64k output. We default high enough that the 6k cap
# (which used to fire ``IncompleteOutputException`` on rich accounts and burn
# 24 min in instructor + BullMQ retries) is no longer the bottleneck. Caller
# can override per prompt.
DEFAULT_MAX_TOKENS = 16384
DEFAULT_TIMEOUT = 300.0

# ── Sampling determinism ───────────────────────────────────────────────────────
# The Anthropic SDK leaves ``temperature`` NOT_GIVEN and the API then defaults to
# 1.0 — max entropy. Every prompt family (facts, signals, strategy, contacts,
# classification, organigramme, plan, messages) ran at 1.0, so two analyses of the
# same company legitimately disagreed on facts, contact count and play selection.
# Worse: ``max_retries`` and the truncation-retry below each draw a FRESH sample,
# so one logical call could be several independent rolls.
#
# 0.0 = greedy decoding: same prompt + same corpus → same output. It does not make
# the pipeline fully deterministic on its own (the corpus still varies — see
# ``source_health``), but it removes the one source of variance with no upside.
#
# Overridable for the rare prompt that genuinely wants variety (e.g. regenerating
# alternative outreach drafts).
DEFAULT_TEMPERATURE = 0.0


def _resolve_temperature() -> float:
    raw = os.getenv("CLAUDE_TEMPERATURE", "").strip()
    if not raw:
        return DEFAULT_TEMPERATURE
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Invalid CLAUDE_TEMPERATURE=%r — falling back to %s", raw, DEFAULT_TEMPERATURE)
        return DEFAULT_TEMPERATURE
    # Anthropic accepts [0, 1]; clamp rather than 400 mid-analysis.
    return min(max(value, 0.0), 1.0)


CLAUDE_TEMPERATURE = _resolve_temperature()


# ── Which models still accept sampling parameters ──────────────────────────────
# Anthropic REMOVED ``temperature`` / ``top_p`` / ``top_k`` on the current
# frontier line (Sonnet 5, Opus 4.7/4.8, Fable 5). Sending a non-default value
# there is not ignored and not deprecated-with-a-warning — it is a hard
# ``400 invalid_request_error: 'temperature' is deprecated for this model``.
#
# That 400 is the one provider error the pipeline CANNOT degrade around: every
# source in phase 1 soft-fails to an empty result, but Claude *is* the engine,
# so a 400 on every call kills every analysis in seconds. It is exactly how the
# default-model bump to ``claude-sonnet-5`` took production down while the
# pipeline still pinned ``temperature=0.0``.
#
# Allow-list rather than deny-list, and unknown ⇒ omit. A model we don't
# recognise is far more likely to be a NEW one (the frontier has removed
# sampling params and is not bringing them back) than a revived legacy one.
# Guessing "send it" costs a total outage; guessing "omit it" costs determinism
# on a single model. We take the cheaper mistake — and log it, so the loss of
# greedy decoding is never silent.
_SAMPLING_CAPABLE_MODELS: tuple[str, ...] = (
    "claude-haiku-4-5",
    "claude-haiku-3",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4-0",
    "claude-opus-4-6",
    "claude-opus-4-5",
    "claude-opus-4-1",
    "claude-opus-4-0",
)

_warned_sampling_models: set[str] = set()


def supports_sampling_params(model: str) -> bool:
    """True when an **Anthropic** ``model`` still accepts ``temperature``/``top_p``/``top_k``.

    ⚠️ L'allow-list ci-dessus ne contient que des modèles Claude : cette fonction
    répond donc « non » pour TOUT identifiant OpenAI. C'est correct — la décision
    OpenAI est une AUTRE décision, elle vit chez le fournisseur OpenAI
    (``llm_gateway._openai_sampling_kwargs``). Pendant un temps les deux se
    contredisaient : celle-ci disait « non » pendant que ``OpenAIProvider._invoke``
    envoyait ``temperature`` inconditionnellement.
    """
    return (model or "").strip().startswith(_SAMPLING_CAPABLE_MODELS)


def _sampling_kwargs(model: str) -> dict[str, float]:
    """The sampling kwargs to splat into an **Anthropic** Messages API call.

    ``{"temperature": N}`` where the model accepts it, ``{}`` where sending it
    would 400. Callers splat this instead of passing ``temperature=`` directly,
    so the Anthropic decision lives in exactly one place.

    ⚠️ Cette décision ne peut PAS déménager dans ``llm_gateway.AnthropicProvider`` :
    deux chemins l'appellent sans jamais passer par le gateway —
    ``call_claude_sync`` (qui va droit à ``_call_sync``) et
    ``chat_orchestrator.py``. Les en priver rejouerait la panne totale du 400
    ``temperature`` sur Sonnet 5. Le fournisseur OpenAI a sa propre fonction.
    """
    if supports_sampling_params(model):
        return {"temperature": CLAUDE_TEMPERATURE}
    if model not in _warned_sampling_models:
        _warned_sampling_models.add(model)
        logger.info(
            "Model %s does not accept sampling parameters — omitting temperature. "
            "Output is no longer greedy-decoded; steer determinism via the prompt.",
            model,
        )
    return {}


# Hard ceiling on the auto-retry-with-doubled-budget recovery path: even if a
# caller starts low (e.g. 2k), we don't want a runaway 64k retry burning $$.
# Sonnet 5 caps at 64k output anyway, so this is the technical max too.
TRUNCATION_RETRY_CAP = 16384

DICT_ENVELOPE_INSTRUCTION = '\n\nWrap your entire JSON response inside a "data" key: {"data": {... your response ...}}'


# ── Typed errors ──────────────────────────────────────────────────────────────
#
# instructor raises ``IncompleteOutputException`` (then re-wraps it in
# ``InstructorRetryException`` after exhausting retries) when Claude truncates
# the JSON mid-output. The previous behaviour was to bubble that as a generic
# 502 with no user-facing French sentence, costing 4 min × attempt × 3 retries
# in production. We translate to a typed ``ClaudeError`` that the FastAPI
# handler in ``app.main`` maps to a 422 with ``user_message``, so the API
# worker fails fast and the analysis card shows a concrete cause.


# #4068.1 — le message destiné à l'utilisateur ne nomme jamais le fournisseur du modèle.
class ClaudeError(Exception):
    """Base class for Claude failures we surface to the API worker."""

    service = "claude"
    code = "CLAUDE_UNKNOWN"
    user_message = "Erreur inattendue du modèle d'IA. Détails techniques dans les logs."


class ClaudeIncompleteOutputError(ClaudeError):
    """Wraps instructor's ``IncompleteOutputException``: Claude hit
    ``stop_reason == "max_tokens"`` mid-JSON, the partial output cannot be
    parsed, and retries with the same budget will repeat the same failure.
    """

    code = "CLAUDE_OUTPUT_TRUNCATED"
    user_message = "Réponse du modèle d'IA tronquée (max_tokens atteint). L'analyse a été annulée — l'équipe a été notifiée."

    def __init__(self, *, prompt_name: str, model: str, max_tokens: int) -> None:
        self.prompt_name = prompt_name
        self.model = model
        self.max_tokens = max_tokens
        super().__init__(f"Claude truncated output for prompt={prompt_name} model={model} max_tokens={max_tokens}")


def _is_truncation(exc: BaseException) -> bool:
    """Detect a max_tokens truncation anywhere in instructor's exception chain.

    The real chain instructor builds in production is two levels deep:
    ``InstructorRetryException → tenacity.RetryError → IncompleteOutputException``
    so a single ``__cause__`` lookup misses it. We walk the whole
    cause/context chain instead, guarded against pathological cycles.
    """
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, IncompleteOutputException):
            return True
        current = current.__cause__ or current.__context__
    return False


# ── Télémétrie de troncature ──────────────────────────────────────────────────
#
# Une réponse coupée à ``max_tokens`` est facturée intégralement PUIS jetée : le
# JSON partiel n'est pas parsable, donc le batch de contacts est droppé, le
# vocabulaire reste inchangé, la section de plan disparaît. Le code retentait
# déjà en doublant le budget — mais sans jamais compter ce que la tentative
# perdue avait coûté, si bien qu'aucun plafond ``max_tokens`` ne pouvait être
# arbitré sur des chiffres. Les compteurs ci-dessous rendent cette perte visible
# par prompt (log structuré + accumulateur lisible par la télémétrie de phase).


@dataclass(frozen=True)
class TruncationStats:
    """Ce qu'un prompt a jeté à la poubelle sur la durée du process."""

    events: int = 0
    wasted_output_tokens: int = 0
    wasted_cost_usd: float = 0.0


_TRUNCATIONS: dict[str, TruncationStats] = {}


def truncation_counters() -> dict[str, TruncationStats]:
    """Copie des compteurs de troncature, indexés par ``prompt_name``."""
    return dict(_TRUNCATIONS)


def reset_truncation_counters() -> None:
    _TRUNCATIONS.clear()


def _record_truncation(*, prompt_name: str, model: str, attempt_max: int, retrying: bool) -> None:
    """Comptabilise une génération tronquée et la logue avec son coût.

    Le nombre de tokens perdus est ``attempt_max`` : une troncature signifie par
    définition que le modèle a rempli son plafond. C'est un plancher exact, pas
    une estimation.
    """
    wasted_cost = _compute_cost(0, attempt_max, model)
    previous = _TRUNCATIONS.get(prompt_name, TruncationStats())
    _TRUNCATIONS[prompt_name] = TruncationStats(
        events=previous.events + 1,
        wasted_output_tokens=previous.wasted_output_tokens + attempt_max,
        wasted_cost_usd=previous.wasted_cost_usd + wasted_cost,
    )
    logger.warning(
        "Claude troncature [%s] %s — %d tokens de sortie jetés (~$%.4f), %s",
        model,
        prompt_name,
        attempt_max,
        wasted_cost,
        "nouvelle tentative au budget doublé" if retrying else "abandon (plafond atteint)",
    )


# Nom canonique d'un fournisseur de modèles. Il vit ICI et non dans
# ``llm_gateway`` parce que ``TokenUsage`` le PORTE, et que ``claude_service``
# ne peut pas importer le gateway (cycle d'import : le gateway l'importe déjà).
# ``llm_gateway`` réexporte les deux noms, donc le réglage reste à UN endroit.
PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_OPENAI = "openai"


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int
    output_tokens: int
    model: str
    cost_usd: float
    # C3 prompt-cache (cache_control: ephemeral). ``cache_read`` = input served
    # from cache (billed ~0.1×), ``cache_creation`` = cache writes (~1.25×).
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    #: QUI a produit cet usage. Le défaut ``anthropic`` est ce qui permet aux 19
    #: sites d'appel de ``call_claude`` d'ignorer complètement le sujet : seul un
    #: fournisseur NON-Anthropic a quelque chose à déclarer. Avant ce champ,
    #: ``_log_usage`` — appelé par les DEUX fournisseurs — écrivait « anthropic »
    #: en dur dans le registre du run et dans la ligne de log, si bien qu'un
    #: appel OpenAI atterrissait dans ``provider_costs`` sous la mauvaise
    #: étiquette. Le back-office lit cette table pour répondre à « lequel a monté
    #: quand la facture monte » : la réponse était structurellement fausse.
    provider: str = PROVIDER_ANTHROPIC
    #: ``False`` = le TARIF de ce modèle est inconnu ; ``cost_usd`` ne vaut alors
    #: rien et ne doit être lu par personne comme un prix.
    #:
    #: ⚠️ Pourquoi 0.0 et pas ``None`` : une douzaine d'agrégats hors du
    #: périmètre de ce fichier font ``+= usage.cost_usd`` (``routers/phase1``,
    #: ``routers/phase4``, ``self_consistency``, ``classification``). Élargir le
    #: type les casserait tous. Le compromis assumé : le float reste un float,
    #: et TOUT ce qui sort du process porte l'inconnu — ``cost_ledger`` reçoit
    #: ``None`` (« non tarifé », colonne ``provider_costs.cost_usd`` NULLABLE),
    #: Langfuse ne reçoit aucun ``costDetails``, la ligne de log dit « non
    #: tarifé », et ``PromptCost.unpriced_calls`` compte le trou pour
    #: ``GET /metrics/cost``. Un zéro qui se lirait « gratuit » n'est visible
    #: nulle part.
    cost_known: bool = True
    #: #2440.19 — la grille de prix qui a produit ``cost_usd``, POSÉE PAR LE
    #: FOURNISSEUR (même geste que ``provider`` juste au-dessus, et pour la
    #: même raison : ce fichier ne peut pas importer ``llm_gateway`` pour lire
    #: sa constante OpenAI). ``None`` quand ``cost_known`` est faux — un appel
    #: non tarifé n'a appliqué aucune grille, il n'y a rien à citer.
    tariff_version: str | None = None
    #: CACHE-LLM (15/10) — pourquoi le fournisseur a arrêté d'écrire, quand on le
    #: sait (``end_turn``, ``max_tokens``…). Lu par le cache de réponse : une
    #: sortie coupée à ``max_tokens`` n'est JAMAIS gardée. ``None`` = non relevé.
    stop_reason: str | None = None


def usage_from_failed_structured_call(exc: BaseException, model: str) -> TokenUsage | None:
    """Ce qu'un appel structuré qui a fini par ÉCHOUER a réellement coûté.

    Un échec de validation n'est pas gratuit : ``instructor`` a payé la première
    réponse puis chaque reask. ``InstructorRetryException`` porte le cumul —
    ``update_total_usage`` remplace l'``usage`` de la dernière réponse par le
    total des tentatives — et le perdre ferait mentir la facture du run vers le
    BAS, là où l'utilisateur, lui, est débité.

    Rend ``None`` quand rien de mesurable n'est attaché. C'est la règle la plus
    dure du dépôt : **« non mesuré » n'est pas « 0 »**. Un ``TokenUsage`` à zéro
    se lirait « cet appel n'a rien coûté », ce qui est faux ; l'appelant doit
    alors OMETTRE la phase de son décompte plutôt qu'y écrire un zéro.
    """
    completion = getattr(exc, "last_completion", None)
    usage = getattr(completion, "usage", None)
    if usage is None:
        return None
    inp = int(getattr(usage, "input_tokens", 0) or 0)
    out = int(getattr(usage, "output_tokens", 0) or 0)
    cache_read, cache_creation = _cache_tokens(usage)
    # Même construction que ``_build_usage`` sur le chemin qui réussit : le
    # tarif se résout de la même façon, donc un échec et un succès du MÊME
    # modèle se comptent au même barème.
    return TokenUsage(
        input_tokens=inp,
        output_tokens=out,
        model=model,
        cost_usd=_compute_cost(inp, out, model, cache_read, cache_creation, _cache_write_1h_tokens(usage)),
        cache_read_tokens=cache_read,
        cache_creation_tokens=cache_creation,
        tariff_version=ANTHROPIC_PRICING_VERSION,
    )


def phase_token_usage(phases: dict[str, TokenUsage]) -> dict[str, Any]:
    """Aggregate per-phase Claude usage into the ``_api_metrics.token_usage`` blob:
    run totals **plus** a per-phase breakdown.

    ``phases`` maps a phase label (``facts`` / ``signals`` / ``strategy``) to its
    ``TokenUsage``. The per-phase ``output_tokens`` is the instrument #274 needs to
    baseline ``bellum_strategy`` specifically (the biggest generation post) — the run
    total alone can't attribute which phase to shrink.

    Top-level keys stay byte-for-byte compatible with the previous inline dict
    (``_token_usage_from_metrics`` reads them); ``by_phase`` is purely additive.
    """

    def _one(u: TokenUsage) -> dict[str, Any]:
        return {
            "input_tokens": u.input_tokens,
            "output_tokens": u.output_tokens,
            "cost_usd": u.cost_usd,
            "cache_read_input_tokens": u.cache_read_tokens,
            "cache_creation_input_tokens": u.cache_creation_tokens,
        }

    values = list(phases.values())
    return {
        "input_tokens": sum(u.input_tokens for u in values),
        "output_tokens": sum(u.output_tokens for u in values),
        "cost_usd": sum(u.cost_usd for u in values),
        "cache_read_input_tokens": sum(u.cache_read_tokens for u in values),
        "cache_creation_input_tokens": sum(u.cache_creation_tokens for u in values),
        "by_phase": {name: _one(u) for name, u in phases.items()},
    }


def _get_api_key() -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
    return api_key


#: Marqueur qu'un CONSTRUCTEUR de prompt (``bellum_advisor.build_system_prompt``)
#: pose entre des segments qui doivent atterrir dans des blocs
#: ``cache_control`` SÉPARÉS. Un seul point de coupure à la fin du texte fait
#: porter le cache sur TOUT le préfixe : dès que la tête du texte contient du
#: contenu qui change à chaque tour, ce préfixe entier rate le cache — y
#: compris la queue qui, elle, n'a jamais bougé (GA-293, « le cache de prompt
#: de Laura, annulé par l'ordre des blocs »). Un texte SEGMENTÉ reçoit un
#: point de coupure par frontière stable au lieu d'un seul à la fin.
#:
#: ⚠️ GA-309 (12/09/2026) : la V1 de ce marqueur utilisait ``\x00`` (un octet
#: NUL) comme délimiteur. Il a fui tel quel dans ``tests/golden/system/
#: advisor.txt`` (4 octets NUL bruts) — invisible en revue tant que le NUL
#: reste hors de la fenêtre de ~8 000 octets que git scrute pour décider
#: « binaire », mais un fichier qui raccourcit ou un marqueur qui remonte
#: suffit à faire disparaître un diff de golden d'une pull request, sans
#: qu'aucun outil (typecheck, ESLint, la suite) ne le signale. La V2 retire
#: la CLASSE entière du problème plutôt que son seul symptôme : un jeton
#: entièrement IMPRIMABLE (ASCII visible), improbable dans une prose
#: française, un gabarit ou un document collé, mais qui ne peut PAR
#: CONSTRUCTION plus jamais introduire de NUL dans un texte assemblé — donc
#: plus jamais dans un golden, un journal ou un export Langfuse.
#: Vit ICI (pas dans ``bellum_advisor.py``) parce que c'est la primitive de
#: cache, ``_cached_system``, qui doit être la SEULE à savoir le reconnaître :
#: un deuxième marqueur inventé ailleurs divergerait du premier.
CACHE_SEGMENT_BREAK = "<<<BELLUM_CACHE_BREAKPOINT_v2>>>"


def cache_control_block(ttl: str | None = None) -> dict[str, str]:
    """Le marqueur ``cache_control`` — 5 min par défaut (forme d'avant, à l'octet),
    ``ttl="1h"`` pour une relecture espacée de 5 à 60 min (écriture à 2×)."""
    return {"type": "ephemeral", "ttl": ttl} if ttl else {"type": "ephemeral"}


def _cached_system(text: str, *, enabled: bool = True, ttl: str | None = None) -> list[dict[str, Any]] | str:
    """C3: wrap the system prompt in ``cache_control: ephemeral`` block(s) so
    Anthropic prompt-caches it. System prompts are large and reused — the SAME
    Phase-4 system prompt is sent for all 6 sections, and a phase's system
    prompt repeats across companies within the ~5-min cache TTL. The cache write
    (1.25×) pays back fast on the reads (~0.1× input).

    ``text`` may carry up to two ``CACHE_SEGMENT_BREAK`` markers (Anthropic
    allows up to 4 breakpoints total). Each marker splits off a segment that
    gets its OWN ``cache_control``, except the LAST segment, which never does
    — nothing re-reads it, so caching it would only pay the 1.25× write
    premium for a 0.1× read that never happens. A ``text`` with NO marker (every
    OTHER prompt in the repo — facts, signals, strategy, contacts…) falls back
    to the exact single-block shape this function always had: fully backward
    compatible, byte-identical request.

    The marker must NEVER reach the model — it is stripped here regardless of
    ``enabled``, so a caller that forgets to keep it out of a logged/persisted
    copy of ``text`` still can't leak it into the actual API payload.

    ``enabled=False`` renvoie la string nue (valeur ``system`` parfaitement
    valide) : pas de bloc, donc pas d'écriture facturée. À réserver aux appels
    dont le prompt ne sera JAMAIS relu dans la fenêtre de cache — voir
    ``CallMetadata.cache_system``.

    ``ttl="1h"`` — LOT (15/10) DATA-C : chaque coupure du system vit une heure
    (voir ``prompt_cache_ttl.cache_ttl_for``). ``None`` = forme d'avant."""
    segments = text.split(CACHE_SEGMENT_BREAK)
    if not enabled:
        return "".join(segments)
    if len(segments) == 1:
        return [{"type": "text", "text": segments[0], "cache_control": cache_control_block(ttl)}]
    last = len(segments) - 1
    return [
        {"type": "text", "text": seg}
        if i == last
        else {"type": "text", "text": seg, "cache_control": cache_control_block(ttl)}
        for i, seg in enumerate(segments)
    ]


def cache_system_for_fanout(index: int) -> bool:
    """Faut-il écrire le cache pour l'appel n°``index`` d'un fan-out parallèle ?

    Dans un fan-out, N appels concurrents partagent le même system prompt. Une
    entrée de cache n'est lisible qu'une fois la première réponse commencée :
    aucun des N ne peut donc lire ce que les autres écrivent, et on paie N fois
    la prime d'écriture (1,25×) pour zéro lecture — l'amortissement 0,27× mesuré
    côté Haiku en juillet 2026.

    On laisse le PREMIER appel écrire et on coupe pour les suivants :

    * dans le run : 1 × 1,25 + (N−1) × 1,0 au lieu de N × 1,25 ;
    * entre les runs : l'entrée existe quand même, donc un run suivant dans la
      fenêtre TTL (~5 min) la relit à 0,1× — ce que « couper partout » aurait
      définitivement perdu (ces system prompts ne dépendent que du profil ESN,
      ils sont donc identiques d'un compte analysé à l'autre).
    """
    return index == 0


# Tarif par million de jetons (USD), (entrée, sortie). Les clés sont cherchées
# comme SOUS-CHAÎNE de l'identifiant de modèle.
#
# ⚠️ Sonnet était à (3,0 / 15,0) : c'était le tarif ANNONCÉ pour le 01/09/2026,
# et cette hausse a été ANNULÉE le 10/08/2026 — $2/$10 est devenu le tarif
# standard (source : modèle unit economics BellumAI du 18/08/2026, feuille
# « Sources », référence « Documentation Anthropic », vérifiée le 18/08).
# Le poste Anthropic est le PREMIER de la facture : le sur-évaluer de 50 %
# fausse `GET /metrics/cost`, le registre `provider_costs`, l'alerte
# `COST_ALERT_DAILY_USD` — et le prix plancher d'un crédit, qui est une
# décision commerciale, pas un détail de télémétrie.
#
# Haiku tombait autrefois dans le palier Sonnet → ×3 de sur-facturation sur
# chaque appel `bellum_signals`.
_MODEL_PRICING: dict[str, tuple[float, float]] = {
    "opus": (5.0, 25.0),
    "sonnet": (2.0, 10.0),
    "haiku": (1.0, 5.0),
}
#: #2440.19 — identifie la grille ci-dessus dans le ledger (`provider_costs`).
#: À BUMPER quand les valeurs statiques changent (pas quand une surcharge d'env
#: change un prix : l'override reste une exception ponctuelle, pas une nouvelle
#: grille). Un coût recalculé après un bump n'est plus comparable terme à terme
#: à un coût d'avant : la version le rend visible plutôt que silencieux.
ANTHROPIC_PRICING_VERSION = "anthropic-2026-v1"
# Un modèle inconnu est facturé au palier Sonnet — le milieu, pour qu'un
# nouvel identifiant ne sous- ni ne sur-facture jamais d'un facteur large.
_DEFAULT_PRICING: tuple[float, float] = _MODEL_PRICING["sonnet"]


def _price_override(tier: str, side: str, default: float) -> float:
    """Surcharge d'un tarif sans redéploiement — `ANTHROPIC_PRICE_SONNET_IN`, etc.

    Ce tarif a changé deux fois en un mois et le dépôt a porté la mauvaise
    valeur pendant tout ce temps sans qu'aucun test ne puisse le dire : un
    tarif public n'est pas une constante du produit. Même discipline que
    `BOONDMANAGER_SEARCH_PARAM` — ce qu'on ne contrôle pas se règle par l'env.

    Une valeur illisible ou ≤ 0 retombe sur le défaut AVEC un avertissement :
    un coût à zéro se lit « c'est gratuit » et éteindrait l'alerte de
    dépassement en silence, ce qui est pire que le mauvais tarif qu'on corrige.
    """
    raw = os.getenv(f"ANTHROPIC_PRICE_{tier.upper()}_{side.upper()}")
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning(
            "ANTHROPIC_PRICE_%s_%s illisible (%r) — tarif par défaut %s conservé",
            tier.upper(), side.upper(), raw, default,
        )
        return default
    if not math.isfinite(value) or value <= 0:
        logger.warning(
            "ANTHROPIC_PRICE_%s_%s doit être un nombre > 0 (reçu %r) — défaut %s conservé",
            tier.upper(), side.upper(), raw, default,
        )
        return default
    return value


def _compute_cost(
    input_tokens: int,
    output_tokens: int,
    model: str,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    cache_creation_1h_tokens: int = 0,
) -> float:
    tier, pricing = next(
        ((key, price) for key, price in _MODEL_PRICING.items() if key in model),
        ("sonnet", _DEFAULT_PRICING),
    )
    in_price = _price_override(tier, "in", pricing[0])
    out_price = _price_override(tier, "out", pricing[1])
    # Anthropic prompt-cache pricing: cache reads ≈ 0.1× input, cache writes ≈
    # 1.25× input. ``input_tokens`` from the API already excludes cached input.
    # LOT (15/10) DATA-C — une écriture au TTL 1 h coûte 2× (pas 1,25×) ;
    # ``cache_creation_1h_tokens`` est la PART 1 h de ``cache_creation_tokens``.
    one_hour = min(max(cache_creation_1h_tokens, 0), cache_creation_tokens)
    return (
        input_tokens * in_price
        + cache_read_tokens * in_price * 0.1
        + (cache_creation_tokens - one_hour) * in_price * 1.25
        + one_hour * in_price * 2.0
        + output_tokens * out_price
    ) / 1_000_000


@dataclass(frozen=True)
class CallMetadata:
    prompt_name: str = "unknown"
    correlation_id: str = ""
    # Écrire le cache prompt coûte 1,25× l'input et ne rapporte qu'à la RELECTURE
    # (0,1×). Un fan-out parallèle (N appels concurrents partageant le même system
    # prompt) écrit N fois et ne lit jamais : le cache n'est lisible qu'une fois la
    # première réponse commencée, donc aucun des N ne peut lire ce que les autres
    # écrivent. ``cache_system=False`` sur ces appels-là supprime la prime
    # d'écriture. Porté par la metadata — déjà threadée jusqu'au dispatch
    # Anthropic par le LLM gateway — plutôt que par un nouveau paramètre de
    # plomberie sur chaque provider (le cache prompt est spécifique à Anthropic).
    cache_system: bool = True
    # #2521 (suite) — quel seau de `rate_limiter.throttle(...)` cet appel prend.
    # Tout appel Claude partageait le seau `claude` (12 concurrents, 50 rpm),
    # y compris les analyses de fond de plusieurs dizaines de secondes — un
    # appel INTERACTIF (Découvrir, dans le même tour HTTP qu'un commercial
    # attend) pouvait donc manger son budget de temps derrière une analyse en
    # cours avant même d'être appelé. `claude_chat` existe déjà pour le même
    # problème côté copilote (16/08/2026) : un seau séparé ne change RIEN au
    # plafond réel du compte Anthropic, il empêche seulement le travail de
    # fond de manger la file de l'interactif. Défaut inchangé : sans cet
    # argument, la requête est byte-identique à avant.
    throttle_provider: str = "claude"
    # 12/10/2026 — délai du client SDK des appels TEXTE (``_call_text``). ``None`` =
    # 60 s, inchangé pour tous les appelants existants. Le brief commercial
    # (sortie de 8 000 tokens, 2-3 min) était coupé à 60 s sur toutes les analyses.
    # Porté par la metadata (déjà threadée jusqu'au dispatch par le gateway).
    timeout: float | None = None
    # CACHE-LLM (15/10) — statut du cache de RÉPONSE pour la ligne de mesure :
    # ``exclu`` (défaut : l'appel n'est pas de classe A ou ne l'a pas demandé),
    # ``miss`` (classe A, parti sur le réseau). Un ``hit`` ne part pas, il est
    # journalisé par ``llm_response_cache`` lui-même.
    response_cache: str = "exclu"


@dataclass(frozen=True)
class PromptCost:
    """Ce qu'un prompt a consommé depuis le démarrage du process."""

    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    cost_usd: float = 0.0
    model: str = ""
    #: Combien de ces appels n'ont PAS de prix connu (modèle absent de la table
    #: de tarifs et non déclaré par env). Sans ce compteur, ``cost_usd`` ci-dessus
    #: se relirait « gratuit » sur ``GET /metrics/cost`` — le zéro silencieux que
    #: tout le reste du registre refuse. Le champ voyage automatiquement dans la
    #: réponse de la route, qui sérialise ``vars(stats)``.
    unpriced_calls: int = 0


_COSTS: dict[str, PromptCost] = {}


def cost_counters() -> dict[str, PromptCost]:
    """Coût cumulé par ``prompt_name`` depuis le démarrage du process.

    Chaque appel loguait déjà sa ligne, mais rien n'agrégeait : impossible de
    répondre à « quelle fonctionnalité coûte quoi ? » sans relire des milliers
    de lignes de logs Railway. Lu par ``GET /metrics/cost``.
    """
    return dict(_COSTS)


def reset_cost_counters() -> None:
    _COSTS.clear()


def _record_cost(usage: TokenUsage, prompt_name: str) -> None:
    previous = _COSTS.get(prompt_name, PromptCost())
    _COSTS[prompt_name] = PromptCost(
        calls=previous.calls + 1,
        input_tokens=previous.input_tokens + usage.input_tokens,
        output_tokens=previous.output_tokens + usage.output_tokens,
        cache_read_tokens=previous.cache_read_tokens + usage.cache_read_tokens,
        cache_creation_tokens=previous.cache_creation_tokens + usage.cache_creation_tokens,
        cost_usd=previous.cost_usd + usage.cost_usd,
        # Le dernier modèle vu : si un prompt bascule (env var), on le voit ici.
        model=usage.model,
        unpriced_calls=previous.unpriced_calls + (0 if usage.cost_known else 1),
    )


def _log_usage(
    usage: TokenUsage,
    metadata: CallMetadata,
    *,
    duration_s: float | None = None,
    input_obj: Any = None,
    output_obj: Any = None,
) -> None:
    _record_cost(usage, metadata.prompt_name)
    # Le coût tel qu'il a le droit de SORTIR du process : ``None`` quand le tarif
    # du modèle est inconnu. « Prix inconnu » ne se lit jamais « gratuit » — ni
    # dans le registre du run, ni dans Langfuse, ni dans la ligne de log.
    exported_cost = usage.cost_usd if usage.cost_known else None
    # Registre par RUN (D19) : le compteur ci-dessus est global au process et
    # remis à zéro au redéploiement — il ne dit pas ce qu'a coûté CETTE analyse.
    #
    # ⚠️ Le fournisseur se LIT sur l'usage, il ne s'écrit pas en dur : cette
    # fonction est appelée par les DEUX fournisseurs du gateway (l'Anthropic ET
    # l'OpenAI), et un « anthropic » constant faisait atterrir chaque appel
    # OpenAI dans ``provider_costs`` sous la mauvaise étiquette. Un modèle qui
    # connaît son prix le passe explicitement ; sinon la ligne compte ses UNITÉS
    # sans prétendre au coût.
    # #2440.6/.7/.8/.9/.16/.19 — modèle, jetons, cache, statut et grille
    # tarifaire voyagent avec la mesure. ``tariff_version`` suit la même règle
    # que le coût : une grille non appliquée (appel non tarifé) ne se cite pas.
    cost_ledger.record(
        usage.provider,
        metadata.prompt_name,
        units=usage.input_tokens + usage.output_tokens,
        cost_usd=exported_cost,
        model=usage.model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cache_creation_tokens=usage.cache_creation_tokens,
        status="ok",
        tariff_version=usage.tariff_version if usage.cost_known else None,
    )
    # Registre PAR RUN (``run_metrics``) : ``provider_pricing.price_run`` documente
    # que les fournisseurs facturés au token gardent le coût exact déjà calculé
    # ici — mais jusqu'ici rien n'écrivait dans ce registre, si bien que
    # ``total_cost_usd`` au niveau du run n'incluait JAMAIS Claude (le seau
    # "anthropic"/"openai" n'existait que via un appel `record_call`, qu'aucun
    # LLM ne fait puisqu'il ne passe pas par `throttle()`). Un coût inconnu (prix
    # non tarifé) ne s'enregistre pas ici — le seau reste absent plutôt que de
    # porter un zéro qui se lirait « gratuit ».
    if exported_cost is not None:
        run_metrics.record_cost(metadata.correlation_id, usage.provider, exported_cost)
    cid = f" cid={metadata.correlation_id}" if metadata.correlation_id else ""
    logger.info(
        "LLM [%s/%s] %s — %d in / %d out — %s%s",
        usage.provider,
        usage.model,
        metadata.prompt_name,
        usage.input_tokens,
        usage.output_tokens,
        f"${usage.cost_usd:.4f}" if usage.cost_known else "coût non tarifé",
        cid,
    )
    # CACHE-LLM (15/10) — la ligne de mesure commune à TOUS les appels (aucun
    # contenu) : cache de réponse et lectures / écritures du cache de prompt.
    llm_response_cache.log_line(
        metadata.prompt_name, metadata.response_cache, usage.cache_read_tokens, usage.cache_creation_tokens
    )
    # Génération Langfuse (env-gated : sans clés = no-op strict, zéro réseau).
    # Même goulot que les compteurs et le registre : un chemin qui compte son
    # coût trace aussi sa génération — aucun site d'instrumentation à oublier.
    # Le contenu (input/output) ne part que sous LANGFUSE_CAPTURE_CONTENT=true.
    langfuse_client.record_generation(
        name=metadata.prompt_name,
        model=usage.model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cache_creation_tokens=usage.cache_creation_tokens,
        cost_usd=exported_cost,
        duration_s=duration_s,
        correlation_id=metadata.correlation_id,
        input_obj=input_obj,
        output_obj=output_obj,
    )


def _cache_tokens(usage: object) -> tuple[int, int]:
    """``(cache_read, cache_creation)`` from an Anthropic usage object — 0 when the
    fields are absent (no prompt-cache on this call)."""
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    return int(read), int(creation)


def _cache_write_1h_tokens(usage: object) -> int:
    """La part des écritures de cache faite au TTL 1 h (``usage.cache_creation``,
    ventilé par TTL) — 0 quand le détail est absent."""
    detail = getattr(usage, "cache_creation", None)
    return int(getattr(detail, "ephemeral_1h_input_tokens", 0) or 0) if detail is not None else 0


def _build_usage(completion: Message, model: str) -> TokenUsage:
    inp = completion.usage.input_tokens
    out = completion.usage.output_tokens
    cache_read, cache_creation = _cache_tokens(completion.usage)
    return TokenUsage(
        input_tokens=inp,
        output_tokens=out,
        model=model,
        cost_usd=_compute_cost(inp, out, model, cache_read, cache_creation, _cache_write_1h_tokens(completion.usage)),
        cache_read_tokens=cache_read,
        cache_creation_tokens=cache_creation,
        tariff_version=ANTHROPIC_PRICING_VERSION,
        stop_reason=getattr(completion, "stop_reason", None),
    )


async def call_claude(
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: type[T] | type[dict[str, Any]] | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    model: str = CLAUDE_MODEL,
    metadata: CallMetadata | None = None,
    prompt_name: str = "unknown",
    correlation_id: str = "",
    task: str | None = None,
    cache_system: bool = True,
    domain_knowledge: bool = False,
    timeout: float | None = None,
    response_cache: bool = False,
    response_cache_validate: Callable[[Any], bool] | None = None,
) -> tuple[T | dict[str, Any] | str, TokenUsage]:
    """Call Claude and return the result + token usage metrics.

    ``response_cache=True`` (CACHE-LLM, 15/10) — appel de classe A (NEUTRE) : sa
    réponse est gardée, COMMUNE à tous les espaces, par ``llm_response_cache``.
    Le rôle (``prompt_name``) DOIT figurer dans sa liste blanche, sinon
    ``ValueError``. ``response_cache_validate`` : validation métier de la sortie
    AVANT écriture (``False`` ⇒ rendue, jamais gardée).

    ``timeout`` (secondes) borne le client SDK des appels TEXTE
    (``response_model=None``) ; ``None`` garde les 60 s historiques.

    ``domain_knowledge=True`` (#3586, lot W2) préfixe au system prompt le digest
    du Drive interne (« Savoir métier Bellum (interne) ») — opt-in EXPLICITE des
    surfaces commerciales sans RAG. Digest absent ou illisible ⇒ prompt
    byte-identique, aucune exception (voir ``internal_knowledge_digest``).

    - response_model=SomeModel  → validated instance of SomeModel
    - response_model=dict       → free-form JSON dict
    - response_model=None       → plain text (str)

    ``task`` names the logical task for the LLM gateway (defaults to
    ``prompt_name``): the gateway resolves a provider/model for the task. With
    default routing (no ``LLM_ROUTE_*`` override, no ``OPENAI_API_KEY``) that
    resolves back to Anthropic + this call's ``model``, so the Anthropic call —
    params, cost, and token accounting — is byte-identical to a direct dispatch.

    ``cache_system=False`` retire le ``cache_control`` du system prompt : à poser
    sur les appels en fan-out parallèle, dont le cache est écrit N fois et jamais
    relu (voir ``CallMetadata.cache_system``). Un ``metadata=`` explicite fait foi
    et porte alors son propre réglage.

    For sync callers (ProfilerAgent), use :func:`call_claude_sync`.
    """
    meta = metadata or CallMetadata(
        prompt_name=prompt_name, correlation_id=correlation_id, cache_system=cache_system, timeout=timeout
    )

    # Attach Claude call metadata to the active Sentry scope. LoggingIntegration will inherit
    # these tags on any logger.error fired below (e.g. instructor validation failures, 429s).
    sentry_sdk.set_tag("claude.prompt_name", meta.prompt_name)
    sentry_sdk.set_tag("claude.model", model)
    sentry_sdk.set_context(
        "claude",
        {"prompt_name": meta.prompt_name, "model": model, "max_tokens": max_tokens, "max_retries": max_retries},
    )

    # Every call routes through the provider-agnostic LLM gateway. With default
    # routing (no ``LLM_ROUTE_*`` override, no ``OPENAI_API_KEY``) each task
    # resolves to Anthropic + the caller's model, so the gateway wraps
    # ``_dispatch_anthropic`` byte-identically. Lazy import avoids a circular
    # import at module load (``llm_gateway`` imports ``claude_service``).
    from app.services.llm_gateway import complete as _gateway_complete

    if domain_knowledge:
        # #3586 (W2) — import paresseux : le module importe `call_claude` pour sa génération.
        from app.services.internal_knowledge_digest import with_domain_knowledge

        system_prompt = await with_domain_knowledge(system_prompt)

    if response_cache:
        return await _complete_with_response_cache(
            task if task is not None else meta.prompt_name,
            system_prompt,
            user_prompt,
            response_model=response_model,
            max_tokens=max_tokens,
            max_retries=max_retries,
            model=model,
            metadata=meta,
            validate=response_cache_validate,
        )

    return await _gateway_complete(
        task if task is not None else meta.prompt_name,
        system_prompt,
        user_prompt,
        response_model=response_model,
        max_tokens=max_tokens,
        max_retries=max_retries,
        model=model,
        metadata=meta,
    )


def _response_model_tag(response_model: Any) -> str:
    """Ce que le type de sortie fait entrer dans la clé : le texte, l'objet libre,
    ou le SCHÉMA d'un modèle (un champ ajouté change la clé)."""
    if response_model is None:
        return "text"
    if response_model is dict:
        return "dict"
    schema = json.dumps(response_model.model_json_schema(), sort_keys=True, ensure_ascii=False)
    return f"{response_model.__name__}:{llm_response_cache.prompt_fingerprint(schema)}"


def _cacheable_output(result: Any, response_model: Any) -> Any | None:
    """La forme JSON gardée d'une sortie VALIDE, ou ``None`` (jamais écrite)."""
    if response_model is None:
        return result if isinstance(result, str) and result.strip() else None
    if response_model is dict:
        return result if isinstance(result, dict) and result else None
    if isinstance(result, response_model):
        return result.model_dump(mode="json")
    return None


def _rehydrate(payload: Any, response_model: Any) -> Any | None:
    """La sortie gardée, revalidée contre le type demandé — ``None`` si elle ne
    passe plus (le schéma a bougé sans changer la clé : traité comme un miss)."""
    if response_model is None or response_model is dict:
        return _cacheable_output(payload, response_model)
    try:
        return response_model.model_validate(payload)
    except Exception:  # noqa: BLE001 — une entrée qui ne valide plus est un miss
        return None


async def _complete_with_response_cache(
    task: str,
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: Any,
    max_tokens: int,
    max_retries: int,
    model: str,
    metadata: CallMetadata,
    validate: Callable[[Any], bool] | None,
) -> tuple[Any, TokenUsage]:
    """CACHE-LLM — un appel de classe A : lecture, sinon appel puis écriture.

    Jamais écrit : appel en échec (l'exception remonte avant), sortie tronquée
    (``stop_reason == "max_tokens"``), sortie invalide (vide, non-objet, schéma)
    ou refusée par ``validate``."""
    from app.services.llm_gateway import complete as _gateway_complete
    from app.services.llm_gateway import resolve_dispatch

    role = metadata.prompt_name
    llm_response_cache.require_allowed(role)
    provider, resolved_model = resolve_dispatch(task, model)
    key = llm_response_cache.response_key(
        provider=provider.name,
        model=resolved_model,
        system_prompt=system_prompt,
        user_input=user_prompt,
        params={
            "max_tokens": max_tokens,
            "output": _response_model_tag(response_model),
            **_sampling_kwargs(resolved_model),
        },
    )
    cached = await llm_response_cache.lookup(role, key)
    if cached is not None:
        value = _rehydrate(cached, response_model)
        if value is not None:
            llm_response_cache.log_line(role, llm_response_cache.STATUS_HIT)
            return value, TokenUsage(
                input_tokens=0, output_tokens=0, model=resolved_model, cost_usd=0.0, provider=provider.name
            )

    result, usage = await _gateway_complete(
        task,
        system_prompt,
        user_prompt,
        response_model=response_model,
        max_tokens=max_tokens,
        max_retries=max_retries,
        model=model,
        metadata=replace(metadata, response_cache=llm_response_cache.STATUS_MISS),
    )
    payload = _cacheable_output(result, response_model)
    truncated = getattr(usage, "stop_reason", None) == "max_tokens"
    if payload is not None and not truncated and (validate is None or validate(result)):
        await llm_response_cache.store(role, key, payload)
    return result, usage


async def _dispatch_anthropic(
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: type[T] | type[dict[str, Any]] | None,
    max_tokens: int,
    max_retries: int,
    model: str,
    metadata: CallMetadata,
) -> tuple[T | dict[str, Any] | str, TokenUsage]:
    """Un appel Anthropic — en LOT dans la voie nocturne, en synchrone sinon.

    LOT (15/10) DATA-C : quand la requête porte la voie « lot »
    (``llm_batch.batch_lane_active``), l'appel rejoint le lot partagé de sa
    boucle (``call_claude_batch``, moitié prix, repli synchrone garanti). Hors
    voie, c'est :func:`_dispatch_anthropic_sync`, inchangé."""
    if llm_batch.batch_lane_active():
        item = BatchItem(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=response_model,
            max_tokens=max_tokens,
            model=model,
            metadata=metadata,
            max_retries=max_retries,
        )
        return cast(
            "tuple[T | dict[str, Any] | str, TokenUsage]",
            await llm_batch.coalesced(item, _batch_outcomes),
        )
    return await _dispatch_anthropic_sync(
        system_prompt,
        user_prompt,
        response_model=response_model,
        max_tokens=max_tokens,
        max_retries=max_retries,
        model=model,
        metadata=metadata,
    )


# ---------------------------------------------------------------------------
# LOT (15/10) DATA-C — Message Batches (moitié prix) pour le NON interactif
# ---------------------------------------------------------------------------

#: Un lot est facturé moitié prix, entrée, sortie et cache compris.
BATCH_PRICE_FACTOR = 0.5


@dataclass(frozen=True)
class BatchItem:
    """Un appel à passer en lot — les mêmes paramètres qu'un ``call_claude``."""

    system_prompt: str
    user_prompt: str
    response_model: Any  # None (texte) | dict | sous-classe de BaseModel
    max_tokens: int
    model: str
    metadata: CallMetadata
    max_retries: int = DEFAULT_MAX_RETRIES


class _BatchDictEnvelope(BaseModel):
    """Même enveloppe que ``_call_dict`` : ``{"data": {...}}``."""

    data: dict

    @field_validator("data", mode="before")
    @classmethod
    def _accept_serialized_object(cls, value: object) -> object:
        return coerce_serialized_object(value)


def _batch_schema(item: BatchItem) -> type[BaseModel] | None:
    if item.response_model is None:
        return None
    if item.response_model is dict:
        return _BatchDictEnvelope
    return cast(type[BaseModel], item.response_model)


def _batch_params(item: BatchItem) -> dict[str, Any]:
    """La requête d'UN élément du lot. Sortie structurée = un outil forcé dont le
    schéma est celui du modèle Pydantic (même forme que l'appel synchrone).
    System en cache 1 h : les éléments d'un lot sont traités dans le désordre,
    sur des minutes — 5 min n'en verrait presque aucun relire l'autre."""
    system = item.system_prompt + (DICT_ENVELOPE_INSTRUCTION if item.response_model is dict else "")
    params: dict[str, Any] = {
        "model": item.model,
        "max_tokens": item.max_tokens,
        **_sampling_kwargs(item.model),
        "system": _cached_system(system, enabled=item.metadata.cache_system, ttl="1h"),
        "messages": [{"role": "user", "content": item.user_prompt}],
    }
    schema = _batch_schema(item)
    if schema is not None:
        params["tools"] = [
            {
                "name": schema.__name__,
                "description": (schema.__doc__ or f"Réponse structurée {schema.__name__}").strip(),
                "input_schema": schema.model_json_schema(),
            }
        ]
        params["tool_choice"] = {"type": "tool", "name": schema.__name__}
    return params


def _content_param(block: Any) -> dict[str, Any]:
    """Un bloc de réponse rejoué tel quel dans le reask (objet SDK ou dict)."""
    if isinstance(block, dict):
        return block
    dump = getattr(block, "model_dump", None)
    if callable(dump):
        return cast(dict[str, Any], dump(exclude_none=True))
    return {key: value for key, value in vars(block).items() if value is not None}


def _read_batch_message(item: BatchItem, message: Any) -> tuple[Any, str | None]:
    """``(valeur, None)`` si la sortie est valide, ``(None, erreur)`` sinon."""
    schema = _batch_schema(item)
    if schema is None:
        text = "".join(getattr(b, "text", "") for b in message.content if getattr(b, "type", None) == "text")
        return (text, None) if text.strip() else (None, "réponse vide")
    block = next(
        (b for b in message.content if getattr(b, "type", None) == "tool_use" and getattr(b, "name", "") == schema.__name__),
        None,
    )
    if block is None:
        return None, f"aucun appel de l'outil {schema.__name__}"
    try:
        value = schema.model_validate(getattr(block, "input", None))
    except Exception as exc:  # noqa: BLE001 — l'erreur de validation EST le reask
        return None, str(exc)
    return (value.data if isinstance(value, _BatchDictEnvelope) else value), None


def _reask_params(params: dict[str, Any], message: Any, error: str) -> dict[str, Any]:
    """Le 2e lot : la sortie refusée, puis l'erreur en ``tool_result`` (même
    geste que le reask d'``instructor`` en synchrone)."""
    tool_use = next((b for b in message.content if getattr(b, "type", None) == "tool_use"), None)
    feedback = f"Ta réponse ne respecte pas le schéma attendu. Corrige et rappelle l'outil.\nErreurs : {error}"
    content: list[dict[str, Any]] = (
        [{"type": "tool_result", "tool_use_id": tool_use.id, "content": feedback, "is_error": True}]
        if tool_use is not None
        else [{"type": "text", "text": feedback}]
    )
    return {
        **params,
        "messages": [
            *params["messages"],
            {"role": "assistant", "content": [_content_param(b) for b in message.content]},
            {"role": "user", "content": content},
        ],
    }


def _batch_usage(message: Any, item: BatchItem) -> TokenUsage:
    usage = _build_usage(message, item.model)
    return replace(usage, cost_usd=usage.cost_usd * BATCH_PRICE_FACTOR)


async def _batch_outcomes(items: list[BatchItem]) -> list[Any]:
    """Le lot complet : construire, soumettre, relire, valider, reask, repli.

    Rend, par élément et dans l'ordre, ``(valeur, usage)`` — ou l'exception de
    SON repli synchrone (les autres éléments ne la voient pas)."""
    started = time.monotonic()
    outcomes: list[Any] = [None] * len(items)
    pending: dict[str, tuple[int, dict[str, Any]]] = {
        f"r{index}": (index, _batch_params(item)) for index, item in enumerate(items)
    }
    client = anthropic.AsyncAnthropic(api_key=_get_api_key(), max_retries=_SDK_TRANSPORT_MAX_RETRIES)
    for attempt in (1, 2):
        if not pending:
            break
        try:
            messages = await llm_batch.run_batch(
                client, [{"custom_id": cid, "params": params} for cid, (_, params) in pending.items()]
            )
        except Exception as exc:  # noqa: BLE001 — tout lot raté repart en synchrone
            logger.warning("Lot Anthropic en échec (%s) — %d appel(s) en synchrone", exc, len(pending))
            break
        reask: dict[str, tuple[int, dict[str, Any]]] = {}
        for cid, (index, params) in pending.items():
            message = messages.get(cid)
            if message is None:
                continue
            item = items[index]
            usage = _batch_usage(message, item)
            _log_usage(
                usage,
                item.metadata,
                duration_s=time.monotonic() - started,
                input_obj={"system": item.system_prompt, "user": item.user_prompt},
                output_obj=None,
            )
            # Tronqué : ni gardé ni redemandé en lot — le synchrone sait doubler
            # ``max_tokens`` (``_is_truncation``), le lot non.
            if getattr(message, "stop_reason", None) == "max_tokens":
                continue
            value, error = _read_batch_message(item, message)
            if error is None:
                outcomes[index] = (value, usage)
            elif attempt == 1 and item.response_model is not None:
                reask[f"{cid}-reask"] = (index, _reask_params(params, message, error))
        pending = reask

    fallback = [index for index, outcome in enumerate(outcomes) if outcome is None]
    if fallback:
        logger.info("Lot Anthropic : %d/%d appel(s) repris en synchrone", len(fallback), len(items))
        synced = await asyncio.gather(
            *(
                _dispatch_anthropic_sync(
                    items[index].system_prompt,
                    items[index].user_prompt,
                    response_model=items[index].response_model,
                    max_tokens=items[index].max_tokens,
                    max_retries=items[index].max_retries,
                    model=items[index].model,
                    metadata=items[index].metadata,
                )
                for index in fallback
            ),
            return_exceptions=True,
        )
        for index, result in zip(fallback, synced, strict=True):
            outcomes[index] = result
    return outcomes


async def call_claude_batch(items: list[BatchItem]) -> list[tuple[Any, TokenUsage]]:
    """LOT (15/10) DATA-C — passe ``items`` en UN lot Message Batches.

    Construit chaque requête, soumet, relit, valide (schéma Pydantic), redemande
    en 2e lot ce qui ne valide pas (reask), et rejoue en SYNCHRONE ce qui reste :
    lot en échec, délai dépassé (``LLM_BATCH_MAX_WAIT_S``, lot annulé), requête
    en erreur, sortie tronquée ou toujours invalide. Rend ``(valeur, usage)``
    dans l'ordre de ``items`` ; lève la première erreur d'un repli synchrone."""
    outcomes = await _batch_outcomes(items)
    for outcome in outcomes:
        if isinstance(outcome, BaseException):
            raise outcome
    return cast(list[tuple[Any, TokenUsage]], outcomes)


async def _dispatch_anthropic_sync(
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: type[T] | type[dict[str, Any]] | None,
    max_tokens: int,
    max_retries: int,
    model: str,
    metadata: CallMetadata,
) -> tuple[T | dict[str, Any] | str, TokenUsage]:
    """Execute a call against Anthropic (text / dict / structured).

    This is the exact three-way dispatch ``call_claude`` used inline before the
    gateway existed. The gateway's Anthropic provider delegates here, so the
    Anthropic path is wrapped — never re-implemented — and stays byte-identical.
    """
    if response_model is None:
        return await _call_text(
            system_prompt,
            user_prompt,
            max_tokens=max_tokens,
            model=model,
            metadata=metadata,
        )

    if response_model is dict:
        return await _call_dict(
            system_prompt,
            user_prompt,
            max_tokens=max_tokens,
            max_retries=max_retries,
            model=model,
            metadata=metadata,
        )

    return await _call_structured(
        system_prompt,
        user_prompt,
        response_model=cast(type[T], response_model),
        max_tokens=max_tokens,
        max_retries=max_retries,
        model=model,
        metadata=metadata,
    )


def call_claude_sync(
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: type[T],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    model: str = CLAUDE_MODEL,
    metadata: CallMetadata | None = None,
    prompt_name: str = "unknown",
    correlation_id: str = "",
) -> tuple[T, TokenUsage]:
    """Structured-output variant for sync code paths (ProfilerAgent)."""
    meta = metadata or CallMetadata(prompt_name=prompt_name, correlation_id=correlation_id)

    sentry_sdk.set_tag("claude.prompt_name", meta.prompt_name)
    sentry_sdk.set_tag("claude.model", model)
    sentry_sdk.set_context(
        "claude",
        {"prompt_name": meta.prompt_name, "model": model, "max_tokens": max_tokens, "max_retries": max_retries},
    )

    return _call_sync(
        system_prompt,
        user_prompt,
        response_model=response_model,
        max_tokens=max_tokens,
        max_retries=max_retries,
        model=model,
        metadata=meta,
    )


# ---------------------------------------------------------------------------
# Internal implementations
# ---------------------------------------------------------------------------


async def _call_structured(
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: type[T],
    max_tokens: int,
    max_retries: int,
    model: str,
    metadata: CallMetadata,
) -> tuple[T, TokenUsage]:
    api_key = _get_api_key()
    client = instructor.from_anthropic(
        anthropic.AsyncAnthropic(
            api_key=api_key, timeout=DEFAULT_TIMEOUT, max_retries=_SDK_TRANSPORT_MAX_RETRIES
        ),
    )

    started = time.monotonic()
    attempt_max = max_tokens
    while True:
        try:
            async with throttle(metadata.throttle_provider):
                response, completion = await client.messages.create_with_completion(
                    model=model,
                    max_tokens=attempt_max,
                    max_retries=max_retries,
                    **_sampling_kwargs(model),
                    system=_cached_system(system_prompt, enabled=metadata.cache_system, ttl=cache_ttl_for(metadata.prompt_name)),
                    messages=[{"role": "user", "content": user_prompt}],
                    response_model=response_model,
                )
            break
        except Exception as exc:
            if _is_truncation(exc):
                next_max = min(attempt_max * 2, TRUNCATION_RETRY_CAP)
                _record_truncation(
                    prompt_name=metadata.prompt_name,
                    model=model,
                    attempt_max=attempt_max,
                    retrying=next_max > attempt_max,
                )
                if next_max > attempt_max:
                    attempt_max = next_max
                    continue
                raise ClaudeIncompleteOutputError(
                    prompt_name=metadata.prompt_name,
                    model=model,
                    max_tokens=attempt_max,
                ) from exc
            raise

    usage = _build_usage(completion, model)
    _log_usage(
        usage,
        metadata,
        duration_s=time.monotonic() - started,
        input_obj={"system": system_prompt, "user": user_prompt},
        output_obj=response,
    )
    return response, usage


def coerce_serialized_object(value: object) -> object:
    """Répare une enveloppe dont le modèle a SÉRIALISÉ le contenu.

    Vu sur un run réel (RATP, 10/08/2026) : au lieu d'un objet, `data` est
    arrivé en chaîne — `'{"strategy": "…"}'` — et la phase de plan est morte
    alors que les trois phases précédentes avaient abouti. Le contenu était
    juste ; seule sa mise en forme variait.

    C'est la règle « parsing JSON Claude robuste » du dépôt, appliquée au seul
    endroit qui les couvre TOUTES : chaque phase passe par cette enveloppe. La
    réparer champ par champ dans chaque modèle de sortie reviendrait à attendre
    que chacun casse en production, l'un après l'autre.

    Ce qui n'est pas un objet JSON est rendu tel quel : la tolérance s'arrête là
    où commencerait la devinette, et Pydantic refuse ensuite avec son message.
    """
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text.startswith("{"):
        return value
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        return value
    return parsed if isinstance(parsed, dict) else value


async def _call_dict(
    system_prompt: str,
    user_prompt: str,
    *,
    max_tokens: int,
    max_retries: int,
    model: str,
    metadata: CallMetadata,
) -> tuple[dict, TokenUsage]:
    class _Envelope(BaseModel):
        data: dict

        @field_validator("data", mode="before")
        @classmethod
        def _accept_serialized_object(cls, value: object) -> object:
            return coerce_serialized_object(value)

    api_key = _get_api_key()
    client = instructor.from_anthropic(
        anthropic.AsyncAnthropic(
            api_key=api_key, timeout=DEFAULT_TIMEOUT, max_retries=_SDK_TRANSPORT_MAX_RETRIES
        ),
    )

    started = time.monotonic()
    attempt_max = max_tokens
    while True:
        try:
            async with throttle(metadata.throttle_provider):
                response, completion = await client.messages.create_with_completion(
                    model=model,
                    max_tokens=attempt_max,
                    max_retries=max_retries,
                    **_sampling_kwargs(model),
                    system=_cached_system(
                        system_prompt + DICT_ENVELOPE_INSTRUCTION,
                        enabled=metadata.cache_system,
                        ttl=cache_ttl_for(metadata.prompt_name),
                    ),
                    messages=[{"role": "user", "content": user_prompt}],
                    response_model=_Envelope,
                )
            break
        except Exception as exc:
            if _is_truncation(exc):
                next_max = min(attempt_max * 2, TRUNCATION_RETRY_CAP)
                _record_truncation(
                    prompt_name=metadata.prompt_name,
                    model=model,
                    attempt_max=attempt_max,
                    retrying=next_max > attempt_max,
                )
                if next_max > attempt_max:
                    attempt_max = next_max
                    continue
                raise ClaudeIncompleteOutputError(
                    prompt_name=metadata.prompt_name,
                    model=model,
                    max_tokens=attempt_max,
                ) from exc
            raise

    usage = _build_usage(completion, model)
    _log_usage(
        usage,
        metadata,
        duration_s=time.monotonic() - started,
        input_obj={"system": system_prompt, "user": user_prompt},
        output_obj=response.data,
    )
    return response.data, usage


async def _call_text(
    system_prompt: str,
    user_prompt: str,
    *,
    max_tokens: int,
    model: str,
    metadata: CallMetadata,
) -> tuple[str, TokenUsage]:
    api_key = _get_api_key()
    client = anthropic.AsyncAnthropic(
        api_key=api_key,
        timeout=metadata.timeout if metadata.timeout is not None else 60.0,
        max_retries=_SDK_TRANSPORT_MAX_RETRIES,
    )
    started = time.monotonic()

    async with throttle(metadata.throttle_provider):
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            **_sampling_kwargs(model),
            system=_cached_system(system_prompt, enabled=metadata.cache_system, ttl=cache_ttl_for(metadata.prompt_name)),
            messages=[{"role": "user", "content": user_prompt}],
        )

    # Une réponse texte tronquée n'explose pas (pas de JSON à parser) : elle est
    # simplement coupée. Sans ce comptage, la coupure était totalement muette.
    if getattr(response, "stop_reason", None) == "max_tokens":
        _record_truncation(
            prompt_name=metadata.prompt_name,
            model=model,
            attempt_max=max_tokens,
            retrying=False,
        )

    # Concatenate every text block. When extended thinking is on, content[0] is a
    # ThinkingBlock (no `.text`), so blindly reading content[0].text raises
    # "'ThinkingBlock' object has no attribute 'text'" — filter to type == "text".
    text = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )
    inp = response.usage.input_tokens
    out = response.usage.output_tokens
    cache_read, cache_creation = _cache_tokens(response.usage)
    usage = TokenUsage(
        input_tokens=inp,
        output_tokens=out,
        model=model,
        cost_usd=_compute_cost(inp, out, model, cache_read, cache_creation, _cache_write_1h_tokens(response.usage)),
        cache_read_tokens=cache_read,
        cache_creation_tokens=cache_creation,
        tariff_version=ANTHROPIC_PRICING_VERSION,
        stop_reason=getattr(response, "stop_reason", None),
    )
    _log_usage(
        usage,
        metadata,
        duration_s=time.monotonic() - started,
        input_obj={"system": system_prompt, "user": user_prompt},
        output_obj=text,
    )
    return text, usage


async def call_claude_with_citations(
    system_prompt: str,
    question: str,
    documents: list[dict[str, str]],
    *,
    model: str = CLAUDE_MODEL,
    max_tokens: int = 2000,
    prompt_name: str = "citations",
    correlation_id: str = "",
    domain_knowledge: bool = False,
) -> tuple[str, list[dict[str, Any]], TokenUsage]:
    """Anthropic native Citations: ground an answer in the supplied documents so
    every claim carries an inhallucinable ``cited_text`` lifted verbatim from the
    source. Citations are free on output; they are incompatible with Structured
    Outputs, so this is a RAW (non-instructor) call. ``documents`` are
    ``{"title": str, "text": str}``. Returns ``(answer, citations, usage)`` where
    each citation is ``{cited_text, document_title, document_index}``.

    ``domain_knowledge=True`` : même préfixe que ``call_claude`` (#3586, W2).
    """
    if domain_knowledge:
        from app.services.internal_knowledge_digest import with_domain_knowledge

        system_prompt = await with_domain_knowledge(system_prompt)
    api_key = _get_api_key()
    client = anthropic.AsyncAnthropic(
        api_key=api_key, timeout=DEFAULT_TIMEOUT, max_retries=_SDK_TRANSPORT_MAX_RETRIES
    )
    started = time.monotonic()

    content: list[dict[str, Any]] = []
    for doc in documents:
        text = (doc.get("text") or "").strip()
        if not text:
            continue
        content.append(
            {
                "type": "document",
                "source": {"type": "text", "media_type": "text/plain", "data": text},
                "title": (doc.get("title") or "source")[:200],
                "citations": {"enabled": True},
            }
        )
    content.append({"type": "text", "text": question})

    async with throttle("claude"):
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            **_sampling_kwargs(model),
            system=_cached_system(system_prompt),
            messages=[{"role": "user", "content": content}],
        )

    answer = ""
    citations: list[dict[str, Any]] = []
    for block in response.content:
        if getattr(block, "type", None) != "text":
            continue
        answer += block.text or ""
        for c in getattr(block, "citations", None) or []:
            cited = getattr(c, "cited_text", None)
            if cited:
                citations.append(
                    {
                        "cited_text": cited,
                        "document_title": getattr(c, "document_title", None),
                        "document_index": getattr(c, "document_index", None),
                    }
                )

    inp = response.usage.input_tokens
    out = response.usage.output_tokens
    cache_read, cache_creation = _cache_tokens(response.usage)
    usage = TokenUsage(
        input_tokens=inp,
        output_tokens=out,
        model=model,
        cost_usd=_compute_cost(inp, out, model, cache_read, cache_creation, _cache_write_1h_tokens(response.usage)),
        cache_read_tokens=cache_read,
        cache_creation_tokens=cache_creation,
        tariff_version=ANTHROPIC_PRICING_VERSION,
    )
    # Ce chemin n'était compté NULLE PART (ni compteurs process, ni registre par
    # run, ni Langfuse) — même famille que le copilote invisible du 16/08. Le
    # brancher sur le goulot commun règle les trois d'un coup.
    _log_usage(
        usage,
        CallMetadata(prompt_name=prompt_name, correlation_id=correlation_id),
        duration_s=time.monotonic() - started,
        input_obj={"system": system_prompt, "question": question},
        output_obj=answer,
    )
    logger.info(
        "Citations call '%s' cid=%s: %d docs → %d citations, %d in / %d out",
        prompt_name,
        correlation_id,
        len(documents),
        len(citations),
        inp,
        out,
    )
    return answer, citations, usage


# ─────────────────────────────────────────────────────────────────────────────
# #2667.2 — lire une IMAGE par le modèle (pièce jointe /chat : png/jpeg/webp).
# ─────────────────────────────────────────────────────────────────────────────
#
# Aucun binaire OCR dans ce dépôt (ni tesseract, ni pytesseract — en ajouter un
# toucherait l'image de déploiement Railway, hors périmètre). Le SEUL chemin
# qui lit une image ici est donc le modèle, via le client Anthropic déjà câblé
# ci-dessus (`anthropic.AsyncAnthropic`) — jamais un fournisseur OCR distinct
# (`app/services/ocr.py` existe, mais il est GATED par `OCR_API_KEY`, une clé
# OPTIONNELLE réservée au fallback PDF-scanné de la fiche CV/note de frais ;
# `ANTHROPIC_API_KEY`, elle, est OBLIGATOIRE — la lecture d'image ne doit pas
# dépendre d'une clé qui peut être absente).
#
# #2667.2 — la phrase que le modèle DOIT rendre s'il ne trouve aucun texte
# lisible : jamais une description devinée de l'image (« une personne devant un
# tableau »), jamais un texte approché. `document_text.extract_image_text` la
# reconnaît et la transforme en `DocumentTextError` — un résultat vide n'est
# jamais présenté comme un succès d'ingestion.
IMAGE_NO_TEXT_SENTINEL = "Aucun texte lisible dans cette image."

# Doctrine (CLAUDE.md « Aucun CRITÈRE PROTÉGÉ ») — si l'image montre une
# personne, le modèle ne doit en tirer AUCUNE caractéristique (âge, genre,
# origine, apparence) : seulement le texte visible. Le dit explicitement,
# plutôt que de compter sur le bon vouloir du modèle.
_IMAGE_TEXT_SYSTEM_PROMPT = f"""Tu LIS le texte visible dans une image, tu ne l'interprètes pas.

Rends UNIQUEMENT le texte lisible dans l'image, tel quel (verbatim), dans son \
ordre d'apparition. N'ajoute aucun commentaire, aucun résumé, aucune mise en \
forme que l'image ne porte pas elle-même.

Si l'image montre une ou plusieurs personnes, ne décris JAMAIS leur âge, leur \
genre, leur origine, ni aucune autre caractéristique physique — seul le TEXTE \
visible (un nom sur un badge, un texte à l'écran, une légende) compte.

Si l'image montre un TABLEAU (colonnes, en-têtes, lignes — un tableau de \
comptes, un planning, une facture…), conserve sa structure : rends chaque \
ligne avec ses colonnes dans l'ordre, en-têtes compris. Une cellule vide \
reste une cellule vide — nomme-la explicitement (« (vide) ») ; ne l'omets \
jamais et ne la remplace JAMAIS par un zéro, qui affirmerait une valeur que \
l'image ne porte pas.

Si l'image ne porte AUCUN texte lisible, réponds EXACTEMENT, sans rien \
ajouter : {IMAGE_NO_TEXT_SENTINEL}"""


async def call_claude_image_text(
    image_bytes: bytes,
    media_type: str,
    *,
    model: str = CLAUDE_MODEL,
    max_tokens: int = 1024,
    prompt_name: str = "image_text_extraction",
    correlation_id: str = "",
    system_prompt: str | None = None,
    instruction: str = "Lis le texte visible dans cette image.",
) -> tuple[str, TokenUsage]:
    """Texte lu par le modèle dans UNE image. Appel RAW (non-instructor, comme
    :func:`call_claude_with_citations`) : pas de schéma structuré à valider,
    juste du texte. Un appel = une image = un coût (voir le prix par tier,
    ``_MODEL_PRICING`` ci-dessus) — l'appelant (``document_text.py``) plafonne
    la taille et le nombre d'images AVANT d'arriver ici, pour ne jamais payer
    un appel qu'il refusera de toute façon.
    """
    api_key = _get_api_key()
    client = anthropic.AsyncAnthropic(
        api_key=api_key, timeout=DEFAULT_TIMEOUT, max_retries=_SDK_TRANSPORT_MAX_RETRIES
    )
    started = time.monotonic()
    metadata = CallMetadata(prompt_name=prompt_name, correlation_id=correlation_id)

    content: list[dict[str, Any]] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.standard_b64encode(image_bytes).decode("ascii"),
            },
        },
        {"type": "text", "text": instruction},
    ]
    system = system_prompt or _IMAGE_TEXT_SYSTEM_PROMPT

    async with throttle(metadata.throttle_provider):
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            **_sampling_kwargs(model),
            system=_cached_system(system, enabled=metadata.cache_system, ttl=cache_ttl_for(metadata.prompt_name)),
            messages=[{"role": "user", "content": content}],
        )

    text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
    usage = _build_usage(response, model)
    _log_usage(
        usage,
        metadata,
        duration_s=time.monotonic() - started,
        input_obj={"system": system, "image_bytes": len(image_bytes), "media_type": media_type},
        output_obj=text,
    )
    return text, usage


async def call_claude_document_text(
    pdf_bytes: bytes,
    *,
    model: str = CLAUDE_MODEL,
    max_tokens: int = 8000,
    prompt_name: str = "pdf_text_extraction",
    correlation_id: str = "",
) -> tuple[str, TokenUsage]:
    """Texte lu par le modèle dans un PDF entier (bloc `document`, lu nativement
    par l'API : texte ET pages-images). Même appel RAW et même consigne que
    :func:`call_claude_image_text` — une LECTURE verbatim, jamais un résumé.
    L'appelant (`ocr.py`) borne taille et nombre de pages avant d'arriver ici.
    """
    api_key = _get_api_key()
    client = anthropic.AsyncAnthropic(
        api_key=api_key, timeout=DEFAULT_TIMEOUT, max_retries=_SDK_TRANSPORT_MAX_RETRIES
    )
    started = time.monotonic()
    metadata = CallMetadata(prompt_name=prompt_name, correlation_id=correlation_id)
    content: list[dict[str, Any]] = [
        {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": base64.standard_b64encode(pdf_bytes).decode("ascii"),
            },
        },
        {"type": "text", "text": "Lis le texte de ce document, page par page."},
    ]
    async with throttle(metadata.throttle_provider):
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            **_sampling_kwargs(model),
            system=_cached_system(_IMAGE_TEXT_SYSTEM_PROMPT, enabled=metadata.cache_system, ttl=cache_ttl_for(metadata.prompt_name)),
            messages=[{"role": "user", "content": content}],
        )
    text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
    usage = _build_usage(response, model)
    _log_usage(
        usage,
        metadata,
        duration_s=time.monotonic() - started,
        input_obj={"system": _IMAGE_TEXT_SYSTEM_PROMPT, "pdf_bytes": len(pdf_bytes)},
        output_obj=text,
    )
    return text, usage


def _call_sync(
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: type[T],
    max_tokens: int,
    max_retries: int,
    model: str,
    metadata: CallMetadata,
) -> tuple[T, TokenUsage]:

    api_key = _get_api_key()
    client = instructor.from_anthropic(
        anthropic.Anthropic(api_key=api_key),
    )
    started = time.monotonic()

    try:
        response, completion = client.messages.create_with_completion(
            model=model,
            max_tokens=max_tokens,
            max_retries=max_retries,
            **_sampling_kwargs(model),
            system=_cached_system(system_prompt, enabled=metadata.cache_system, ttl=cache_ttl_for(metadata.prompt_name)),
            messages=[{"role": "user", "content": user_prompt}],
            response_model=response_model,
        )
    except Exception as exc:
        if _is_truncation(exc):
            _record_truncation(
                prompt_name=metadata.prompt_name,
                model=model,
                attempt_max=max_tokens,
                retrying=False,
            )
            raise ClaudeIncompleteOutputError(
                prompt_name=metadata.prompt_name,
                model=model,
                max_tokens=max_tokens,
            ) from exc
        raise

    usage = _build_usage(completion, model)
    _log_usage(
        usage,
        metadata,
        duration_s=time.monotonic() - started,
        input_obj={"system": system_prompt, "user": user_prompt},
        output_obj=response,
    )
    return response, usage
