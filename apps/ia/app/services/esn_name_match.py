"""Reconnaître une ESN du référentiel dans un nom d'employeur publié.

## Le défaut que ce module corrige

La reconnaissance était une **égalité exacte** de nom normalisé
(``if _normalized(name) in esn_names``). Or les deux côtés ne parlent pas la
même langue :

* le référentiel porte des noms **COMMERCIAUX** — « Capgemini », « Sopra
  Steria », « SII », « Open » (477 noms, et rien d'autre : ni SIREN, ni ville) ;
* France Travail publie des **RAISONS SOCIALES** — « CAPGEMINI TECHNOLOGY
  SERVICES », « SOPRA STERIA GROUP », « SII SUD OUEST », « ALTEN SIR ».

Aucune ne rencontrait l'autre. Le bloc « qui déborde » de l'écran Territoire
restait donc vide, et un territoire sans concurrence RECONNUE se lit comme un
territoire sans concurrence. C'est le retour du 31/08 : « parfois ça sort juste
pas d'ESN ».

## La règle, et pourquoi elle est étroite

    le nom du référentiel est un PRÉFIXE DE JETONS du nom publié,
    ET tous les jetons restants appartiennent à un vocabulaire FERMÉ.

Ni sous-chaîne, ni distance d'édition, ni « ça se ressemble ». La raison est
asymétrique : **un faux positif range un client final parmi les concurrents**,
ce qui oriente une décision commerciale vers le mauvais interlocuteur ; un faux
négatif ne fait que taire une ligne. Entre les deux, on choisit le silence.

Trois conséquences assumées, chacune tenue par un test qui dit NON :

* « OPEN CLASSROOMS » ne matche pas « Open » — `classrooms` n'est pas un
  suffixe connu ;
* « ALTENTIVE » ne matche pas « Alten » — la frontière est le JETON, pas le
  caractère ;
* « STUDIO ALTEN » ne matche pas — un PRÉFIXE, pas une sous-chaîne.

## Ce que la fonction rend, et pourquoi

La **clé du référentiel** (le nom normalisé), jamais le nom publié. C'est ce qui
permet à l'API de retrouver les faits de l'ESN (`factsByName` lit
`normalized_name`) et de regrouper « SII » et « SII SUD OUEST » sous UNE entité
au lieu de deux lignes qui se partagent ses offres.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable

#: Les jetons qui peuvent SUIVRE un nom d'ESN sans en changer l'identité.
#:
#: Fermé et écrit à la main, comme `TECH_TERMS` de `territory_overview` et pour
#: la même raison : une règle « intelligente » sur des raisons sociales
#: françaises rapprocherait n'importe quoi de n'importe quoi.
#:
#: Trois familles, et rien d'autre :
#:  1. formes juridiques et têtes de groupe ;
#:  2. qualificatifs de métier (une filiale technique porte le nom du groupe) ;
#:  3. qualificatifs géographiques (les agences régionales, très fréquentes
#:     chez France Travail : « SII SUD OUEST », « ALTEN GRAND EST »).
KNOWN_SUFFIX_TOKENS: frozenset[str] = frozenset(
    {
        # ── 1. formes juridiques & groupe ──────────────────────────────────
        "sa", "sas", "sasu", "sarl", "eurl", "se", "snc", "scop", "gie",
        "group", "groupe", "holding", "holdings", "compagnie", "cie",
        "et", "associes", "partners", "sir",
        # ── 2. métier ──────────────────────────────────────────────────────
        "technology", "technologies", "technologie", "tech",
        "services", "service", "solutions", "solution",
        "consulting", "conseil", "consultants",
        "engineering", "ingenierie", "systems", "systemes", "system",
        "informatique", "digital", "software", "it", "data", "cloud",
        "infrastructures", "infrastructure", "industrie", "industries",
        "telecom", "telecoms", "energy", "energie", "transport", "finance",
        # ── 3. géographie ──────────────────────────────────────────────────
        "france", "international", "europe", "monde",
        "nord", "sud", "est", "ouest", "centre", "grand",
        "ile", "de", "du", "des", "la", "le", "les",
        "paris", "lyon", "marseille", "toulouse", "bordeaux", "nantes",
        "lille", "rennes", "strasbourg", "nice", "montpellier", "grenoble",
        "rhone", "alpes", "loire", "atlantique", "mediterranee", "aquitaine",
        "bretagne", "normandie", "occitanie", "provence", "auvergne",
        "hauts", "pays", "region", "regions", "agence",
    }
)


def normalize(name: str | None) -> str:
    """Même normalisation que ``EsnDirectoryService.normalize`` côté API.

    Les deux côtés DOIVENT produire la même chaîne : c'est ce qui permet de
    comparer un nom du référentiel à un nom publié, et de retrouver les faits
    d'une ESN par sa clé. Une divergence ici ne casserait rien bruyamment —
    elle ferait simplement que plus rien ne se rencontre.
    """
    stripped = "".join(
        c for c in unicodedata.normalize("NFD", str(name or "")) if unicodedata.category(c) != "Mn"
    )
    return " ".join("".join(ch if ch.isalnum() else " " for ch in stripped.lower()).split())


#: Index d'appariement : jetons du nom du référentiel → sa clé normalisée.
EsnIndex = dict[tuple[str, ...], str]


def build_esn_index(known_names: Iterable[str | None]) -> EsnIndex:
    """Prépare le référentiel pour l'appariement.

    Les noms arrivent DÉJÀ normalisés de l'API (``knownNames`` lit
    ``normalized_name``), mais on renormalise : ce module doit rester juste
    qu'on l'appelle avec des clés ou avec des libellés bruts.
    """
    index: EsnIndex = {}
    for raw in known_names:
        key = normalize(raw)
        if not key:
            continue
        index[tuple(key.split())] = key
    return index


def match_esn(employer_name: str | None, index: EsnIndex) -> str | None:
    """La clé de l'ESN reconnue dans ce nom d'employeur, ou ``None``.

    Le préfixe le plus LONG gagne : « sopra » et « sopra steria » peuvent
    coexister au référentiel, et rendre « sopra » pour « SOPRA STERIA GROUP »
    rattacherait ses offres à la mauvaise entité.
    """
    tokens = tuple(normalize(employer_name).split())
    if not tokens or not index:
        return None

    # Du plus long au plus court : le premier préfixe valide est le bon.
    for length in range(len(tokens), 0, -1):
        key = index.get(tokens[:length])
        if key is None:
            continue
        rest = tokens[length:]
        # Tous les jetons restants doivent être des suffixes CONNUS. Un seul
        # inconnu (« classrooms ») suffit à refuser — c'est là que le module
        # dit non, et c'est sa seule raison d'exister.
        if all(token in KNOWN_SUFFIX_TOKENS for token in rest):
            return key
    return None
