"""#4358.4 = #4419.10 = #4435.4 — LE SECTEUR D'UNE ENTREPRISE SE LIT PAR TROIS SOURCES COMBINÉES.

Décision Louis (21/10/2026) : code NAF + activité déclarée (objet social / description) + site web. Le NAF seul
ne suffit plus — une place de marché est codée « commerce de gros » (46.90Z), un éditeur « conseil » (70.22Z) —
mais il reste la source première : une entreprise dont le NAF est dans le secteur demandé n'a besoin de rien
d'autre.

Ce que ce module ne fait pas : il ne rattache JAMAIS une entreprise au NAF précis d'un autre métier (un
hypermarché qui mentionne sa « boutique en ligne » reste un détaillant, #4358), et il n'invente rien — sans
activité ni site, on retombe sur le NAF, la ligne n'est pas rattachée. Le rattachement est NOMMÉ
(« rattaché par son activité »), jamais silencieux.

Les termes vivent ICI, à un seul endroit (GA-26), et le référentiel des secteurs et de leurs codes NAF
reste celui de ``application_sector_naf`` (les paliers voisins de #4434-#4436 : ``criteria_referential``).
"""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Mapping
from typing import Any

from app.services.application_sector_naf import APPLICATION_SECTOR_NAF

#: NAF « flous » : des codes de service ou de gros qui n'enferment pas le métier réel (conseil, activités
#: informatiques, holdings, commerce de gros, sièges, ingénierie, publicité). Seuls ces préfixes laissent
#: l'activité ou le site trancher ; un NAF précis d'un autre métier ne se rattrape pas.
FUZZY_NAF_PREFIXES: tuple[str, ...] = ("46.", "62.", "63.", "64.2", "70.", "73.", "74.", "82.")

#: Ce que disent l'activité ou le site d'une entreprise du secteur. Des expressions, jamais des mots seuls
#: (« vente » ou « service » ne discriminent rien). Un secteur absent de la table n'a pas de lecture par
#: l'activité : seul son NAF compte.
SECTOR_ACTIVITY_TERMS: dict[str, tuple[str, ...]] = {
    "ecommerce": (
        "place de marche",
        "marketplace",
        "e-commerce",
        "ecommerce",
        "vente en ligne",
        "vente a distance",
        "boutique en ligne",
        "plateforme de vente",
        "site marchand",
    ),
    "software_tech": (
        "editeur de logiciel",
        "editeur de logiciels",
        "logiciel en mode saas",
        "plateforme saas",
        "solution saas",
        "software publisher",
    ),
    "fintech": (
        "paiement en ligne",
        "services de paiement",
        "neobanque",
        "fintech",
        "crowdfunding",
        "financement participatif",
    ),
    "logistics": ("logistique", "supply chain", "entreposage", "messagerie et fret", "transport de marchandises"),
    "healthcare": ("clinique", "etablissement de sante", "centre hospitalier", "soins hospitaliers"),
    "telecom": ("operateur telecom", "operateur de telecommunications", "fournisseur d'acces internet"),
    "media_entertainment": ("production audiovisuelle", "jeux video", "editeur de jeux", "streaming video"),
    "renewables": ("energie solaire", "energie eolienne", "parc photovoltaique", "energies renouvelables"),
    "aerospace": ("aeronautique", "aerospatial", "construction aeronautique", "sous-traitant aeronautique"),
}

#: Champs lus, dans l'ordre. L'activité est ce que l'entreprise DÉCLARE (objet social, domaine, description) ;
#: le site est le texte de sa page (jamais deviné depuis un nom de domaine).
_ACTIVITY_FIELDS = ("corporatePurpose", "activityDomain", "activity", "description")
_SITE_FIELDS = ("websiteText", "siteDescription")


def _fold(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _fields_text(company: Mapping[str, Any], fields: Iterable[str]) -> str:
    return " ".join(_fold(company.get(field)) for field in fields if company.get(field))


def sectors_asked_in_naf(naf_code: str | None) -> list[str]:
    """Les secteurs partagés DEMANDÉS, relus dans la liste NAF (l'écran envoie le secteur en codes NAF,
    ``buildRegistryQuery``). Seulement quand la liste est EXACTEMENT l'union de secteurs entiers : un code tapé
    à la main, ou une liste de sections, ne nomme aucun secteur — on ne devine pas ce qui n'a pas été coché."""
    asked = {code.strip().upper() for code in (naf_code or "").split(",") if code.strip()}
    sectors = [sector for sector, codes in APPLICATION_SECTOR_NAF.items() if codes and set(codes) <= asked]
    covered = {code for sector in sectors for code in APPLICATION_SECTOR_NAF[sector]}
    return sectors if asked and covered == asked else []


def _is_fuzzy(naf_code: Any) -> bool:
    code = str(naf_code or "").strip().upper()
    return any(code.startswith(prefix) for prefix in FUZZY_NAF_PREFIXES)


def read_sector_attachment(company: Mapping[str, Any], sectors: Iterable[str]) -> dict[str, str] | None:
    """Le secteur demandé auquel l'ACTIVITÉ ou le SITE de cette entreprise la rattache, ou ``None``.

    ``{"sector": code, "via": "activity" | "site"}`` — l'activité prime sur le site. ``None`` quand : le NAF est
    déjà dans le secteur (rien à rattacher), le NAF est précis et d'un autre métier, ou ni l'activité ni le site
    ne portent un terme du secteur."""
    naf = str(company.get("nafCode") or "").strip().upper()
    if not _is_fuzzy(naf):
        return None
    activity = _fields_text(company, _ACTIVITY_FIELDS)
    site = _fields_text(company, _SITE_FIELDS)
    for sector in sectors:
        if naf in APPLICATION_SECTOR_NAF.get(sector, ()):
            return None
        terms = SECTOR_ACTIVITY_TERMS.get(sector, ())
        if any(term in activity for term in terms):
            return {"sector": sector, "via": "activity"}
        if any(term in site for term in terms):
            return {"sector": sector, "via": "site"}
    return None


#: Le libellé d'écran du rattachement — jamais « secteur : X » seul, qui prétendrait un NAF.
ATTACHMENT_LABEL_FR = {"activity": "rattaché par son activité", "site": "rattaché par son site"}
