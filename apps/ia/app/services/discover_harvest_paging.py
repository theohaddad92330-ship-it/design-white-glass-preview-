"""#4796 — la pagination des sources GRATUITES de Découvrir (mode Signaux).

Avant : un appel par source et par département, quel que soit le nombre de lignes que la source avait en
réserve — au mieux ~288 lignes brutes pour tout l'écran. Maintenant : on lit la page SUIVANTE tant que la
précédente était pleine, que le budget de temps le permet et que le plafond dur n'est pas atteint.

Trois arrêts, tous nommés (``stopped_on``), jamais un silence :

  * ``last-page``  — la page rendue était incomplète : la source n'a plus rien derrière ;
  * ``budget``     — le budget de moisson est consommé (``HARVEST_BUDGET_S``) ;
  * ``page-cap``   — le plafond dur de pages est atteint (``HARVEST_MAX_PAGES``) : une source ne tient jamais
    la moisson en otage.

Ne sert QUE des sources publiques et gratuites (France Travail, APEC, BOAMP, DECP). Les fournisseurs payants
et le moteur de recherche n'y passent pas : « la pertinence décide de l'achat, pas le volume » (Louis 25/10).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

#: Une page : (décalage brut, mesure de page à remplir) → lignes. ``stats["raw"]`` / ``stats["asked"]`` disent
#: combien d'enregistrements la source a rendus / combien on lui en a demandé (avant tout filtre local) :
#: c'est ce qui sépare « page pleine » de « page filtrée ». Absents (source de test) : on retombe sur les lignes.
PageFetcher = Callable[[int, dict[str, int]], Awaitable[list[dict]]]


@dataclass(frozen=True)
class PagedHarvest:
    rows: list[dict]
    pages: int
    raw: int
    stopped_on: str


async def harvest_pages(
    fetch_page: PageFetcher,
    *,
    page_rows: int,
    max_pages: int,
    deadline: float,
    label: str = "source",
) -> PagedHarvest:
    """Lit les pages de ``fetch_page`` jusqu'à page incomplète, budget épuisé ou plafond dur.

    La PREMIÈRE page lève comme avant (``SignalSourceUnavailable`` reste visible dans ``degraded``) ; une page
    suivante qui échoue ne fait JAMAIS perdre les pages déjà lues — c'est un bonus de volume, pas la source.
    """
    rows: list[dict] = []
    raw_total = 0
    pages = 0
    offset = 0
    stopped_on = "page-cap"
    while pages < max(1, max_pages):
        stats: dict[str, int] = {}
        started = time.monotonic()
        try:
            page = await fetch_page(offset, stats)
        except Exception as exc:  # noqa: BLE001 — seule la page 1 est l'engagement de la source
            if pages == 0:
                raise
            logger.warning("Discover harvest %s: page %d failed, keeping %d pages: %s", label, pages + 1, pages, exc)
            stopped_on = "page-failed"
            break
        pages += 1
        rows.extend(page)
        raw = stats.get("raw", len(page))
        asked = stats.get("asked", page_rows)
        raw_total += raw
        if raw < asked:
            stopped_on = "last-page"
            break
        if pages >= max_pages:
            stopped_on = "page-cap"
            break
        # Une page de plus ne part que si elle PEUT finir dans le budget (même durée que la précédente) :
        # sinon la moisson dépasserait son budget d'une page entière, et le total les 2 minutes annoncées.
        now = time.monotonic()
        if now + (now - started) >= deadline:
            stopped_on = "budget"
            break
        offset += raw
    logger.info(
        "discover_harvest %s: pages=%d raw=%d rows=%d stopped_on=%s", label, pages, raw_total, len(rows), stopped_on
    )
    return PagedHarvest(rows=rows, pages=pages, raw=raw_total, stopped_on=stopped_on)
