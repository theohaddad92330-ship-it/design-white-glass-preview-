"""#2616.1 — recrutement multi-plateformes via le MOTEUR DE RECHERCHE déjà
branché (``data_gateway.DataGateway``, waterfall Serper → Tavily → Brave), en
complément d'APEC et de WTTJ (Algolia, no-op tant que l'opérateur n'a pas
d'accès partenaire — voir ``wttj.py``, ça n'arrivera pas vite).

Décision (Louis, 23/09/2026, doctrine ``c79_collecte_large_mais_propre``) : la
collecte est LARGE (plusieurs plateformes, pas seulement France Travail), et
PROPRE — jamais l'index Algolia privé de WTTJ ni sa clé embarquée, seulement
des résultats de recherche PUBLICS, sur les mêmes plateformes que
``discover_signals._corroborate_hiring_platforms`` connaît déjà
(``job_platforms.JOB_PLATFORM_LABELS``, GA-26 : un réglage vit à un seul
endroit) : Welcome to the Jungle, et les ATS publics (Lever, Greenhouse,
Teamtailor, SmartRecruiters, Welcomekit).

Contrat de sortie ROW identique à ``apec.list_hiring_companies_apec`` /
``wttj.list_hiring_companies_wttj`` (``name``/``siren``/``department``/
``city``/``sourceLabel``/``signal{type,label,date,url,detail}``) : additif
dans le bucket ``hiring``, jamais une source sélectionnable de plus.

NO-OP STRICT (zéro appel réseau) sans AUCUNE des trois clés du waterfall
(``SERPER_API_KEY``/``TAVILY_API_KEY``/``BRAVE_API_KEY``) — ``BRAVE_API_KEY``
est déjà posée en production (voir ``agent_docs/env-reference.md``) ; ``[]``
gracieux sur toute panne (une source d'appoint ne casse jamais la recherche).

FRAÎCHEUR — la nuance de cette source par rapport à APEC/WTTJ : un résultat de
recherche web ne porte pas toujours une date structurée. Quand une date est
embarquée dans l'URL de l'offre (``source_judge._date_from_url`` — ISO ou
segments ``/YYYY/MM/DD/``), la règle existante s'applique (< ``since_days``,
récent d'abord). **Sans date, la ligne n'est jamais retenue** — le contrat du
bucket ``hiring`` (``discover_signals._Group.absorb``) exige déjà une date
pour tout signal, et une date DEVINÉE (ex. « aujourd'hui ») fausserait le tri
par fraîcheur en faisant passer une offre ancienne, simplement réindexée
aujourd'hui, pour la plus fraîche du lot. Même choix qu'APEC/WTTJ, qui
excluent déjà silencieusement leurs offres sans date en mode broadcast.

Attribution : le nom d'employeur vient du SLUG PUBLIC que l'URL de l'offre
porte (``job_platforms.company_from_url``) — jamais deviné, jamais un domaine
non reconnu rattaché à une plateforme au hasard (même doctrine que
``ats_boards.py`` : on n'attribue que sur PREUVE).
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta

import httpx

from app.services.data_gateway import DataGateway
from app.services.data_sources.france_travail import is_it_offer
from app.services.domain_job_filters import offer_relevant_to_profile
from app.services.data_sources.job_platforms import (
    JOB_PLATFORM_LABELS,
    company_from_url,
    platform_from_url,
)
from app.services.internship_posting import is_internship_posting
from app.services.source_judge import judge_source

logger = logging.getLogger(__name__)

#: Les trois clés du waterfall (même liste que ``data_gateway._WATERFALL``,
#: dupliquée ici comme dans ``test_data_gateway.py`` : ce sont trois noms de
#: variable stables, pas un réglage qui dériverait). Sans AUCUNE des trois,
#: zéro appel réseau — vérifié avant d'instancier le gateway.
_SEARCH_KEY_ENV: tuple[str, ...] = ("SERPER_API_KEY", "TAVILY_API_KEY", "BRAVE_API_KEY")

#: Terme large par défaut quand l'appelant ne fournit aucun mot-clé — même
#: repli que APEC/WTTJ (``_BROADCAST_DEFAULT_KEYWORDS``).
_BROADCAST_DEFAULT_KEYWORDS = "informatique"

#: Les sites interrogés — Welcome to the Jungle (résultats de recherche
#: PUBLICS, jamais l'index Algolia privé) et les ATS publics. Jetons alignés
#: sur ``job_platforms._HOST_TOKENS`` (GA-26).
_SEARCH_SITES: tuple[str, ...] = (
    "welcometothejungle.com/fr/companies",
    "jobs.lever.co",
    "boards.greenhouse.io",
    "*.teamtailor.com",
    "jobs.smartrecruiters.com",
    "welcomekit.co",
)


async def list_hiring_companies_search(
    department: str | None = None,
    keywords: list[str] | None = None,
    since_days: int = 90,
    limit: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
    profile: dict | None = None,
) -> list[dict]:
    """Employeurs ayant publié une offre CDI récente, trouvée par
    RECHERCHE PUBLIQUE (``site:``) sur Welcome to the Jungle et les ATS
    publics — jamais l'index privé WTTJ. NO-OP STRICT sans aucune clé de
    recherche configurée ; ``[]`` gracieux sur toute panne. Ne lève JAMAIS
    d'exception typée — même contrat que APEC/WTTJ : une source d'appoint ne
    doit jamais faire perdre les lignes déjà collectées par les autres
    sources du bucket ``hiring``.
    """
    if not any(os.environ.get(k, "").strip() for k in _SEARCH_KEY_ENV):
        return []

    limit = max(1, min(int(limit or 1), 50))
    cleaned_keywords = [k for k in (str(k or "").strip() for k in (keywords or [])) if k]
    kw_text = " ".join(cleaned_keywords[:8]) if cleaned_keywords else _BROADCAST_DEFAULT_KEYWORDS
    location = (department or "").strip()
    dept = "".join(ch for ch in location if ch.isalnum()).upper()[:3] or None

    gateway = DataGateway(client=client)

    async def _one(site: str) -> list[dict]:
        query = " ".join(p for p in (f"site:{site}", kw_text, "CDI", location) if p)
        try:
            return await gateway.search(query, limit=20)
        except Exception as exc:  # noqa: BLE001 — une source d'appoint ne casse jamais la recherche
            logger.warning("Recherche recrutement (site:%s) échouée: %s", site, exc)
            return []

    results = await asyncio.gather(*(_one(site) for site in _SEARCH_SITES))

    cutoff_days = max(1, int(since_days or 1))
    today = datetime.now(UTC).date()

    seen_urls: set[str] = set()
    rows: list[tuple[datetime, dict]] = []
    for hits in results:
        for hit in hits or []:
            if not isinstance(hit, dict):
                continue
            url = str(hit.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            token = platform_from_url(url)
            if not token:
                continue  # hors des plateformes ciblées — jamais rattaché au hasard

            title = " ".join(str(hit.get("title") or "").split())
            # #3901 — pertinence selon le PROFIL, plus de filtre IT fixe ; sans profil, on ne filtre pas.
            if not title or is_internship_posting(title):
                continue  # Louis 12/10 + 14/10 : aucune offre de stage
            if not offer_relevant_to_profile({"intitule": title}, profile, it_check=is_it_offer):
                continue

            employer = company_from_url(url, token)
            if not employer:
                continue  # aucun slug exploitable — rien à prospecter, on n'invente pas

            # #2616.1 — juger sur le HIT COMPLET, pas sur l'URL seule : une vraie
            # offre Lever/Greenhouse/Teamtailor/SmartRecruiters/Welcomekit ne
            # porte JAMAIS de date dans son URL (un identifiant opaque, pas
            # `/YYYY-MM-DD/`) — `judge_source({"url": url})` droppait donc CHAQUE
            # ligne en prod, malgré le waterfall branché (cause du 23/23 France
            # Travail, recette 23/09/2026). Le hit peut porter la date RÉELLE que
            # le fournisseur a rendue (`data_gateway.py` : `page_age`/`age` Brave,
            # `date` Serper, `published_date` Tavily) — jamais devinée, et le
            # repli sur l'URL reste intact quand elle est absente.
            verdict = judge_source(hit)
            if verdict.published is None or verdict.age_days is None:
                continue  # sans date, jamais devinée (voir docstring module)
            if verdict.age_days > cutoff_days:
                continue  # trop ancien pour la fenêtre demandée

            seen_urls.add(url)
            published_date = today - timedelta(days=verdict.age_days)
            rows.append(
                (
                    datetime.combine(published_date, datetime.min.time(), tzinfo=UTC),
                    {
                        "name": employer,
                        "siren": None,  # jamais deviné — résolu en aval
                        "department": dept,  # jamais déduit du résultat — même repli qu'APEC/WTTJ
                        "city": None,
                        "sourceLabel": JOB_PLATFORM_LABELS.get(token, token),
                        "signal": {
                            "type": "hiring",
                            "label": f"Recrutement — {title}",  # #3901.w : pas d'« IT » figé
                            "date": published_date.isoformat(),
                            "url": url,
                            "detail": None,
                        },
                    },
                )
            )

    rows.sort(key=lambda t: t[0], reverse=True)
    return [row for _dt, row in rows[:limit]]


__all__ = ["list_hiring_companies_search"]
