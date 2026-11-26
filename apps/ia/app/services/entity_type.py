"""Le TYPE d'une entité, et le droit de l'afficher par défaut (§23-24).

Le reproche du rapport tient en une capture : l'onglet « Filiales » de Société
Générale affichait quinze SCI, « RISING LEASE FIVE », « SCI DU SURMELIN »,
« REMONTEES MECANIQUES DU GRAND BORNAND » — tous étiquetés « Filiale » du même
badge. Les entités stratégiques (Boursorama, SGSS, Retail Banking France)
existaient bien, mais noyées au milieu de véhicules juridiques sans intérêt
commercial. Ce n'est pas un problème de collecte : le registre fournit le graphe
légal complet, et il a raison de le faire. C'est un problème de DISCRIMINATION —
il manquait une couche qui dise, entité par entité, de quoi il s'agit.

Ce module la fournit, et rien de plus. Il ne juge pas la pertinence commerciale
(``entities.classify_entity_relevance`` s'en charge) : il répond à la question
factuelle « quelle SORTE d'objet est-ce ? », dont découle une règle d'affichage.
Les deux sont séparés parce qu'ils échouent différemment — se tromper de type
est une erreur de lecture du registre, se tromper de pertinence est une erreur
de jugement métier.
"""

from __future__ import annotations

import re
from typing import Mapping

from .entities import is_it_entity
from .official_directory import person_and_title

#: Les types du §24, dans l'ordre où ils sont décidés.
ENTITY_TYPE_PARENT = "parent"
ENTITY_TYPE_BUSINESS_UNIT = "business_unit"
ENTITY_TYPE_OPERATING = "operating_subsidiary"
ENTITY_TYPE_VEHICLE = "financing_vehicle"
ENTITY_TYPE_DORMANT = "dormant_or_divested"
ENTITY_TYPE_OUT_OF_SCOPE = "out_of_scope"
ENTITY_TYPE_PARTNER = "partner"
#: Une PERSONNE, ingérée là où on attendait une organisation.
#:
#: Le §24 avait un test pour la SCI, un pour la coentreprise, un pour l'entité
#: cédée — aucun pour l'être humain. Recette live du 29/08/2026, compte ROCHE :
#: « Entités couvertes 26/27 · À ouvrir : Wafaa Mamilli — Chief Digital
#: Technology Officer ». Le compte paraissait moins couvert qu'il ne l'est, à
#: cause d'une entité qui n'existe pas.
ENTITY_TYPE_PERSON = "person_not_an_entity"

#: Ce qu'on montre sans que l'utilisateur ait à demander.
#:
#: Un véhicule de financement, une entité cédée ou un homonyme ne sont pas
#: SUPPRIMÉS — ils restent consultables, et c'est important : le registre est
#: une source vérifiable, et masquer sans trace donnerait un produit qui « perd »
#: des entités. Ils sortent simplement de la vue par défaut, celle qui doit
#: répondre à « par où j'entre ? ».
DISPLAYED_BY_DEFAULT: frozenset[str] = frozenset(
    {ENTITY_TYPE_PARENT, ENTITY_TYPE_BUSINESS_UNIT, ENTITY_TYPE_OPERATING}
)

#: Le partenaire va dans une VUE SÉPARÉE (§24) : le mélanger à la hiérarchie du
#: groupe ferait lire une participation croisée comme une filiale.
SEPARATE_VIEW: frozenset[str] = frozenset({ENTITY_TYPE_PARTNER})

_MIN_NAME_LEN = 2

# Véhicules juridiques et de financement. C'est la famille qui noyait la liste.
_VEHICLE_RE = re.compile(
    r"\b(sci|scpi|sccv|sarl\s+de\s+famille|fct|fcp|sicav|opci|"
    r"titrisation|securitisation|emtn|compartiment|"
    r"credit\s+bail|cr[ée]dit[- ]bail|leasing|lease|location[- ]bail)\b",
    re.IGNORECASE,
)

_HOLDING_RE = re.compile(r"\b(holding|participations?|gie|groupement\s+d)\b", re.IGNORECASE)

_DORMANT_RE = re.compile(
    r"\b(en\s+liquidation|liquidation\s+judiciaire|radi[ée]e?|dissoute?|"
    r"cess[ée]e?|c[ée]d[ée]e?|ex[- ]filiale|dormante?|sans\s+activit[ée])\b",
    re.IGNORECASE,
)

#: Les mots qui signent une BU ou une marque stratégique — le niveau commercial
#: utile, celui que le rapport veut voir remonter en tête.
_BUSINESS_UNIT_RE = re.compile(
    r"\b(banque\s+de\s+(d[ée]tail|grande\s+client[èe]le)|retail\s+banking|wholesale|"
    r"corporate\s+(and|&)\s+investment|securities\s+services|asset\s+management|"
    r"direction\s+(g[ée]n[ée]rale|des?\s+\w+)|division|business\s+unit|"
    r"p[ôo]le\s+\w+|branche\s+\w+)\b",
    re.IGNORECASE,
)

_PARTNER_RE = re.compile(
    r"\b(joint[- ]venture|coentreprise|partenariat|consortium|"
    r"participation\s+minoritaire)\b",
    re.IGNORECASE,
)


def is_holding_name(name: str | None) -> bool:
    """#2284.11 — le nom signe-t-il une holding ? Exposé pour le résolveur
    d'entité (``entity_resolution.py``), qui distingue holding et véhicule
    juridique là où ce module-ci les range ensemble (affichage)."""
    return bool(_HOLDING_RE.search(name or ""))


def classify_entity_type(
    name: str | None,
    *,
    is_root: bool = False,
    naf: str | None = None,
    headcount: int | None = None,
    in_scope: bool = True,
) -> tuple[str, str]:
    """Quelle SORTE d'entité est-ce, et pourquoi — ``(type, raison)``.

    ``is_root`` marque la maison-mère du graphe (elle vient du registre, pas du
    nom : « Société Générale » ne s'auto-désigne pas). ``in_scope`` porte la
    décision géographique déjà prise en amont ; une entité hors zone est un
    ``out_of_scope``, quelle que soit sa nature par ailleurs.

    L'ordre des tests est la partie qui compte. Une entité cédée qui s'appelle
    « SCI » est d'abord cédée : la ranger en véhicule ferait croire qu'elle est
    seulement inintéressante, alors qu'elle a QUITTÉ le groupe. Et une SCI
    passe avant toute lecture de BU, sinon « SCI Pôle Santé » remonterait en
    tête des cibles commerciales.
    """
    cleaned = (name or "").strip()
    if len(cleaned) < _MIN_NAME_LEN:
        return ENTITY_TYPE_OUT_OF_SCOPE, "nom vide ou illisible"

    if is_root:
        return ENTITY_TYPE_PARENT, "maison-mère du groupe"

    # Une PERSONNE avant tout le reste : c'est le seul cas où la ligne ne
    # décrit pas une organisation du tout, et il doit passer AVANT la lecture
    # de BU — « … — Chief Digital Technology Officer » porte les mots
    # « Direction » / « Officer » qui feraient sinon remonter la personne en
    # tête des cibles commerciales.
    person = person_and_title(cleaned)
    if person is not None:
        who, role = person
        return ENTITY_TYPE_PERSON, f"personne, pas une organisation : « {who} », {role}"

    # Cédée / dormante d'abord : elle a quitté le périmètre, ce qui prime sur ce
    # qu'elle est par ailleurs.
    if _DORMANT_RE.search(cleaned):
        return ENTITY_TYPE_DORMANT, "entité cédée, dissoute ou sans activité"

    # Puis les véhicules — la famille qui noyait la liste du rapport.
    if _VEHICLE_RE.search(cleaned):
        return ENTITY_TYPE_VEHICLE, "véhicule juridique ou de financement"

    if _PARTNER_RE.search(cleaned):
        return ENTITY_TYPE_PARTNER, "partenariat ou participation, hors hiérarchie du groupe"

    if not in_scope:
        return ENTITY_TYPE_OUT_OF_SCOPE, "hors périmètre demandé"

    # Une holding PURE est un véhicule ; une holding OPÉRATIONNELLE est un point
    # de repère utile. Faute de pouvoir trancher sur le nom seul, l'effectif
    # départage : une holding sans salarié n'a personne à qui vendre.
    if _HOLDING_RE.search(cleaned):
        if headcount is not None and headcount >= 10:
            return ENTITY_TYPE_PARENT, "holding opérationnelle (effectif réel)"
        return ENTITY_TYPE_VEHICLE, "holding sans effectif connu"

    if _BUSINESS_UNIT_RE.search(cleaned):
        return ENTITY_TYPE_BUSINESS_UNIT, "business unit ou marque stratégique"

    # Une entité qui porte un signal IT est une BU prioritaire pour une ESN : le
    # rapport la veut « oui, prioritaire », pas noyée parmi les filiales.
    if is_it_entity(cleaned) or (naf or "").startswith("62"):
        return ENTITY_TYPE_BUSINESS_UNIT, "entité IT / digitale du groupe"

    return ENTITY_TYPE_OPERATING, "filiale opérationnelle"


def displays_by_default(entity_type: str) -> bool:
    """Cette entité s'affiche-t-elle sans que l'utilisateur ait à la demander ?"""
    return entity_type in DISPLAYED_BY_DEFAULT


def annotate_entity_type(
    entity: Mapping[str, object],
    *,
    is_root: bool = False,
    in_scope: bool = True,
) -> dict:
    """Ajoute ``entityType`` / ``entityTypeReason`` / ``displayByDefault`` sans
    rien retirer. Non destructif : une entité garde tout ce qu'elle portait, y
    compris sa pertinence commerciale, qui répond à une autre question."""
    out = dict(entity)
    headcount = out.get("headcount")
    entity_type, reason = classify_entity_type(
        str(out.get("name") or out.get("legalName") or ""),
        is_root=is_root,
        naf=str(out.get("nafCode") or out.get("naf") or "") or None,
        headcount=headcount if isinstance(headcount, int) else None,
        in_scope=in_scope,
    )
    out["entityType"] = entity_type
    out["entityTypeReason"] = reason
    out["displayByDefault"] = displays_by_default(entity_type)
    return out


def partition_by_display(entities: list[Mapping[str, object]]) -> dict[str, list[dict]]:
    """Range une liste d'entités déjà typées en trois paquets : ce qu'on montre,
    ce qui reste consultable, et la vue séparée des partenaires.

    Rendre trois listes plutôt qu'un filtre est délibéré : l'écran doit pouvoir
    écrire « 15 entités masquées » et les rouvrir. Un filtre qui jette ne
    permettrait pas de le dire, et un produit qui perd des entités sans le
    signaler est pire qu'un produit qui en montre trop.
    """
    shown: list[dict] = []
    hidden: list[dict] = []
    partners: list[dict] = []
    for raw in entities:
        item = dict(raw)
        entity_type = str(item.get("entityType") or ENTITY_TYPE_OPERATING)
        if entity_type in SEPARATE_VIEW:
            partners.append(item)
        elif displays_by_default(entity_type):
            shown.append(item)
        else:
            hidden.append(item)
    return {"shown": shown, "hidden": hidden, "partners": partners}
