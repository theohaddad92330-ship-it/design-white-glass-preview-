"""CASCADE-PLANCHER-5 (Louis 25/10/2026) — le plancher de 5 offres DU MÉTIER par compte, par paliers nommés.

    « Certains comptes peuvent pas me remonter moins de 5 offres sinon faut se servir de la cascade
      et m'en sortir un max » — et « encore plus quand dans l'analyse j'ai demandé un truc précis ».

Le plancher se tient en CHERCHANT MIEUX, jamais en FILTRANT MOINS. Chaque palier élargit une chose et une seule ;
le tri métier (``keep``) s'applique à CHAQUE offre de CHAQUE palier, sans exception :

    sources → toutes celles qui ont une clé, pas seulement la première qui répond
    terms   → synonymes et formes voisines de la compétence
    window  → offres plus anciennes (dans la borne d'âge existante)
    group   → filiales et établissements du compte

Deux régimes : sans demande explicite la cascade s'arrête dès que le plancher est atteint ; AVEC une demande
précise (compétence nommée, besoin saisi, périmètre demandé) elle parcourt tous ses paliers. Dans les deux, le
plafond d'appels payés (``CASCADE_PAID_CALLS_MAX``) reste la borne. Après toute la cascade, moins de 5 offres du
métier ⇒ on en rend moins et on le DIT (``reason``) : une absence ne fait aucune ligne, jamais un « 0 ».
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

#: Le plancher : offres DU MÉTIER visées par compte. Un objectif de recherche, pas une quantité à produire.
OFFERS_FLOOR = 5
#: Les paliers, dans l'ordre où ils sont parcourus. Réglage UNIQUE de l'ordre (GA-26).
TIER_ORDER = ("sources", "terms", "window", "group")
#: Appels PAYÉS au plus par compte, TOUS paliers confondus (le palier 0 compris). Le cache 30 j ne compte pas.
#: 5 200 crédits TheirStack avaient brûlé en 5 jours le 15/10 : Louis accepte de consommer plus, pas sans borne.
CASCADE_PAID_CALLS_MAX = 8
#: Statuts d'un palier, dits tels quels à l'écran et dans le journal.
STATUS_REACHED = "plancher atteint"
STATUS_TRIED = "tenté"
STATUS_FAILED = "en échec"
STATUS_CAPPED = "plafond d'appels payés atteint"
STATUS_UNAVAILABLE = "non branché"
#: Les motifs d'un rendu en dessous du plancher.
REASON_SHORT = "sous le plancher après toute la cascade"
REASON_CAPPED = "plafond d'appels payés atteint"


class PaidCapReached(Exception):  # noqa: N818 — un état, pas une erreur : l'appelant le range en « non tenté »
    """Le plafond d'appels payés est atteint : l'appel ne part pas."""


@dataclass
class TierStats:
    """Le compteur d'UN palier : ce qu'il a rapporté, coûté, et ce qu'il n'a pas pu tenter."""

    name: str
    status: str = STATUS_REACHED
    gained: int = 0
    paid: int = 0
    cached: int = 0
    not_attempted: int = 0

    def public(self) -> dict[str, object]:
        return {
            "tier": self.name,
            "status": self.status,
            "gained": self.gained,
            "paid": self.paid,
            "cached": self.cached,
            "notAttempted": self.not_attempted,
        }


@dataclass
class PaidBudget:
    """Le plafond d'appels payés d'un compte. ``take()`` AVANT chaque appel payé (cache manqué) ; un cache servi
    ne passe que par ``cached()``. Refusé ⇒ l'appel ne part pas et il est compté « non tenté », jamais silencieux."""

    cap: int = CASCADE_PAID_CALLS_MAX
    used: int = 0
    stats: dict[str, TierStats] = field(default_factory=dict)
    current: str = "sources"

    def _tier(self) -> TierStats:
        return self.stats.setdefault(self.current, TierStats(self.current))

    def begin(self, tier: str) -> None:
        self.current = tier
        self.stats.setdefault(tier, TierStats(tier))

    def take(self, *, force: bool = False) -> bool:
        """Réserve un appel payé. ``force`` : un appel qui existait avant la cascade (palier 0) est compté mais
        jamais refusé — la cascade ne retire rien à ce que l'analyse faisait déjà."""
        if self.used >= self.cap and not force:
            self._tier().not_attempted += 1
            return False
        self.used += 1
        self._tier().paid += 1
        return True

    def cached(self, count: int = 1) -> None:
        self._tier().cached += count


@dataclass
class CascadeResult:
    floor: int
    explicit: bool
    offers: list[dict]
    tiers: list[TierStats]
    reason: str | None = None
    paid_total: int = 0
    #: DECATHLON 30/10 — les offres qui comptent pour le plancher (``counts``) ; ``None`` = toutes.
    counted: int | None = None

    @property
    def below_floor(self) -> bool:
        return (len(self.offers) if self.counted is None else self.counted) < self.floor

    def public(self) -> dict[str, object]:
        """Ce que l'écran peut dire : aucun fournisseur nommé, aucun « 0 » pour une valeur absente."""
        return {
            "floor": self.floor,
            "found": len(self.offers),
            "belowFloor": self.below_floor,
            "explicit": self.explicit,
            "reason": self.reason,
            "paidCalls": self.paid_total,
            "tiers": [t.public() for t in self.tiers],
        }


TierFetcher = Callable[[PaidBudget], Awaitable[list[dict]]]


def _identity(offer: Mapping[str, object]) -> tuple[str, str]:
    from app.services.data_sources.job_aggregators import _offer_key

    return (_offer_key(dict(offer)), str(offer.get("url") or "").strip().lower())


def _merge(kept: list[dict], incoming: Iterable[object], keep: Callable[[str], bool]) -> int:
    """Ajoute à ``kept`` les offres du MÉTIER (``keep`` sur chaque titre — jamais relâché), sans stage, sans doublon
    (même intitulé + même ville, ou même URL). Rend le nombre d'offres gagnées."""
    from app.services.data_sources.job_aggregators import drop_internship_postings

    seen_keys = {_identity(o)[0] for o in kept}
    seen_urls = {_identity(o)[1] for o in kept} - {""}
    rows = [o for o in incoming if isinstance(o, dict)]
    gained = 0
    for offer in drop_internship_postings(rows, title_keys=("title",), contract_keys=("contractType",)):
        key, url = _identity(offer)
        if key in seen_keys or (url and url in seen_urls):
            continue
        if not keep(str(offer.get("title") or "")):
            continue
        kept.append(offer)
        seen_keys.add(key)
        if url:
            seen_urls.add(url)
        gained += 1
    return gained


async def run_cascade(
    base: Iterable[object],
    tiers: Mapping[str, TierFetcher],
    *,
    keep: Callable[[str], bool],
    explicit_request: bool = False,
    floor: int = OFFERS_FLOOR,
    budget: PaidBudget | None = None,
    counts: Callable[[dict], bool] | None = None,
) -> CascadeResult:
    """Parcourt ``TIER_ORDER`` tant que le nombre d'offres DU MÉTIER est sous ``floor`` — ou, si la demande est
    explicite, jusqu'au dernier palier. ``base`` est le palier 0 (déjà collecté) ; chaque fetcher reçoit le
    ``PaidBudget`` et rend des offres brutes que le tri métier ``keep`` filtre ici, jamais ailleurs.

    DECATHLON 30/10 — ``counts`` dit quelles offres gardées comptent pour le plancher (les métiers du vendeur) :
    un placeur en CDI garde toute offre, et sans lui du bruit « atteignait » le plancher. ``None`` = toutes."""
    budget = budget or PaidBudget()
    kept: list[dict] = []
    _merge(kept, base, keep)

    def _counted() -> int:
        return len(kept) if counts is None else sum(1 for o in kept if counts(o))

    stats: list[TierStats] = []
    for name in TIER_ORDER:
        budget.begin(name)
        tier = budget.stats[name]
        stats.append(tier)
        fetch = tiers.get(name)
        if _counted() >= floor and not explicit_request:
            tier.status = STATUS_REACHED
            continue
        if fetch is None:
            tier.status = STATUS_UNAVAILABLE
            continue
        before_not_attempted = tier.not_attempted
        try:
            rows = await fetch(budget)
        except PaidCapReached:
            tier.status = STATUS_CAPPED
            continue
        except Exception as exc:  # noqa: BLE001 — un palier tombé ne casse jamais l'analyse
            logger.warning("cascade palier=%s en échec: %s", name, exc)
            tier.status = STATUS_FAILED
            continue
        tier.gained = _merge(kept, rows, keep)
        tier.status = STATUS_CAPPED if tier.not_attempted > before_not_attempted and not rows else STATUS_TRIED
        logger.info(
            "cascade palier=%s gagnées=%d payés=%d cache=%d non_tentés=%d total_métier=%d",
            name,
            tier.gained,
            tier.paid,
            tier.cached,
            tier.not_attempted,
            _counted(),
        )
    reason = None
    if _counted() < floor:
        capped = any(t.not_attempted for t in stats) or any(t.status == STATUS_CAPPED for t in stats)
        reason = REASON_CAPPED if capped and budget.used >= budget.cap else REASON_SHORT
    result = CascadeResult(
        floor=floor,
        explicit=explicit_request,
        offers=kept,
        tiers=stats,
        reason=reason,
        paid_total=budget.used,
        counted=None if counts is None else _counted(),
    )
    return result


__all__ = [
    "CASCADE_PAID_CALLS_MAX",
    "OFFERS_FLOOR",
    "PaidBudget",
    "PaidCapReached",
    "CascadeResult",
    "TIER_ORDER",
    "run_cascade",
]
