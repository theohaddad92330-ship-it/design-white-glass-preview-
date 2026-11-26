"""Observabilité LLM — client Langfuse minimal (traces, générations, spans).

Ce qu'il résout : ``GET /metrics/cost`` est un compteur en mémoire de process —
remis à zéro au redéploiement, jamais agrégé entre replicas — et les trois 500
du copilote des 15-16/08 n'ont laissé AUCUNE ligne de log (l'accès s'écrit en
fin de requête, et le tour ne finissait jamais). Ici, chaque appel Claude part
en **génération** Langfuse (tokens, cache, coût, latence, modèle), chaque tour
de copilote et chaque run d'analyse en **trace**, chaque phase du graphe et
chaque outil du copilote en **span** — persistés côté Langfuse, lisibles après
un redéploiement, regroupés par ``sessionId`` = correlation-id.

#2442.2 — le ``traceId`` lui-même DÉRIVE du correlation-id ({@link
derive_trace_id}), la même convention que la référence support de l'API
(``observability-privacy.ts:supportReference``) : un support qui tient UNE
valeur (celle des journaux, du tag Sentry ``correlation_id`` ou de la
référence ``BLM-XXXXXXXX``) la retrouve telle quelle comme ``traceId`` dans
Langfuse, sans recouper ``sessionId``.

Trois contrats, les mêmes que le reste du dépôt :

1. **Env-gated, sans clés = no-op strict, ZÉRO réseau.** La paire
   ``LANGFUSE_PUBLIC_KEY`` + ``LANGFUSE_SECRET_KEY`` est le seul interrupteur
   (``LANGFUSE_HOST`` optionnel, défaut cloud EU). ``LANGFUSE_DISABLED=true``
   est le break-glass inverse : couper sans retirer les clés.
2. **Une métrique ne casse jamais ce qu'elle mesure** (règle du
   ``cost_ledger``) : aucune fonction publique ne lève, un POST d'ingestion en
   échec jette son lot — il ne se rejoue pas, il ne bloque rien.
3. **Le contenu des prompts ne sort PAS par défaut.** Les prompts portent la
   donnée des comptes clients : seuls tokens / coût / modèle / latence /
   prompt_name partent. ``LANGFUSE_CAPTURE_CONTENT=true`` est l'opt-in
   explicite de l'opérateur (RGPD : Langfuse devient alors sous-traitant du
   contenu), borné à ``_CONTENT_CAP_CHARS``.
4. **Masking AVANT export, inconditionnel.** Tout texte qui part — contenu
   capturé, métadonnées, message d'erreur d'un span — traverse
   :func:`_redact` : e-mails, téléphones et secrets sont remplacés au moment
   où le corps est CONSTRUIT, donc la file elle-même n'a jamais la donnée
   brute. Il n'existe aucune variable pour l'éteindre : un garde-fou qu'on
   peut débrancher n'en est pas un. Voir le bloc « masquage » plus bas.

Pas de SDK ``langfuse`` : l'API publique d'ingestion suffit
(``POST /api/public/ingestion``, Basic auth, lot d'événements typés) et httpx
est déjà là. Le SDK tirerait OpenTelemetry entier pour ce dont on se sert.

Transport : une file bornée en mémoire + un thread de fond démarré par
``start()`` (startup FastAPI) qui la draine par lots. Les fonctions
d'enregistrement n'ouvrent JAMAIS le réseau elles-mêmes — c'est ce qui rend le
no-op vérifiable et les tests hermétiques. Une trace est **paresseuse** : elle
n'est émise qu'au premier événement enfant, pour qu'un endpoint qui n'appelle
aucun modèle ne produise aucun bruit.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Any

import httpx

from app.services import kill_switch
from app.services.chat_slo import ack_ms_from_stages, turn_slo_summary

logger = logging.getLogger(__name__)

_DEFAULT_HOST = "https://cloud.langfuse.com"
_INGESTION_PATH = "/api/public/ingestion"

#: Borne de la file : au-delà on jette le plus ancien. Une observabilité qui
#: mange la mémoire du service qu'elle observe aurait tout faux.
_MAX_QUEUE = 1000
_BATCH_MAX = 100
_FLUSH_INTERVAL_S = 5.0
_POST_TIMEOUT_S = 10.0
#: Plafond du contenu capturé (opt-in) : un prompt de recherche fait ~36k chars,
#: on tronque plutôt que de faire gonfler chaque lot d'ingestion.
_CONTENT_CAP_CHARS = 20_000

_TRUTHY = {"1", "true", "yes", "on"}


# ── configuration (lue à CHAQUE appel — pas de redémarrage pour l'activer) ────


def enabled() -> bool:
    """True quand les DEUX clés sont posées et que le break-glass ne l'est pas.

    ⚠️ Deux conditions DISTINCTES, et il ne faut pas les confondre : l'absence de
    clés est un no-op normal, l'interrupteur est une décision d'exploitation.
    Seul le second est publié comme « capacité coupée » — la lecture passe donc
    par le registre (``kill_switch.py``), à comparaison identique.
    """
    if kill_switch.disabled(kill_switch.LANGFUSE_KILL_SWITCH):
        return False
    return bool(
        os.environ.get("LANGFUSE_PUBLIC_KEY", "").strip()
        and os.environ.get("LANGFUSE_SECRET_KEY", "").strip()
    )


def _capture_content() -> bool:
    return os.environ.get("LANGFUSE_CAPTURE_CONTENT", "").strip().lower() in _TRUTHY


def _host() -> str:
    return (os.environ.get("LANGFUSE_HOST", "").strip() or _DEFAULT_HOST).rstrip("/")


# ── état ──────────────────────────────────────────────────────────────────────


@dataclass
class _PendingTrace:
    """Une trace liée au contexte courant, émise au premier événement enfant."""

    trace_id: str
    name: str
    user_id: str | None = None
    session_id: str | None = None
    metadata: dict[str, Any] | None = None
    emitted: bool = field(default=False, compare=False)
    #: #2442.3 — le récapitulatif d'un TOUR (``bind_trace(..., summarize=True)``).
    #: ``None`` pour toute autre trace : run d'analyse, clic isolé — inchangées.
    turn: _TurnStats | None = field(default=None, compare=False)


@dataclass
class _TurnStats:
    """#2442.3 / #2442.11 / #2442.12 — ce qu'un tour a CONSOMMÉ, jamais ce qu'il a DIT.

    Que des nombres, des noms d'outils/d'étapes (liste fermée du code) et des
    noms de classes d'exception : aucun champ n'accueille du texte libre, donc
    aucun ne peut porter le corps d'un message.
    """

    started: float
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    cost_usd: float = 0.0
    cost_complete: bool = True
    generations: int = 0
    models: list[str] = field(default_factory=list)
    tools: list[dict[str, Any]] = field(default_factory=list)
    stages: dict[str, int] = field(default_factory=dict)
    #: #2442.12 (épopée #2879) — coût des outils NON-LLM (Brave, Apollo,
    #: Firecrawl, Pappers…) appelés pendant ce tour, par fournisseur. Rempli
    #: par `note_turn_provider_costs`, jamais recalculé ici : ce dataclass ne
    #: connaît aucun prix, seulement ce qu'on lui a donné.
    provider_costs: dict[str, dict[str, Any]] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    first_status_ms: int | None = None
    first_token_ms: int | None = None
    final_status: str | None = None


_trace: ContextVar[_PendingTrace | None] = ContextVar("langfuse_trace", default=None)

_queue: list[dict[str, Any]] = []
_lock = threading.Lock()
_worker: threading.Thread | None = None
_stop = threading.Event()


# ── helpers ───────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _event(event_type: str, body: dict[str, Any]) -> dict[str, Any]:
    return {"id": uuid.uuid4().hex, "timestamp": _iso(_now()), "type": event_type, "body": body}


def _enqueue(events: list[dict[str, Any]]) -> None:
    with _lock:
        _queue.extend(events)
        overflow = len(_queue) - _MAX_QUEUE
        if overflow > 0:
            del _queue[:overflow]


# ── masquage : ce qui ne sort JAMAIS, quelle que soit la configuration ────────
#
# Exigence `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md:28-30` — « masking avant
# export », « aucun secret/token », « contenu email/téléphone masqué par défaut ».
#
# Trois principes ont guidé l'écriture de ces motifs :
#
# 1. **Le masquage est appliqué à la CONSTRUCTION du corps**, pas au POST : la
#    file en mémoire ne contient donc jamais la donnée brute. « Avant export »
#    au sens fort.
# 2. **Un masque trop gourmand rend la trace inutile.** Un SIREN (9 chiffres),
#    un effectif, un chiffre d'affaires et un code postal doivent PASSER — sinon
#    on masque le dossier au lieu de masquer la personne. Les motifs de
#    téléphone sont donc volontairement étroits : E.164 (`+33…`) et national
#    français (`0X…`), les deux seules formes que l'enrichissement produit.
# 3. **Ce n'est pas configurable.** Retirer le MOYEN vaut mieux que retirer la
#    permission : une variable d'extinction finit toujours posée « juste pour
#    déboguer ».

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

#: Téléphone international (E.164 avec séparateurs) ou national français.
_PHONE_RE = re.compile(
    r"(?<![\w.])(?:\+\d{1,3}[\s.\-]?(?:\(?\d{1,4}\)?[\s.\-]?){2,6}\d{2,4}"
    r"|0[1-9](?:[\s.\-]?\d{2}){4})(?![\w.])"
)

#: Secrets, du plus spécifique au plus générique. L'ordre compte : le motif
#: « clé = valeur » ne doit pas manger un jeton déjà remplacé.
_SECRET_RES: tuple[re.Pattern[str], ...] = (
    # JWT (trois segments base64url) — un jeton Supabase entier tient dans un log.
    re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}"),
    # En-tête d'autorisation.
    re.compile(r"\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE),
    # Clés à préfixe (Anthropic, Stripe, Langfuse…).
    re.compile(r"\b[a-z]{2}[-_](?:[A-Za-z0-9]+[-_])*[A-Za-z0-9]{12,}"),
    # `api_key=…`, `"token": "…"`, `password=…` — la CLÉ reste lisible, la valeur non.
    # ⚠️ Les crochets sont EXCLUS de la valeur : sans ça, ce motif re-masquait le
    # `[secret masqué]` qu'un motif précédent venait de poser et laissait traîner
    # un « masqué] » orphelin.
    re.compile(
        r"((?:api[-_]?key|access[-_]?token|token|secret|password|authorization)\"?\s*[:=]\s*\"?)"
        r"([^\"'\s,;}&\[\]]{6,})",
        re.IGNORECASE,
    ),
)

_EMAIL_MASK = "[email masqué]"
_PHONE_MASK = "[téléphone masqué]"
_SECRET_MASK = "[secret masqué]"


def _redact(text: str) -> str:
    """Masque regex PUIS (flag ``TRACE_PII_NER_ENABLED``) noms de personnes. Ne lève jamais.

    #4113 — Presidio complète le regex pour les NOMS, sur les traces Langfuse
    seulement. Flag absent : ``mask_person_names`` rend le texte tel quel sans
    importer Presidio — chemin byte-identique à ``_redact_regex``.
    """
    from app.services.trace_pii_ner import mask_person_names  # noqa: PLC0415

    return mask_person_names(_redact_regex(text))


def _redact_regex(text: str) -> str:
    """Masque e-mails, téléphones et secrets. Ne lève jamais.

    Appliqué à TOUT texte qui part vers Langfuse — contenu capturé, valeurs de
    métadonnées, message d'erreur d'un span. Ce dernier est celui qui manquait :
    il exporte un ``str(exc)`` et n'a jamais dépendu de
    ``LANGFUSE_CAPTURE_CONTENT``, alors qu'un fournisseur en échec recopie
    volontiers l'URL appelée, clé d'API comprise.
    """
    try:
        redacted = _EMAIL_RE.sub(_EMAIL_MASK, text)
        for pattern in _SECRET_RES:
            redacted = pattern.sub(
                lambda m: (m.group(1) + _SECRET_MASK) if m.re.groups >= 2 else _SECRET_MASK,
                redacted,
            )
        return _PHONE_RE.sub(_PHONE_MASK, redacted)
    except Exception:  # noqa: BLE001 — un masque qui casse ne doit pas laisser passer
        return _SECRET_MASK


def redact_personal_data(text: str) -> str:
    """Le MÊME masquage (e-mails, téléphones, secrets), exposé hors de Langfuse.

    #1949.23 — la trace anonyme d'une demande que Laura n'a pas su router passe
    par ce masque (``unrouted_intent.py``). Un second jeu de motifs écrit à côté
    divergerait du premier au prochain correctif — un masquage vit à un seul
    endroit. Ne lève jamais, comme ``_redact``. Regex seul (#4113) : le NER des
    noms ne vaut que pour les traces Langfuse.
    """
    return _redact_regex(text)


def _redact_meta(value: Any) -> Any:
    """Masque récursivement les chaînes d'un bloc de métadonnées.

    Les appelants y passent aujourd'hui des identifiants techniques
    (``thread_id``, ``correlationId``) ; rien ne garantit que le prochain n'y
    mettra pas un extrait de dossier.
    """
    if isinstance(value, str):
        return _redact(value)
    if isinstance(value, dict):
        return {key: _redact_meta(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_meta(item) for item in value]
    return value


def _stringify(value: Any) -> str:
    """Sérialisation best-effort du contenu capturé, MASQUÉE puis bornée. Jamais
    d'exception : ce qui ne se sérialise pas devient sa ``repr``.

    ⚠️ L'ordre compte : on masque AVANT de tronquer. Tronquer d'abord couperait
    un secret en deux et en laisserait la moitié partir.
    """
    try:
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    except Exception:  # noqa: BLE001 — le contenu est optionnel, pas vital
        text = repr(value)
    return _redact(text)[:_CONTENT_CAP_CHARS]


def _emit_trace_if_needed(pending: _PendingTrace) -> None:
    if pending.emitted:
        return
    pending.emitted = True
    _enqueue([_event("trace-create", _trace_body(pending))])


def _environment() -> str | None:
    """L'environnement de déploiement, tel que Sentry le connaît déjà.

    On ne crée PAS de variable dédiée : ``SENTRY_ENVIRONMENT`` est posée sur les
    trois services depuis des mois, et en ajouter une seconde garantirait qu'un
    jour les deux disent des choses différentes. ``LANGFUSE_ENVIRONMENT`` reste
    acceptée pour un opérateur qui voudrait les séparer volontairement.
    """
    return (os.environ.get("LANGFUSE_ENVIRONMENT") or os.environ.get("SENTRY_ENVIRONMENT") or "").strip() or None


def _release() -> str | None:
    """La version déployée — sur Railway, le SHA du commit."""
    return (os.environ.get("SENTRY_RELEASE") or os.environ.get("RAILWAY_GIT_COMMIT_SHA") or "").strip() or None


def _trace_body(pending: _PendingTrace) -> dict[str, Any]:
    body: dict[str, Any] = {"id": pending.trace_id, "name": pending.name, "timestamp": _iso(_now())}
    if pending.user_id:
        body["userId"] = pending.user_id
    if pending.session_id:
        body["sessionId"] = pending.session_id
    # ⚠️ L'environnement et la version voyagent sur CHAQUE trace, et pas
    # seulement sur celles dont l'appelant a pensé à les passer. Sans eux, les
    # traces de développement, de recette et de production tombent dans la même
    # vue sans rien pour les distinguer — c'est-à-dire qu'on ne peut ni chercher
    # « les erreurs de prod » ni corréler une régression à un déploiement. La
    # séparation dev/staging/prod est un garde-fou explicite des exigences
    # d'observabilité ; elle ne se tient pas au niveau de l'appelant.
    #
    # Les valeurs de l'appelant GAGNENT : une trace qui déclare son propre
    # environnement sait quelque chose que le processus ignore.
    inherited = {key: value for key, value in (("environment", _environment()), ("release", _release())) if value}
    metadata = {**inherited, **(pending.metadata or {})}
    if metadata:
        # Masquage AVANT export : la file elle-même n'a jamais la donnée brute.
        body["metadata"] = _redact_meta(metadata)
    return body


# ── #2442.2 — UNE convention commune d'identifiant ────────────────────────────

#: Un correlation-id compact (32 hexadécimaux, la forme d'un UUID sans tirets).
_HEX32_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def derive_trace_id(correlation_id: str | None) -> str | None:
    """#2442.2 — le trace_id Langfuse DÉRIVE du correlation-id, il n'est plus
    tiré au hasard dès qu'on en a un.

    Même convention que la référence support (`observability-privacy.ts:
    supportReference`) côté API : un identifiant hexadécimal compact passe TEL
    QUEL (avec ou sans tirets, casse normalisée) ; une forme non hexadécimale
    — un en-tête fourni par un appelant externe — passe par un SHA-256
    reproductible, jamais recopiée en clair dans un id Langfuse.

    Le résultat : le MÊME identifiant se retrouve dans les journaux
    (`correlation_id`), Sentry (tag `correlation_id`), la référence support
    affichée à l'écran (`BLM-XXXXXXXX`, les huit premiers hexadécimaux de ce
    même id) et le `traceId` Langfuse — un support n'a plus qu'UNE valeur à
    chercher dans les trois systèmes, plutôt que de recouper `sessionId`.

    `None`/vide → `None` : hors requête (tâche de fond), rien à dériver ;
    `bind_trace` retombe alors sur un identifiant aléatoire, comme avant.
    """
    value = (correlation_id or "").strip()
    if not value:
        return None
    compact = value.replace("-", "").lower()
    if _HEX32_PATTERN.match(compact):
        return compact
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


# ── API : traces ──────────────────────────────────────────────────────────────


@contextmanager
def bind_trace(
    name: str,
    *,
    user_id: str | None = None,
    session_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    summarize: bool = False,
) -> Iterator[None]:
    """Lie une trace au contexte (run d'analyse, tour de copilote).

    Paresseuse : rien n'est émis tant qu'aucune génération / aucun span n'arrive
    dessous. Sans clés : passe-plat pur.

    #2442.2 — `trace_id` dérive de `session_id` (= correlation-id, posé par
    tous les appelants) via {@link derive_trace_id} : SI on a un correlation-id,
    le trace_id Langfuse EST cette même valeur, sous sa forme compacte. Sans
    lui (tâche de fond), un identifiant aléatoire — comportement inchangé.
    """
    if not enabled():
        yield
        return
    current = _trace.get()
    if current is not None and current.name == name:
        # #2442.4 — un bind IMBRIQUÉ du même nom REJOINT la trace liée plus haut
        # (la route lie le tour pour y ranger récupération et persistance,
        # l'orchestrateur le lie aussi) : une seconde trace couperait le tour
        # en deux. Ce qui est déjà posé gagne ; le neuf ne fait que compléter.
        _join_trace(current, user_id=user_id, session_id=session_id, metadata=metadata)
        yield
        return
    pending = _PendingTrace(
        trace_id=derive_trace_id(session_id) or uuid.uuid4().hex,
        name=name,
        user_id=user_id,
        session_id=session_id,
        metadata=metadata,
        turn=_TurnStats(started=monotonic()) if summarize else None,
    )
    token = _trace.set(pending)
    try:
        yield
    finally:
        _trace.reset(token)
        if pending.turn is not None:
            _emit_turn_summary(pending)


def _join_trace(
    pending: _PendingTrace,
    *,
    user_id: str | None,
    session_id: str | None,
    metadata: dict[str, Any] | None,
) -> None:
    if pending.user_id is None and user_id is not None:
        pending.user_id = user_id
    if pending.session_id is None and session_id is not None:
        pending.session_id = session_id
    if metadata:
        pending.metadata = {**metadata, **(pending.metadata or {})}


def _elapsed_ms(stats: _TurnStats) -> int:
    return max(0, round((monotonic() - stats.started) * 1000))


def _turn_summary(stats: _TurnStats) -> dict[str, Any]:
    """Le récapitulatif d'un tour. Une mesure ABSENTE n'a pas de clé — jamais
    « 0 » (GA-18) : un tour sans premier jeton n'a pas de ``firstTokenMs``, un
    coût dont une génération n'a pas de prix n'a pas de ``costUsd``."""
    summary: dict[str, Any] = {
        "totalMs": _elapsed_ms(stats),
        "generations": stats.generations,
        "models": list(stats.models),
        "tokens": {
            "input": stats.input_tokens,
            "output": stats.output_tokens,
            **({"cacheRead": stats.cache_read_tokens} if stats.cache_read_tokens else {}),
            **({"cacheCreation": stats.cache_creation_tokens} if stats.cache_creation_tokens else {}),
        },
        "costComplete": stats.cost_complete and stats.generations > 0,
        "tools": [dict(tool) for tool in stats.tools],
        "stageMs": dict(stats.stages),
        "errors": list(stats.errors),
    }
    if stats.generations > 0 and stats.cost_complete:
        summary["costUsd"] = round(stats.cost_usd, 6)
    if stats.provider_costs:
        summary["providerCosts"] = dict(stats.provider_costs)
    if stats.first_status_ms is not None:
        summary["firstStatusMs"] = stats.first_status_ms
    if stats.first_token_ms is not None:
        summary["firstTokenMs"] = stats.first_token_ms
    if stats.final_status is not None:
        summary["finalStatus"] = stats.final_status
    # #2441.4 — le verdict SLO (ack, premier statut) du tour ; absent si rien
    # de mesurable (GA-18), jamais un « dans les clous » par défaut.
    slo = turn_slo_summary(ack_ms=ack_ms_from_stages(stats.stages), first_status_ms=stats.first_status_ms)
    if slo:
        summary["slo"] = slo
    return summary


def _emit_turn_summary(pending: _PendingTrace) -> None:
    """Un tour de copilote s'émet TOUJOURS, même sans enfant : un tour qui a
    échoué avant le modèle est justement celui qu'un support doit retrouver.
    Upsert du même ``id`` — jamais une seconde trace."""
    try:
        if pending.turn is None:
            return
        pending.metadata = {**(pending.metadata or {}), "turn": _turn_summary(pending.turn)}
        pending.emitted = True
        _enqueue([_event("trace-create", _trace_body(pending))])
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais l'appel
        logger.debug("langfuse.turn_summary ignoré: %s", exc)


def _current_turn() -> _TurnStats | None:
    if not enabled():
        return None
    pending = _trace.get()
    return pending.turn if pending is not None else None


#: Les événements de flux qui datent un tour (#2442.11) : ``step`` = premier
#: statut montré (« Lecture de ta messagerie… »), ``delta`` = premier jeton.
TURN_EVENTS = ("step", "delta")

#: Les statuts finaux d'un tour — liste FERMÉE, pour que les tours s'additionnent.
TURN_FINAL_STATUSES = ("ok", "partial", "timeout", "failed")


def note_turn_event(kind: str) -> None:
    """Date le PREMIER statut / premier jeton du tour courant. Hors tour ou
    sans clés : no-op. Ne lève jamais."""
    try:
        stats = _current_turn()
        if stats is None:
            return
        if kind == "step" and stats.first_status_ms is None:
            stats.first_status_ms = _elapsed_ms(stats)
        elif kind == "delta" and stats.first_token_ms is None:
            stats.first_token_ms = _elapsed_ms(stats)
            if stats.first_status_ms is None:
                stats.first_status_ms = stats.first_token_ms
    except Exception as exc:  # noqa: BLE001
        logger.debug("langfuse.note_turn_event ignoré: %s", exc)


def note_turn_stage(name: str, duration_ms: int) -> None:
    """#2442.4 — une étape mesurée HORS de ce service (l'API : quota, contexte)
    rangée dans le récapitulatif du tour. Hors tour ou sans clés : no-op."""
    try:
        stats = _current_turn()
        if stats is None:
            return
        _count_span(stats, name, max(0, int(duration_ms)), None)
    except Exception as exc:  # noqa: BLE001
        logger.debug("langfuse.note_turn_stage ignoré: %s", exc)


def note_turn_provider_costs(priced: dict[str, dict[str, Any]]) -> None:
    """#2442.12 (épopée #2879) — le coût des outils NON-LLM appelés pendant le
    tour courant, un fournisseur à la fois (forme de `provider_pricing.price_run`
    : ``{"calls": int, "cost_usd": float, ...}``).

    Chaque outil qui parle à un fournisseur externe passe déjà par
    `rate_limiter.throttle()`, qui alimente `run_metrics` par correlation-id —
    le même identifiant que la trace du tour. Cette fonction ne fait QUE
    transporter ce qui existe déjà vers le récapitulatif ; elle n'invente ni
    n'appelle aucun fournisseur. Hors tour ou sans clés : no-op. Ne lève jamais."""
    try:
        stats = _current_turn()
        if stats is None:
            return
        for provider, metric in priced.items():
            calls = int(metric.get("calls", 0))
            if calls <= 0:
                continue
            stats.provider_costs[provider] = {
                "calls": calls,
                "cost_usd": round(float(metric.get("cost_usd", 0.0)), 6),
            }
    except Exception as exc:  # noqa: BLE001
        logger.debug("langfuse.note_turn_provider_costs ignoré: %s", exc)


def note_turn_status(status: str, *, keep_existing: bool = False) -> None:
    """Pose le statut final du tour (``TURN_FINAL_STATUSES``). Un statut hors
    liste est ignoré plutôt qu'inventé. ``keep_existing`` : ne remplace pas un
    statut déjà posé plus précisément (``timeout``). Hors tour ou sans clés : no-op."""
    try:
        stats = _current_turn()
        if stats is None or status not in TURN_FINAL_STATUSES:
            return
        if keep_existing and stats.final_status is not None:
            return
        stats.final_status = status
    except Exception as exc:  # noqa: BLE001
        logger.debug("langfuse.note_turn_status ignoré: %s", exc)


def update_current_trace(
    *, user_id: str | None = None, session_id: str | None = None, name: str | None = None
) -> None:
    """Enrichit la trace courante (ex. le user_id connu après le bind). Hors
    trace ou sans clés : no-op. Trace déjà émise : ré-émet le même id (upsert
    côté Langfuse)."""
    try:
        if not enabled():
            return
        pending = _trace.get()
        if pending is None:
            return
        if user_id is not None:
            pending.user_id = user_id
        if session_id is not None:
            pending.session_id = session_id
        if name is not None:
            pending.name = name
        if pending.emitted:
            _enqueue([_event("trace-create", _trace_body(pending))])
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais l'appel
        logger.debug("langfuse.update_current_trace ignoré: %s", exc)


#: Ce qu'un tour a produit. Liste FERMÉE — une issue libre devient dix
#: formulations du même résultat, et plus rien ne s'additionne (même raisonnement
#: que le catalogue d'issues des motions commerciales).
TRACE_OUTCOMES = ("acted", "answered", "no_outcome", "failed")


def set_trace_outcome(outcome: str, *, detail: str | None = None) -> None:
    """Ce que la trace courante a PRODUIT — la métadonnée « outcome vérifié ».

    Elle manquait, et c'est elle qui rend l'alerte « no-outcome » POSSIBLE côté
    Langfuse : sans ce champ, l'onglet Alerts ne peut poser aucune règle sur les
    tours qui n'ont rien produit — c'est exactement ce que la capture
    ``tracing.png`` du paquet d'exigences montrait (une entrée Alerts, aucune
    alerte).

    ⚠️ Une sortie de modèle ne prouve JAMAIS un outcome : ``answered`` dit qu'un
    texte est revenu, pas qu'il était juste. L'issue vérifiée d'une ACTION est
    ``acted``, et elle se lit sur les appels d'outils réellement exécutés.

    Hors trace ou sans clés : no-op. Ne force pas l'émission d'une trace
    paresseuse — une trace sans aucun enfant reste du bruit.
    """
    try:
        if not enabled():
            return
        pending = _trace.get()
        if pending is None:
            return
        metadata = dict(pending.metadata or {})
        metadata["outcome"] = outcome
        if detail:
            metadata["outcomeDetail"] = detail
        pending.metadata = metadata
        if pending.emitted:
            _enqueue([_event("trace-create", _trace_body(pending))])
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais l'appel
        logger.debug("langfuse.set_trace_outcome ignoré: %s", exc)


# ── API : générations ─────────────────────────────────────────────────────────


def record_generation(
    *,
    name: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    cost_usd: float | None = None,
    duration_s: float | None = None,
    correlation_id: str = "",
    input_obj: Any = None,
    output_obj: Any = None,
) -> None:
    """Enregistre un appel LLM. Sous une trace liée, la génération s'y range ;
    sinon elle crée sa propre mini-trace nommée par le prompt — chaque clic de
    fonctionnalité (icebreaker, message, battlecard…) reste lisible seul.

    ``cost_usd=None`` = coût inconnu : la génération ne porte alors AUCUN
    ``costDetails`` — « prix inconnu » ne se lit jamais « gratuit » (règle du
    cost_ledger). Le contenu (``input_obj``/``output_obj``) n'est sérialisé que
    si l'opérateur a posé ``LANGFUSE_CAPTURE_CONTENT=true``.
    """
    try:
        if not enabled():
            return
        events: list[dict[str, Any]] = []
        pending = _trace.get()
        if pending is not None:
            _emit_trace_if_needed(pending)
            trace_id = pending.trace_id
            if pending.turn is not None:
                _count_generation(
                    pending.turn,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cache_read_tokens=cache_read_tokens,
                    cache_creation_tokens=cache_creation_tokens,
                    cost_usd=cost_usd,
                )
        else:
            trace_id = uuid.uuid4().hex
            orphan_body: dict[str, Any] = {"id": trace_id, "name": name, "timestamp": _iso(_now())}
            if correlation_id:
                orphan_body["sessionId"] = correlation_id
            events.append(_event("trace-create", orphan_body))

        end = _now()
        start = end - timedelta(seconds=duration_s) if duration_s and duration_s > 0 else end
        usage_details: dict[str, int] = {"input": input_tokens, "output": output_tokens}
        if cache_read_tokens:
            usage_details["cache_read_input_tokens"] = cache_read_tokens
        if cache_creation_tokens:
            usage_details["cache_creation_input_tokens"] = cache_creation_tokens
        body: dict[str, Any] = {
            "id": uuid.uuid4().hex,
            "traceId": trace_id,
            "name": name,
            "model": model,
            "startTime": _iso(start),
            "endTime": _iso(end),
            "usageDetails": usage_details,
            "metadata": {"correlationId": correlation_id} if correlation_id else {},
        }
        if cost_usd is not None:
            body["costDetails"] = {"total": cost_usd}
        if _capture_content():
            if input_obj is not None:
                body["input"] = _stringify(input_obj)
            if output_obj is not None:
                body["output"] = _stringify(output_obj)
        events.append(_event("generation-create", body))
        _enqueue(events)
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais l'appel
        logger.debug("langfuse.record_generation ignoré: %s", exc)


def _count_generation(
    stats: _TurnStats,
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    cache_creation_tokens: int,
    cost_usd: float | None,
) -> None:
    stats.generations += 1
    stats.input_tokens += int(input_tokens or 0)
    stats.output_tokens += int(output_tokens or 0)
    stats.cache_read_tokens += int(cache_read_tokens or 0)
    stats.cache_creation_tokens += int(cache_creation_tokens or 0)
    if cost_usd is None:
        # Un prix inconnu rend le total INCONNU, jamais sous-estimé.
        stats.cost_complete = False
    else:
        stats.cost_usd += float(cost_usd)
    if model and model not in stats.models:
        stats.models.append(model)


def _count_span(stats: _TurnStats, name: str, duration_ms: int, error: str | None) -> None:
    if error:
        stats.errors.append(error)
    if name.startswith("tool:"):
        stats.tools.append({"name": name[len("tool:") :], "ms": duration_ms, "status": "error" if error else "ok"})
    else:
        stats.stages[name] = stats.stages.get(name, 0) + duration_ms


# ── API : spans ───────────────────────────────────────────────────────────────


@contextmanager
def span(name: str, *, metadata: dict[str, Any] | None = None) -> Iterator[None]:
    """Mesure un pas nommé SOUS la trace courante (phase du graphe, outil du
    copilote). Hors trace : no-op — un span orphelin ne raconte rien. Une
    exception marque le span ``ERROR`` puis se propage telle quelle."""
    if not enabled() or _trace.get() is None:
        yield
        return
    start = _now()
    started = monotonic()
    level: str | None = None
    status_message: str | None = None
    error_class: str | None = None
    try:
        yield
    except BaseException as exc:
        level = "ERROR"
        error_class = exc.__class__.__name__
        status_message = str(exc) or error_class
        raise
    finally:
        try:
            pending = _trace.get()
            if pending is not None:
                if pending.turn is not None:
                    _count_span(pending.turn, name, max(0, round((monotonic() - started) * 1000)), error_class)
                    # #2442.3 — dans un TOUR, le texte d'une exception peut
                    # recopier la demande de la personne : seule la classe sort,
                    # sauf opt-in contenu explicite de l'opérateur.
                    if status_message is not None and not _capture_content():
                        status_message = error_class
                _emit_trace_if_needed(pending)
                body: dict[str, Any] = {
                    "id": uuid.uuid4().hex,
                    "traceId": pending.trace_id,
                    "name": name,
                    "startTime": _iso(start),
                    "endTime": _iso(_now()),
                }
                if metadata:
                    body["metadata"] = _redact_meta(metadata)
                if level:
                    body["level"] = level
                    # ⚠️ Ce chemin n'a JAMAIS dépendu de LANGFUSE_CAPTURE_CONTENT :
                    # un span en échec exporte son `str(exc)` quoi qu'il arrive.
                    # Un fournisseur qui recopie l'URL appelée y met sa clé.
                    body["statusMessage"] = _redact(status_message or "")
                _enqueue([_event("span-create", body)])
        except Exception as exc:  # noqa: BLE001
            logger.debug("langfuse.span ignoré: %s", exc)


# ── transport ─────────────────────────────────────────────────────────────────


def _post_batch(events: list[dict[str, Any]]) -> bool:
    """POST un lot. False = échec (loggé, jamais levé, jamais rejoué : rejouer
    de l'observabilité en boucle contre un ingest en panne aggraverait la
    panne)."""
    try:
        credentials = f"{os.environ['LANGFUSE_PUBLIC_KEY'].strip()}:{os.environ['LANGFUSE_SECRET_KEY'].strip()}"
        auth = base64.b64encode(credentials.encode()).decode()
        response = httpx.post(
            _host() + _INGESTION_PATH,
            json={"batch": events},
            headers={"Authorization": f"Basic {auth}"},
            timeout=_POST_TIMEOUT_S,
        )
        if response.status_code >= 400:
            logger.warning("Ingestion Langfuse refusée (HTTP %d) — lot jeté", response.status_code)
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — l'observabilité n'a pas le droit de casser
        logger.warning("Ingestion Langfuse en échec — lot jeté: %s", exc)
        return False


def flush() -> None:
    """Draine la file par lots. Appelée par le thread de fond et au shutdown.
    Ne lève jamais ; un lot en échec est perdu, pas rejoué."""
    if not enabled():
        return
    while True:
        with _lock:
            batch = _queue[:_BATCH_MAX]
            del _queue[: len(batch)]
        if not batch:
            return
        if not _post_batch(batch):
            return


def _flush_loop() -> None:  # pragma: no cover - thread de fond, testé via flush()
    while not _stop.wait(_FLUSH_INTERVAL_S):
        flush()


def start() -> None:
    """Démarre le flusher de fond (appelé au startup FastAPI). Idempotent ;
    sans clés, ne démarre rien. Les fonctions d'enregistrement ne démarrent
    JAMAIS le thread elles-mêmes : c'est ce qui garantit qu'aucun test — et
    aucun script — n'ouvre le réseau par accident."""
    global _worker
    if not enabled():
        return
    with _lock:
        if _worker is not None and _worker.is_alive():
            return
        _stop.clear()
        _worker = threading.Thread(target=_flush_loop, name="langfuse-flush", daemon=True)
        _worker.start()
    logger.info("Observabilité Langfuse active — host %s (contenu capturé: %s)", _host(), _capture_content())


# ── outillage de test ─────────────────────────────────────────────────────────


def _pending_events() -> list[dict[str, Any]]:
    with _lock:
        return list(_queue)


def _worker_thread() -> threading.Thread | None:
    return _worker


def _reset_for_tests() -> None:
    global _worker
    _stop.set()
    if _worker is not None and _worker.is_alive():  # pragma: no cover - défensif
        _worker.join(timeout=0.2)
    _worker = None
    _stop.clear()
    with _lock:
        _queue.clear()
    _trace.set(None)


__all__ = [
    "TRACE_OUTCOMES",
    "TURN_EVENTS",
    "TURN_FINAL_STATUSES",
    "bind_trace",
    "enabled",
    "flush",
    "note_turn_event",
    "note_turn_stage",
    "note_turn_status",
    "record_generation",
    "set_trace_outcome",
    "span",
    "start",
    "update_current_trace",
]
