"""Le retournement NAF — une source d'offres, deux marchés (tome 4 §20.1).

La même requête d'offres d'emploi sur un département dit deux choses opposées
selon qui l'a publiée : une offre publiée par une entreprise NON-ESN désigne un
CLIENT FINAL qui recrute (prospection directe), la même offre publiée par une
ESN désigne une ESN qui DÉBORDE (prospection partenaire). Le tome appelle ce
retournement « le meilleur rapport valeur/effort » du chantier.

⚠️ Le tome le croit gratuit — « le retournement coûte un filtre ». C'est faux
dans ce dépôt, et il faut le savoir avant de lire la suite : **aucune source
d'offres ne rend de SIREN ni de code NAF**. France Travail l'écrit en toutes
lettres (`france_travail.py`, `"siren": None`), et l'APEC, Greenhouse et Lever
ne rendent qu'un nom d'employeur en texte libre. Le NAF n'existe qu'APRÈS la
résolution de l'employeur au registre — résolution que le dépôt fait déjà pour
d'autres raisons. Le filtre s'applique donc en aval, jamais à la source.

Ce module ne porte que la DÉCISION de classement, en un seul endroit : le tome
demande explicitement de ne pas recopier la liste des préfixes dans chaque
source, et le dépôt en portait déjà trois versions divergentes.
"""

from __future__ import annotations

from typing import Literal

#: Le type d'entité qu'une requête territoriale veut lire.
EntityType = Literal["client", "esn", "all"]
ENTITY_TYPES: tuple[EntityType, ...] = ("client", "esn", "all")

#: Les préfixes NAF qui désignent une ESN. `62.0x` est le cœur (programmation,
#: conseil, infogérance) ; `70.22Z` (conseil de gestion) est le code sous lequel
#: beaucoup d'ESN sont immatriculées — c'est le second préfixe que le ticket
#: nomme. Ils sont comparés SANS point ni casse : le registre écrit « 6202A »,
#: le tome écrit « 62.0 », et une comparaison littérale raterait l'un des deux.
ESN_NAF_PREFIXES: tuple[str, ...] = ("620", "7022")

#: Les codes NAF COMPLETS d'une ESN — ce que le registre accepte réellement.
#: `activite_principale` refuse un préfixe (« 62.0 » → 400) et n'accepte qu'une
#: liste de codes exacts. Les préfixes ci-dessus servent au CLASSEMENT d'un code
#: déjà connu ; ceux-ci servent à INTERROGER. Confondre les deux rend une
#: « source indisponible » sur un registre parfaitement disponible.
ESN_NAF_CODES: tuple[str, ...] = ("62.01Z", "62.02A", "62.02B", "62.03Z", "62.09Z", "70.22Z")

#: Les préfixes AMBIGUS : ils apparaissent des DEUX côtés. `70.22Z` couvre
#: autant d'ESN que de cabinets de conseil en stratégie qui n'ont rien
#: d'informatique, et `62.09Z` (« autres activités informatiques ») sert de
#: fourre-tout à des entreprises qui ne vendent pas de prestation. Les écarter
#: en silence d'un des deux marchés perdrait de vraies cibles ; les ranger d'un
#: seul côté en inventerait. Ils sont donc rendus dans les deux, marqués.
AMBIGUOUS_NAF_PREFIXES: tuple[str, ...] = ("7022", "6209")


def _digits(naf_code: object) -> str:
    return "".join(ch for ch in str(naf_code or "") if ch.isdigit())


def is_esn_naf_code(naf_code: object) -> bool | None:
    """``True`` si le code désigne une ESN, ``False`` sinon, ``None`` si absent.

    Le tri-état est ce qui permet de ne jamais conclure d'un silence : un code
    absent n'est PAS « ce n'est pas une ESN », et l'appelant doit choisir quoi
    faire de cette ignorance plutôt que de la voir tranchée à sa place.
    """
    digits = _digits(naf_code)
    if len(digits) < 3:
        return None
    return digits.startswith(ESN_NAF_PREFIXES)


def is_ambiguous_naf(naf_code: object) -> bool:
    """Le code peut désigner une ESN comme un cabinet qui n'en est pas une."""
    digits = _digits(naf_code)
    return bool(digits) and digits.startswith(AMBIGUOUS_NAF_PREFIXES)


def matches_entity_type(naf_code: object, entity_type: EntityType) -> bool:
    """Cette entité doit-elle apparaître dans une lecture `entity_type` ?

    Trois règles, dans cet ordre :

    1. `all` garde tout — y compris ce dont on ignore le NAF.
    2. Un NAF **inconnu** est gardé des deux côtés. Le jeter du marché client
       parce qu'on n'a pas pu résoudre son employeur ferait disparaître de
       vraies cibles pour une raison purement technique ; le jeter du marché
       ESN pour la même raison masquerait une ESN qui recrute.
    3. Un NAF **ambigu** apparaît des deux côtés, avec son drapeau.
    """
    if entity_type == "all":
        return True
    esn = is_esn_naf_code(naf_code)
    if esn is None or is_ambiguous_naf(naf_code):
        return True
    return esn if entity_type == "esn" else not esn


def entity_type_flags(naf_code: object) -> dict[str, object]:
    """Ce qu'une ligne porte pour être lisible : sa nature, et son doute.

    `nafAmbiguous` n'est pas un détail d'affichage : c'est ce qui permet à
    l'écran de dire « celle-ci peut ne pas en être une » plutôt que de laisser
    l'utilisateur découvrir en appelant.
    """
    return {
        "isEsn": is_esn_naf_code(naf_code),
        "nafAmbiguous": is_ambiguous_naf(naf_code),
    }
