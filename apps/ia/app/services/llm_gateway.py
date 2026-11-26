"""IA v2 LLM Gateway — provider-agnostic dispatch + per-task routing.

Every ``claude_service.call_claude`` routes each logical task through
:func:`complete`, which resolves a ``{provider, model}`` route and dispatches.
With default routing (no override, no ``OPENAI_API_KEY``) that resolves to
Anthropic + the caller's model, so the dispatched call is byte-identical to a
direct Anthropic call.

Design invariants
-----------------
* **Default routing = Anthropic + the caller's model.** Every task defaults to
  ``Route(provider="anthropic", model=None)`` where ``model=None`` means "inherit
  the model the caller passed". The Anthropic provider delegates straight back to
  ``claude_service._dispatch_anthropic`` (it *wraps* the existing path, never
  re-implements it), so with default routing the output is byte-identical to a
  direct Anthropic call — same model, same instructor path, same cost calc.
* **OpenAI is a second, optional provider.** Route a task to it via env. Without
  ``OPENAI_API_KEY`` (or without the ``openai`` SDK installed) the provider is
  unavailable and the route falls back to Anthropic — never a fabricated result.
* **Cost accounting is per provider.** Anthropic reuses ``_compute_cost``; OpenAI
  uses its own pricing table. Both return the shared ``TokenUsage`` shape, which
  now CARRIES its provider: ``_log_usage`` is common to both, so that field is
  the only way the run ledger (``provider_costs``, read by the back office) can
  be true. A model whose price is UNKNOWN is never billed at another model's
  rate — it is recorded "non tarifé": an unknown price never reads as "free",
  nor as "same as gpt-4o".
* **La forme d'un appel OpenAI se décide sur preuve, pas sur habitude.** Les
  contraintes par modèle (``temperature``, ``max_completion_tokens``, et le
  raisonnement implicite refusé avec des outils de fonction) sont chacune écrites
  avec la mesure ou la ligne de SDK qui l'établit. Voir
  ``_openai_sampling_kwargs`` et ``_openai_tools_reasoning_effort``.

Routing overrides (read fresh on every call — no restart needed)
----------------------------------------------------------------
* ``LLM_ROUTE_<TASK>`` (e.g. ``LLM_ROUTE_STRATEGY=openai:gpt-4o`` or
  ``LLM_ROUTE_SIGNALS=openai``) — highest precedence. ``LLM_ROUTE_CHAT`` commande
  aussi la boucle d'outils du copilote, qui ne passe pas par ``complete`` mais
  résout sa destination par ``resolve_dispatch`` (voir ``chat_orchestrator``).
  ``LLM_ROUTE_CHAT_FAST`` / ``LLM_ROUTE_CHAT_DEEP`` (#2248) règlent les deux
  paliers du copilote (``chat_model_routing``) ; non réglés, ils héritent de
  ``LLM_ROUTE_CHAT``.
* ``LLM_GATEWAY_ROUTING`` — JSON, e.g.
  ``{"strategy": {"provider": "openai", "model": "gpt-4o"}}``.
* Otherwise the code default (Anthropic + inherit).

Break-glass: ``LLM_GATEWAY_DISABLED=true`` (kill_switch.py) ignores EVERY
routing override and dispatches direct Anthropic + the caller's model — the
exact pre-gateway path, byte-identical. Read fresh on every call.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import time
from dataclasses import dataclass
from typing import Any, NamedTuple

from pydantic import BaseModel

from app.services import claude_service, cost_ledger, provider_fit
from app.services.kill_switch import LLM_GATEWAY_KILL_SWITCH, disabled

logger = logging.getLogger(__name__)

# ── Optional OpenAI SDK — guarded so this module imports on prod images that do
# not ship ``openai`` (it is not a hard dependency). Missing SDK → provider
# reports unavailable → route falls back to Anthropic.
try:  # pragma: no cover - import guard
    import openai
except Exception:  # pragma: no cover - SDK absent
    openai = None  # type: ignore[assignment]

try:  # pragma: no cover - instructor is a hard dep, guarded defensively
    import instructor
except Exception:  # pragma: no cover
    instructor = None  # type: ignore[assignment]


# Les noms canoniques vivent dans ``claude_service`` — c'est ``TokenUsage`` qui
# les PORTE, et un réglage vit à un seul endroit. On les réexporte ici pour que
# ``llm_gateway.PROVIDER_OPENAI`` reste lisible depuis l'extérieur.
PROVIDER_ANTHROPIC = claude_service.PROVIDER_ANTHROPIC
PROVIDER_OPENAI = claude_service.PROVIDER_OPENAI

# The distinct analysis tasks (mirrors the graph phases + the phase-1 sub-prompts).
# ⚠️ Ajouts EN FIN, jamais au milieu : une valeur d'énumération qui change de
# rang casse tout ce qui l'a persistée.
#
# ``chat`` est arrivé APRÈS les autres (28/08/2026) et il est d'une autre nature :
# ce n'est pas une phase d'analyse, c'est le copilote. Il est ici quand même,
# et pour la raison qui fonde ce module — **un réglage vit à un seul endroit**.
# Le tour de copilote outillé appelle le client Anthropic en direct (protocole
# d'outils propre à Anthropic), donc il ne passe pas par ``complete`` ; mais il
# résout sa destination avec ``resolve_dispatch`` ci-dessous, exactement comme
# ``complete``. ``LLM_ROUTE_CHAT`` commande donc les DEUX chemins du chat —
# l'outillé et celui de repli (``CHAT_TOOLS_DISABLED``) — au lieu de deux
# variables qui finiraient par se contredire.
CANONICAL_TASKS = (
    "research",
    "signals",
    "strategy",
    "classify",
    "plan",
    "messages",
    "plan_light",
    # `org` puis `chat` : AJOUTÉS À LA FIN, dans leur ordre d'arrivée sur `main`.
    # Insérer au milieu casserait la ligne de base GA-08 (un enum ne perd jamais
    # une valeur et n'en insère jamais au milieu).
    "org",
    "chat",
    # #1911.1 (13/09/2026) — le titre d'un fil de Laura, sur Haiku (EXTRACTION).
    # Sans sa tâche, le préfixe ``bellum_chat`` le rangeait sous ``chat``, le
    # copilote Sonnet : ``LLM_ROUTE_CHAT`` aurait commandé les deux, et la garde
    # ``test_aucune_tache_ne_melange_extraction_et_raisonnement`` est tombée en
    # CI. AJOUTÉ À LA FIN (GA-08).
    "chat_title",
    # #2248 (17/09/2026) — les deux PALIERS du copilote, choisis demande par
    # demande par ``chat_model_routing.choose_chat_tier`` : ``LLM_ROUTE_CHAT_FAST``
    # et ``LLM_ROUTE_CHAT_DEEP``. Aucun prompt ne porte ces noms (le préfixe
    # ``bellum_chat`` reste rangé sous ``chat``) : seule la boucle du copilote
    # et son repli les résolvent, quand un palier est réglé. Non réglés, ils
    # HÉRITENT de ``chat`` (``_TASK_ROUTE_INHERITS``). AJOUTÉS À LA FIN (GA-08).
    "chat_fast",
    "chat_deep",
    # #2443.9 (#2899, 04/10/2026) — la route CANARY du copilote : le modèle
    # CANDIDAT, servi aux seuls espaces de `CHAT_CANARY_WORKSPACE_ALLOWLIST`
    # (`LLM_ROUTE_CHAT_CANARY`). Non réglée, jamais résolue. AJOUTÉE À LA FIN (GA-08).
    "chat_canary",
)

# Map a ``prompt_name`` / task string onto a canonical task. Prefixes because the
# real prompt_names are versioned per call (e.g. ``bellum_contacts_batch_2_of_5``,
# ``bellum_plan_quick_wins``).
_PROMPT_PREFIX_TASK: tuple[tuple[str, str], ...] = (
    ("bellum_facts", "research"),
    ("bellum_signals", "signals"),
    ("bellum_strategy", "strategy"),
    ("bellum_contacts", "classify"),
    # ⚠️ L'organigramme a SA tâche, et ce n'est pas une coquetterie de rangement.
    # Il partageait `classify` avec les contacts, alors que le banc du 28/08 les
    # sépare : sur Luna, les contacts tiennent et **l'organigramme PERD**
    # (100 → 95,10 ; l'axe qui tombe est `chaine_de_decision`, 1,00 → 0,80).
    # Un seul interrupteur pour les deux rendait ce recul IRRÉVERSIBLE — ramener
    # l'organigramme aurait ramené les contacts. Même défaut que `plan` /
    # `plan_light`, que la garde d'alors n'a pas vu ici parce que les deux
    # prompts sont du même camp (extraction).
    ("bellum_organigramme", "org"),
    # ⚠️ L'ORDRE compte : le premier préfixe qui matche gagne. Les deux sections
    # « checklist » du plan sont sur Haiku (``PLAN_LIGHT_MODEL``) alors que
    # ``bellum_plan`` est du narratif Sonnet — elles doivent donc sortir AVANT
    # que le préfixe ``bellum_plan`` ne les attrape. Sans ça, router « ce qui
    # était sur Haiku » vers un autre fournisseur emporterait le plan narratif
    # avec, ce qui est le défaut « un réglage qui commande deux choses ».
    ("bellum_plan_quick_wins", "plan_light"),
    ("bellum_plan_if_no_response", "plan_light"),
    ("bellum_plan", "plan"),
    # Gabarit piloté par la base de connaissances : de l'extraction, pas de
    # l'arbitrage. Il partageait la tâche du plan narratif et ne le peut plus.
    ("bellum_messages", "messages"),
    # Le copilote. Un seul prompt, donc une tâche à lui : il ne partage son
    # interrupteur avec rien d'autre, et c'est voulu — c'est la première ligne
    # annoncée de la facture, elle doit pouvoir bouger seule.
    # ⚠️ AVANT ``bellum_chat`` : le premier préfixe qui matche gagne, et
    # ``bellum_chat_title`` commence par ``bellum_chat``. Le titre est de
    # l'extraction Haiku, le copilote du raisonnement Sonnet — deux interrupteurs.
    ("bellum_chat_title", "chat_title"),
    ("bellum_chat", "chat"),
    # #2810 — extraction d'entité pour /search : sa propre tâche, aucun préfixe
    # `bellum_search*` existant à ce jour à faire passer avant.
    ("bellum_search_entity_extract", "search_entity_extract"),
)


@dataclass(frozen=True)
class Route:
    """Where a task should run. ``model=None`` means inherit the caller's model
    (this is what keeps default routing byte-identical to the pre-gateway path)."""

    provider: str
    model: str | None = None


# Code-level default routing: every task → Anthropic, inherit caller model.
DEFAULT_ROUTING: dict[str, Route] = {task: Route(PROVIDER_ANTHROPIC, None) for task in CANONICAL_TASKS}
_FALLBACK_ROUTE = Route(PROVIDER_ANTHROPIC, None)


# ── Task / route resolution ────────────────────────────────────────────────────


def canonical_task(task: str | None) -> str:
    """Normalise a task/prompt_name onto a canonical task key."""
    raw = (task or "").strip()
    if raw in CANONICAL_TASKS:
        return raw
    low = raw.lower()
    for prefix, canonical in _PROMPT_PREFIX_TASK:
        if low.startswith(prefix):
            return canonical
    # Unknown task → key by itself; with no override it still routes to Anthropic
    # + inherited model, so an unmapped prompt_name is never re-routed by accident.
    return raw or "default"


def _apply_json_override(canonical: str, route: Route) -> Route:
    raw = os.environ.get("LLM_GATEWAY_ROUTING")
    if not raw:
        return route
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        logger.warning("LLM_GATEWAY_ROUTING is not valid JSON — ignoring")
        return route
    entry = data.get(canonical) if isinstance(data, dict) else None
    if not isinstance(entry, dict):
        return route
    provider = str(entry.get("provider", route.provider)).strip().lower()
    model = entry.get("model", route.model)
    return Route(provider, model if isinstance(model, str) and model else None)


def _apply_env_override(canonical: str, route: Route) -> Route:
    raw = os.environ.get(f"LLM_ROUTE_{canonical.upper()}")
    if not raw or not raw.strip():
        return route
    raw = raw.strip()
    if ":" in raw:
        provider, model = raw.split(":", 1)
        return Route(provider.strip().lower(), model.strip() or None)
    return Route(raw.lower(), None)


#: Une tâche NEUVE qui sort d'une tâche existante hérite de l'interrupteur de
#: celle-ci tant qu'on ne lui a pas donné le sien.
#:
#: Pourquoi ça existe : scinder `classify` en `classify` + `org` est un
#: refactor, et **un refactor ne change jamais un routage de production au
#: passage.** `LLM_ROUTE_CLASSIFY` est posée sur Railway depuis le 28/08 et
#: commande aujourd'hui l'organigramme ; sans cet héritage, le déploiement de
#: cette scission aurait REBASCULÉ l'organigramme de Luna vers Haiku tout seul,
#: c'est-à-dire changé un modèle de production sans que personne le décide.
#:
#: Ce que ça donne concrètement : rien ne bouge au déploiement ; le jour où
#: Louis veut ramener l'organigramme, `LLM_ROUTE_ORG` suffit, et les contacts
#: ne bougent pas.
_TASK_ROUTE_INHERITS: dict[str, str] = {
    "org": "classify",
    # #2248 — un palier non réglé part là où partait le chat entier : poser le
    # seul palier fort ne déplace pas le quotidien, et ``LLM_ROUTE_CHAT`` garde
    # son sens exact.
    "chat_fast": "chat",
    "chat_deep": "chat",
    "chat_canary": "chat",
}


def _has_override(canonical: str) -> bool:
    """Une surcharge est-elle POSÉE pour cette tâche ?

    On teste la PRÉSENCE, pas l'égalité avec le défaut : un opérateur qui épingle
    explicitement ``LLM_ROUTE_ORG=anthropic`` demande le défaut Anthropic, et un
    test d'égalité le confondrait avec « rien de posé » — l'héritage reprendrait
    alors la main et le renverrait chez `classify`, c'est-à-dire l'inverse exact
    de ce qu'il a écrit.
    """
    raw = os.environ.get(f"LLM_ROUTE_{canonical.upper()}")
    if raw and raw.strip():
        return True
    blob = os.environ.get("LLM_GATEWAY_ROUTING")
    if not blob:
        return False
    try:
        data = json.loads(blob)
    except (ValueError, TypeError):
        return False
    return isinstance(data, dict) and isinstance(data.get(canonical), dict)


def resolve_route(task: str | None) -> Route:
    """Resolve the effective route for a task: code default → JSON override →
    per-task env override (last wins).

    Une tâche listée dans ``_TASK_ROUTE_INHERITS`` et dont AUCUNE surcharge n'est
    posée lit celle de la tâche dont elle est issue — voir la note là-bas.
    """
    canonical = canonical_task(task)
    if canonical in _TASK_ROUTE_INHERITS and not _has_override(canonical):
        canonical = _TASK_ROUTE_INHERITS[canonical]
    route = DEFAULT_ROUTING.get(canonical, _FALLBACK_ROUTE)
    route = _apply_json_override(canonical, route)
    route = _apply_env_override(canonical, route)
    return route


class RoutingPolicyEntry(NamedTuple):
    """Une ligne de la politique de routage effective, pour UNE tâche
    canonique — ce que `/config/model-routing` (#2445.2, épopée #2766) rend à
    la console ops."""

    task: str
    provider: str
    model: str | None
    overridden: bool
    inherits_from: str | None


def describe_routing_policy() -> tuple[RoutingPolicyEntry, ...]:
    """La politique de routage EFFECTIVE, par tâche canonique — introspection
    seule, ne change rien. Pour chaque tâche : sa destination résolue
    MAINTENANT (fournisseur + modèle), si un réglage est POSÉ (sur la tâche
    elle-même, ou sur celle dont elle hérite tant qu'aucun réglage propre
    n'existe — voir `_TASK_ROUTE_INHERITS`), et de qui elle hérite le cas
    échéant. Lue par la console d'opérations IA (#2445 — épopée #2766), jamais
    par le produit : nos fournisseurs ne se nomment jamais AU CLIENT, mais un
    opérateur qui règle un coût doit voir où chaque tâche part réellement."""
    entries = []
    for task in CANONICAL_TASKS:
        inherits_from = None
        effective = task
        if task in _TASK_ROUTE_INHERITS and not _has_override(task):
            effective = _TASK_ROUTE_INHERITS[task]
            inherits_from = effective
        route = resolve_route(task)
        entries.append(RoutingPolicyEntry(task, route.provider, route.model, _has_override(effective), inherits_from))
    return tuple(entries)


# ── Provider cost accounting ────────────────────────────────────────────────────

@dataclass(frozen=True)
class _OpenAIPrice:
    """Tarif d'un modèle OpenAI, en dollars par MILLION de jetons."""

    input_usd: float
    output_usd: float
    #: Entrée servie par le cache de prompt. Valeur EXPLICITE et non « 0,5 × le
    #: prix d'entrée » : la remise de moitié est vraie pour la gamme gpt-4/o-series
    #: mais pas pour tous les modèles (gpt-5.6-luna est à 0,02 pour 0,20, soit
    #: 0,1×). Une règle qui n'est pas vraie partout n'est pas une règle.
    cached_input_usd: float


# Tarifs OpenAI par MILLION de jetons (USD). Les clés sont cherchées comme
# SOUS-CHAÎNE de l'identifiant du modèle, la plus spécifique d'abord (un dict
# conserve l'ordre d'insertion) — c'est ce qui fait qu'un identifiant daté comme
# ``gpt-4o-2026-05-13`` retombe sur le bon palier, et que ``gpt-4o-mini`` n'est
# jamais facturé au tarif ``gpt-4o``.
#
# Sources et dates de vérification :
#   * ``gpt-5.6-luna`` — fiche officielle du modèle, fournie par Louis, vérifiée
#     le 28/08/2026 : 0,20 $/M en entrée, 1,20 $/M en sortie, 0,02 $/M en entrée
#     mise en cache. C'est le modèle qui a rendu le défaut visible : il tombait
#     jusqu'ici sur le palier ``gpt-4o``, soit 12,5 fois son vrai prix d'entrée.
#   * les autres — tarifs de liste au moment de l'écriture du gateway, entrée
#     mise en cache à 0,5 × l'entrée, conformément à la remise annoncée alors.
#
# Comme côté Anthropic, chaque ligne est surchargeable par environnement (voir
# ``_openai_price_override``) : un tarif public n'est pas une constante du
# produit, et celui d'Anthropic a déjà changé deux fois en un mois.
_OPENAI_PRICING: dict[str, _OpenAIPrice] = {
    "gpt-5.6-luna": _OpenAIPrice(0.20, 1.20, 0.02),
    "gpt-4o-mini": _OpenAIPrice(0.15, 0.60, 0.075),
    "gpt-4o": _OpenAIPrice(2.50, 10.00, 1.25),
    "gpt-4.1-nano": _OpenAIPrice(0.10, 0.40, 0.05),
    "gpt-4.1-mini": _OpenAIPrice(0.40, 1.60, 0.20),
    "gpt-4.1": _OpenAIPrice(2.00, 8.00, 1.00),
    "o4-mini": _OpenAIPrice(1.10, 4.40, 0.55),
    "o3-mini": _OpenAIPrice(1.10, 4.40, 0.55),
    "o3": _OpenAIPrice(2.00, 8.00, 1.00),
}

#: #2440.19 — identifie cette grille dans le ledger (`provider_costs`), même
#: convention que `claude_service.ANTHROPIC_PRICING_VERSION`. À bumper quand les
#: valeurs statiques ci-dessus changent, pas sur une simple surcharge d'env.
OPENAI_PRICING_VERSION = "openai-2026-v1"

#: Un avertissement par modèle inconnu, pas un par appel — sinon la ligne qui
#: compte se noie dans dix mille copies d'elle-même.
_warned_unpriced_models: set[str] = set()


def _openai_env_tier(key: str) -> str:
    """L'identifiant d'un modèle, en forme de variable d'environnement.

    ``gpt-5.6-luna`` → ``GPT_5_6_LUNA`` ; ``o3-mini`` → ``O3_MINI``. Les points
    et les tirets ne peuvent pas vivre dans un nom de variable, et on ne veut pas
    d'une seconde table qui finirait par contredire la première.
    """
    return re.sub(r"[^A-Z0-9]+", "_", key.upper()).strip("_")


def _openai_price_override(tier: str, side: str, default: float | None) -> float | None:
    """Surcharge d'un tarif OpenAI sans redéploiement — ``OPENAI_PRICE_GPT_4O_IN``…

    Sémantique identique à ``claude_service._price_override``, et pour la même
    raison : un tarif public n'est pas une constante du produit, et le dépôt a
    déjà porté la mauvaise valeur Anthropic pendant un mois sans qu'aucun test ne
    puisse le dire. Relue à CHAQUE appel, donc réglable à chaud.

    Une valeur illisible, non finie ou ≤ 0 retombe sur le défaut AVEC un
    avertissement : un coût à zéro se lit « c'est gratuit » et éteindrait
    l'alerte de dépassement en silence, ce qui est pire que le mauvais tarif
    qu'on corrige.

    ``default=None`` sert au cas « modèle absent de la table » : l'opérateur peut
    DÉCLARER un tarif pour un modèle sorti ce matin, et l'absence de déclaration
    reste un prix inconnu — jamais un prix deviné.
    """
    name = f"OPENAI_PRICE_{tier}_{side}"
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("%s illisible (%r) — tarif par défaut %s conservé", name, raw, default)
        return default
    if not math.isfinite(value) or value <= 0:
        logger.warning("%s doit être un nombre > 0 (reçu %r) — défaut %s conservé", name, raw, default)
        return default
    return value


def _openai_price(model: str) -> _OpenAIPrice | None:
    """Le tarif applicable à ``model``, ou ``None`` si personne ne le connaît.

    ``None`` est la réponse honnête et la seule qui ne coûte rien : la précédente
    facturait tout modèle inconnu au palier ``gpt-4o``, en silence. Un chiffre
    faux est pire qu'un chiffre absent — il a l'air juste, donc personne ne le
    vérifie, et il finit par fixer un prix de vente.
    """
    key = next((k for k in _OPENAI_PRICING if k in model), None)
    if key is not None:
        tier = _openai_env_tier(key)
        base = _OPENAI_PRICING[key]
        in_price = _openai_price_override(tier, "IN", base.input_usd)
        out_price = _openai_price_override(tier, "OUT", base.output_usd)
        cached = _openai_price_override(tier, "CACHED_IN", base.cached_input_usd)
        # Les défauts sont non-nuls, donc les trois valeurs le sont aussi.
        return _OpenAIPrice(float(in_price), float(out_price), float(cached))

    # Modèle absent de la table : l'opérateur peut quand même déclarer son tarif
    # sur l'identifiant EXACT. Il faut les DEUX côtés — une entrée sans sortie
    # ne se complète pas au tarif d'un autre modèle, c'est là que commencerait la
    # devinette qu'on refuse.
    tier = _openai_env_tier(model)
    in_price = _openai_price_override(tier, "IN", None)
    out_price = _openai_price_override(tier, "OUT", None)
    if in_price is None or out_price is None:
        return None
    cached = _openai_price_override(tier, "CACHED_IN", in_price * 0.5)
    return _OpenAIPrice(in_price, out_price, float(cached))


def _openai_compute_cost(
    input_tokens: int,
    output_tokens: int,
    model: str,
    cache_read_tokens: int = 0,
) -> float | None:
    """Le coût d'un appel OpenAI, ou ``None`` quand le tarif est inconnu.

    ``input_tokens`` est déjà le reliquat NON caché (voir ``_usage_from_openai``),
    donc l'entrée mise en cache se facture séparément à son propre tarif.
    """
    price = _openai_price(model)
    if price is None:
        if model not in _warned_unpriced_models:
            _warned_unpriced_models.add(model)
            logger.warning(
                "Tarif OpenAI inconnu pour le modèle %r — appel enregistré « non tarifé ». "
                "Les jetons sont comptés, le coût reste vide : un prix inconnu ne se lit "
                "jamais « gratuit », ni « comme gpt-4o ». Pour le tarifer, ajoutez-le à "
                "_OPENAI_PRICING ou posez OPENAI_PRICE_%s_IN et OPENAI_PRICE_%s_OUT.",
                model,
                _openai_env_tier(model),
                _openai_env_tier(model),
            )
        return None
    return (
        input_tokens * price.input_usd
        + cache_read_tokens * price.cached_input_usd
        + output_tokens * price.output_usd
    ) / 1_000_000


# ── Paramètres d'échantillonnage : la décision d'OpenAI, chez OpenAI ────────────
#
# ``claude_service._sampling_kwargs`` est la décision ANTHROPIC : son allow-list
# ne contient que des modèles Claude, elle répond donc « non » à tout identifiant
# OpenAI. Pendant ce temps ``_invoke`` envoyait ``temperature`` à OpenAI
# inconditionnellement — les deux décisions se contredisaient, et la seconde
# n'était écrite nulle part.
#
# Le raisonnement est le MÊME que côté Anthropic, avec le même arbitrage sur le
# coût des deux erreurs possibles : envoyer ``temperature`` à un modèle de
# raisonnement (o-series, et la gamme gpt-5) est un refus dur de l'API, donc une
# panne ; l'omettre sur un modèle qui l'accepte coûte le décodage glouton sur ce
# seul modèle. On prend la moins chère — allow-list, et inconnu ⇒ on omet —, et
# on la logue, pour que la perte de déterminisme ne soit jamais silencieuse.
#
# ⚠️ Le SDK embarqué ne code PAS cette contrainte (``temperature`` y est un
# ``Optional[float]`` sans note par modèle) : cette liste est donc le côté
# prudent d'un contrat non vérifiable depuis le dépôt, pas une lecture de la
# documentation. Doctrine : « un contrat d'API non vérifiable ne se devine pas ».
_OPENAI_SAMPLING_CAPABLE_MODELS: tuple[str, ...] = ("gpt-4o", "gpt-4.1", "gpt-4-", "gpt-3.5")

_warned_openai_sampling_models: set[str] = set()


def _openai_sampling_kwargs(model: str) -> dict[str, float]:
    """``{"temperature": N}`` si ce modèle OpenAI l'accepte, ``{}`` sinon."""
    if (model or "").strip().startswith(_OPENAI_SAMPLING_CAPABLE_MODELS):
        return {"temperature": claude_service.CLAUDE_TEMPERATURE}
    if model not in _warned_openai_sampling_models:
        _warned_openai_sampling_models.add(model)
        logger.info(
            "Modèle OpenAI %s : temperature omise (non reconnue comme acceptant les "
            "paramètres d'échantillonnage). La sortie n'est plus décodée glouton — "
            "le déterminisme se pilote par le prompt.",
            model,
        )
    return {}


# ── Le raisonnement IMPLICITE d'OpenAI, et nos outils de fonction ──────────────
#
# Mesuré en production le 28/08/2026 : les DIX prompts du chemin payant routés
# vers ``gpt-5.6-luna`` ont échoué, tous sur le même 400, cité verbatim :
#
#   Function tools with reasoning_effort are not supported for gpt-5.6-luna in
#   /v1/chat/completions. To use function tools, use /v1/responses or set
#   reasoning_effort to 'none'.
#
# D'OÙ VIENT CE PARAMÈTRE — la question tranchée avant de choisir un correctif,
# parce qu'elle décide du correctif. Ce n'est ni nous, ni ``instructor``, ni le
# SDK :
#
#   * le dépôt ne l'écrit nulle part (aucune occurrence de ``reasoning_effort``
#     dans ``apps/ia``) ;
#   * ``instructor==1.7.9`` non plus — zéro occurrence dans ses 45 modules ;
#   * ``openai==1.109.1`` le déclare ``reasoning_effort: Optional[ReasoningEffort]
#     | Omit = omit`` (``openai/resources/chat/completions/completions.py:105``),
#     et un ``omit`` est retiré du corps avant sérialisation.
#
#   Preuve directe, rejouée par ``tests/test_openai_tools_reasoning.py`` : un
#   appel structuré passé par le VRAI ``instructor`` + le VRAI SDK met sur le fil
#   exactement ``{max_completion_tokens, messages, model, tool_choice, tools}``.
#   Pas de ``reasoning_effort``.
#
#   Donc c'est le SERVEUR qui l'applique : ``gpt-5.6-luna`` est un modèle de
#   raisonnement, l'API lui donne un effort de raisonnement par défaut, et refuse
#   cet effort implicite dès qu'on joint des outils de fonction sur
#   ``/v1/chat/completions``. C'est bien notre appel qui est mal formé, mais le
#   paramètre fautif est celui qu'on n'envoie PAS.
#
# LE CHOIX — ``reasoning_effort='none'`` plutôt que ``/v1/responses``, et
# pourquoi :
#
#   ⚠️ 15/10/2026 (arbitrage pip-audit, PR #4126) : relevés en ``instructor==1.13.0``
#   et ``openai==2.54.0``. La preuve directe ci-dessus repasse au vert sur ces
#   versions, et ``reasoning_effort`` y reste ``Optional[...] | Omit = omit``.
#   Le point 1 ci-dessous décrit 1.7.9 : la 1.13.0 porte ``Mode.RESPONSES_TOOLS``
#   (toujours pas de ``from_openai_responses``) — le choix ``'none'`` tient par le
#   point 2 et par la doctrine, pas par l'absence du mode.
#
#   1. ``instructor==1.7.9`` n'a AUCUN mode Responses — ``from_openai_responses``
#      n'existe pas et ``instructor.Mode`` ne contient aucun membre ``RESPONSES_*``
#      (mesuré). Passer par ``/v1/responses`` voudrait dire réécrire à la main la
#      définition d'outil, la lecture de l'appel d'outil, la reprise sur erreur de
#      validation et une seconde forme d'usage — c'est-à-dire ré-implémenter
#      ``instructor`` pour un seul fournisseur, sans clé pour le vérifier avant
#      livraison. Doctrine : « un contrat d'API non vérifiable ne se devine pas ».
#   2. ``'none'`` est l'échappatoire que l'API NOMME elle-même, sur l'endpoint
#      qu'on utilise déjà.
#
#   ⚠️ CE QU'ON PERD, et ce n'est pas un détail technique : sur un modèle de
#   raisonnement, ``'none'`` éteint le raisonnement. Les prompts concernés sont
#   les prompts analytiques (``bellum_strategy``, ``bellum_organigramme``,
#   ``bellum_signals``…). L'arbitrage se lit contre l'état MESURÉ, pas contre un
#   idéal : aujourd'hui ces appels ne rendent rien du tout. Un appel sans
#   raisonnement vaut mieux qu'un 400 ; il ne vaut pas mieux qu'un appel avec
#   raisonnement. Si la qualité en souffre, la suite est ``/v1/responses``, et son
#   préalable est nommé : une version d'``instructor`` qui porte un mode Responses.
#
# COMMENT ON DÉCIDE À QUI L'ENVOYER — pas une liste de préfixes.
#
#   Une liste de modèles vieillit mal, et se tromper coûte des deux côtés :
#   l'omettre sur un modèle de raisonnement est le 400 qu'on corrige, l'envoyer à
#   un modèle qui ne connaît pas le paramètre serait un 400 tout neuf. Alors on ne
#   décide pas : **c'est l'API qui décide, et on lit son refus.** Le premier appel
#   d'un modèle inconnu part SANS rien de plus (donc rigoureusement identique à
#   aujourd'hui pour ``gpt-4o``, ``gpt-4.1``, ``o3``, ``o3-mini``, ``o4-mini`` et
#   tout ce qui marchait) ; si — et seulement si — l'API répond le 400 qui NOMME
#   ``reasoning_effort`` et les outils, on retient le modèle et on rejoue une
#   fois. Les appels suivants du même processus partent réglés.
#
#   Le jeu ci-dessous n'est donc pas une politique, c'est un cache préchauffé avec
#   la seule mesure qu'on ait — ``gpt-5.6-luna``, 28/08/2026 —, pour que le modèle
#   qu'on sait concerné ne paie pas un aller-retour refusé par processus. Un
#   identifiant daté (``gpt-5.6-luna-2026-05-13``) le manquerait et apprendrait
#   tout seul : c'est le comportement voulu, pas un trou.
#
# ⚠️ Le contournement ne s'applique QU'aux appels qui portent des outils, c'est-à-
# dire aux sorties structurées. Le chemin texte (``response_model=None``) n'envoie
# aucun outil, ne déclenche donc pas le refus, et GARDE son raisonnement entier.
# C'est ce qui borne la perte de qualité à l'endroit exact où elle est le prix
# d'un appel qui aboutit.

#: La valeur envoyée quand l'API a refusé le raisonnement implicite. Réglable à
#: chaud (relue à chaque appel), défaut NOMMÉ ``none``.
#: ⚠️ Deux mots pour deux choses, et les confondre serait un piège : ``none`` est
#: une VALEUR de l'API (« ne raisonne pas ») ; ``off`` est NOTRE interrupteur
#: (« n'applique pas le contournement, laisse le 400 remonter »).
_OPENAI_TOOLS_REASONING_ENV = "OPENAI_TOOLS_REASONING_EFFORT"
_OPENAI_TOOLS_REASONING_DEFAULT = "none"
_OPENAI_TOOLS_REASONING_OFF = "off"

#: Modèles dont l'API a refusé le raisonnement implicite en présence d'outils.
#: Semé avec la mesure du 28/08/2026 ; complété tout seul à la première mesure de
#: chaque processus (cache de processus, pas un état persistant).
_openai_tools_reasoning_conflict: set[str] = {"gpt-5.6-luna"}


def _openai_tools_reasoning_effort() -> str | None:
    """La valeur de ``reasoning_effort`` à joindre aux appels outillés.

    ``None`` = contournement désactivé (``OPENAI_TOOLS_REASONING_EFFORT=off`` ou
    valeur vide) : le 400 remonte alors tel quel, ce qui est exactement l'état
    mesuré avant ce lot — utile pour re-mesurer, et pour rendre le défaut à un
    test.
    """
    raw = os.getenv(_OPENAI_TOOLS_REASONING_ENV)
    if raw is None:
        return _OPENAI_TOOLS_REASONING_DEFAULT
    raw = raw.strip()
    if not raw or raw.lower() == _OPENAI_TOOLS_REASONING_OFF:
        return None
    return raw


def _openai_tools_reasoning_kwargs(model: str) -> dict[str, str]:
    """``{"reasoning_effort": …}`` pour un modèle CONNU pour le réclamer, ``{}``
    sinon — et ``{}`` tant qu'aucun refus n'a été mesuré pour ce modèle."""
    effort = _openai_tools_reasoning_effort()
    if effort is None:
        return {}
    name = (model or "").strip()
    if not any(known in name for known in _openai_tools_reasoning_conflict):
        return {}
    return {"reasoning_effort": effort}


def _is_tools_reasoning_refusal(exc: BaseException) -> bool:
    """Ce refus-ci est-il CELUI qu'on sait contourner ?

    Volontairement étroit : il faut que l'API nomme ``reasoning_effort`` ET les
    outils. Tout autre 400 remonte intact — un contournement qui rattraperait
    n'importe quelle erreur masquerait le prochain défaut au lieu de le montrer.

    ⚠️ On ne peut PAS se contenter d'attraper ``openai.BadRequestError``, et la
    lecture rapide d'``instructor/retry.py`` le fait croire (son ``except`` ne
    nomme que ``ValidationError``/``JSONDecodeError``). Mesuré : le ``tenacity``
    qu'il configure — ``AsyncRetrying(stop=stop_after_attempt(max_retries))``,
    sans prédicat ``retry=`` — rejoue sur TOUTE exception, puis emballe la
    dernière dans ``InstructorRetryException``. Un 400 arrive donc ici sous un
    autre type, sans ``status_code``, après ``max_retries`` allers-retours. D'où
    une détection par le TEXTE, la chaîne des causes comprise, et un
    ``status_code`` traité comme un indice facultatif — jamais comme une condition.
    """
    status = getattr(exc, "status_code", None)
    if status is not None and status != 400:
        return False
    parts: list[str] = []
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        parts.extend(
            str(p) for p in (getattr(current, "message", "") or "", getattr(current, "body", "") or "", current)
        )
        current = current.__cause__ or current.__context__
    text = " ".join(parts).lower()
    return "reasoning_effort" in text and "tool" in text


async def _send_with_tools(model: str, call: Any) -> Any:
    """Exécute ``call(extra_kwargs)`` et, sur CE refus-là, apprend puis rejoue une fois.

    Une seule reprise, jamais deux : après l'apprentissage ``extra`` est non vide,
    donc un second échec remonte.

    ⚠️ Ce que coûte l'apprentissage, mesuré et non supposé : ``instructor`` rejoue
    lui-même le 400 ``max_retries`` fois avant de le laisser sortir (voir
    ``_is_tools_reasoning_refusal``). Le PREMIER appel d'un modèle inconnu paie
    donc ``max_retries`` allers-retours refusés — gratuits chez OpenAI, mais bien
    présents dans la latence que ``OpenAIProvider.complete`` mesure autour de
    ``_invoke``. Une fois par modèle et par processus ; le modèle déjà mesuré
    (``gpt-5.6-luna``) ne paie rien du tout.
    """
    extra = _openai_tools_reasoning_kwargs(model)
    try:
        return await call(extra)
    except Exception as exc:
        effort = _openai_tools_reasoning_effort()
        name = (model or "").strip()
        # ``extra`` non vide ⇒ on a DÉJÀ envoyé le réglage et l'appel a quand même
        # échoué : ce refus-ci n'est pas celui qu'on sait contourner, il remonte.
        # ``effort is None`` ⇒ contournement coupé par l'opérateur.
        # ``name`` vide ⇒ rien à retenir : mémoriser "" ferait matcher TOUT modèle.
        if extra or effort is None or not name or not _is_tools_reasoning_refusal(exc):
            raise
        retry = {"reasoning_effort": effort}
        _openai_tools_reasoning_conflict.add(name)
        logger.warning(
            "OpenAI a refusé les outils de fonction avec le raisonnement implicite sur %r "
            "(/v1/chat/completions). Appel rejoué avec reasoning_effort=%r : ce modèle "
            "NE RAISONNE PLUS sur les sorties structurées, ce qui est un arbitrage de "
            "qualité, pas un détail. Pour le désactiver et voir le refus : %s=off. "
            "Message de l'API : %s",
            model,
            effort,
            _OPENAI_TOOLS_REASONING_ENV,
            exc,
        )
        return await call(retry)


class _ProviderUsage(NamedTuple):
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int


def _usage_from_openai(usage: object) -> _ProviderUsage:
    """Normalise an OpenAI usage object. OpenAI reports cached tokens *inside*
    ``prompt_tokens``; we split them out so ``input_tokens`` is the uncached
    remainder (matching Anthropic's TokenUsage semantics)."""
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    cached = 0
    details = getattr(usage, "prompt_tokens_details", None)
    if details is not None:
        cached = int(getattr(details, "cached_tokens", 0) or 0)
    return _ProviderUsage(max(prompt - cached, 0), completion, cached)


# ── Providers ───────────────────────────────────────────────────────────────────


class LLMProvider:
    name = "base"

    def is_available(self) -> bool:  # pragma: no cover - abstract
        raise NotImplementedError

    async def complete(
        self,
        task: str,
        system_prompt: str,
        user_prompt: str,
        *,
        response_model: Any,
        max_tokens: int,
        max_retries: int,
        model: str,
        metadata: claude_service.CallMetadata,
    ) -> tuple[Any, claude_service.TokenUsage]:  # pragma: no cover - abstract
        raise NotImplementedError


class AnthropicProvider(LLMProvider):
    name = PROVIDER_ANTHROPIC

    def is_available(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))

    async def complete(
        self,
        task: str,
        system_prompt: str,
        user_prompt: str,
        *,
        response_model: Any,
        max_tokens: int,
        max_retries: int,
        model: str,
        metadata: claude_service.CallMetadata,
    ) -> tuple[Any, claude_service.TokenUsage]:
        # Wrap the existing Anthropic dispatch — same models, same instructor
        # path, same _compute_cost. Referenced via the module so tests can patch it.
        return await claude_service._dispatch_anthropic(
            system_prompt,
            user_prompt,
            response_model=response_model,
            max_tokens=max_tokens,
            max_retries=max_retries,
            model=model,
            metadata=metadata,
        )


class _DictEnvelope(BaseModel):
    data: dict


class OpenAIProvider(LLMProvider):
    name = PROVIDER_OPENAI

    def is_available(self) -> bool:
        # No key or no SDK → unavailable → gateway falls back to Anthropic.
        return bool(os.environ.get("OPENAI_API_KEY")) and openai is not None and instructor is not None

    async def complete(
        self,
        task: str,
        system_prompt: str,
        user_prompt: str,
        *,
        response_model: Any,
        max_tokens: int,
        max_retries: int,
        model: str,
        metadata: claude_service.CallMetadata,
    ) -> tuple[Any, claude_service.TokenUsage]:
        # La latence se mesure ICI, comme le chemin Anthropic la mesure dans ses
        # ``_call_*`` : sans elle, comparer deux modèles se fait sans colonne
        # « temps de réponse », c'est-à-dire sur la moitié de la question.
        started = time.monotonic()
        try:
            result, raw = await self._invoke(
                system_prompt,
                user_prompt,
                response_model=response_model,
                max_tokens=max_tokens,
                max_retries=max_retries,
                model=model,
            )
        except Exception as exc:
            # #2528/#2529 — la cause RÉELLE de « l'analyse a échoué » en prod.
            # ``claude_service._call_dict`` (chemin Anthropic) classe une
            # troncature ``max_tokens`` en ``ClaudeIncompleteOutputError`` — le
            # type que ``_run_call_resilient`` (phase4_plan.py) sait DÉGRADER
            # (une reprise concise, puis une section vide et NOMMÉE) plutôt que
            # faire échouer l'analyse entière. Ce chemin OpenAI n'avait aucune
            # classification équivalente : une section du plan routée vers
            # OpenAI (`bellum_plan_evaluation`, modèle `gpt-5.6-luna` en prod)
            # qui tronquait laissait `InstructorRetryException` remonter BRUTE
            # jusqu'au nœud `plan` du graphe, qui la traite comme un échec de
            # TOUTE l'analyse (`UnrecoverableError` côté worker NestJS) au lieu
            # d'une section dégradée — exactement le bandeau vu par Louis sur
            # ATOS FRANCE le 17/09.
            if claude_service._is_truncation(exc):
                raise claude_service.ClaudeIncompleteOutputError(
                    prompt_name=metadata.prompt_name,
                    model=model,
                    max_tokens=max_tokens,
                ) from exc
            raise
        duration_s = time.monotonic() - started

        cost = _openai_compute_cost(raw.input_tokens, raw.output_tokens, model, raw.cache_read_tokens)
        usage = claude_service.TokenUsage(
            input_tokens=raw.input_tokens,
            output_tokens=raw.output_tokens,
            model=model,
            # ``cost_known=False`` ⇒ ce 0.0 n'est lu comme un prix par personne :
            # le registre du run reçoit ``None`` (« non tarifé »), Langfuse ne
            # reçoit aucun ``costDetails``, la ligne de log le dit, et
            # ``/metrics/cost`` compte l'appel dans ``unpriced_calls``.
            cost_usd=cost if cost is not None else 0.0,
            cache_read_tokens=raw.cache_read_tokens,
            cache_creation_tokens=0,
            provider=PROVIDER_OPENAI,
            cost_known=cost is not None,
            tariff_version=OPENAI_PRICING_VERSION if cost is not None else None,
        )
        claude_service._log_usage(usage, metadata, duration_s=duration_s)
        return result, usage

    async def _invoke(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        response_model: Any,
        max_tokens: int,
        max_retries: int,
        model: str,
    ) -> tuple[Any, _ProviderUsage]:
        """The one network seam (patched in tests). Returns ``(result, usage)``
        where ``result`` matches ``response_model`` (None→str, dict→dict, else the
        validated model instance).

        Deux détails de forme, tranchés sur preuve et non par habitude :

        * **``max_completion_tokens``, pas ``max_tokens``.** Le SDK embarqué
          (``openai==1.109.1``,
          ``openai/types/chat/completion_create_params.py``) documente
          ``max_tokens`` ainsi, verbatim : « This value is now deprecated in
          favor of ``max_completion_tokens``, and is not compatible with
          o-series models ». La table de tarifs ci-dessus contient déjà ``o3``,
          ``o3-mini`` et ``o4-mini`` : router une tâche vers l'un d'eux
          envoyait un paramètre que l'API refuse. Le changement n'est pas une
          précaution, c'est un 400 en attente. Le nom du paramètre local reste
          ``max_tokens`` : c'est le vocabulaire du gateway, partagé avec
          Anthropic, et le renommer contaminerait les 19 sites d'appel.
        * **``temperature`` passe par ``_openai_sampling_kwargs``**, la décision
          OpenAI, au lieu d'être envoyée inconditionnellement.
        * **Les deux branches OUTILLÉES passent par ``_send_with_tools``**, qui
          joint ``reasoning_effort`` aux seuls modèles dont l'API a refusé le
          raisonnement implicite en présence d'outils. Le raisonnement complet du
          choix — et ce qu'il coûte — est écrit au-dessus de
          ``_openai_tools_reasoning_effort``. La branche TEXTE n'y passe pas :
          elle n'envoie aucun outil, donc rien ne la refuse, donc elle garde son
          raisonnement.
        """
        api_key = os.environ["OPENAI_API_KEY"]

        if response_model is None:
            client = openai.AsyncOpenAI(api_key=api_key, timeout=claude_service.DEFAULT_TIMEOUT)
            resp = await client.chat.completions.create(
                model=model,
                max_completion_tokens=max_tokens,
                **_openai_sampling_kwargs(model),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            text = resp.choices[0].message.content or ""
            return text, _usage_from_openai(resp.usage)

        if response_model is dict:
            client = instructor.from_openai(openai.AsyncOpenAI(api_key=api_key, timeout=claude_service.DEFAULT_TIMEOUT))

            async def _dict_call(reasoning: dict[str, str]):
                return await client.chat.completions.create_with_completion(
                    model=model,
                    max_completion_tokens=max_tokens,
                    max_retries=max_retries,
                    **_openai_sampling_kwargs(model),
                    **reasoning,
                    messages=[
                        {"role": "system", "content": system_prompt + claude_service.DICT_ENVELOPE_INSTRUCTION},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_model=_DictEnvelope,
                )

            obj, completion = await _send_with_tools(model, _dict_call)
            return obj.data, _usage_from_openai(completion.usage)

        client = instructor.from_openai(openai.AsyncOpenAI(api_key=api_key, timeout=claude_service.DEFAULT_TIMEOUT))

        async def _structured_call(reasoning: dict[str, str]):
            return await client.chat.completions.create_with_completion(
                model=model,
                max_completion_tokens=max_tokens,
                max_retries=max_retries,
                **_openai_sampling_kwargs(model),
                **reasoning,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_model=response_model,
            )

        obj, completion = await _send_with_tools(model, _structured_call)
        return obj, _usage_from_openai(completion.usage)


# Module singletons — tests patch ``OPENAI_PROVIDER._invoke`` (no network) and can
# swap ``_PROVIDERS`` entries.
ANTHROPIC_PROVIDER = AnthropicProvider()
OPENAI_PROVIDER = OpenAIProvider()
_PROVIDERS: dict[str, LLMProvider] = {
    PROVIDER_ANTHROPIC: ANTHROPIC_PROVIDER,
    PROVIDER_OPENAI: OPENAI_PROVIDER,
}


#: #2975 (#2440.69-72) — la route de secours vers Anthropic reste ANNONCÉE
#: (déjà un `logger.warning` juste plus bas) mais devient LIMITÉE : au-delà de
#: ce nombre de bascules CONSÉCUTIVES pour le MÊME fournisseur routé,
#: l'alerte monte de warning à error (le canal Sentry du dépôt, jamais
#: `capture_exception` en direct) — une dégradation qui dure devient un
#: incident, pas un bruit de fond qu'on apprend à ignorer. Même discipline
#: que `CostAlertService` : un seuil NOMMÉ, jamais un e-mail ni une
#: notification utilisateur (le fournisseur ne se nomme jamais à l'écran).
_DEGRADED_ROUTE_ALERT_THRESHOLD = 5

#: Bascules consécutives PAR fournisseur routé — jamais agrégées entre
#: fournisseurs (chacun a sa propre disponibilité, la même discipline que
#: GA-43 : un compte ne s'agrège jamais avec un autre).
_degraded_route_streaks: dict[str, int] = {}


def _record_degraded_route(provider_name: str) -> int:
    streak = _degraded_route_streaks.get(provider_name, 0) + 1
    _degraded_route_streaks[provider_name] = streak
    return streak


def reset_degraded_route_streak(provider_name: str | None = None) -> None:
    """Remet le compteur à zéro — pour les tests, et pour un futur appelant
    qui confirmerait que ``provider_name`` est redevenu disponible.
    ``None`` : tous les fournisseurs."""
    if provider_name is None:
        _degraded_route_streaks.clear()
    else:
        _degraded_route_streaks.pop(provider_name, None)


#: #3495 — fournisseur routé À COURT DE CRÉDIT (429 ``insufficient_quota`` /
#: ``credit_balance_exhausted``). Un quota épuisé ne se corrige pas en réessayant :
#: on bascule CE tour vers Anthropic et on écarte le fournisseur pour une durée
#: BORNÉE (``LLM_QUOTA_BREAKER_S``, 600 s par défaut), pour ne pas payer un appel
#: perdu par tour. Passé le délai il est réessayé (demi-ouvert), jamais exclu pour
#: toujours. Un 429 de DÉBIT (rate limit ordinaire) n'est PAS un quota épuisé.
_QUOTA_BREAKER_ENV = "LLM_QUOTA_BREAKER_S"
_QUOTA_BREAKER_DEFAULT_S = 600.0
_QUOTA_CODES = frozenset({"insufficient_quota", "credit_balance_exhausted"})
_QUOTA_PHRASES = ("insufficient_quota", "credit_balance_exhausted", "no credits remaining")
_exhausted_until: dict[str, float] = {}


def _quota_breaker_s() -> float:
    try:
        parsed = float(os.environ.get(_QUOTA_BREAKER_ENV, ""))
    except ValueError:
        return _QUOTA_BREAKER_DEFAULT_S
    return parsed if parsed > 0 else _QUOTA_BREAKER_DEFAULT_S


def is_quota_exhausted(exc: BaseException) -> bool:
    """Ce 429 dit-il « plus de crédit » (et non « trop vite ») ?"""
    if openai is None or not isinstance(exc, openai.RateLimitError):
        return False
    body = getattr(exc, "body", None)
    error = body.get("error") if isinstance(body, dict) else None
    code = error.get("code") if isinstance(error, dict) else None
    if isinstance(code, str) and code.lower() in _QUOTA_CODES:
        return True
    text = str(getattr(exc, "message", "") or exc).lower()
    return any(phrase in text for phrase in _QUOTA_PHRASES)


def mark_provider_exhausted(provider_name: str) -> None:
    _exhausted_until[provider_name] = time.monotonic() + _quota_breaker_s()


def is_provider_exhausted(provider_name: str) -> bool:
    until = _exhausted_until.get(provider_name)
    if until is None:
        return False
    if time.monotonic() >= until:
        _exhausted_until.pop(provider_name, None)
        return False
    return True


def reset_provider_exhausted(provider_name: str | None = None) -> None:
    if provider_name is None:
        _exhausted_until.clear()
    else:
        _exhausted_until.pop(provider_name, None)


def report_quota_exhausted(provider_name: str) -> None:
    """Alerte OPÉRATEUR nommée (journal ERROR → Sentry) — jamais un message à la personne."""
    mark_provider_exhausted(provider_name)
    logger.error(
        "llm_provider_quota_exhausted provider=%s — crédit épuisé, bascule sur anthropic "
        "pendant %.0f s (disjoncteur %s) : recharger le compte du fournisseur",
        provider_name,
        _quota_breaker_s(),
        _QUOTA_BREAKER_ENV,
    )


def _select_provider(route: Route) -> LLMProvider:
    """Pick the provider for a route, falling back to Anthropic when the routed
    provider is unknown or unavailable (no key / no SDK) or out of credit."""
    if route.provider == PROVIDER_ANTHROPIC:
        return ANTHROPIC_PROVIDER
    if is_provider_exhausted(route.provider):
        return ANTHROPIC_PROVIDER
    provider = _PROVIDERS.get(route.provider)
    if provider is not None and provider.is_available():
        reset_degraded_route_streak(route.provider)
        return provider
    streak = _record_degraded_route(route.provider)
    log = logger.error if streak >= _DEGRADED_ROUTE_ALERT_THRESHOLD else logger.warning
    log(
        "Task routed to provider=%s but it is unavailable — falling back to anthropic "
        "(bascule dégradée consécutive #%d)",
        route.provider,
        streak,
    )
    return ANTHROPIC_PROVIDER


#: #2440.69-72 (épopée #2975) — LE RETRY qui restait « reste » sur cinq lots
#: indépendants (25/09 → 28/09 matin) : chacun l'a écarté pour la même raison,
#: nommée dans chaque bilan — un retry-avec-backoff INCONDITIONNEL sur le
#: fournisseur PRIMAIRE avant bascule ajouterait de la latence à CHAQUE appel
#: d'un fournisseur en panne, sur le chemin chaud de `complete` (donc du chat
#: et de toute l'analyse) : un changement de comportement de dispatch en
#: production, jamais une tranche sûre pour un lot.
#:
#: LA TRANCHE ICI EST DIFFÉRENTE, et c'est ce qui la rend sûre : elle ne
#: RÉESSAIE JAMAIS le fournisseur qui vient d'échouer (aucun retry, aucune
#: latence ajoutée sur lui) — elle BASCULE, une seule fois, vers la route de
#: secours (Anthropic), exactement ce que `_select_provider` fait déjà pour
#: une INDISPONIBILITÉ statique (pas de clé/SDK). Ce qui manquait : la même
#: bascule pour une panne RUNTIME (délai, connexion, 429, 5xx) mesurée
#: PENDANT l'appel, pas seulement avant.
#:
#: Hors réglage (défaut de TOUT appelant d'avant ce champ) : l'exception
#: remonte NUE, chemin byte-identique — c'est l'état mesuré par
#: `test_non_truncation_openai_error_is_not_reclassified` et par chaque audit
#: précédent sur cette épopée.
_RETRY_ON_ERROR_ENV = "LLM_GATEWAY_RETRY_ON_ERROR"
_RETRY_ON_ERROR_ON = frozenset({"1", "true"})


def _retry_on_error_enabled() -> bool:
    """Relu à CHAQUE appel — même discipline que tout coupe-circuit du fichier."""
    return os.environ.get(_RETRY_ON_ERROR_ENV, "").strip().lower() in _RETRY_ON_ERROR_ON


def _is_transient_provider_error(exc: BaseException) -> bool:
    """Ce refus-ci mérite-t-il UNE bascule vers la route de secours ?

    Volontairement étroit, même discipline que ``_is_tools_reasoning_refusal`` :
    seules les pannes de DISPONIBILITÉ (délai, connexion, quota, panne serveur)
    — jamais une erreur de FORME (validation, troncature — déjà classée en
    ``ClaudeIncompleteOutputError`` par ``OpenAIProvider.complete`` avant que
    cette fonction ne soit même atteinte, authentification, requête mal
    formée) qu'un second fournisseur ne corrige pas et qu'un appelant sait
    déjà dégrader proprement (``_run_call_resilient``). Un SDK absent (import
    gardé en tête de module) rend cette fonction honnête : aucune exception
    OpenAI connue ⇒ jamais transitoire pour ce process.
    """
    if openai is None:
        return False
    return isinstance(
        exc,
        (openai.APITimeoutError, openai.APIConnectionError, openai.RateLimitError, openai.InternalServerError),
    )


#: #2440.78 — échecs d'EXÉCUTION consécutifs par fournisseur (délai, connexion, quota, 5xx),
#: remis à zéro au premier succès. Distinct de `_degraded_route_streaks` (indisponibilité
#: STATIQUE, remise à zéro à chaque sélection réussie) : la santé se mesure sur des appels.
#: Un fournisseur écarté pour santé n'est plus APPELÉ, donc plus jamais remis à zéro par un
#: succès : la série n'est retenue que `_HEALTH_COOLDOWN_S` secondes après le DERNIER échec, puis
#: le fournisseur est réessayé (demi-ouvert) — jamais exclu pour toujours.
_HEALTH_COOLDOWN_S = 60.0
_runtime_failure_streaks: dict[str, tuple[int, float]] = {}


def record_runtime_failure(provider_name: str) -> int:
    streak = _live_runtime_failure_streak(provider_name) + 1
    _runtime_failure_streaks[provider_name] = (streak, time.monotonic())
    return streak


def _live_runtime_failure_streak(provider_name: str) -> int:
    count, last = _runtime_failure_streaks.get(provider_name, (0, 0.0))
    return count if count and time.monotonic() - last < _HEALTH_COOLDOWN_S else 0


def record_runtime_success(provider_name: str) -> None:
    _runtime_failure_streaks.pop(provider_name, None)


def reset_runtime_failure_streak(provider_name: str | None = None) -> None:
    if provider_name is None:
        _runtime_failure_streaks.clear()
    else:
        _runtime_failure_streaks.pop(provider_name, None)


_CLEARED_PROVIDERS_ENV = "LLM_PROVIDER_CLEARED"
_MAX_OUTPUT_USD_ENV = "LLM_ROUTE_MAX_OUTPUT_USD_PER_MTOK"


def default_requirements(**declared: Any) -> provider_fit.RoutingRequirements:
    """Les exigences de l'APPEL (``declared``) + les deux réglages d'exploitation, relus à CHAQUE appel.

    ``LLM_PROVIDER_CLEARED`` (liste séparée par des virgules) : fournisseurs autorisés pour des
    données personnelles — absente, la conformité n'est pas évaluée (chemin d'avant, inchangé).
    ``LLM_ROUTE_MAX_OUTPUT_USD_PER_MTOK`` : plafond de coût de sortie — absent ou illisible, aucun
    plafond (jamais « 0 »)."""
    raw = os.environ.get(_CLEARED_PROVIDERS_ENV, "").strip()
    cleared = frozenset(p.strip().lower() for p in raw.split(",") if p.strip()) if raw else None
    cap: float | None = None
    try:
        parsed = float(os.environ.get(_MAX_OUTPUT_USD_ENV, ""))
        cap = parsed if parsed > 0 else None
    except ValueError:
        cap = None
    return provider_fit.RoutingRequirements(cleared_providers=cleared, max_output_usd_per_mtok=cap, **declared)


def resolve_dispatch(
    task: str | None, model: str, requirements: provider_fit.RoutingRequirements | None = None
) -> tuple[LLMProvider, str]:
    """``(fournisseur, modèle)`` pour ``task`` — LA dérivation, à un seul endroit.

    Trois règles, et elles se lisent ensemble :

    * **Bris de glace.** ``LLM_GATEWAY_DISABLED=true`` ignore TOUTE surcharge de
      routage et force le chemin d'avant la passerelle — Anthropic direct + le
      modèle de l'appelant.
    * **Repli honnête.** Un fournisseur routé mais indisponible (pas de clé, pas
      de SDK) retombe sur Anthropic. Jamais un 401, jamais un résultat inventé.
    * **Le modèle suit son fournisseur.** L'identifiant routé n'est retenu que si
      le fournisseur résolu EST celui qui était routé ; sur un repli on hérite du
      modèle de l'appelant, sinon un identifiant OpenAI partirait dans un appel
      Anthropic.

    Extraite de ``complete`` le 28/08/2026 parce qu'un SECOND appelant en a
    besoin : la boucle d'outils du copilote (``chat_orchestrator``) parle le
    protocole d'outils de son fournisseur et ne peut donc pas passer par
    ``complete`` — mais elle doit résoudre sa destination de la MÊME façon. Deux
    chemins qui refont une dérivation divergent ; ici il n'y en a qu'un.
    """
    route = _FALLBACK_ROUTE if disabled(LLM_GATEWAY_KILL_SWITCH) else resolve_route(task)
    provider = _select_provider(route)
    chosen_model = model
    if provider.name == route.provider and route.model:
        chosen_model = route.model
    # #2440.74-80 — l'APPEL déclare ce qu'il exige ; le fournisseur routé est vérifié AVANT
    # de partir. Sans `requirements` (appelant d'avant), chemin byte-identique. Échec d'une
    # vérification → Anthropic + le modèle de l'appelant, annoncé avec le nom de la vérification.
    if requirements is not None and provider is not ANTHROPIC_PROVIDER:
        price = _openai_price(chosen_model) if provider.name == PROVIDER_OPENAI else None
        verdict = provider_fit.check_provider_fit(
            provider.name,
            chosen_model,
            requirements,
            output_usd_per_mtok=price.output_usd if price else None,
            runtime_failure_streak=_live_runtime_failure_streak(provider.name),
        )
        if not verdict.fit:
            logger.warning(
                "Route %s:%s écartée pour la tâche %s — vérification(s) échouée(s) : %s — repli anthropic",
                provider.name,
                chosen_model,
                task,
                "; ".join(f"{c.name} ({c.detail})" for c in verdict.checks if c.status == "failed"),
            )
            return ANTHROPIC_PROVIDER, model
    return provider, chosen_model


#: #2440.46 — les statuts HTTP d'une LIMITE fournisseur : 429 (débit) et 529 (surcharge).
#: Volontairement étroit : un 400/401/5xx ordinaire dit autre chose qu'une limite.
_PROVIDER_LIMIT_STATUSES = frozenset({429, 529})
_PROVIDER_LIMIT_STATUS = "provider_limit"


def is_provider_limit(exc: BaseException) -> bool:
    """Ce refus est-il une LIMITE du fournisseur (429 / surcharge), de l'un ou l'autre SDK ?

    Lit le statut HTTP sur l'exception, puis sur sa cause (``instructor`` enveloppe) :
    aucune dépendance à un SDK en particulier, donc valable pour les deux fournisseurs.
    """
    seen: BaseException | None = exc
    for _ in range(3):
        if seen is None:
            return False
        if getattr(seen, "status_code", None) in _PROVIDER_LIMIT_STATUSES:
            return True
        seen = seen.__cause__
    return False


def _record_provider_limit(provider_name: str, task: str | None, model: str) -> None:
    """#2440.46 — UNE ligne datée dans le registre du run (``provider_costs``), SANS débit.

    Opération distincte (``<tâche>.limite``) : elle ne se fond jamais dans la ligne « ok » de
    la même tâche. Coût 0.0 = l'appel refusé n'a rien facturé (une mesure, pas un « non mesuré ») ;
    aucune ligne de crédit n'est touchée ici. Hors run, ``record`` est un no-op silencieux.
    """
    cost_ledger.record(
        provider_name,
        f"{canonical_task(task)}.limite",
        units=0,
        cost_usd=0.0,
        model=model,
        status=_PROVIDER_LIMIT_STATUS,
    )


async def complete(
    task: str | None,
    system_prompt: str,
    user_prompt: str,
    *,
    response_model: Any = None,
    max_tokens: int = claude_service.DEFAULT_MAX_TOKENS,
    max_retries: int = claude_service.DEFAULT_MAX_RETRIES,
    model: str = claude_service.CLAUDE_MODEL,
    metadata: claude_service.CallMetadata | None = None,
) -> tuple[Any, claude_service.TokenUsage]:
    """Route ``task`` to a provider/model and return ``(result, TokenUsage)``.

    ``result`` shape mirrors ``call_claude``: ``response_model=None`` → str,
    ``response_model=dict`` → dict, otherwise a validated model instance. Usage +
    cost are bundled in the returned ``TokenUsage``.
    """
    meta = metadata or claude_service.CallMetadata(prompt_name=str(task or "unknown"))
    provider, chosen_model = resolve_dispatch(
        task,
        model,
        default_requirements(
            structured_output=response_model is not None,
            # ~3 caractères par jeton : une estimation PRUDENTE (par excès), jamais une mesure.
            estimated_input_tokens=(len(system_prompt) + len(user_prompt)) // 3,
            max_output_tokens=max_tokens,
        ),
    )

    try:
        result = await provider.complete(
            canonical_task(task),
            system_prompt,
            user_prompt,
            response_model=response_model,
            max_tokens=max_tokens,
            max_retries=max_retries,
            model=chosen_model,
            metadata=meta,
        )
        if provider is not ANTHROPIC_PROVIDER:
            record_runtime_success(provider.name)
        return result
    except Exception as exc:
        if is_provider_limit(exc):
            # #2440.46 — la limite laisse une trace datée, quel que soit le chemin de repli ensuite.
            _record_provider_limit(provider.name, task, chosen_model or model)
        quota_exhausted = provider is not ANTHROPIC_PROVIDER and is_quota_exhausted(exc)
        if provider is not ANTHROPIC_PROVIDER and _is_transient_provider_error(exc):
            record_runtime_failure(provider.name)
        if quota_exhausted:
            # #3495 — crédit épuisé : bascule de ce tour, sans réessayer, même hors
            # `LLM_GATEWAY_RETRY_ON_ERROR` (sans elle Laura reste en panne).
            report_quota_exhausted(provider.name)
            return await ANTHROPIC_PROVIDER.complete(
                canonical_task(task),
                system_prompt,
                user_prompt,
                response_model=response_model,
                max_tokens=max_tokens,
                max_retries=max_retries,
                model=model,
                metadata=meta,
            )
        # #2440.69-72 (épopée #2975) — LE RETRY, hors réglage : aucun mot n'est
        # exécuté (l'exception remonte au `raise` nu ci-dessous), donc aucun
        # coût de latence sur le chemin chaud d'avant ce champ.
        if provider is ANTHROPIC_PROVIDER or not _retry_on_error_enabled() or not _is_transient_provider_error(exc):
            raise
        streak = _record_degraded_route(provider.name)
        log = logger.error if streak >= _DEGRADED_ROUTE_ALERT_THRESHOLD else logger.warning
        log(
            "Fournisseur %s indisponible EN COURS D'APPEL (%s) — bascule de secours (unique, "
            "sans réessayer %s) vers anthropic (bascule dégradée consécutive #%d)",
            provider.name,
            exc.__class__.__name__,
            provider.name,
            streak,
        )
        # Le modèle SUIT son fournisseur (même règle que `resolve_dispatch`) :
        # un identifiant du fournisseur en panne ne part jamais dans l'appel
        # Anthropic — on hérite du modèle de l'APPELANT, jamais de la route.
        return await ANTHROPIC_PROVIDER.complete(
            canonical_task(task),
            system_prompt,
            user_prompt,
            response_model=response_model,
            max_tokens=max_tokens,
            max_retries=max_retries,
            model=model,
            metadata=meta,
        )
