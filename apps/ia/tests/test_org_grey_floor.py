"""GA-187 — Le PLANCHER DE GRIS, la règle des 60 %, tenue là où le graphe est ASSEMBLÉ.

`T5.md:798-802` (§27.2 « La règle qui protège l'organigramme ») :

    « Un organigramme où tout est coloré est un organigramme inventé. »
    Contrainte dure : sur un compte sans enrichissement lancé, AU MOINS 60 % des
    nœuds sont gris. SI LE GÉNÉRATEUR COLORE PLUS, IL INVENTE.
    Test : sur les 7 comptes du golden set sans enrichissement, mesurer la part
    de gris. Sous 60 %, le prompt est trop généreux.

Repris en KPI (`T5.md:1040` — « Part de gris dans l'organigramme sans
enrichissement | ratio | > 60 % | le générateur invente-t-il ») et en règle dure
du ticket (`T5.md:1323` — « sans enrichissement lancé, au moins 60 % des nœuds
sont de rôle `inconnu`. Un test le vérifie sur les 7 comptes de référence »).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER GARDE, ET POURQUOI IL EST ICI ET PAS DANS `apps/web`
─────────────────────────────────────────────────────────────────────────────
Le dépôt portait le NOMBRE (`MOSTLY_INFERRED_RATIO = 0.6`) sans la RÈGLE : il
comptait des ARÊTES inférées, au DÉNOMINATEUR de tous les liens hiérarchiques,
et en tirait une ÉTIQUETTE posée au lecteur. La source, elle, compte des NŒUDS de
rôle `inconnu`, au dénominateur des personnes NON ENRICHIES, et en tire une
ACCUSATION contre le générateur. Un écran ne peut pas réparer un générateur ;
il ne peut que répéter ce qu'on lui donne. La mesure vit donc ici.

Mesuré AVANT ce chantier sur les graphes de référence : **0 % de gris**
(TF1 0/2 non enrichis, PME 200 0/1, deux ESN non mesurable). Cause racine :
`bellum_contacts.py:108` n'offre au modèle AUCUNE valeur « inconnu » —
« economic | technical | user | champion | procurement | influencer | blocker » —
et l'assembleur reprenait ce rôle tel quel. 100 % des nœuds étaient coloriés
d'un rôle que personne n'avait observé.

Ce que ce fichier tient donc, dans cet ordre :

  1. **La règle mécanique** — aucun nœud ne porte un rôle de décision qu'aucune
     règle NOMMÉE ne justifie. C'est « une preuve d'identité ne prouve jamais une
     relation » posé sur l'axe RÔLE : le titre prouve le titre, pas le pouvoir
     d'achat. Elle vaut sur TOUS les comptes, quel que soit le nombre de nœuds.
  2. **Le plancher lui-même** — sur les comptes de référence sans enrichissement,
     au moins 60 % de gris.
  3. **La mesure voyage avec le graphe** — un lecteur ne la recalcule pas.
  4. **La garde sait dire NON** — un graphe volontairement sur-colorié la fait
     tomber, et le corpus qu'elle lit n'est pas vide.

Garde **GA-187**. Elle prouve les deux choses qu'une garde doit prouver :
``test_the_floor_says_no_to_an_over_coloured_graph`` force un rôle sur des
nœuds qu'aucune règle ne justifierait et vérifie que la part de gris tombe
sous le plancher (le ROUGE, sur commande) ; ``test_the_reference_corpus_is_not_empty``
vérifie que les comptes de référence produisent bien des personnes (le corpus
n'est pas vide).
"""

from __future__ import annotations

import pytest

from app.services.decision_role import classify_decision_role
from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_colouring import GREY_ROLE_FLOOR, is_grey, measure_role_colouring
from tests.test_named_account_golden_sets import (
    _annotate,
    _pme_contacts,
    _shared_contacts,
    _tf1_contacts,
    _tf1_entities,
)

# Les comptes de référence qui portent des PERSONNES. Les quatre autres cas de la
# p29 (Société Générale, Crédit Agricole, SNCF, secteur public) éprouvent la
# cartographie d'ENTITÉS et ne fournissent aucun contact : il n'y a pas de nœud
# de personne à colorier, donc rien à mesurer. Les compter à zéro les ferait
# passer pour des comptes parfaitement gris — « non mesuré » n'est pas « mesuré ».
REFERENCE_ACCOUNTS: dict[str, tuple[list[dict], list[dict]]] = {
    "TF1": (_tf1_contacts(), _annotate(_tf1_entities())),
    "PME 200": (_pme_contacts(), _annotate([{"name": "PME Cible", "type": "groupe"}])),
    "Deux profils ESN": (_shared_contacts(), [{"name": "Cible", "type": "groupe"}]),
}


def _graph_of(name: str) -> dict:
    contacts, entities = REFERENCE_ACCOUNTS[name]
    return assemble_org_graph(contacts=contacts, entities=entities)


# ── 0. La garde LIT quelque chose ─────────────────────────────────────────────


def test_the_reference_corpus_is_not_empty() -> None:
    """Un corpus vide rendrait toutes les assertions ci-dessous vraies pour rien.

    C'est le défaut « garde borgne » : six gardes en deux jours surveillaient un
    ensemble vide. On vérifie donc que les comptes de référence produisent bien
    des personnes, et que le classifieur de rôles a bien de la matière à lire.
    """
    total_people = 0
    for name in REFERENCE_ACCOUNTS:
        graph = _graph_of(name)
        assert graph["people"], f"{name} ne produit aucune personne — la garde ne lit rien"
        total_people += len(graph["people"])
    assert total_people >= 7, f"corpus trop maigre pour mesurer une part ({total_people} personnes)"


# ── 1. La règle mécanique : pas de couleur sans règle nommée ──────────────────


@pytest.mark.parametrize("name", sorted(REFERENCE_ACCOUNTS))
def test_no_node_is_coloured_by_a_role_no_rule_can_justify(name: str) -> None:
    """« Une preuve d'IDENTITÉ ne prouve jamais une RELATION » — ni un RÔLE.

    Le champ `role` d'un contact vient du modèle, dont le schéma ne propose que
    des rôles COLORANTS. L'assembleur ne le reprend donc que si une règle nommée
    (`classify_decision_role`, déterministe et relisible) le confirme, ou si un
    humain l'a saisi. Sinon le nœud reste `unknown` — gris, et honnête.
    """
    graph = _graph_of(name)
    for person in graph["people"]:
        coloured = [role for role in person["decisionRoles"] if role != "unknown"]
        if not coloured:
            continue
        # Un rôle porté par un nœud le DIT toujours : déduit d'une règle, ou
        # déclaré par quelqu'un (T5 §27.3 « badge déduit ✓ si inféré »).
        assert person.get("roleInferred") in (True, False)
        # SEULE exception nommée : le bloqueur. Ce n'est pas une couleur de
        # POUVOIR mais un avertissement, et « masquer un blocker hiérarchiquement
        # réel falsifie l'organigramme » (décision 5 du FINAL).
        if coloured == ["blocker"]:
            continue
        if person.get("roleInferred") is False:
            continue  # saisie humaine — elle gagne toujours
        rule = classify_decision_role(person.get("title"))
        assert rule is not None, (
            f"{person['fullName']} ({person.get('title')!r}) est colorié {coloured} "
            "alors qu'aucune règle nommée ne situe son rôle d'achat"
        )


# ── 2. Le plancher ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", sorted(REFERENCE_ACCOUNTS))
def test_the_grey_floor_holds_on_every_reference_account(name: str) -> None:
    """Au moins 60 % des nœuds NON ENRICHIS restent de rôle `unknown`.

    `None` = aucune personne non enrichie sur ce compte : la question ne se pose
    pas, et un « 0 % » y serait faux. C'est le cas des « deux profils ESN », dont
    les deux contacts portent un e-mail.
    """
    measure = measure_role_colouring(_graph_of(name)["people"])
    if measure is None:
        return
    share = measure["grey"] / measure["unenriched"]
    assert share >= GREY_ROLE_FLOOR, (
        f"{name} : {share:.0%} de gris sur {measure['unenriched']} personnes non enrichies, "
        f"plancher {GREY_ROLE_FLOOR:.0%} — le générateur colorie ce qu'il ne sait pas"
    )


def test_at_least_one_reference_account_is_actually_measurable() -> None:
    """Sans ce témoin, un `return` sur `None` rendrait le test précédent vide."""
    measurable = [n for n in REFERENCE_ACCOUNTS if measure_role_colouring(_graph_of(n)["people"]) is not None]
    assert measurable, "aucun compte de référence ne porte de personne non enrichie"


# ── 3. La mesure voyage AVEC le graphe ────────────────────────────────────────


def test_the_graph_carries_its_own_colouring_measure() -> None:
    """Le lecteur ne recalcule pas le plancher : il le LIT.

    Deux dérivations d'une même question divergent — c'est exactement comme ça
    que `MOSTLY_INFERRED_RATIO` s'est mis à compter des arêtes.
    """
    graph = _graph_of("TF1")
    colouring = graph["colouring"]
    assert colouring["floor"] == GREY_ROLE_FLOOR
    assert colouring["unenriched"] == 2  # Bruno Sistemi porte un e-mail → enrichi
    assert colouring["grey"] == 2


def test_a_fully_enriched_graph_carries_no_measure() -> None:
    """Rien à mesurer ⇒ AUCUN bloc. Surtout pas « 0 % de gris », qui accuserait
    le générateur d'une faute que personne n'a pu constater."""
    graph = _graph_of("Deux profils ESN")
    assert "colouring" not in graph


# ── 4. La garde sait dire NON ─────────────────────────────────────────────────


def test_the_floor_says_no_to_an_over_coloured_graph() -> None:
    """Le rouge, sur commande : trois personnes non enrichies, une seule grise."""
    people = [
        {"identityStatus": "classified", "decisionRoles": ["economic_buyer"]},
        {"identityStatus": "classified", "decisionRoles": ["technical_buyer"]},
        {"identityStatus": "verified_identity", "decisionRoles": ["unknown"]},
    ]
    measure = measure_role_colouring(people)
    assert measure == {"unenriched": 3, "grey": 1, "floor": GREY_ROLE_FLOOR}
    assert measure["grey"] / measure["unenriched"] < GREY_ROLE_FLOOR


def test_an_enriched_person_is_allowed_to_be_coloured() -> None:
    """« sans enrichissement lancé » est dans la phrase de la source : une
    personne enrichie sort du dénominateur — c'est le travail qu'on a payé."""
    people = [
        {"identityStatus": "enriched", "decisionRoles": ["economic_buyer"]},
        {"identityStatus": "actionable", "decisionRoles": ["champion"]},
        {"identityStatus": "classified", "decisionRoles": ["unknown"]},
    ]
    assert measure_role_colouring(people) == {"unenriched": 1, "grey": 1, "floor": GREY_ROLE_FLOOR}


def test_grey_is_role_unknown_not_role_absent_only() -> None:
    """Les deux formes de l'absence sont grises : la liste vide (graphes anciens)
    et le rôle `unknown` explicitement NOMMÉ (ce que l'assembleur émet)."""
    assert is_grey({"decisionRoles": []}) is True
    assert is_grey({"decisionRoles": ["unknown"]}) is True
    assert is_grey({"decisionRoles": ["unknown", "champion"]}) is False
    assert is_grey({"decisionRoles": ["procurement"]}) is False
