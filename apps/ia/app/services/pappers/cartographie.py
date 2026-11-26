"""Helpers around the Pappers ``/v2/entreprise/cartographie`` graph.

The cartographie endpoint returns node lists (companies, persons) and two edge
lists. The edges of ``liens_entreprises_entreprises`` are ORIENTED strings
``"{holder}-{held}"`` over the node ids (pattern ``e[0-9]+``): the Google
response this suite is built on carries ``"e3-e1"`` where ``e3`` is ALPHABET
HOLDINGS and ``e1`` GOOGLE FRANCE — the parent points at what it owns.

We use that direction to keep the account's OWN perimeter. Without it, the
subsidiary list was "every graph neighbour except the root", so analysing a
subsidiary dragged in its parent AND the parent's other children: the TF1
dossier listed BOUYGUES, BOUYGUES TELECOM and COLAS among its « entités
actionnables », none of which a seller approaching TF1 can do anything with.

The direction is read defensively: whenever it yields nothing usable — no edge,
malformed edges, unknown root, or a root that is a pure leaf — we fall back on
the companies REACHABLE PAR UN LIEN D'ENTREPRISE À ENTREPRISE, direction
ignorée. Une hypothèse fausse sur l'orientation ne peut donc pas faire
disparaître le graphe.

⚠️ CE QUE CE REPLI N'EST PLUS, et pourquoi. Il rendait « toutes les entreprises
du graphe sauf la racine ». Or la cartographie contient AUSSI les sociétés
atteintes par les autres mandats des PERSONNES du conseil. Sur un run réel
(SNCF, 11/08/2026), le dossier listait donc 83 « filiales » dont une marque de
prêt-à-porter, un réseau de coiffure et un maroquinier : des sociétés réelles,
reliées à SNCF par des administrateurs communs, et par rien d'autre.

Un administrateur partagé n'est pas un lien capitalistique. Le repli se limite
donc au sous-graphe ENTREPRISE→ENTREPRISE ; quand la racine n'y a aucune arête,
on rend une liste VIDE. Un périmètre vide est une réponse — un périmètre qui
contient Lacoste n'en est pas une, et c'est celui-là qu'un commercial montre à
son prospect.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict

from .models import CorporateGraph, GroupAffiliation, RelatedCompany

logger = logging.getLogger(__name__)

#: ``"e3-e1"`` — holder id, then held id. Anything else est ignoré (et compte
#: comme « pas de direction exploitable », ce qui déclenche le repli).
_EDGE_RE = re.compile(r"^\s*(e\d+)\s*-\s*(e\d+)\s*$")


def _edge_pair(edge: object) -> tuple[str, str] | None:
    """Lit une arête (détenteur, détenu), quelle que soit sa forme.

    ⚠️ Il y en a DEUX, et n'en lire qu'une a coûté cher. La chaîne ``"e3-e1"``
    est la forme sur laquelle ce module a été écrit ; une réponse réelle
    (SNCF, 11/08/2026) porte des PAIRES : ``["e2", "e1"]``. Le lecteur ne
    reconnaissait donc aucune arête, l'orientation n'était jamais lue, et le
    repli « tous les voisins » rendait 83 « filiales » — dont celles reliées à
    la racine par un simple administrateur commun.

    Rien n'est deviné au-delà de ces deux formes : ce qui n'est pas reconnu
    reste ignoré, et déclenche le repli.
    """
    if isinstance(edge, str):
        match = _EDGE_RE.match(edge)
        return (match.group(1), match.group(2)) if match else None
    if isinstance(edge, (list, tuple)) and len(edge) == 2:
        left, right = edge
        if isinstance(left, str) and isinstance(right, str):
            left, right = left.strip(), right.strip()
            if left and right and left != right:
                return (left, right)
    return None


def _children_by_parent(edges: list[object]) -> dict[str, list[str]]:
    children: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        pair = _edge_pair(edge)
        if pair:
            children[pair[0]].append(pair[1])
    return children


def _descendants(root_id: str, children: dict[str, list[str]]) -> set[str]:
    """Ids reachable from ``root_id`` by following ownership edges downwards."""
    seen: set[str] = set()
    stack = list(children.get(root_id, ()))
    while stack:
        node = stack.pop()
        if node in seen or node == root_id:
            continue
        seen.add(node)
        stack.extend(children.get(node, ()))
    return seen


def _linked_component(root_id: str, edges: list[object]) -> set[str]:
    """Ids reliés à la racine par des arêtes ENTREPRISE→ENTREPRISE, sans tenir
    compte du sens. C'est le repli : le lien capitalistique est certain, seule
    son orientation ne l'est pas."""
    neighbours: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        pair = _edge_pair(edge)
        if not pair:
            continue
        neighbours[pair[0]].add(pair[1])
        neighbours[pair[1]].add(pair[0])

    seen: set[str] = set()
    stack = list(neighbours.get(root_id, ()))
    while stack:
        node = stack.pop()
        if node in seen or node == root_id:
            continue
        seen.add(node)
        stack.extend(neighbours.get(node, ()))
    return seen


def extract_subsidiaries(graph: CorporateGraph, root_siren: str) -> list[RelatedCompany]:
    """Les sociétés que la racine POSSÈDE (directement ou non).

    Repli sur le sous-graphe entreprise→entreprise quand l'orientation n'est pas
    exploitable, puis sur une liste VIDE quand la racine n'y a aucune arête —
    voir la docstring du module : un administrateur partagé n'est pas un lien
    capitalistique.
    """
    others = [c for c in graph.companies if (c.siren or "") != root_siren]
    root = next((c for c in graph.companies if (c.siren or "") == root_siren), None)
    if root is None:
        # Racine absente du graphe : forme inattendue, on garde le comportement
        # historique plutôt que de faire disparaître un périmètre.
        return others

    children = _children_by_parent(graph.company_to_company_edges)
    owned = _descendants(root.id, children) if children else set()
    if owned:
        return [c for c in others if c.id in owned]

    # L'orientation n'a rien donné (racine feuille, ou notre hypothèse de sens
    # est fausse) : on garde les sociétés reliées par un lien d'entreprise à
    # entreprise, quel qu'en soit le sens. Le lien capitalistique est certain,
    # seule son orientation ne l'est pas.
    linked = _linked_component(root.id, graph.company_to_company_edges)
    if linked:
        return [c for c in others if c.id in linked]

    # Ici, aucune arête entreprise→entreprise n'a été exploitée. Deux cas, et
    # ils n'appellent PAS la même réponse.
    if graph.company_to_company_edges:
        # Des arêtes existent mais aucune n'est lisible : c'est un défaut de
        # lecture chez nous, pas une absence de lien. Ne pas punir le dossier.
        return others

    # Aucune arête entreprise→entreprise du tout : les sociétés du graphe ne
    # sont reliées à la racine que par des PERSONNES (mandats croisés). Un
    # administrateur partagé n'est pas un lien capitalistique.
    if others:
        logger.info(
            "Cartographie %s : %d sociétés ne sont reliées que par des personnes "
            "— périmètre rendu vide plutôt que faux",
            root_siren,
            len(others),
        )
    return []


def plausible_group_name(name: str | None) -> bool:
    """Un nom de société qu'on peut afficher comme tête de groupe : au moins deux caractères
    alphanumériques, pas un simple numéro. Le registre ne confirme pas le reste (voir le rapport #3917)."""
    text = (name or "").strip()
    alnum = [ch for ch in text if ch.isalnum()]
    return len(alnum) >= 2 and not all(ch.isdigit() for ch in alnum)


def extract_parent_companies(graph: CorporateGraph, root_siren: str) -> list[RelatedCompany]:
    """Les sociétés qui DÉTIENNENT la racine — le sens inverse de
    `extract_subsidiaries`, pour que #2086.25 (« groupe ou filiale ») puisse
    nommer les DEUX moitiés du fait, pas seulement le périmètre possédé.

    ⚠️ Volontairement PLUS STRICT que `extract_subsidiaries` : aucun repli sur
    le sous-graphe non orienté, aucun repli sur « racine absente du graphe ».
    Un parent deviné sur un lien dont le sens est incertain — ou sur un SIREN
    absent du graphe — serait un fait plus fort qu'une liste de filiales
    possédées (« cette société appartient à X » plutôt que « ces sociétés
    voisines ne sont peut-être pas ses filiales ») : direction illisible ou
    racine introuvable → liste vide, jamais un parent inventé.
    """
    root = next((c for c in graph.companies if (c.siren or "") == root_siren), None)
    if root is None:
        return []

    children = _children_by_parent(graph.company_to_company_edges)
    holder_ids = {holder for holder, held in children.items() if root.id in held}
    if not holder_ids:
        return []
    return [c for c in graph.companies if c.id in holder_ids and (c.siren or "").strip() and plausible_group_name(c.name)]


def extract_group_affiliation(graph: CorporateGraph, root_siren: str) -> GroupAffiliation | None:
    """#2165.24 / #2166.3 / #2165.16 — ``groupe`` quand la racine n'a aucun
    holder dans ce graphe et détient au moins une filiale ; ``filiale`` quand
    une chaîne de détention existe au-dessus d'elle, auquel cas on remonte
    jusqu'à la société qui n'a elle-même aucun holder (la TÊTE de groupe, pas
    seulement le holder direct — une petite-fille pointe sur la mère, pas sur
    sa mère intermédiaire).

    Même repli que `extract_subsidiaries` sur ce même graphe : aucune arête
    entreprise→entreprise exploitable (ou racine absente) rend `None`, jamais
    un rôle deviné.
    """
    root = next((c for c in graph.companies if (c.siren or "") == root_siren), None)
    if root is None:
        return None

    children = _children_by_parent(graph.company_to_company_edges)
    if not children:
        return None

    # Table inverse de `children` : qui détient chaque société.
    holder_of: dict[str, str] = {}
    holders_of: dict[str, set[str]] = defaultdict(set)
    for holder, helds in children.items():
        for held in helds:
            holder_of.setdefault(held, holder)
            holders_of[held].add(holder)

    by_id = {c.id: c for c in graph.companies}

    if root.id not in holder_of:
        # Rien ne détient la racine dans ce graphe. Elle n'est une « tête de
        # groupe » que si elle détient elle-même au moins une filiale ici —
        # sinon c'est une société isolée du point de vue capitalistique, pas
        # une tête de groupe sans enfant.
        if root.id in children:
            return GroupAffiliation(role="groupe", head_siren=root_siren, head_name=root.name)
        return None

    # Remonte la chaîne de détention. Le plafond protège d'un cycle malformé
    # plutôt que de boucler indéfiniment sur un graphe corrompu.
    current = root.id
    seen: set[str] = set()
    for _ in range(len(graph.companies) + 1):
        parent = holder_of.get(current)
        if parent is None or parent in seen:
            break
        # R17 15/10 (#3917) — plusieurs détenteurs distincts : le graphe ne dit pas LEQUEL est la tête de
        # groupe (« Filiale de ETG » pour Renault SAS venait du premier lu). Pas de tête devinée : aucune.
        if len(holders_of[current]) > 1:
            return None
        seen.add(parent)
        current = parent

    head = by_id.get(current)
    head_siren = head.siren if head else None
    if not head_siren or not plausible_group_name(head.name if head else None):
        return None
    return GroupAffiliation(role="filiale", head_siren=head_siren, head_name=head.name if head else None)
