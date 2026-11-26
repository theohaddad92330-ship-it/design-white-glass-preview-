"""#2291.2 — COMMENT UNE ENTREPRISE CIBLE CONTRACTUALISE : OBSERVÉ, JAMAIS DÉDUIT.

DÉCISION Louis 19/09/2026 (QCM) : l'OBSERVER. Aucune donnée du dépôt ne disait
comment une entreprise CIBLE contractualise — ``CONTRACT_KINDS`` /
``CONSULTANT_CONTRACTS`` décrivent l'ESN elle-même, et
``dataforge_account_domain.likely_contract_models`` est une DÉDUCTION (« likely »),
pas un constat. Cette observation se construit sur deux sources RÉELLES que
Découvrir interroge DÉJÀ pour les premières lignes rendues
(``discover.py::_candidate_signals``) — aucun appel réseau de plus :

(a) les OFFRES D'EMPLOI que la cible publie — le code NATIF ``typeContrat`` de
    France Travail (``it_job_signals`` → ``contractCode``) ;
(b) les AVIS DE MARCHÉS PUBLICS qu'elle PASSE (BOAMP, la cible est l'acheteur),
    quand l'avis DIT le mode : « assistance technique », « en régie »,
    « au forfait », « forfaitaire ».

─────────────────────────────────────────────────────────────────────────────
CE QUI A ÉTÉ VÉRIFIÉ, ET CE QUI NE L'A PAS ÉTÉ (un contrat d'API ne se devine pas)
─────────────────────────────────────────────────────────────────────────────
Codes ``typeContrat`` vérifiés le 19/09/2026 sur le moteur PUBLIC de France
Travail, qui partage le référentiel ``typesContrats`` de l'API :
``candidat.francetravail.fr/offres/recherche?typeContrat=MIS`` → filtre appliqué
« Intérim » ; ``typeContrat=LIB`` → « Profession libérale » ;
``typeContrat=DIN`` → « CDI Intérimaire ». ``CDI`` / ``CDD`` / ``LIB``
apparaissent dans les ``filtresPossibles`` d'une réponse réelle de l'API
(github.com/etiennekintzler/api-offres-emploi). TOUT autre code (``SAI``,
``FRA``, ``CCE``…) reste ``other`` : compté, jamais classé au jugé. Le LIBELLÉ
(``typeContratLibelle``) n'est jamais lu comme un code — sa forme exacte n'a pas
été vérifiée.

⚠️ « freelance » = ``LIB`` (profession libérale) : c'est le SEUL code natif qui
désigne un indépendant. France Travail n'a pas de code « freelance ».

Champs BOAMP vérifiés le 19/09/2026 sur le jeu public Opendatasoft (``objet``,
``nomacheteur``, ``dateparution``) : aucun champ structuré ne porte le mode de
contractualisation — le descripteur « Informatique (assistance) » couvre aussi
le support utilisateur, donc il n'est PAS lu comme « régie ». Seul le TEXTE de
l'objet, quand il nomme le mode, est compté.

─────────────────────────────────────────────────────────────────────────────
CE QUE L'OBSERVATION A LE DROIT D'AFFIRMER
─────────────────────────────────────────────────────────────────────────────
· sa SOURCE, sa FENÊTRE (plus ancien → plus récent des faits comptés), le JOUR
  du constat, et son VOLUME ;
· une offre n'est comptée que si son EMPLOYEUR est la cible (un cabinet qui
  publie pour elle, une offre anonymisée : jamais) ; un avis, que si la cible
  en est l'ACHETEUR ;
· un fait sans date n'est pas compté (« un signal sans date n'en est pas un ») ;
· rien d'attribuable → ``None`` : « non observé », jamais une préférence déduite.
  Et une observation SANS indépendant ni régie ne dit pas « n'y recourt pas » —
  elle dit ce qui a été lu (doctrine c65, GA-259).
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Any

from app.services.homonym_disambiguation import normalize_company_name
from app.services.text_norm import normalize_name

JOB_OFFERS_SOURCE = "Offres d'emploi publiques"
PUBLIC_CONTRACTS_SOURCE = "Avis de marchés publics"

# Codes natifs VÉRIFIÉS (voir le docblock de tête) → nature du contrat.
_JOB_KIND_BY_CODE: dict[str, str] = {
    "CDI": "permanent",
    "CDD": "fixedTerm",
    "MIS": "interim",
    "DIN": "permanent",  # Louis 01/11 : un « CDI Intérimaire » est un CDI.
    "LIB": "freelance",
}
_JOB_KINDS = ("permanent", "fixedTerm", "interim", "freelance", "other")

# Les TOURNURES qui disent le mode, jamais un mot isolé : « Régie des eaux » est
# un acheteur, « forfait mobile » un abonnement.
_REGIE = re.compile(r"\b(?:en regie|mode regie|assistance technique)\b")
_FIXED_PRICE = re.compile(r"\b(?:au forfait|en forfait|mode forfait|forfaitaires?)\b")


def _day(value: object) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None
    return parsed.date()


def _is_target(target: str, other: object) -> bool:
    """L'employeur / l'acheteur EST-il la cible ? Noms repliés (accents, casse,
    forme juridique retirée), puis égalité ou inclusion de l'un dans l'autre
    (« DECATHLON » ⊆ « DECATHLON FRANCE ») — la règle marque/parent déjà tenue
    par ``name_similarity``. Un nom absent n'est jamais la cible."""
    wanted = normalize_company_name(target)
    seen = normalize_company_name(other)
    if not wanted or not seen:
        return False
    if wanted == seen:
        return True
    wanted_tokens, seen_tokens = set(wanted.split()), set(seen.split())
    return wanted_tokens <= seen_tokens or seen_tokens <= wanted_tokens


def _job_kind(row: Mapping[str, Any]) -> str:
    code = str(row.get("contractCode") or "").strip().upper()
    if not code:
        # Libellé absent à la source : ``contractType`` porte alors le CODE
        # lui-même. Seul un code vérifié est lu ; un libellé reste « autre ».
        code = str(row.get("contractType") or "").strip().upper()
    return _JOB_KIND_BY_CODE.get(code, "other")


def job_kind(row: Mapping[str, Any]) -> str:
    """#2616.1 — la SEULE table de correspondance code natif → nature de contrat
    (voir le docblock de tête, GA-26) : `discover_signals.py` la réutilise pour
    distinguer le CDI (``"permanent"``) plutôt que dupliquer
    ``_JOB_KIND_BY_CODE``. Alias public de :func:`_job_kind` — même contrat,
    jamais un code deviné."""
    return _job_kind(row)


#: #4999 — codes natifs dont le CONTRAT est freelance / indépendant (France Travail ``typeContrat`` :
#: ``LIB`` profession libérale, ``FRA`` franchise). #5000 — ``MIS`` (mission d'intérim) en est SORTI : l'intérim
#: est une valeur à part (``INTERIM``). Jamais lu dans un libellé libre.
_FREELANCE_CODES = frozenset({"LIB", "FRA"})


def is_freelance_contract(row: Mapping[str, Any]) -> bool:
    """#4999 — vrai seulement quand le code natif de la source dit freelance/indépendant."""
    code = str(row.get("contractCode") or "").strip().upper()
    if not code:
        code = str(row.get("contractType") or "").strip().upper()
    return code in _FREELANCE_CODES


#: #5000 — nature de contrat (``job_kind``) → valeur du filtre Découvrir. UNE table (GA-26) : le CDI, le CDD
#: et l'intérim se lisent sur ``_JOB_KIND_BY_CODE``, le freelance sur ``_FREELANCE_CODES``.
_SIGNAL_CONTRACT_BY_KIND: dict[str, str] = {"permanent": "CDI", "fixedTerm": "CDD", "interim": "INTERIM"}


def signal_contract_type(row: Mapping[str, Any]) -> str | None:
    """#5000 — ``CDI`` / ``CDD`` / ``INTERIM`` / ``FREELANCE`` d'après le code natif, sinon ``None`` (jamais deviné)."""
    mapped = _SIGNAL_CONTRACT_BY_KIND.get(_job_kind(row))
    if mapped:
        return mapped
    return "FREELANCE" if is_freelance_contract(row) else None


def _window(days: list[date]) -> dict[str, str]:
    return {"since": min(days).isoformat(), "until": max(days).isoformat()}


def _job_offers(target: str, rows: Iterable[object]) -> dict[str, Any] | None:
    counts = dict.fromkeys(_JOB_KINDS, 0)
    days: list[date] = []
    for row in rows:
        if not isinstance(row, Mapping) or not _is_target(target, row.get("company")):
            continue
        day = _day(row.get("date"))
        if day is None:
            continue
        counts[_job_kind(row)] += 1
        days.append(day)
    if not days:
        return None
    return {"source": JOB_OFFERS_SOURCE, "total": len(days), "counts": counts, **_window(days)}


def _public_contracts(target: str, rows: Iterable[object]) -> dict[str, Any] | None:
    regie = fixed_price = 0
    days: list[date] = []
    for row in rows:
        if not isinstance(row, Mapping) or not _is_target(target, row.get("buyer")):
            continue
        day = _day(row.get("publishedDate"))
        if day is None:
            continue
        days.append(day)
        # Un avis peut nommer les DEUX modes : chacun est compté là où l'avis le dit.
        title = normalize_name(row.get("title"))
        regie += 1 if _REGIE.search(title) else 0
        fixed_price += 1 if _FIXED_PRICE.search(title) else 0
    if not days:
        return None
    return {
        "source": PUBLIC_CONTRACTS_SOURCE,
        "total": len(days),
        "regie": regie,
        "fixedPrice": fixed_price,
        **_window(days),
    }


def observe_contract_model(
    target: str,
    job_rows: Iterable[object] | None,
    tender_rows: Iterable[object] | None,
    *,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """L'observation du modèle de contrat de ``target``, ou ``None`` (non observé).

    ``job_rows`` : lignes de ``france_travail.it_job_signals`` ; ``tender_rows`` :
    lignes de ``public_tenders.public_tenders``. Déjà en main chez l'appelant —
    cette fonction n'appelle rien.
    """
    name = (target or "").strip()
    if not name:
        return None
    jobs = _job_offers(name, job_rows or [])
    contracts = _public_contracts(name, tender_rows or [])
    if jobs is None and contracts is None:
        return None
    observed_at = (now or datetime.now(UTC)).date().isoformat()
    return {"observedAt": observed_at, "jobOffers": jobs, "publicContracts": contracts}
