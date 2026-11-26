"""Conseil de qualification d'un compte candidat (addendum final p33-40).

    « Le registre fournit un univers de candidats, jamais une liste finale. »

L'écran Découvrir renvoyait des résultats JURIDIQUEMENT VRAIS et
COMMERCIALEMENT ABSURDES : « TURGOT LIFE », « BONILLA CHRISTOPHE », « INDIVISION
DEGREMONT », « PAULOV JULIETTE » — des personnes physiques, des indivisions et
des coquilles à zéro salarié, présentées à un commercial d'ESN comme des comptes
à conquérir. Le registre répondait exactement à la question posée ; c'est la
question qui était incomplète.

Ce module ajoute la question manquante, AVANT le score : *cette ligne représente-
t-elle une organisation à laquelle une ESN peut vendre ?* Il rend un verdict
parmi trois, et une raison.

**Il est entièrement déterministe.** Pas de modèle, pas de réseau, pas d'aléa.
Le rapport parle d'un « conseil multi-agents » ; sept LLM pour décider qu'une
indivision n'achète pas de prestation informatique serait coûteux, lent et moins
fiable qu'une table de catégories juridiques. Le modèle garde ce qu'il fait
mieux que nous — l'angle commercial — et la qualification redevient une règle
qu'on peut lire, tester et expliquer à un utilisateur qui conteste une exclusion.

**Il exclut peu, et seulement sur preuve** (arbitrage produit du 02/08). Un
verdict `excluded` demande un FAIT : la catégorie juridique dit « personne
physique », l'entité est administrativement cessée, le SIREN apparaît deux fois,
le département n'est pas celui qui a été demandé. Tout le reste — zéro salarié,
nom qui ressemble à une SCI, microstructure — part en `to_verify` : visible,
hors du haut de liste, jamais supprimé en silence. Rater une vraie petite cible
coûte plus cher que d'afficher une ligne douteuse étiquetée comme telle.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from typing import Any, Literal

from app.services.naf_sections import SECTOR_TO_NAF_SECTION, naf_section_of, requested_sectors
from app.services.sector_reading import ATTACHMENT_LABEL_FR, read_sector_attachment, sectors_asked_in_naf

#: Les trois verdicts du rapport (p40).
Verdict = Literal["recommended", "to_verify", "excluded"]


class ExclusionCode:
    """Raisons d'exclusion — des identifiants STABLES, jamais du texte libre.

    L'écran les traduit, l'utilisateur peut filtrer dessus, et la boucle
    « pourquoi exclu ? » (p41) peut compter les faux positifs par code. Un
    message français ici rendrait tout cela impossible.
    """

    NATURAL_PERSON = "natural_person"
    UNINCORPORATED = "unincorporated"
    CEASED = "ceased"
    DUPLICATE = "duplicate"
    OUT_OF_ZONE = "out_of_zone"
    # #2490.2 — le SECTEUR demandé est un fait dur, au même titre que la zone.
    # Une source qui ne sait pas l'honorer (Pappers et une liste de codes, une
    # section qu'il jette) rend une liste plus large ; la ligne qui n'en est pas
    # ne doit plus occuper le haut de la page.
    OUT_OF_SECTOR = "out_of_sector"


class VerifyCode:
    """Raisons de mise en « à vérifier ». Un doute, pas une preuve."""

    NO_EMPLOYEES = "no_employees"
    MICRO_STRUCTURE = "micro_structure"
    NON_OPERATING_VEHICLE = "non_operating_vehicle"
    PERSON_LIKE_NAME = "person_like_name"
    PUBLIC_OR_ASSOCIATION = "public_or_association"
    UNKNOWN_LEGAL_FORM = "unknown_legal_form"
    # #2490.8 — le mot-clé tapé n'est ni dans le nom ni dans l'activité : le
    # plein-texte du registre l'a trouvé sur un ÉTABLISSEMENT ou une adresse.
    # Mesuré le 17/09/2026 : « aéronautique Toulouse » rendait deux géants de la
    # restauration collective, atteints par le nom d'un site de restauration.
    KEYWORD_ELSEWHERE = "keyword_elsewhere"


# ── Catégories juridiques INSEE ──────────────────────────────────────────────
#
# Le premier chiffre de la catégorie juridique porte l'essentiel :
#   1 = entrepreneur individuel (une PERSONNE, pas une organisation)
#   2 = groupement sans personnalité morale (indivision, société en participation)
#   3 = personne morale de droit étranger
#   4 = personne morale de droit public soumise au droit commercial
#   5 = société commerciale (SAS, SARL, SA…) — le cas nominal
#   6 = autre personne morale immatriculée au RCS (SCI, GIE, SCPI…)
#   7 = personne morale de droit public administratif
#   8 = organisme privé spécialisé
#   9 = groupement de droit privé (associations)
#
# Seules les deux premières familles sont des EXCLUSIONS prouvées : dans un cas
# le registre dit qu'il s'agit d'une personne, dans l'autre qu'il n'y a pas de
# personne morale du tout. Les autres se jugent sur leur activité.

_NATURAL_PERSON_PREFIX = "1"
_UNINCORPORATED_PREFIX = "2"
_PUBLIC_PREFIXES = ("7",)
_ASSOCIATION_PREFIXES = ("9",)

#: Véhicules juridiques sans activité opérationnelle propre. Ce sont des
#: catégories complètes, pas des préfixes : une « autre personne morale RCS »
#: (6xxx) recouvre aussi bien un GIE informatique — parfaitement vendable —
#: qu'une SCI. Seuls les codes réellement immobiliers/patrimoniaux sont retenus.
_NON_OPERATING_CATEGORIES = {
    "6540",  # Société civile immobilière
    "6541",  # SCI de construction-vente
    "6521",  # Société civile de placement immobilier
    "6532",  # Société civile d'attribution
    "6533",  # Groupement agricole d'exploitation en commun
    "6534",  # Groupement foncier agricole
    "6536",  # Groupement forestier
    "6539",  # Société civile de moyens (structure de partage de charges)
}

#: Tranches INSEE sans aucun salarié. « NN » = non renseigné : c'est une absence
#: d'information, pas un zéro — les deux mènent au même doute mais pas au même
#: message, d'où deux codes distincts en aval.
_NO_EMPLOYEE_TRANCHES = {"00", "NN", ""}
#: 1 à 2 salariés (tranche 01) et 3 à 5 (tranche 02) : une microstructure peut
#: être une vraie cible (un cabinet de conseil de trois personnes achète), mais
#: elle mérite un coup d'œil avant d'occuper le haut d'une liste.
_MICRO_TRANCHES = {"01", "02"}


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _legal_category(company: Mapping[str, Any]) -> str:
    """Catégorie juridique INSEE, sous ses deux orthographes possibles."""
    return _text(company.get("legalCategory") or company.get("nature_juridique"))


def is_public_employer(legal_category: str | None) -> bool | None:
    """#2616.2 — l'employeur d'un signal de recrutement est-il un organisme
    PUBLIC (catégorie juridique INSEE 7xxx — État, collectivités territoriales,
    établissements publics administratifs) ?

    MÊME préfixe que la qualification de compte ci-dessus (`_PUBLIC_PREFIXES`)
    — une seule table de vérité (GA-26), jamais une seconde règle qui pourrait
    diverger. Une ASSOCIATION (9xxx) n'est PAS un employeur public au sens de
    cette question, même si `qualify_candidate` la range dans le même code
    `PUBLIC_OR_ASSOCIATION` (cycle d'achat différent du privé commercial, mais
    pas une administration) : les deux questions ne se répondent pas pareil.

    `None` quand la catégorie juridique n'est pas connue (SIREN non résolu,
    registre muet sur ce champ) — jamais deviné : « non mesuré » n'est pas
    « privé » (GA-18/GA-19).
    """
    category = _text(legal_category)
    if not category:
        return None
    return category[0] in _PUBLIC_PREFIXES


def is_end_client_legal_category(legal_category: str | None) -> bool | None:
    """#2284.17 (Company Graph) — la catégorie juridique dit-elle CLIENT FINAL :
    une administration, une collectivité, un établissement public (7xxx) ou une
    association (9xxx) ? Les deux achètent des prestations, ni l'une ni l'autre
    n'est une ESN — à la différence d'``is_public_employer`` ci-dessus, qui
    répond à une question plus étroite (« organisme PUBLIC ») et exclut donc
    l'association à dessein.

    MÊMES préfixes que `is_public_employer`/`qualify_candidate` (GA-26 — une
    seule table de vérité, jamais une seconde qui pourrait diverger).

    `None` quand la catégorie juridique n'est pas connue — jamais deviné : un
    ``end_client`` affirmé sur un silence resterait ``legal_entity``, le repli
    honnête (``entity_resolution._kind_of``).
    """
    category = _text(legal_category)
    if not category:
        return None
    return category[0] in _PUBLIC_PREFIXES or category[0] in _ASSOCIATION_PREFIXES


#: Un nom de personne physique dans le registre s'écrit « PRENOM NOM » ou
#: « NOM PRENOM » : deux ou trois mots, aucune forme sociale, aucun chiffre.
#: C'est un INDICE, jamais une preuve — « MARTIN DUPONT CONSEIL » existe, et une
#: entreprise peut légitimement porter le nom de son fondateur.
_COMPANY_FORM_TOKENS = {
    "sa", "sas", "sasu", "sarl", "eurl", "sci", "snc", "scop", "sem", "gie", "sca", "scs",
    "groupe", "group", "holding", "france", "international", "conseil", "consulting",
    "services", "solutions", "technologies", "tech", "digital", "industries", "industrie",
    "associes", "associés", "partners", "cie", "compagnie", "ets", "etablissements",
    "societe", "société", "agence", "cabinet", "bureau", "atelier", "studio", "lab",
    # #4626 — des mots de MÉTIER : « IA DATA » (mesuré en production le 26/10) n'est pas le nom d'une personne, et le
    # repère « nom de personne » de l'écran ne doit pas le dire de lui. Aucun de ces mots n'est un patronyme courant.
    "data", "ia", "ai", "cloud", "software", "systems", "systemes", "système", "systeme", "informatique", "network",
    "networks", "reseaux", "réseaux", "analytics", "cyber", "securite", "sécurité", "info", "web", "net", "soft",
    "logiciel", "logiciels", "numerique", "numérique", "ingenierie", "ingénierie", "engineering", "labs", "invest",
    "capital", "finance", "immobilier", "energie", "énergie", "energies", "transport", "transports", "formation",
    "recrutement", "interim", "intérim", "robotics", "robotique", "automation", "innovation", "conseils",
}


def _looks_like_a_person(name: str) -> bool:
    """Le nom ressemble-t-il à celui d'une personne plutôt qu'à une raison sociale ?"""
    tokens = [t for t in re.split(r"[\s\-']+", name.lower()) if t]
    if not 2 <= len(tokens) <= 3:
        return False
    if any(token in _COMPANY_FORM_TOKENS for token in tokens):
        return False
    # Un chiffre ou un point trahit une raison sociale (« 3D LAB », « M.G.P. »).
    return all(token.isalpha() for token in tokens)


def _fold_tokens(text: str) -> set[str]:
    """Mots d'un nom, sans casse ni accent — pour comparer « BEN HRIZ AYA » et « Aya BEN HRIZ »."""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return {t for t in re.split(r"[\s\-',]+", folded) if t}


def _is_nom_prenom_cased(name: str) -> bool:
    """« TAMANI Thinhinane » : un mot en capitales puis un mot en casse mixte — la forme que le registre donne à une
    personne. Une raison sociale en capitales (« AIR LIQUIDE ») n'a pas de mot en casse mixte."""
    words = [w for w in re.split(r"[\s]+", name.strip()) if w]
    has_upper = any(len(w) > 1 and w.isupper() for w in words)
    has_mixed = any(w[0].isupper() and w[1:].islower() for w in words if len(w) > 1)
    return has_upper and has_mixed


def _named_by_a_registry_person(name: str, company: Mapping[str, Any]) -> bool:
    """Le nom est celui d'un dirigeant physique du registre (un entrepreneur individuel s'y inscrit sous son nom)."""
    wanted = _fold_tokens(name)
    people = company.get("people")
    if not wanted or not isinstance(people, list):
        return False
    for person in people:
        value = (person.get("name") or {}).get("value") if isinstance(person, Mapping) else None
        if isinstance(value, str) and _fold_tokens(value) == wanted:
            return True
    return False


def _headcount_tranche(company: Mapping[str, Any]) -> str:
    """Code de tranche INSEE, quand la source l'a conservé."""
    return _text(company.get("headcountTranche")).upper()


#: Première tranche INSEE à 50 salariés et plus (21 = 50 à 99). Les codes sont
#: des nombres à deux chiffres croissants ; « NN » (non renseigné) n'en est pas.
_FIFTY_OR_MORE_TRANCHE = 21


def _declares_fifty_or_more(tranche: str) -> bool:
    return tranche.isdigit() and int(tranche) >= _FIFTY_OR_MORE_TRANCHE


def _declares_under_fifty(tranche: str) -> bool:
    """Tranche CONNUE et sous 50 salariés — « NN » ou vide n'est pas une tranche connue."""
    return tranche.isdigit() and int(tranche) < _FIFTY_OR_MORE_TRANCHE


def _requested_city(filters: Mapping[str, Any] | None) -> str:
    """#2490.11 — la ville RÉSOLUE en commune (nom CANONIQUE INSEE), jamais le
    texte libre tapé par l'utilisateur.

    Comparer un fold brut du texte tapé exclurait par erreur des sièges bien
    dans la zone dès que la graphie diffère (« Saint Étienne » tapé contre
    « SAINT-ETIENNE » rendu par le registre). La clé n'est posée par l'appelant
    (`routers/discover.py::_resolve_city_commune`) qu'après une résolution
    réussie — sinon la ligne n'est jamais exclue sur ce critère.
    """
    # #4627 — un RAYON demandé (25 km posés par défaut, 10 / 50 choisis) EST la zone : le registre ne rend que des sièges
    # dans ce cercle, et le siège d'une commune voisine y est dans la zone, pas « hors du périmètre ». Sans rayon, la
    # ville résolue ancre toujours le siège (Blagnac n'est pas Toulouse, #2490.11).
    if (filters or {}).get("radiusKm"):
        return ""
    return _fold((filters or {}).get("cityCommuneName"))


def _requested_departments(filters: Mapping[str, Any] | None) -> set[str]:
    raw = (filters or {}).get("departments")
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, Sequence):
        return set()
    return {_text(item) for item in raw if _text(item)}


def _naf_key(code: Any) -> str:
    """« 62.02A » / « 6202A » / « 62.02 a » → « 6202A »."""
    return re.sub(r"[^0-9A-Z]", "", _text(code).upper())


def _outside_requested_sector(company: Mapping[str, Any], filters: Mapping[str, Any] | None) -> bool:
    """#2490.2 — la ligne est-elle PROUVÉE hors du secteur demandé ?

    Deux formes de demande, et les deux sont des faits durs : la liste de codes
    NAF (ce que l'écran envoie depuis que chaque secteur porte ses codes) et les
    secteurs d'écran traduits en SECTION NAF. Même règle que pour la zone : un
    code NAF absent ou illisible ne prouve rien, la ligne n'est pas exclue.
    """
    filters = filters or {}
    candidate = _naf_key(company.get("nafCode"))
    section = naf_section_of(company.get("nafCode"))
    if not candidate or section is None:
        return False
    wanted_codes = {_naf_key(code) for code in _text(filters.get("nafCode")).split(",") if _naf_key(code)}
    if wanted_codes and candidate not in wanted_codes:
        # #4358.4 — le NAF flou se lit aussi par l'activité et le site : rattachée, la ligne n'est pas hors secteur.
        return _sector_attachment(company, filters) is None
    raw_sectors = [*(filters.get("sectors") or []), filters.get("sector") or ""]
    wanted_sections = {
        SECTOR_TO_NAF_SECTION[sector] for sector in requested_sectors(raw_sectors) if sector in SECTOR_TO_NAF_SECTION
    }
    return bool(wanted_sections) and section not in wanted_sections


def _sector_attachment(company: Mapping[str, Any], filters: Mapping[str, Any] | None) -> dict[str, str] | None:
    """#4358.4 — le rattachement NOMMÉ d'une ligne au secteur demandé par son activité ou son site."""
    asked = sectors_asked_in_naf(_text((filters or {}).get("nafCode")))
    attachment = read_sector_attachment(company, asked)
    if attachment is None:
        return None
    return {**attachment, "label": ATTACHMENT_LABEL_FR[attachment["via"]]}


def _fold(value: Any) -> str:
    """Minuscules, sans accents — « Aéronautique » et « AERONAUTIQUES » se lisent pareil."""
    decomposed = unicodedata.normalize("NFKD", _text(value).lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


#: Un mot-clé plus court ne discrimine rien (« de », « sas », « it »).
_KEYWORD_MIN_LENGTH = 4


def _words(value: Any) -> list[str]:
    return [word for word in re.split(r"[^0-9a-z]+", _fold(value)) if len(word) >= _KEYWORD_MIN_LENGTH]


def _keyword_elsewhere(company: Mapping[str, Any], filters: Mapping[str, Any] | None) -> bool:
    """#2490.8 — aucun mot du texte libre dans le NOM ni dans l'ACTIVITÉ.

    Un préfixe dans les deux sens suffit (« aéronautique » ↔ « AERONAUTIQUES »).
    Un texte libre sans mot exploitable (un SIREN, un sigle court) ne pose aucun
    doute : on ne sait pas ce qu'il cherchait, on ne le reproche à personne.

    Le mot qui est la VILLE du siège est un lieu, pas une activité : il ne suffit
    pas à dire que la ligne répond. Sinon « COMMUNE DE TOULOUSE » répondait à
    « aéronautique Toulouse » par son seul nom. Un texte libre qui n'est QUE ce
    lieu, lui, a trouvé exactement ce qu'il cherchait.
    """
    keywords = [word for word in _words((filters or {}).get("freetext")) if not word.isdigit()]
    city = set(_words(company.get("city")))
    activity_keywords = [word for word in keywords if word not in city]
    if not activity_keywords:
        return False
    identity = _words(company.get("name")) + _words(company.get("sector"))
    return not any(
        word.startswith(key) or key.startswith(word) for key in activity_keywords for word in identity
    )


def qualify_candidate(
    company: Mapping[str, Any],
    *,
    filters: Mapping[str, Any] | None = None,
    seen_sirens: Iterable[str] = (),
) -> dict[str, Any]:
    """Qualifie UN candidat. Rend le verdict, son code et une raison lisible.

    ``seen_sirens`` porte les SIREN déjà retenus dans la même réponse : c'est ce
    qui permet d'exclure le doublon SANS supposer que la source déduplique.
    """
    name = _text(company.get("name"))
    siren = _text(company.get("siren"))
    category = _legal_category(company)
    reasons: list[str] = []

    # ── Exclusions PROUVÉES ──────────────────────────────────────────────────

    if siren and siren in set(seen_sirens):
        return _verdict("excluded", ExclusionCode.DUPLICATE, "Déjà présent dans cette liste.")

    if company.get("ceased") is True:
        return _verdict("excluded", ExclusionCode.CEASED, "Entité administrativement cessée.")

    # #4626 — le registre affirme « entrepreneur individuel » (`individualEntrepreneur`), même sans catégorie juridique.
    if category.startswith(_NATURAL_PERSON_PREFIX) or company.get("individualEntrepreneur") is True:
        # Le registre lui-même dit « entrepreneur individuel » : ce n'est pas une
        # organisation, c'est quelqu'un. Aucun doute à lever.
        return _verdict("excluded", ExclusionCode.NATURAL_PERSON, "Personne physique, pas une organisation.")

    if category.startswith(_UNINCORPORATED_PREFIX):
        return _verdict(
            "excluded",
            ExclusionCode.UNINCORPORATED,
            "Groupement sans personnalité morale (indivision, société en participation).",
        )

    requested = _requested_departments(filters)
    department = _text(company.get("department"))
    if requested and department and department not in requested:
        # Le décalage est PROUVÉ : l'utilisateur a demandé un périmètre, la ligne
        # n'y est pas. Un département inconnu, lui, ne prouve rien — on ne l'exclut
        # pas, la donnée manque simplement.
        return _verdict("excluded", ExclusionCode.OUT_OF_ZONE, "Hors du périmètre géographique demandé.")

    requested_city = _requested_city(filters)
    city = _fold(company.get("city"))
    # #4429.2 — un compte ajouté par un PALIER de zone (25 km, département…) est hors de la ville par
    # construction : c'est le palier demandé, étiqueté, pas un écart à reprocher.
    widened = isinstance(company.get("zone"), Mapping) and company["zone"].get("tier") not in (None, "city")
    if requested_city and city and city != requested_city and not widened:
        # #2490.11 — la ville RÉSOLUE ancre le SIÈGE, pas seulement le
        # département : Blagnac et Toulouse partagent le 31, mais un
        # utilisateur qui tape « Toulouse » ne veut pas un siège à Blagnac.
        return _verdict("excluded", ExclusionCode.OUT_OF_ZONE, "Hors du périmètre géographique demandé.")

    # #4435.2 — un compte ajouté par un PALIER de secteur (voisin direct, groupe) est hors du secteur demandé
    # par construction : c'est le palier annoncé et étiqueté, pas un écart à reprocher (même règle que la zone).
    sector_widened = (company.get("widenedBy") or {}).get("axis") == "sector"
    if not sector_widened and _outside_requested_sector(company, filters):
        return _verdict("excluded", ExclusionCode.OUT_OF_SECTOR, "Hors du secteur demandé.")

    attachment = _sector_attachment(company, filters)

    # ── Doutes : visibles, mais pas en tête de liste ─────────────────────────

    if category in _NON_OPERATING_CATEGORIES:
        reasons.append(VerifyCode.NON_OPERATING_VEHICLE)

    if category and category[0] in _PUBLIC_PREFIXES:
        reasons.append(VerifyCode.PUBLIC_OR_ASSOCIATION)
    elif category and category[0] in _ASSOCIATION_PREFIXES:
        reasons.append(VerifyCode.PUBLIC_OR_ASSOCIATION)

    tranche = _headcount_tranche(company)
    if tranche in _NO_EMPLOYEE_TRANCHES:
        reasons.append(VerifyCode.NO_EMPLOYEES)
    elif tranche in _MICRO_TRANCHES:
        reasons.append(VerifyCode.MICRO_STRUCTURE)

    # #2490.10 — le nom n'est qu'un INDICE, et une structure qui DÉCLARE cinquante
    # salariés ou plus est une preuve d'organisation plus forte que lui. Sans
    # cette borne, « AIRBUS OPERATIONS » (10 000 salariés et plus) et « SAFRAN
    # POWER UNITS » sortaient « à vérifier » : deux mots, aucune forme sociale.
    # #4626 — et l'ABSENCE de tranche ne l'étaye pas : sans tranche connue sous 50, une raison sociale de deux ou trois
    # mots (« SPIE BATIGNOLLES », « AIR LIQUIDE ») ne se dit plus « nom de personne ».
    # #4626 (décision Louis 30/10/2026) — tranche ET forme juridique inconnues : « on ne sait rien » n'est pas « ce n'est
    # pas une personne ». Le badge s'affiche si un indice plus fin que « 2-3 mots » l'étaye : le nom est celui d'un
    # dirigeant physique du registre, ou la casse « NOM Prénom ». La ligne reste comptée.
    nothing_known = not category and not _declares_fifty_or_more(tranche) and not _declares_under_fifty(tranche)
    finer_clue = nothing_known and (_named_by_a_registry_person(name, company) or _is_nom_prenom_cased(name))
    if name and _looks_like_a_person(name) and (_declares_under_fifty(tranche) or finer_clue):
        reasons.append(VerifyCode.PERSON_LIKE_NAME)

    if not category:
        # Sans catégorie juridique, on n'a pas pu poser la question principale.
        # Le dire vaut mieux que de recommander à l'aveugle.
        reasons.append(VerifyCode.UNKNOWN_LEGAL_FORM)

    if _keyword_elsewhere(company, filters):
        reasons.append(VerifyCode.KEYWORD_ELSEWHERE)

    if reasons:
        return _verdict(
            "to_verify", reasons[0], _verify_message(reasons[0]), extra_codes=reasons[1:], sector_attachment=attachment
        )

    return _verdict("recommended", None, "Entité opérationnelle valide.", sector_attachment=attachment)


def _verdict(
    verdict: Verdict,
    code: str | None,
    message: str,
    *,
    extra_codes: Sequence[str] = (),
    sector_attachment: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    result = {
        "verdict": verdict,
        "code": code,
        "reason": message,
        # Les autres doutes ne sont pas perdus : l'écran peut tous les montrer,
        # et la boucle d'apprentissage peut les compter.
        "otherCodes": list(extra_codes),
    }
    if sector_attachment:
        result["sectorAttachment"] = dict(sector_attachment)
    return result


_VERIFY_MESSAGES = {
    VerifyCode.NO_EMPLOYEES: "Aucun salarié déclaré — vérifier qu'il s'agit d'une structure active.",
    VerifyCode.MICRO_STRUCTURE: "Très petite structure — vérifier le potentiel avant d'investir du temps.",
    VerifyCode.NON_OPERATING_VEHICLE: "Véhicule juridique (immobilier, patrimonial) sans activité opérationnelle propre.",
    VerifyCode.PERSON_LIKE_NAME: "Le nom ressemble à celui d'une personne — vérifier qu'il s'agit d'une société.",
    VerifyCode.PUBLIC_OR_ASSOCIATION: "Organisme public ou association — cycle d'achat différent.",
    VerifyCode.UNKNOWN_LEGAL_FORM: "Forme juridique inconnue — impossible de conclure sans vérification.",
    VerifyCode.KEYWORD_ELSEWHERE: "Le mot-clé n'est ni dans le nom ni dans l'activité — vérifier la correspondance.",
}


def _verify_message(code: str) -> str:
    return _VERIFY_MESSAGES.get(code, "À vérifier avant de démarcher.")


def qualify_all(
    companies: Sequence[Mapping[str, Any]],
    *,
    filters: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Qualifie une liste, en gérant les doublons dans l'ordre d'arrivée.

    Rend une entrée par candidat, dans le même ordre : l'appelant décide ensuite
    quoi afficher et comment trier. Ce module ne SUPPRIME rien — supprimer
    silencieusement est précisément ce qu'on reproche à l'état actuel, dans
    l'autre sens.
    """
    seen: set[str] = set()
    verdicts: list[dict[str, Any]] = []
    for company in companies:
        qualification = qualify_candidate(company, filters=filters, seen_sirens=seen)
        siren = _text(company.get("siren"))
        # Seules les lignes RETENUES alimentent la détection de doublon : sinon
        # une première ligne exclue « consommerait » le SIREN et ferait passer la
        # seconde pour un doublon alors qu'aucune n'a été montrée.
        if siren and qualification["verdict"] != "excluded":
            seen.add(siren)
        verdicts.append(qualification)
    return verdicts
