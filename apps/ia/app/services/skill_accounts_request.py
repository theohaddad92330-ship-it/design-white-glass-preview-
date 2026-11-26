"""#4434.3 (recette prod 23/10) — « Quels comptes cherchent du React ? » : Laura demandait le périmètre
(« IDF / Grand Est / Toute la France / Autre ») au lieu d'agir.

Doctrine (Louis) : Laura AGIT. Le périmètre qui manque se prend au profil (``geoZone``), sinon c'est la France ;
il se DIT en une ligne, jamais en question. La recherche part par la compétence (``run_account_search`` →
moteur de Découvrir, #4434.2) ; sous le seuil, la compétence s'élargit SEULE à ses voisines, NOMMÉES
(« proche : JavaScript ») — même référentiel que Découvrir.

Ce module ne fait que RECONNAÎTRE la demande et écrire la consigne du tour ; l'orchestrateur retire l'outil de
clarification. Une compétence inconnue du référentiel (et qui n'est pas un métier connu) n'est jamais devinée.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from typing import Any

from app.services.criteria_referential import canonical_skill
from app.services.discover_request_reading import read_request
from app.services.geo_labels import department_label, region_label
from app.services.hiring_trade_terms import trade_offer_terms

_SUBJECT = r"(?:comptes?|entreprises?|bo[iî]tes?|soci[ée]t[ée]s?|clients?|prospects?)"
_VERB = r"(?:cherchent|recherchent|recrutent|embauchent|utilisent|ont\s+besoin\s+de)"
_ARTICLE = r"(?:du|de\s+la|des|de\s+l['’]|d['’]|de|en|sur)"
_JOB_NOUN = r"(?:d[ée]veloppeurs?|devs?|profils?|consultants?|ing[ée]nieurs?|experts?)"
_SKILL = r"(?P<skill>[\wÀ-ÿ+#.\-]+?)"

_AFTER_VERB = re.compile(
    rf"(?i)\b{_SUBJECT}\b[^?.!\n]{{0,40}}?\b{_VERB}\s+(?:{_ARTICLE}\s*)?(?:{_JOB_NOUN}\s+)?{_SKILL}(?=[\s?.!,;]|$)"
)
_BEFORE_VERB = re.compile(rf"(?i)\b{_SUBJECT}\s+{_SKILL}\s+qui\s+{_VERB}\b")


def _known(skill: str) -> bool:
    return bool(canonical_skill(skill)) or trade_offer_terms([skill])[0] is not None


def requested_skill(message: str | None) -> str | None:
    """La compétence (ou le métier) d'une demande de COMPTES qui la cherchent, telle que tapée ; sinon ``None``."""
    text = (message or "").strip()
    if not text:
        return None
    for pattern in (_AFTER_VERB, _BEFORE_VERB):
        for match in pattern.finditer(text):
            skill = match.group("skill").strip(".-")
            if skill and _known(skill):
                return skill
    return None


def _profile_regions(profile: Mapping[str, Any] | None) -> list[str]:
    zones = [z.strip() for z in str((profile or {}).get("geoZone") or "").split(",") if z.strip()]
    return list(dict.fromkeys(code for zone in zones if (code := read_request(zone).region)))


def skill_accounts_note(skill: str, message: str | None, profile: Mapping[str, Any] | None) -> str:
    """La consigne du tour : l'appel exact, le périmètre posé ET dit, aucune question."""
    asked = read_request(message or "")
    args: dict[str, Any] = {"technologies": [skill], "signals": ["hiring"]}
    if asked.region or asked.department:
        if asked.region:
            args["region"] = [asked.region]
            perimeter = region_label(asked.region)
        else:
            args["department"] = asked.department
            perimeter = department_label(str(asked.department))
    elif regions := _profile_regions(profile):
        args["region"] = regions
        perimeter = ", ".join(region_label(code) for code in regions) + " (ton profil)"
    else:
        perimeter = "toute la France (aucune zone dans ton profil)"
    return (
        f"\n\nCETTE DEMANDE CHERCHE DES COMPTES PAR COMPÉTENCE (#4434.3) : « {skill} ». Tu ne poses AUCUNE question, "
        "ni sur le périmètre ni sur l'élargissement (l'outil de clarification t'est retiré) : appelle "
        f"`run_account_search` avec {json.dumps(args, ensure_ascii=False)}. Écris en tête, en une ligne : "
        f"« Périmètre : {perimeter}. » Si la compétence exacte rend peu de comptes, l'outil élargit SEUL à ses "
        "compétences voisines : nomme-les (« proche : … ») — jamais un zéro sec, jamais « tu veux élargir ? »."
    )
