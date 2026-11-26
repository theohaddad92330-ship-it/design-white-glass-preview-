"""Une offre publiée par un cabinet de recrutement n'est pas son besoin à lui.

Le piège que décrit le tome 2 §13 : « une offre publiée par Michael Page pour un
client n'est pas un signal sur Michael Page ». Sans ce filtre, les cabinets
remontent en tête de Découvrir — ce sont les entreprises qui publient le plus
d'offres IT de France — et le commercial appelle un intermédiaire en croyant
appeler un donneur d'ordre.

#2265.4 / #2265.9 — une PLATEFORME de mise en relation (Malt, Comet,
Collective.work…) pose le même piège sous une autre forme : ce n'est pas un
cabinet (aucun code NAF 78.10Z/78.30Z), mais une mission qu'elle publie n'est
pas non plus son propre besoin. #2265.9 nomme explicitement Collective.work —
elle ne doit jamais être présentée sans cette classification.

DEUX PREUVES, DANS CET ORDRE

1. le **code NAF** du registre : `78.10Z` (activités des agences de placement de
   main-d'œuvre) et `78.30Z` (autre mise à disposition de ressources humaines).
   C'est un fait, publié, et il ne se périme pas.
2. à défaut de NAF résolu, le **nom** : une liste courte et nommée, tenue à la
   main. Elle ne prétend pas être exhaustive — une liste de cabinets l'est
   rarement — mais elle rattrape les plus gros publieurs du marché français.

`78.20Z` (travail temporaire) est délibérément ABSENT : une entreprise
d'intérim place ses propres salariés en mission, ce qui est un besoin réel de
main-d'œuvre, pas une annonce pour le compte d'un tiers. Le tome ne cite que les
deux codes ci-dessus, et élargir sans preuve écarterait des comptes valides.

Ce qu'on NE fait pas : supprimer l'offre. Elle est CONSERVÉE et marquée — le
commercial peut vouloir travailler le cabinet lui-même, et une offre qui
disparaît sans explication est pire qu'une offre expliquée.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Literal

#: Codes NAF des intermédiaires du recrutement (nomenclature INSEE 2008).
RECRUITMENT_NAF_CODES = ("78.10Z", "78.30Z")

#: Marqueur ajouté au détail d'un signal intermédié. Il DIT ce qui manque : le
#: client final, que l'annonce ne nomme presque jamais. Conservé tel quel
#: (compat) pour le cas cabinet, le plus fréquent.
INTERMEDIATED_NOTE = "offre publiée par un cabinet de recrutement — le client final n'est pas nommé"

#: #2265.4/#2265.9 — même note, formulée pour une plateforme plutôt qu'un
#: cabinet.
PLATFORM_NOTE = "offre publiée par une plateforme de mise en relation — le client final n'est pas nommé"


def intermediated_note(kind: IntermediaryKind | None) -> str:
    """Le texte à joindre au détail d'un signal, selon la catégorie retenue.

    Repli sur ``INTERMEDIATED_NOTE`` (cabinet) si la catégorie est absente —
    ne doit être appelée que sur un signal déjà marqué intermédié.
    """
    return PLATFORM_NOTE if kind == "plateforme" else INTERMEDIATED_NOTE

#: Repli quand le registre n'a pas rendu de NAF. Volontairement court : chaque
#: entrée est un publieur massif d'offres IT en France, et une liste longue
#: finirait par écarter une ESN dont le nom ressemble à celui d'un cabinet.
_KNOWN_RECRUITERS = (
    "michael page",
    "page personnel",
    "hays",
    "expectra",
    "randstad",
    "manpower",
    "adecco",
    "robert walters",
    "robert half",
    "fed it",
    "lynx rh",
    "walters people",
    "approach people",
    "gi group",
    "kelly services",
    "spring france",
    "hunteed",
    "urban linker",
    "silkhom",
)

# #2265.4 / #2265.9 — le même piège existe pour une PLATEFORME de mise en
# relation (canal) : une mission publiée sur Malt ou Collective.work n'est pas
# un besoin de la plateforme elle-même, c'est le besoin d'un client qu'elle ne
# nomme pas. Aucun code NAF unique ne les distingue (elles se dispersent entre
# 63.12Z, 70.22Z et d'autres selon leur activité déclarée) — contrairement au
# cabinet de recrutement, la preuve reste donc SEULEMENT le nom, une liste
# courte et nommée, tenue à la main comme `_KNOWN_RECRUITERS`. #2265.9 exige
# nommément que Collective.work ne soit jamais présenté sans cette
# classification : il ouvre la liste.
_KNOWN_PLATFORMS = (
    "collective.work",
    "malt",
    "comet",
    "freelance.com",
    # #4746 — vue en démonstration le 28/10 : « FreeWorks » rendue comme un client final.
    "free work",
    "free-work",
    "free works",
    "freework",
    "freeworks",
    "creme de la creme",
    # #4419.9 — un organisateur de forums d'emploi est un site d'annonces, pas un employeur.
    "forums talents handicap",
    "talents handicap",
    # #4746.1 / #4814.1 (lot P, recette 01/11) — l'organisme public de l'emploi publie des annonces pour d'autres :
    # un site d'annonces, jamais un client final.
    "france travail",
    "pole emploi",
)


# #2265.7 (épopée #2851) — LES SOURCES DE DONNÉES, jamais un prospect. Un
# éditeur de registre ou de base de contacts (Pappers, Kompass, Apollo…) n'a
# aucun besoin d'ESN à satisfaire : le présenter comme un compte à conquérir,
# c'est faire appeler un fournisseur d'information par le commercial. Même
# nature de preuve que `_KNOWN_PLATFORMS` : le NOM, une liste courte, nommée et
# PUBLIQUE (raisons sociales de fournisseurs de données d'entreprise connus),
# tenue à la main — aucun code NAF unique ne les distingue. Miroir à
# l'identique dans `packages/contracts/src/schemas/intermediary-actor.ts`.
_KNOWN_DATA_SOURCES = (
    "pappers",
    "societe.com",
    "infogreffe",
    "kompass",
    "dun & bradstreet",
    "ellisphere",
    "manageo",
    "verif.com",
    "apollo.io",
    "zoominfo",
    "lusha",
    "kaspr",
    "dropcontact",
    "hunter.io",
    "clearbit",
    "crunchbase",
)


# #4814 (arbitrage Louis 31/10) — VMS, MSP et apporteurs d'affaires ne sont pas des clients finaux. Aucun NAF
# unique ne les désigne : la preuve est le NOM, listes courtes et nommées, mots entiers (GA-26 : même
# mécanique que `_KNOWN_DATA_SOURCES`, au même endroit). Hors liste ⇒ jamais retiré (GA-18/19).
_KNOWN_VMS = ("fieldglass", "beeline", "pixid", "coupa talent", "vendorcentral")
_KNOWN_MSP = ("sourceright", "pontoon solutions", "talent solutions msp", "wiser msp")
_BROKER_TERMS = ("apporteur d'affaires", "apporteurs d'affaires", "apporteur d affaires")


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"\s+", " ", text).strip()


def _naf_key(value: object) -> str:
    """« 7810Z », « 78.10z », « 78.10Z » → ``7810Z``. Une valeur illisible rend
    une chaîne vide : on ne devine pas un code d'activité."""
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def is_recruitment_naf(naf: object) -> bool:
    """Le registre dit-il que cette entreprise place de la main-d'œuvre ?"""
    key = _naf_key(naf)
    return bool(key) and key in {_naf_key(code) for code in RECRUITMENT_NAF_CODES}


#: Recette 21/10 B.6 (S.14) — NAF du travail temporaire. Pour l'analyse « cabinet » il reste ABSENT de
#: `RECRUITMENT_NAF_CODES` (voir l'en-tête) ; ici il sert à autre chose : ne pas présenter une agence d'intérim
#: comme un compte qui recrute (Manpower, Adecco, Randstad en tête de liste des signaux de recrutement).
TEMP_AGENCY_NAF_CODES = ("78.20Z",)
_KNOWN_TEMP_AGENCIES = (
    "manpower",
    "adecco",
    "randstad",
    "synergie",
    "crit interim",
    "proman",
    "partnaire",
    "supplay",
    "temporis",
    "start people",
    "gi group",
    "kelly services",
    "samsic emploi",
    "daily interim",
    "interaction interim",
)


def is_temp_agency(*, name: object = None, naf: object = None) -> bool:
    """Intérim / travail temporaire : le NAF 78.20Z (un fait du registre) OU le NOM (liste courte, mots entiers)."""
    key = _naf_key(naf)
    if key and key in {_naf_key(code) for code in TEMP_AGENCY_NAF_CODES}:
        return True
    folded = _fold(name)
    if not folded:
        return False
    return any(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", folded) for term in _KNOWN_TEMP_AGENCIES)


def looks_like_recruiter(name: object) -> bool:
    """Repli par le nom, quand aucun NAF n'a été résolu.

    La comparaison porte sur le nom ENTIER plié : « Hays France » contient
    « hays », mais « Thays Conseil » ne doit pas matcher — d'où les frontières
    de mot.
    """
    folded = _fold(name)
    if not folded:
        return False
    return any(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", folded) for term in _KNOWN_RECRUITERS)


def looks_like_platform(name: object) -> bool:
    """Le nom correspond-il à une plateforme de mise en relation connue ?

    Même garde de frontière de mot que ``looks_like_recruiter`` : « Maltese
    Consulting » ne doit pas matcher « Malt ».
    """
    folded = _fold(name)
    if not folded:
        return False
    return any(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", folded) for term in _KNOWN_PLATFORMS)


def looks_like_data_source(name: object) -> bool:
    """Le nom est-il celui d'un fournisseur de données d'entreprise connu ?

    Même garde de frontière de mot que ``looks_like_platform`` : « Hunter.io »
    matche, « Hunters Conseil » non. Sans nom ⇒ ``False`` : on n'écarte jamais
    un acteur sur un doute."""
    folded = _fold(name)
    if not folded:
        return False
    return any(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", folded) for term in _KNOWN_DATA_SOURCES)


def _name_has_term(name: object, terms: tuple[str, ...]) -> bool:
    folded = _fold(name).replace("’", "'")
    return bool(folded) and any(re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", folded) for t in terms)


def looks_like_vms(name: object) -> bool:
    return _name_has_term(name, _KNOWN_VMS)


def looks_like_msp(name: object) -> bool:
    return _name_has_term(name, _KNOWN_MSP)


def looks_like_broker(name: object) -> bool:
    return _name_has_term(name, _BROKER_TERMS)


def is_intermediated_employer(*, name: object = None, naf: object = None) -> bool:
    """Cette offre est-elle publiée POUR QUELQU'UN D'AUTRE ?

    Couvre les deux intermédiaires du tome (cabinet de recrutement ET
    plateforme de mise en relation, #2265.4/#2265.9) : dans les deux cas,
    l'annonce ne nomme pas le client final. Le NAF fait foi quand il existe —
    mais SEULEMENT pour l'axe cabinet, le seul que le registre sait trancher ;
    aucun code NAF unique ne désigne une plateforme, donc le nom reste
    consulté pour cet axe même quand le NAF est résolu. Aucun signal ⇒
    ``False`` : on n'écarte pas un employeur sur un doute, on l'écarte sur une
    preuve.
    """
    if naf is not None and _naf_key(naf):
        if is_recruitment_naf(naf):
            return True
        return looks_like_platform(name)
    return looks_like_recruiter(name) or looks_like_platform(name)


#: Nom de la catégorie qu'``is_intermediated_employer`` a retenue — un premier
#: pas, réel et branché (contrairement à un enum de typologie posé sans
#: appelant), vers la typologie nommée que #2265.1 demande. Volontairement
#: étroit : seules les deux catégories que ce module sait PROUVER.
IntermediaryKind = Literal["cabinet_recrutement", "plateforme"]


def intermediary_kind(*, name: object = None, naf: object = None) -> IntermediaryKind | None:
    """Quelle catégorie d'intermédiaire, ou ``None`` si aucune ne matche.

    Le NAF (cabinet) est vérifié avant le nom : une preuve registre l'emporte
    sur une liste tenue à la main. Comme dans ``is_intermediated_employer``, un
    NAF résolu et non-cabinet laisse la plateforme (sans axe NAF) décidable
    par le nom.
    """
    if naf is not None and _naf_key(naf):
        if is_recruitment_naf(naf):
            return "cabinet_recrutement"
        return "plateforme" if looks_like_platform(name) else None
    if looks_like_recruiter(name):
        return "cabinet_recrutement"
    if looks_like_platform(name):
        return "plateforme"
    return None
