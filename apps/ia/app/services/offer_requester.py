"""#4182 (EX-12) — de l'offre RH à l'équipe métier demandeuse, AVEC PREUVE.

Une offre publiée par les RH ne dit pas quel service la demande. Le commercial ESN veut
atteindre l'équipe opérationnelle, pas le chargé de recrutement. Ce module compose, à partir
de ce que l'offre DIT (zéro LLM, zéro devinette) :

· ``author``  — qui PUBLIE l'annonce (RH / cabinet / non précisé), jamais confondu avec le manager ;
· ``possibleManager`` — la fonction de rattachement, SEULEMENT quand le texte la nomme ET qu'elle
  n'est pas elle-même une fonction RH (« rattaché à la DRH » nomme l'auteur, pas le demandeur) ;
· ``team`` — l'équipe, quand un marqueur explicite l'introduit ;
· ``scope`` — l'entité visée : la ville du SITE de l'offre, jamais remontée au groupe ;
· ``status`` — ``etaye`` (un rattachement ou une équipe écrits dans l'offre) ou ``a_identifier``
  (un rôle à identifier, jamais une personne inventée) avec la ``method`` de qualification, en
  CODES (le texte vit dans le lexique de l'interface) ;
· ``openFreelanceMission`` — TOUJOURS ``False`` : une annonce RH est un recrutement, jamais une
  mission freelance ouverte (le CDI est comblé en interne, ``hiring_signal.py``).

Aucune PERSONNE n'est nommée ici : le contact se choisit parmi ceux du compte, sur cette fonction.
Aucun fournisseur n'est nommé : la preuve est « le texte de l'offre ».
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.services.job_context import derive_reporting_line, derive_team

AUTHOR_HR = "rh"
AUTHOR_AGENCY = "cabinet"
AUTHOR_UNSPECIFIED = "non_precise"

STATUS_SUPPORTED = "etaye"
STATUS_TO_IDENTIFY = "a_identifier"

#: La preuve est toujours la même source : le texte de l'offre (jamais un nom de fournisseur).
EVIDENCE_OFFER_TEXT = "texte_de_l_offre"

#: Une fonction RH nomme l'AUTEUR de l'annonce, pas l'équipe qui demande le profil.
_HR_FUNCTION = re.compile(
    r"\b(?:rh|drh|ressources humaines|recrut\w*|talent\w*|people|chargee? de recrutement|human resources)\b"
)
_AGENCY_MARKER = re.compile(r"\b(?:cabinet de recrutement|pour le compte de|pour notre client|on behalf of)\b")
_HR_AUTHOR_MARKER = re.compile(
    r"\b(?:service recrutement|equipe recrutement|equipe rh|chargee? de recrutement|talent acquisition|"
    r"ressources humaines|recruiter)\b"
)


def _plain(text: str | None) -> str:
    if not isinstance(text, str):
        return ""
    folded = unicodedata.normalize("NFD", text.casefold())
    return "".join(ch for ch in folded if unicodedata.category(ch) != "Mn")


def is_hr_function(function: str | None) -> bool:
    """``True`` quand la fonction nommée est une fonction RH/recrutement (l'auteur, pas le demandeur)."""
    return bool(_HR_FUNCTION.search(_plain(function)))


def _author(label: str | None, detail: str | None, *, intermediated: bool) -> dict[str, Any]:
    if intermediated:
        return {"kind": AUTHOR_AGENCY, "evidence": EVIDENCE_OFFER_TEXT}
    text = _plain(f"{label or ''} {detail or ''}")
    if _AGENCY_MARKER.search(text):
        return {"kind": AUTHOR_AGENCY, "evidence": EVIDENCE_OFFER_TEXT}
    if _HR_AUTHOR_MARKER.search(text):
        return {"kind": AUTHOR_HR, "evidence": EVIDENCE_OFFER_TEXT}
    # Une offre publiée par un employeur l'est par ses RH : mais le texte ne le DIT pas — on ne
    # l'affirme pas, on dit « non précisé ».
    return {"kind": AUTHOR_UNSPECIFIED, "evidence": None}


#: Les étapes de la méthode de qualification, en CODES stables : le texte vit dans le lexique de
#: l'interface (FR/EN), jamais ici — une phrase française dans la réponse serait lue telle quelle.
METHOD_READ_OFFER = "lire_offre"
METHOD_HR_NAMES_AUTHOR = "fonction_rh_nomme_auteur"
METHOD_FIND_FUNCTION = "chercher_fonction_operationnelle"
METHOD_ASK_FIRST_CONTACT = "demander_au_premier_interlocuteur"


def _method(*, hr_reporting: bool) -> list[str]:
    steps = [METHOD_READ_OFFER, METHOD_FIND_FUNCTION, METHOD_ASK_FIRST_CONTACT]
    if hr_reporting:
        steps.insert(1, METHOD_HR_NAMES_AUTHOR)
    return steps


def derive_offer_requester(
    label: str | None,
    detail: str | None,
    *,
    team: str | None,
    reports_to: str | None,
    site_city: str | None,
    job_family: str | None = None,
    intermediated: bool = False,
) -> dict[str, Any]:
    """Le dossier « qui demande ce profil ? » d'UNE offre. Toujours un dict (le statut dit l'état)."""
    hr_reporting = bool(reports_to) and is_hr_function(reports_to)
    manager_function = None if hr_reporting else (reports_to or None)
    possible_manager = (
        {"function": manager_function, "entity": site_city or None, "evidence": EVIDENCE_OFFER_TEXT}
        if manager_function
        else None
    )
    supported = bool(possible_manager or team)
    requester: dict[str, Any] = {
        "author": _author(label, detail, intermediated=intermediated),
        "possibleManager": possible_manager,
        "team": team or None,
        "scope": {"city": site_city or None},
        "jobFamily": job_family or None,
        "status": STATUS_SUPPORTED if supported else STATUS_TO_IDENTIFY,
        "openFreelanceMission": False,
    }
    if not supported:
        requester["method"] = _method(hr_reporting=hr_reporting)
    return requester


def stamp_offer_requesters(signals: object, jobs: object) -> list[dict[str, Any]]:
    """#4182.5 — le demandeur d'une offre sur les signaux du COMPTE (Mes cibles), pas seulement Découvrir.

    Pose ``requester`` sur un signal ``source_kind == "job"`` quand son URL est celle d'une offre
    collectée : la jointure est l'URL, JAMAIS le texte (un intitulé qui ressemble ne rattache rien).
    Le dossier se lit dans le texte de l'offre, par la même fonction que Découvrir
    (``derive_offer_requester``). Tout autre signal passe inchangé.
    """
    by_url: dict[str, dict[str, Any]] = {}
    for job in jobs if isinstance(jobs, list) else []:
        if not isinstance(job, dict):
            continue
        url = str(job.get("url") or job.get("sourceUrl") or "").strip()
        if url:
            by_url.setdefault(url, job)
    out: list[dict[str, Any]] = []
    for sig in signals if isinstance(signals, list) else []:
        if not isinstance(sig, dict):
            continue
        item = dict(sig)
        job = by_url.get(str(item.get("url") or "").strip()) if item.get("source_kind") == "job" else None
        if job is not None:
            title = job.get("title") or job.get("label")
            detail = job.get("description") or job.get("detail")
            city = str(job.get("city") or "").strip() or None
            item["requester"] = derive_offer_requester(
                title,
                detail,
                team=derive_team(title, detail),
                reports_to=derive_reporting_line(title, detail),
                site_city=city,
            )
        out.append(item)
    return out


__all__ = [
    "METHOD_ASK_FIRST_CONTACT",
    "METHOD_FIND_FUNCTION",
    "METHOD_HR_NAMES_AUTHOR",
    "METHOD_READ_OFFER",
    "AUTHOR_AGENCY",
    "AUTHOR_HR",
    "AUTHOR_UNSPECIFIED",
    "EVIDENCE_OFFER_TEXT",
    "STATUS_SUPPORTED",
    "STATUS_TO_IDENTIFY",
    "derive_offer_requester",
    "stamp_offer_requesters",
    "is_hr_function",
]
