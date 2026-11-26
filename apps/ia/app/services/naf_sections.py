"""Le secteur d'écran ↔ la section NAF — UNE dérivation, deux lecteurs.

## Pourquoi ce module existe

La table `secteur → section NAF` vivait en privé dans `routers/discover.py`,
sous le nom `_SECTOR_TO_NAF_SECTION`. Conséquence mesurée : le mode **Signaux**
de Découvrir affichait les mêmes pastilles de secteur que le mode Registre, et
`sector` n'y était lu **nulle part** — zéro occurrence dans
`routers/discover_signals.py`. L'utilisateur cochait « Industrie » et il ne se
passait rien, sans une note, sans une entrée `degraded` : le critère n'était
même pas envoyé au serveur.

Un réglage vit à un seul endroit (loi 1 du tome 7). Une dérivation aussi : deux
tables recopiées divergent, et celle qu'on oublie de mettre à jour est toujours
celle du chemin le moins regardé.

## Le choix qui compte : un NAF inconnu est ÉCARTÉ, pas gardé

Quand un secteur EST demandé, une ligne dont on ne sait pas lire le code NAF ne
peut pas être affirmée « de ce secteur ». La garder salirait la liste avec
exactement ce que l'utilisateur a exclu ; l'écarter en silence lui cacherait
qu'on a jeté des candidats. Donc : **écartée, et COMPTÉE** — l'appelant expose
le nombre, comme il le fait déjà pour le filtre par type d'entité.

Le cas symétrique est traité à l'inverse, et c'est délibéré : un **secteur**
absent de la table ne filtre **rien** (et {@link unknown_sectors} le nomme).
Un libellé d'écran ajouté sans son entrée ici viderait sinon la liste en
silence — le pire des deux échecs possibles.
"""

from __future__ import annotations

#: Les secteurs proposés à l'écran → leur section NAF (nomenclature INSEE).
#:
#: La section est plus LARGE que le libellé d'écran (« IT » = toute la section J,
#: information et communication) — c'est exact et assumé : c'est la maille que
#: le registre gouv.fr sait filtrer (`section_activite_principale`).
SECTOR_TO_NAF_SECTION: dict[str, str] = {
    "it": "J",  # Information et communication
    "telecom": "J",
    "finance": "K",  # Activités financières et d'assurance
    "energy": "D",  # Production et distribution d'électricité, gaz
    "industry": "C",  # Industrie manufacturière
    "health": "Q",  # Santé humaine et action sociale
    "retail": "G",  # Commerce
    "transport": "H",  # Transports et entreposage
    "construction": "F",  # Construction
    "public": "O",  # Administration publique
}

#: #3181.2 (épopée #3247) — section NAF → GROUPES du vocabulaire fermé des secteurs d'application
#: (`packages/contracts/.../application-sectors.ts`, `APPLICATION_SECTOR_GROUPS`). Sert à lire « ce
#: candidat est dans un secteur où l'espace possède une preuve ». Une section sans entrée ici (ou
#: un NAF illisible) ne dit RIEN — jamais un groupe deviné. L'industrie manufacturière (C) recouvre
#: deux groupes (fabrication, procédés).
NAF_SECTION_TO_APPLICATION_GROUPS: dict[str, tuple[str, ...]] = {
    "J": ("tech",),
    "K": ("finance",),
    "D": ("energie",),
    "C": ("industrie", "process"),
    "Q": ("sante",),
    "G": ("commerce",),
    "H": ("transport",),
    "F": ("construction",),
    "O": ("public",),
}


#: Division NAF (les deux premiers chiffres) → section. Bornes INSEE, INCLUSIVES.
#:
#: Écrite plutôt que dérivée d'un préfixe : les sections ne suivent aucune règle
#: arithmétique (C couvre 10→33, D une seule division, T deux). Un `//` sur le
#: numéro aurait marché sur les trois cas qu'on aurait testés.
_DIVISION_RANGES: tuple[tuple[int, int, str], ...] = (
    (1, 3, "A"),    # Agriculture, sylviculture et pêche
    (5, 9, "B"),    # Industries extractives
    (10, 33, "C"),  # Industrie manufacturière
    (35, 35, "D"),  # Électricité, gaz, vapeur
    (36, 39, "E"),  # Eau, assainissement, déchets
    (41, 43, "F"),  # Construction
    (45, 47, "G"),  # Commerce, réparation d'automobiles
    (49, 53, "H"),  # Transports et entreposage
    (55, 56, "I"),  # Hébergement et restauration
    (58, 63, "J"),  # Information et communication
    (64, 66, "K"),  # Activités financières et d'assurance
    (68, 68, "L"),  # Activités immobilières
    (69, 75, "M"),  # Activités spécialisées, scientifiques et techniques
    (77, 82, "N"),  # Activités de services administratifs et de soutien
    (84, 84, "O"),  # Administration publique
    (85, 85, "P"),  # Enseignement
    (86, 88, "Q"),  # Santé humaine et action sociale
    (90, 93, "R"),  # Arts, spectacles et activités récréatives
    (94, 96, "S"),  # Autres activités de services
    (97, 98, "T"),  # Activités des ménages en tant qu'employeurs
    (99, 99, "U"),  # Activités extra-territoriales
)


def naf_division_of(naf_code: str | None) -> int | None:
    """La division NAF (deux premiers chiffres), ou ``None`` si le code est illisible — jamais devinée."""
    compact = "".join(ch for ch in str(naf_code or "") if ch.isalnum())
    return int(compact[:2]) if len(compact) >= 2 and compact[:2].isdigit() else None


def naf_section_of(naf_code: str | None) -> str | None:
    """La section NAF d'un code d'activité, ou ``None`` quand il est illisible.

    Accepte les trois formes que les sources publient — ``62.02A``, ``6202A``,
    ``62``. ``None`` n'est JAMAIS une section devinée : « je ne sais pas lire ce
    code » et « ce code n'est d'aucun secteur » ne mènent pas à la même décision.

    ⚠️ La division est lue sur les DEUX PREMIERS caractères, qui doivent être des
    chiffres — on ne récolte pas les chiffres où qu'ils soient. Un ``ZZ.99Z``
    malformé rendrait sinon ``U`` (activités extra-territoriales) en récupérant
    le ``99`` de la sous-classe : une section inventée à partir d'un code
    illisible, exactement ce que ce module refuse de faire.
    """
    compact = "".join(ch for ch in str(naf_code or "") if ch.isalnum())
    if len(compact) < 2 or not compact[:2].isdigit():
        return None
    division = int(compact[:2])
    for low, high, section in _DIVISION_RANGES:
        if low <= division <= high:
            return section
    return None


def requested_sectors(sectors: list[str] | tuple[str, ...] | None) -> list[str]:
    """Les secteurs RÉELLEMENT demandés — normalisés, sans ``all`` ni doublons.

    « Tous secteurs » n'est pas une contrainte : le laisser passer ferait d'une
    recherche non restreinte un filtre qui n'a de correspondance nulle part.
    Même règle que ``_crossed_sectors`` côté registre.

    Publique, et c'est délibéré : les routeurs RENDENT ce résultat dans leur
    ``query`` pour que l'écran puisse vérifier ce qui a été appliqué. Normaliser
    une seconde fois côté appelant ferait diverger ce qui est filtré de ce qui
    est annoncé.
    """
    kept: list[str] = []
    for raw in sectors or ():
        sector = str(raw or "").strip().lower()
        if not sector or sector == "all" or sector in kept:
            continue
        kept.append(sector)
    return kept


def unknown_sectors(sectors: list[str] | tuple[str, ...] | None) -> list[str]:
    """Les secteurs demandés que la table ne connaît pas — nommés, jamais avalés.

    Ils ne filtrent rien (voir le module) ; les rendre permet à l'appelant de
    le DIRE plutôt que de laisser croire que le critère a été appliqué.
    """
    return [s for s in requested_sectors(sectors) if s not in SECTOR_TO_NAF_SECTION]


def matches_sectors(naf_code: str | None, sectors: list[str] | tuple[str, ...] | None) -> bool:
    """Cette entreprise appartient-elle à l'un des secteurs demandés ?

    Aucun secteur demandé → ``True`` : on ne retire rien d'une recherche qu'on
    n'a pas restreinte. Secteurs demandés mais AUCUN connu de la table →
    ``True`` également, pour la raison écrite en tête de module.
    """
    wanted = {SECTOR_TO_NAF_SECTION[s] for s in requested_sectors(sectors) if s in SECTOR_TO_NAF_SECTION}
    if not wanted:
        return True
    section = naf_section_of(naf_code)
    # `section is None` ⇒ code illisible ⇒ écartée. Voir le module : c'est le
    # seul verdict honnête quand un secteur a été explicitement demandé.
    return section in wanted


def application_groups_of_naf(naf_code: str | None) -> tuple[str, ...]:
    """Les groupes de secteurs d'application d'un code NAF — vide quand il est illisible ou hors table."""
    section = naf_section_of(naf_code)
    return NAF_SECTION_TO_APPLICATION_GROUPS.get(section or "", ())

