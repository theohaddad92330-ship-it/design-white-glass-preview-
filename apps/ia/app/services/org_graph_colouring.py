"""Le PLANCHER DE GRIS de l'organigramme — mesuré là où le graphe est ASSEMBLÉ.

`T5.md:798-802` (§27.2 « La règle qui protège l'organigramme ») :

    « Un organigramme où tout est coloré est un organigramme inventé. »
    Contrainte dure : sur un compte sans enrichissement lancé, AU MOINS 60 % des
    nœuds sont gris. SI LE GÉNÉRATEUR COLORE PLUS, IL INVENTE.

C'est un PLANCHER SUR LE GÉNÉRATEUR, pas une étiquette pour le lecteur : il
répond à « est-ce que ce qu'on produit invente ? », pas à « comment le dire à
l'écran ». Le dépôt en avait fait l'inverse — `MOSTLY_INFERRED_RATIO` comptait
des ARÊTES inférées, au dénominateur de tous les liens hiérarchiques, pour poser
une mention côté web. Le nombre avait survécu, la règle non ; et un graphe dont
100 % des liens étaient officiels pouvait colorier 100 % de ses personnes sans
qu'une seule phrase de l'écran ne s'en émeuve.

Trois définitions, et ce sont elles qui font la règle :

  · **GRIS** = le nœud ne porte AUCUN rôle de décision, ou seulement `unknown`.
    C'est « je ne sais pas qui décide », dit et assumé.
  · **LE DÉNOMINATEUR** = les personnes que l'enrichissement n'a PAS touchées.
    « Sans enrichissement lancé » est dans la phrase de la source : une personne
    enrichie a le droit d'être colorée, c'est le travail qu'on a payé.
  · **ABSENCE DE MESURE** = aucune personne non enrichie. La fonction rend alors
    ``None``, jamais un « 0 % » : la question ne se pose pas, elle n'a pas une
    réponse nulle. (« Non mesuré » n'est jamais « mesuré à zéro ».)

Pur : aucun réseau, aucun modèle, aucun coût. On compte des lignes déjà en main.
Tenu par ``tests/test_org_grey_floor.py``.
"""

from __future__ import annotations

from typing import Any

# Le plancher de la source. UN seul endroit : le graphe le transporte
# (`orgColouring.floor`) pour que le lecteur n'ait pas à en garder une copie —
# deux réglages d'une même règle divergent, c'est la loi 1 du tome 7.
GREY_ROLE_FLOOR = 0.6

# Les statuts d'identité qui signent un enrichissement RÉELLEMENT lancé sur la
# personne (`orgIdentityStatusSchema`). Les autres — `seed`, `verified_identity`,
# `classified`, `historical` — sont des états de découverte : le compte n'a pas
# payé pour eux, ils entrent donc dans le dénominateur du plancher.
ENRICHED_STATUSES = frozenset({"enriched", "actionable"})


def is_grey(person: dict[str, Any]) -> bool:
    """Le nœud est-il GRIS, c'est-à-dire sans rôle de décision affirmé ?

    Les deux formes de l'absence comptent : la liste vide (les graphes produits
    avant que le rôle inconnu soit NOMMÉ) et le rôle `unknown` explicite, que
    l'assembleur émet désormais — « ce qui n'a pas pu être évalué est NOMMÉ ».
    """
    roles = person.get("decisionRoles") or []
    return not [role for role in roles if role and role != "unknown"]


def measure_role_colouring(people: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    """La part de gris du graphe, ou ``None`` s'il n'y a rien à mesurer.

    Rend le bloc exact que le contrat attend (`orgColouringSchema`) : les deux
    COMPTES et le plancher appliqué. La PART, elle, se dérive — à un seul endroit,
    côté lecture (`readOrgColouring`) — plutôt que d'être stockée : un ratio figé
    dans un graphe mentirait dès la première correction humaine qui en élague un.
    """
    unenriched = [p for p in people or [] if str(p.get("identityStatus") or "") not in ENRICHED_STATUSES]
    if not unenriched:
        return None
    return {
        "unenriched": len(unenriched),
        "grey": sum(1 for person in unenriched if is_grey(person)),
        "floor": GREY_ROLE_FLOOR,
    }
