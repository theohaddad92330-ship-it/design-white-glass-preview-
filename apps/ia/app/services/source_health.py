"""Per-run registry of sources that silently degraded.

The research pipeline is deliberately fault-tolerant: a Brave timeout, a
Firecrawl 25s per-URL cut, Pappers 503, a rate-limit wait exceeded or a
classification batch that raised all degrade to an empty result rather than
failing the analysis. That is the right call — a partial dossier beats none.

What was wrong is that the loss was INVISIBLE. Run A had Brave + Firecrawl +
Pappers, run B lost Brave to a 60s blip, and both reported "terminé". The user
saw two analyses of the same company with different facts and a different
contact count, with nothing anywhere saying why. Under load the swallowing gets
worse (``RateLimitTimeout`` propagates into the same handlers), so the runs that
look least rigorous are exactly the ones with the least visible explanation.

This module is the seam: every ``except`` that drops a source records here, and
the analysis output carries the list so the API/UI can show "dossier établi sans
Firecrawl (timeout)". No behaviour change — purely additive observability.

In-process and best-effort by design: it is a reporting aid, not a ledger. A
worker restart loses it, which is fine because the run is lost too.
"""

from __future__ import annotations

import logging
from collections import OrderedDict
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

logger = logging.getLogger(__name__)

_TIME_BUDGET = "time_budget"  # = DegradeReason.TIME_BUDGET (ce module n'importe pas company_filters)

# A pathological run (every Firecrawl URL timing out) must not build an unbounded
# list, and a long-lived worker must not retain every run it has ever seen.
MAX_ENTRIES_PER_RUN = 40
MAX_TRACKED_RUNS = 256

# correlation_id → ordered {(source, reason, code): None}. An OrderedDict of runs
# gives us FIFO eviction; the inner mapping dedupes while preserving insertion
# order.
_RUNS: OrderedDict[str, OrderedDict[tuple[str, str, str], None]] = OrderedDict()

# DISCOVER-PARTIEL-2 (16/10) — les attentes sur NOTRE limiteur (créneau indisponible,
# budget de temps) : comptées À PART, par run et par source. Ce n'est pas une panne de la
# source, elle n'entre donc ni dans `_RUNS` ni dans le bandeau.
_DEFERRED: OrderedDict[str, dict[str, int]] = OrderedDict()

#: Le texte de `RateLimitTimeout` (distributed_rate_limiter) : filet pour les appelants qui
#: transmettent encore `str(exc)` sans code.
_LIMITER_WAIT_MARK = "rate limit slot for provider"

# SIG-C (11/10) — les erreurs survenues PENDANT un fetch observé. Une liste
# MUTABLE posée par `watch_fetch_errors` : les tâches que le fetch lance
# (single-flight, gather) copient le contexte mais partagent la même liste ;
# deux fetchs voisins (gather) ont chacun la leur.
_FETCH_ERRORS: ContextVar[list[str] | None] = ContextVar("source_health_fetch_errors", default=None)


@contextmanager
def watch_fetch_errors() -> Iterator[list[str]]:
    """Collecte les raisons de dégradation notées pendant le bloc.

    SIG-C — c'est ce qui sépare « la source a répondu rien » (un vide qui se
    cache) de « la source n'a rien dit » (une erreur, jamais cachée)."""
    errors: list[str] = []
    parent = _FETCH_ERRORS.get()
    token = _FETCH_ERRORS.set(errors)
    try:
        yield errors
    finally:
        _FETCH_ERRORS.reset(token)
        # #4045 (14/10) — les écoutes s'EMBOÎTENT (``cached_fact`` → ``cached_by``
        # → la source) : une erreur notée dans la plus interne doit aussi être
        # vue par l'externe, sinon elle range « rien » 24 h pour une panne.
        if parent is not None and errors:
            parent.extend(errors)


class FetchError(str):
    """Une erreur de fetch observé, avec son CODE machine (``DegradeReason``) quand il est
    connu. Reste une ``str`` : tout consommateur de la liste garde sa forme."""

    code: str = ""

    def __new__(cls, reason: str, code: str = "") -> FetchError:
        obj = super().__new__(cls, reason)
        obj.code = code
        return obj


def note_fetch_error(reason: str, code: str = "") -> None:
    """Marque le fetch observé comme en ERREUR, sans l'inscrire au run.

    Pour un échec qu'une source avale sans ``record_degradation`` (la panne
    d'une requête parmi deux, par exemple). No-op hors d'un fetch observé."""
    errors = _FETCH_ERRORS.get()
    if errors is not None:
        errors.append(FetchError((reason or "").strip()[:200] or "error", (code or "").strip()[:64]))


# SIG-C (11/10) — les fournisseurs qui s'inscrivent sous LEUR nom (supervision
# admin, `analysis_runs.source_health`) mais que l'écran client replie sous une
# FAMILLE : nos fournisseurs ne se nomment jamais côté client.
_PUBLIC_FAMILY: dict[str, str] = {
    "adzuna": "job_aggregators",
    "jooble": "job_aggregators",
    "theirstack": "job_aggregators",
    "mantiks": "job_aggregators",
    "fantastic_jobs": "job_aggregators",
    # #4116 — appels d'offres européens : la source ne se nomme jamais à l'écran.
    "ted": "eu_tenders",
}


def public_source(source: str) -> str:
    """Le nom qu'une dégradation porte À L'ÉCRAN : sa famille si elle en a une."""
    return _PUBLIC_FAMILY.get(source, source)


def error_reason(exc: BaseException) -> str:
    """Le motif LISIBLE d'une exception : son message, sinon son type (un timeout httpx a un
    ``str(exc)`` vide — la dégradation se lisait alors « aucun motif »)."""
    return str(exc) or type(exc).__name__


def _is_limiter_wait(reason: str, code: str) -> bool:
    return (code or "").strip() == _TIME_BUDGET or _LIMITER_WAIT_MARK in (reason or "")


def record_deferral(correlation_id: str, *, source: str, reason: str = "") -> None:
    """Note que ``source`` n'a PAS été interrogée à fond parce que NOTRE limiteur (ou notre
    budget de temps) a fait attendre : rien n'a échoué chez elle.

    Jamais au bandeau, jamais dans ``get_degradations``. Le fetch observé, lui, est marqué
    (code ``time_budget``) : un vide issu d'une attente ne se range pas « rien ».
    Se compte à part (``get_deferrals``) et se journalise ``source_deferred``."""
    note_fetch_error(reason, _TIME_BUDGET)
    cid = (correlation_id or "").strip()
    src = (source or "unknown").strip()
    logger.info("source_deferred [%s] %s — %s", cid, src, (reason or "").strip()[:200])
    if not cid:
        return
    counts = _DEFERRED.get(cid)
    if counts is None:
        counts = {}
        _DEFERRED[cid] = counts
        while len(_DEFERRED) > MAX_TRACKED_RUNS:
            _DEFERRED.popitem(last=False)
    else:
        _DEFERRED.move_to_end(cid)
    counts[src] = counts.get(src, 0) + 1


def get_deferrals(correlation_id: str) -> dict[str, int]:
    """Les attentes sur notre limiteur de ce run, par source (supervision, jamais l'écran)."""
    return dict(_DEFERRED.get((correlation_id or "").strip()) or {})


def record_degradation(
    correlation_id: str, *, source: str, reason: str, code: str = ""
) -> None:
    """Note that ``source`` did not contribute to this run, and why.

    Safe to call from inside an ``except`` block: it never raises and never
    blocks. Duplicate (source, reason) pairs collapse — Firecrawl timing out on
    7 URLs is one line, not seven.

    ``code`` is an optional machine-readable cause from the shared
    :class:`~app.services.company_filters.DegradeReason` vocabulary
    (``quota_exceeded``, ``unauthorized``, ``rate_limited``…). ``reason`` stays
    the free-text detail a human reads. The split exists because free text
    cannot be aggregated: "Pappers est HS depuis 3 h — quota épuisé" needs a
    stable key to group on, while the operator still wants the raw sentence.
    Optional and omitted from the output when unset, so every existing call site
    and consumer keeps its exact current shape.
    """
    # DISCOVER-PARTIEL-2 — attendre NOTRE limiteur n'est pas une panne : filet central.
    if _is_limiter_wait(reason, code):
        record_deferral(correlation_id, source=source, reason=reason)
        return
    # SIG-C — AVANT le test d'identifiant : une source dégradée n'a pas dit « rien »,
    # même sur un chemin sans run ; son vide ne se cache pas.
    note_fetch_error(reason, code)
    cid = (correlation_id or "").strip()
    if not cid:
        # Sync/profiler paths carry no correlation id. Dropping the entry is
        # better than pooling unrelated runs under a shared "" bucket.
        return

    src = (source or "unknown").strip()
    why = (reason or "").strip()[:200]
    kind = (code or "").strip()[:64]

    entries = _RUNS.get(cid)
    if entries is None:
        entries = OrderedDict()
        _RUNS[cid] = entries
        while len(_RUNS) > MAX_TRACKED_RUNS:
            _RUNS.popitem(last=False)
    else:
        _RUNS.move_to_end(cid)

    key = (src, why, kind)
    if key in entries or len(entries) >= MAX_ENTRIES_PER_RUN:
        return
    entries[key] = None
    logger.info("Source dégradée [%s] %s — %s%s", cid, src, why, f" [{kind}]" if kind else "")


def get_degradations(correlation_id: str) -> list[dict[str, str]]:
    """Degraded sources for this run, in the order they were recorded.

    ``code`` is present only on entries that were recorded with one — an
    unclassified degradation must not masquerade as a classified one.
    """
    entries = _RUNS.get((correlation_id or "").strip())
    if not entries:
        return []
    out: list[dict[str, str]] = []
    for src, why, kind in entries:
        entry = {"source": src, "reason": why}
        if kind:
            entry["code"] = kind
        out.append(entry)
    return out


def get_public_degradations(correlation_id: str) -> list[dict[str, str]]:
    """Les dégradations du run telles que l'ÉCRAN peut les lire : chaque fournisseur
    replié sous sa famille (``public_source``), doublons fusionnés, ordre gardé.

    SIG-C — l'agrégat « job_aggregators » reste calculable pour tout lecteur
    côté client ; ``get_degradations`` garde le détail nominatif."""
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for entry in get_degradations(correlation_id):
        public = {**entry, "source": public_source(entry["source"])}
        key = (public["source"], public["reason"], public.get("code", ""))
        if key not in seen:
            seen.add(key)
            out.append(public)
    return out


def summarise(correlation_id: str) -> str:
    """One-line human summary for logs and the run banner. Empty when healthy."""
    entries = get_degradations(correlation_id)
    if not entries:
        return ""
    return ", ".join(f"{e['source']} ({e['reason']})" if e["reason"] else e["source"] for e in entries)


def clear_degradations(correlation_id: str) -> None:
    """Drop the run's entries — call at the start of a run so a re-used
    correlation id doesn't inherit the previous attempt's failures."""
    _RUNS.pop((correlation_id or "").strip(), None)
    _DEFERRED.pop((correlation_id or "").strip(), None)
