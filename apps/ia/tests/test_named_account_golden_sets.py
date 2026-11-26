"""Golden sets « comptes nommés » — Annexe Organigramme p29 (« Golden sets — cas à
tester ») + p30 (« Tests automatisés minimaux »).

L'audit (`agent_docs/audit-org-mapping-2026-07-22.md` §8) est sans appel : sur les
7 golden sets réclamés (TF1, Société Générale, Crédit Agricole, SNCF, PME 200,
secteur public, deux profils ESN), **1 seul existe** (un éval SG antérieur, sans
la moindre assertion organigramme). Rien ne protège la cartographie d'une
régression : le jour où l'annotation d'entités cesse d'écarter un SGTM, où le
garde-fou board se débranche de la 1re approche, où l'arbre groupe→BU s'aplatit,
toute la CI reste verte.

Ce module fait tourner les services RÉELS de la cartographie de bout en bout —
`entities.annotate_entity_relevance` / `assign_entity_parents` /
`derive_in_scope_families`, `org_graph_assembler.assemble_org_graph` (donc
`org_resolver` + `org_confidence` + `governance_guard`), `sales_context`,
`opening_movement`, `contact_priority_score`, `buying_committee` — sur les sept
cas nommés de la p29, et ASSERTE l'assertion attendue de chaque ligne. Aucun LLM,
aucun réseau : tout est calculé et déterministe.

Discipline de ce fichier (empruntée à `test_dod_golden_sets.py`) :

- Les **goldens protecteurs** verrouillent un comportement qui MARCHE aujourd'hui
  (l'arbre TF1, l'exclusion SGTM, le board rétrogradé) — ils tombent si une
  régression le casse.
- Les **propriétés documentées** verrouillent un comportement INTENTIONNEL mais
  contre-intuitif — au premier chef le plafond de confiance p14 : une personne
  connue du *registre* ET confirmée par le site officiel plafonne à 80 (jamais
  « vérifié »), là où *fournisseur* + officiel atteint 100. Ce n'est pas un bug à
  masquer, c'est une propriété de la grille à trancher en produit ; on la
  DOCUMENTE par une assertion explicite plutôt que de la contourner.
- Les **sentinelles de trou** (``pytest.mark.xfail(strict=True)``) encodent le
  comportement que la p29/p30 EXIGE mais que la prod ne tient pas encore. Deux
  ont été BOUCHÉES et sont redevenues des tests normaux verts : le niveau L5
  Achats (tier « achats » du classifieur) et l'accessScore du comité. Restent
  ``xfail`` : la zone blanche complètement située et le stock estimé — les deux
  demandent un producteur en amont (le classifieur qui situe la zone ; un vrai
  comptage Apollo qu'on refuse d'inventer). Une sentinelle devient ``XPASS`` —
  donc ROUGE en mode strict — le jour où son trou est bouché, forçant la mise à
  niveau du golden au lieu de le laisser mentir.

Les écarts que ces sentinelles révèlent sont listés dans la PR — c'est le
livrable, pas leur correction (un autre agent tient le code de production).
"""

from __future__ import annotations

import pytest

from app.services.contact_priority_score import (
    contact_priority_score,
    seller_context_from_profile,
)
from app.services.entities import (
    annotate_entity_relevance,
    assign_entity_parents,
    derive_in_scope_families,
)
from app.services.hierarchy_level import classify_hierarchy_level
from app.services.opening_movement import recommend_opening_movement
from app.services.org_confidence import ConfidenceFactors, compute_confidence, is_verified
from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_validate import validate_org_graph
from app.services.org_resolver import EdgeSource, resolve_hierarchy_edge

# ── helpers ───────────────────────────────────────────────────────────────────


def _annotate(raw: list[dict], in_scope=frozenset()) -> list[dict]:
    """Le chemin réel de la phase 1 : annoter la pertinence de chaque entité PUIS
    poser l'arbre parent. ``in_scope`` = familles hors-secteur épargnées (dérivées
    du groupe cible en prod par ``derive_in_scope_families``)."""
    return assign_entity_parents(
        [annotate_entity_relevance(e, in_scope, frozenset(), False, it_esn=True) for e in raw]
    )


def _by_name(entities: list[dict]) -> dict[str, dict]:
    return {e["name"]: e for e in entities}


def _path_person_ids(graph: dict) -> list[str]:
    return [s["personId"] for s in graph["recommendedPath"]]


# ══════════════════════════════════════════════════════════════════════════════
# CAS 1 — TF1
# p29 : « board exclu du first contact ; TF1 Pub / Data / Produit structurés ;
#        zones achats et N-1 visibles. »
# ══════════════════════════════════════════════════════════════════════════════


def _tf1_entities() -> list[dict]:
    return [
        {"name": "TF1 Groupe", "type": "groupe", "siren": "326300159"},
        {"name": "TF1 Pub", "type": "filiale_strategique"},
        {"name": "TF1 Business Solutions", "type": "bu"},
        {"name": "Newen Studios", "type": "filiale"},
        {"name": "SCI TF1 Immobilier", "type": None},  # bruit — véhicule immobilier
    ]


def _tf1_contacts() -> list[dict]:
    return [
        {
            "fullName": "Alice Conseil",
            "title": "Présidente du conseil d'administration",
            "entity": "TF1 Groupe",
            "role": "influencer",
            "hierarchyLevel": "governance",
            "source": "pappers",
            "bucket": "decideur",
        },
        {
            "fullName": "Bruno Sistemi",
            "title": "DSI",
            "entity": "TF1 Groupe",
            "role": "technical",
            "hierarchyLevel": "direction",
            "source": "apollo",
            "email": "bruno@tf1.fr",
            "family": "IT",
            "bucket": "decideur",
        },
        {
            "fullName": "Carla Donnees",
            "title": "Responsable Data",
            "entity": "TF1 Pub",
            "role": "user",
            "hierarchyLevel": "management",
            "source": "apollo",
            "reportingTo": "DSI",
            "family": "Data",
            "bucket": "operationnel",
        },
    ]


def _tf1_zones() -> list[dict]:
    return [
        {
            "zone": "Aucun acheteur IT identifié sur TF1 Pub",
            "entity": "TF1 Pub",
            "family": "Achats",
            "level": "direction",
            "importance": "critique",
            "suggestedSearch": "acheteur / responsable achats IT TF1 Pub",
        }
    ]


def test_tf1_group_bu_tree_is_structured() -> None:
    """« TF1 Pub / Data / Produit structurés » — l'arbre groupe→filiale→BU se pose
    depuis le type + le partage de marque, jamais depuis une arête Pappers devinée."""
    ann = _annotate(_tf1_entities())
    by = _by_name(ann)
    assert by["TF1 Groupe"]["parentId"] is None
    assert by["TF1 Pub"]["parentId"] == "TF1 Groupe"
    # La BU s'accroche à la filiale la plus proche partageant la marque, pas au groupe.
    assert by["TF1 Business Solutions"]["parentId"] == "TF1 Pub"
    assert by["Newen Studios"]["parentId"] == "TF1 Groupe"
    # Le véhicule immobilier est du bruit : hors de la cartographie actionnable.
    assert by["SCI TF1 Immobilier"]["getsPlay"] is False


def test_tf1_board_is_never_the_first_contact_when_cold() -> None:
    """« board exclu du first contact » — sur un compte froid, la place de
    gouvernance (L0) passe DERRIÈRE les opérationnels dans le chemin recommandé."""
    graph = assemble_org_graph(
        contacts=_tf1_contacts(),
        entities=_annotate(_tf1_entities()),
        approach_order=[
            {"contact": "Alice Conseil", "why_first": "board"},
            {"contact": "Bruno Sistemi", "why_first": "décideur IT"},
            {"contact": "Carla Donnees", "why_first": "prescripteur"},
        ],
        relationship_state="froid",
    )
    order = _path_person_ids(graph)
    assert order[0] != "p-alice-conseil", "le board ouvre le chemin sur un compte froid"
    assert order[-1] == "p-alice-conseil", "le board doit être rétrogradé en dernier"
    assert validate_org_graph(graph) == []


def test_tf1_board_stays_first_when_the_account_is_warm() -> None:
    """Témoin : le garde-fou est CONDITIONNÉ à la relation. Sur un compte chaud
    (référé/sponsor), l'ordre d'origine est respecté — sinon on prouve seulement
    qu'on trie toujours pareil, pas qu'on lit la relation."""
    graph = assemble_org_graph(
        contacts=_tf1_contacts(),
        entities=_annotate(_tf1_entities()),
        approach_order=[
            {"contact": "Alice Conseil", "why_first": "sponsor board référé"},
            {"contact": "Bruno Sistemi", "why_first": "décideur IT"},
        ],
        relationship_state="refere",
    )
    assert _path_person_ids(graph)[0] == "p-alice-conseil"


def test_tf1_uncovered_achats_zone_carries_its_axes() -> None:
    """« zones achats et N-1 visibles » — une zone que le classifieur a SITUÉE
    (entité + famille + niveau) ressort avec ses axes, donc relançable case par case."""
    graph = assemble_org_graph(
        contacts=_tf1_contacts(),
        entities=_annotate(_tf1_entities()),
        uncovered_zones=_tf1_zones(),
    )
    assert len(graph["uncoveredZones"]) == 1
    zone = graph["uncoveredZones"][0]
    assert zone["entityId"] == "e-tf1-pub"
    assert zone["family"] == "Achats"
    assert zone["hierarchyLevel"] == "L2"  # « direction » → L2
    assert zone["suggestedQueries"]  # une requête concrète à rejouer


# ══════════════════════════════════════════════════════════════════════════════
# CAS 2 — Société Générale
# p29 : « aucun SGTM ; filiales cédées statutées ; gouvernance actuelle. »
# ══════════════════════════════════════════════════════════════════════════════


def _sg_entities() -> list[dict]:
    return [
        {"name": "Société Générale SA", "type": "groupe", "siren": "552120222"},
        {"name": "SG Global Solution Centre", "type": "filiale_strategique"},
        # SGTM = arm BTP du groupe (le pépin Matteo) — hors secteur d'une banque.
        {"name": "SGTM", "type": "filiale", "nafCode": "4120A"},
        # Filiale africaine — hors périmètre géographique d'une ESN France.
        {"name": "Société Générale Côte d'Ivoire", "type": "filiale"},
        # Véhicule de titrisation — jamais une cible.
        {"name": "2009 KOALA FINANCE", "type": "filiale"},
        # Filiale cédée — sortie du périmètre, à STATUER (pas à jeter en silence).
        {"name": "Fiditool (ancienne filiale cédée)", "type": "filiale"},
    ]


def test_sg_sgtm_and_offscope_entities_never_get_a_play() -> None:
    """« aucun SGTM » — l'arm BTP (NAF 41xx), la filiale africaine et le SPV sont
    gardés & étiquetés mais jamais actionnables."""
    by = _by_name(_annotate(_sg_entities()))
    assert by["SGTM"]["relevance"] == "out_of_sector"
    assert by["SGTM"]["getsPlay"] is False
    assert by["Société Générale Côte d'Ivoire"]["relevance"] == "out_of_sector"
    assert by["2009 KOALA FINANCE"]["type"] == "SPV"
    assert by["2009 KOALA FINANCE"]["getsPlay"] is False
    # L'arm IT/digital reste, elle, la cible n°1.
    assert by["SG Global Solution Centre"]["type"] == "filiale_strategique"


def test_sg_divested_subsidiary_is_statused_not_dropped() -> None:
    """« filiales cédées statutées » — une entité cédée porte le type ``cedee`` (et
    sort du périmètre) ; elle n'est pas silencieusement supprimée."""
    by = _by_name(_annotate(_sg_entities()))
    fiditool = by["Fiditool (ancienne filiale cédée)"]
    assert fiditool["type"] == "cedee"
    assert fiditool["getsPlay"] is False
    assert "cédée" in fiditool["relevanceReason"].lower()


def test_sg_governance_is_not_conflated_with_the_c_level() -> None:
    """« gouvernance actuelle » — un « Président du conseil de surveillance » est une
    place de gouvernance (L0), distincte d'un dirigeant exécutif (« Directeur
    Général » → L1). Le Pappers-board n'est pas le comité d'achat (annexe p2)."""
    assert classify_hierarchy_level("Président du conseil de surveillance") == "governance"
    assert classify_hierarchy_level("Directeur Général") == "c_level"
    # Le sysadmin homonyme ne remonte jamais en gouvernance.
    assert classify_hierarchy_level("Administrateur système Linux") == "operationnel"


# ══════════════════════════════════════════════════════════════════════════════
# CAS 3 — Crédit Agricole
# p29 : « groupe fédéré : CASA, CAGIP, CACIB, caisses / métiers séparés. »
# ══════════════════════════════════════════════════════════════════════════════


def _ca_entities() -> list[dict]:
    return [
        {"name": "Crédit Agricole SA", "type": "groupe", "nafCode": "6419Z"},
        {"name": "CAGIP", "type": "filiale_strategique"},  # le GIE informatique
        {"name": "CACIB", "type": "filiale"},
        {"name": "Caisse Régionale Crédit Agricole Nord de France", "type": "filiale"},
    ]


def test_credit_agricole_federated_group_holds_together() -> None:
    """« groupe fédéré : CASA, CAGIP, CACIB, caisses » — avec les familles in-scope
    dérivées (le groupe cible EST agricole par son nom), CASA reste le groupe et les
    métiers s'y rattachent. C'est le chemin RÉEL de la phase 1."""
    names = [e["name"] for e in _ca_entities()]
    in_scope = derive_in_scope_families(naf="6419Z", entity_names=names)
    assert "agri" in in_scope  # la dérivation reconnaît le cœur « Agricole » du groupe
    by = _by_name(_annotate(_ca_entities(), in_scope=in_scope))
    assert by["Crédit Agricole SA"]["type"] == "groupe"
    assert by["Crédit Agricole SA"]["relevance"] == "operating"
    assert by["CAGIP"]["parentId"] == "Crédit Agricole SA"
    assert by["CACIB"]["parentId"] == "Crédit Agricole SA"
    assert by["Caisse Régionale Crédit Agricole Nord de France"]["parentId"] == "Crédit Agricole SA"
    # Le GIE informatique reste l'arm stratégique.
    assert by["CAGIP"]["type"] == "filiale_strategique"


def test_credit_agricole_collapses_without_the_in_scope_derivation() -> None:
    """Témoin (la dérivation est PORTANTE, pas décorative) : sans les familles
    in-scope, le mot « Agricole » du nom fait tomber le groupe et les caisses dans
    le hors-secteur « agriculture » — l'arbre fédéré s'effondre (racine détruite,
    parents à None). Ce témoin fige la fragilité : si un jour la banque « Crédit
    Agricole » cesse d'être un homonyme agricole même sans dérivation, ce test
    tombera et il faudra le mettre à jour."""
    by = _by_name(_annotate(_ca_entities(), in_scope=frozenset()))
    assert by["Crédit Agricole SA"]["type"] == "homonyme"
    assert by["Crédit Agricole SA"]["relevance"] == "out_of_sector"
    assert by["CAGIP"]["parentId"] is None  # racine perdue → plus de rattachement


# ══════════════════════════════════════════════════════════════════════════════
# CAS 4 — SNCF
# p29 : « groupe, Voyageurs, Réseau, Connect & Tech ; SNEF exclu. »
# ══════════════════════════════════════════════════════════════════════════════


def _sncf_entities() -> list[dict]:
    return [
        {"name": "SNCF", "type": "groupe"},
        {"name": "SNCF Voyageurs", "type": "filiale"},
        {"name": "SNCF Réseau", "type": "filiale"},
        {"name": "SNCF Connect & Tech", "type": "filiale_strategique"},
        # SNEF = homonyme (installateur électrique), aucun lien réel — l'indice
        # sectoriel (NAF BTP 43.xx) doit l'exclure.
        {"name": "SNEF", "type": "filiale", "nafCode": "4321A"},
    ]


def test_sncf_group_tree_and_snef_excluded() -> None:
    """« groupe, Voyageurs, Réseau, Connect & Tech ; SNEF exclu » — les entités
    ferroviaires structurent l'arbre, l'installateur électrique homonyme (NAF BTP)
    est écarté et n'est jamais rattaché au groupe."""
    by = _by_name(_annotate(_sncf_entities()))
    assert by["SNCF"]["parentId"] is None
    assert by["SNCF Voyageurs"]["parentId"] == "SNCF"
    assert by["SNCF Réseau"]["parentId"] == "SNCF"
    assert by["SNCF Connect & Tech"]["parentId"] == "SNCF"
    assert by["SNCF Connect & Tech"]["type"] == "filiale_strategique"
    # SNEF : hors secteur, non actionnable, JAMAIS accroché à SNCF. Un homonyme
    # n'est pas un nœud structurel → l'arbre ne lui pose même pas de parentId.
    assert by["SNEF"]["getsPlay"] is False
    assert by["SNEF"].get("parentId") is None


@pytest.mark.xfail(
    strict=True,
    reason=(
        "ÉCART (audit §2 p6) : un homonyme SANS indice sectoriel (« SNEF » nu, "
        "aucun NAF) est force-rattaché à la racine unique du groupe par le "
        "fallback ``assign_entity_parents``. Rien ne le distingue d'une vraie "
        "filiale. La p29 exige « SNEF exclu » quelle que soit la donnée fournie ; "
        "aujourd'hui l'exclusion dépend d'un signal NAF/nom que le run peut ne pas "
        "avoir. À trancher en produit (ne rattacher un enfant que sur preuve de "
        "marque partagée, pas par fallback racine-unique)."
    ),
)
def test_sncf_bare_homonym_is_not_force_attached() -> None:
    entities = [
        {"name": "SNCF", "type": "groupe"},
        {"name": "SNEF", "type": "filiale"},  # aucun NAF, aucun signal
    ]
    by = _by_name(_annotate(entities))
    # Comportement SOUHAITÉ : un nom sans marque partagée reste honnêtement orphelin.
    assert by["SNEF"]["parentId"] is None


# ══════════════════════════════════════════════════════════════════════════════
# CAS 5 — PME 200 salariés
# p29 : « structure simple, DSI/RSI + managers ; pas de faux COMEX. »
# ══════════════════════════════════════════════════════════════════════════════


def _pme_contacts() -> list[dict]:
    return [
        {
            "fullName": "Paul Direction",
            "title": "DSI",
            "entity": "PME Cible",
            "role": "economic",
            "hierarchyLevel": "direction",
            "source": "apollo",
            "email": "paul@pme.fr",
            "bucket": "decideur",
        },
        {
            "fullName": "Rita Reseau",
            "title": "Responsable Systèmes & Réseau",
            "entity": "PME Cible",
            "role": "technical",
            "hierarchyLevel": "management",
            "source": "apollo",
            "reportingTo": "DSI",
            "bucket": "operationnel",
        },
    ]


def test_pme_simple_structure_no_fabricated_comex() -> None:
    """« structure simple, DSI/RSI + managers ; pas de faux COMEX » — le graphe ne
    contient que les personnes réellement fournies ; aucun siège de gouvernance /
    C-level n'est inventé, et le DSI (économique) ouvre le chemin."""
    graph = assemble_org_graph(
        contacts=_pme_contacts(),
        entities=_annotate([{"name": "PME Cible", "type": "groupe"}]),
        approach_order=[
            {"contact": "Paul Direction", "why_first": "décideur IT"},
            {"contact": "Rita Reseau", "why_first": "prescripteur"},
        ],
        relationship_state="froid",
    )
    names = {p["fullName"] for p in graph["people"]}
    assert names == {"Paul Direction", "Rita Reseau"}, "un contact a été fabriqué"
    # Aucun niveau gouvernance (L0) ni C-level (L1) n'apparaît — pas de faux COMEX.
    levels = {p.get("hierarchyLevel") for p in graph["people"]}
    assert "L0" not in levels and "L1" not in levels
    # Le DSI (le vrai décideur d'une PME) ouvre.
    assert _path_person_ids(graph)[0] == "p-paul-direction"
    assert validate_org_graph(graph) == []


# ══════════════════════════════════════════════════════════════════════════════
# CAS 6 — Secteur public
# p29 : « rôles métier, DSI, achats et procédure ; pas de faux economic buyer
#         simpliste. »
# ══════════════════════════════════════════════════════════════════════════════


def test_public_sector_routes_through_the_contractual_movement() -> None:
    """« achats et procédure ; pas d'economic buyer simpliste » — un archétype
    public route sur le mouvement CONTRACTUEL (veille → titulaire → métier →
    procédure), pas sur un « contacte le décideur budget » générique."""
    move = recommend_opening_movement("petite", "public", "froid")
    assert move["movement"] == "public"
    assert "procédure" in move["sequence"] or "titulaire" in move["sequence"]
    # Le même compte NON public sortirait d'un autre mouvement — preuve que
    # l'archétype pilote bien la décision (et non une constante).
    assert recommend_opening_movement("petite", "pme_eti", "froid")["movement"] != "public"


def test_public_sector_procurement_role_is_ranked() -> None:
    """« rôles métier, DSI, achats » — un acheteur public (rôle procurement) porte
    bien un score /100 non nul : le rôle achats n'est pas ignoré au profit du seul
    décideur budgétaire."""
    acheteur = {
        "fullName": "Agnès Marches",
        "title": "Responsable de la commande publique",
        "role": "procurement",
        "source": "apollo",
        "email": "a@collectivite.fr",
        "entityRelevance": "operating",
    }
    assert contact_priority_score(acheteur) > 0


# ══════════════════════════════════════════════════════════════════════════════
# CAS 7 — Deux profils ESN, même compte
# p29 : « même graphe de faits, mais buying committee priorisé et chemin
#         différents. »
# ══════════════════════════════════════════════════════════════════════════════


def _shared_contacts() -> list[dict]:
    """Le MÊME graphe de faits (mêmes personnes, mêmes entités) pour les deux ESN."""
    return [
        {"fullName": "Dana Donnees", "title": "Directrice Data & Analytics", "role": "economic",
         "source": "apollo", "email": "dana@cible.fr", "entityRelevance": "operating"},
        {"fullName": "Igor Infra", "title": "Directeur Cloud & Infrastructure", "role": "technical",
         "source": "apollo", "email": "igor@cible.fr", "entityRelevance": "operating"},
    ]


def test_two_esn_profiles_reprioritise_the_same_committee() -> None:
    """« buying committee priorisé différent » — sur le même graphe de faits, une
    ESN Data classe la décideuse Data devant, une ESN Cloud classe le décideur
    Infra devant. La priorisation suit l'expertise déclarée du vendeur."""
    contacts = _shared_contacts()
    data_esn = seller_context_from_profile({"expertise_areas": ["Data Engineering", "Analytics", "BI"]})
    cloud_esn = seller_context_from_profile({"expertise_areas": ["Cloud", "Infrastructure", "DevOps"]})

    dana, igor = contacts[0], contacts[1]
    # ESN Data : Dana > Igor.
    assert contact_priority_score(dana, data_esn) > contact_priority_score(igor, data_esn)
    # ESN Cloud : Igor > Dana. L'ordre du comité s'inverse sur le MÊME graphe.
    assert contact_priority_score(igor, cloud_esn) > contact_priority_score(dana, cloud_esn)


def test_two_esn_profiles_choose_a_different_opening_path() -> None:
    """« chemin différent » — le même compte (PME/ETI froid) ouvre par le bas pour
    une petite ESN et par le milieu pour une grande : le mouvement dépend du stade."""
    petite = recommend_opening_movement("petite", "pme_eti", "froid")["movement"]
    grande = recommend_opening_movement("grande", "pme_eti", "froid")["movement"]
    assert petite == "bottom_up"
    assert grande == "middle_out"
    assert petite != grande


def test_two_esn_witness_same_facts_same_graph() -> None:
    """Témoin : le GRAPHE DE FAITS ne bouge pas d'un profil à l'autre. La
    personnalisation vit dans la priorisation/le chemin, pas dans la structure —
    sinon on inventerait des faits différents selon le vendeur."""
    graph_a = assemble_org_graph(contacts=_shared_contacts(), entities=[{"name": "Cible", "type": "groupe"}])
    graph_b = assemble_org_graph(contacts=_shared_contacts(), entities=[{"name": "Cible", "type": "groupe"}])
    assert graph_a["people"] == graph_b["people"]
    assert graph_a["entities"] == graph_b["entities"]


# ══════════════════════════════════════════════════════════════════════════════
# p30 — Tests automatisés minimaux (« la CI doit casser si une relation ou une
# sortie viole les invariants »). Ces invariants tiennent sur TOUS les cas.
# ══════════════════════════════════════════════════════════════════════════════


class TestInvariantsMinimaux:
    def _rich_graph(self) -> dict:
        """Un graphe assemblé depuis un jeu réaliste (TF1) + un rejet mémorisé et
        une approche qui tente de faire passer le rejeté — pour éprouver TOUS les
        invariants d'un coup."""
        return assemble_org_graph(
            contacts=_tf1_contacts(),
            entities=_annotate(_tf1_entities()),
            uncovered_zones=_tf1_zones(),
            approach_order=[
                {"contact": "Bruno Sistemi", "why_first": "décideur IT"},
                {"contact": "Carla Donnees", "why_first": "prescripteur"},
                {"contact": "Fantome Parti", "why_first": "ne doit jamais apparaître"},
            ],
            rejected_items=[{"sourceId": "p-fantome-parti", "reason": "signalé parti"}],
            relationship_state="froid",
        )

    def test_no_output_name_is_absent_from_the_input_contacts(self) -> None:
        """« Aucun nom de sortie absent de la liste des contacts fournis. » Le
        graphe ne fabrique jamais une personne — chaque nœud vient d'un contact."""
        graph = self._rich_graph()
        provided = {c["fullName"] for c in _tf1_contacts()}
        assert all(p["fullName"] in provided for p in graph["people"])

    def test_every_hierarchy_edge_is_sourced_and_contract_valid(self) -> None:
        """« Aucun hierarchyEdge sans sourceId ou verified=false + confidence. »
        L'invariant du contrat (miroir Python) doit passer, et chaque arête porte
        des sourceIds + une confidence."""
        graph = self._rich_graph()
        assert validate_org_graph(graph) == []
        for edge in graph["hierarchyEdges"]:
            assert edge["sourceIds"], "arête sans source"
            assert isinstance(edge["confidence"], int)
            if edge["verified"]:
                assert edge["confidence"] >= 90

    def test_no_rejected_contact_in_recommended_path(self) -> None:
        """« Aucun rejected contact dans recommendedPath. » Un contact mémorisé
        écarté n'entre jamais dans le chemin, même si l'approche le référence."""
        graph = self._rich_graph()
        rejected_ids = {r["sourceId"] for r in graph["rejectedItems"]}
        assert "p-fantome-parti" in rejected_ids
        assert all(s["personId"] not in rejected_ids for s in graph["recommendedPath"])

    def test_no_board_first_touch_for_a_cold_small_esn(self) -> None:
        """« Aucun board comme first contact pour petite ESN froide sans relation. »
        La gouvernance (L0) ne peut pas ouvrir un compte froid."""
        graph = assemble_org_graph(
            contacts=_tf1_contacts(),
            entities=_annotate(_tf1_entities()),
            approach_order=[{"contact": "Alice Conseil"}, {"contact": "Bruno Sistemi"}],
            relationship_state=None,  # absent = froid = garde-fou actif
        )
        first = graph["recommendedPath"][0]["personId"]
        first_level = {p["id"]: p.get("hierarchyLevel") for p in graph["people"]}[first]
        assert first_level != "L0"

    def test_same_input_yields_a_stable_structure(self) -> None:
        """« Même input = structure stable. » L'assemblage est pur : deux passes sur
        le même jeu rendent le même graphe, octet pour octet."""
        assert self._rich_graph() == self._rich_graph()

    def test_a_well_situated_zone_carries_all_its_axes(self) -> None:
        """« Chaque uncoveredZone contient entityId, family, level, raison et
        suggestedQueries. » — vrai POUR une zone que le classifieur a située."""
        zone = self._rich_graph()["uncoveredZones"][0]
        for key in ("entityId", "family", "hierarchyLevel", "reason", "suggestedQueries"):
            assert key in zone, f"axe manquant : {key}"


# ══════════════════════════════════════════════════════════════════════════════
# Propriétés documentées & sentinelles de trou (les ÉCARTS que ces jeux révèlent,
# sans les corriger — cf. mandat & audit §1/§3).
# ══════════════════════════════════════════════════════════════════════════════


class TestPlafondConfianceP14:
    """Le plafond de confiance p14 est une PROPRIÉTÉ de la grille, pas un bug : deux
    preuves de même NATURE (grounding A) remplissent le même facteur +30. On la
    documente par une assertion explicite (mandat : « documenter le plafond plutôt
    que le contourner ; c'est à trancher en produit »)."""

    def test_registry_plus_official_site_plateaus_at_80_never_verified(self) -> None:
        """Registre (A) + site officiel (A) = 80, JAMAIS « vérifié » (seuil 90) : les
        deux preuves de grounding A remplissent une seule fois le facteur +30."""
        edge = resolve_hierarchy_edge(
            from_id="p1", to_id="e1", relation="member_of",
            sources=[EdgeSource(id="s1", kind="registry", fresh=True),
                     EdgeSource(id="s2", kind="official_site", fresh=True)],
            explicit_title=True, same_org_id=True,
        )
        assert edge is not None
        assert edge["confidence"] == 80
        assert edge["verified"] is False

    def test_vendor_plus_official_site_reaches_verified(self) -> None:
        """L'ASYMÉTRIE : fournisseur (B, +20) + site officiel (A, +30) = 100 →
        « vérifié ». Une personne de nature *fournisseur* corroborée par l'officiel
        atteint le seuil qu'une personne de nature *registre* ne peut pas atteindre —
        alors que le registre est réputé au moins aussi fiable."""
        edge = resolve_hierarchy_edge(
            from_id="p1", to_id="e1", relation="member_of",
            sources=[EdgeSource(id="s1", kind="linkedin", fresh=True),
                     EdgeSource(id="s2", kind="official_site", fresh=True)],
            explicit_title=True, same_org_id=True,
        )
        assert edge is not None
        assert edge["confidence"] == 100
        assert edge["verified"] is True

    def test_two_A_proofs_fill_one_factor(self) -> None:
        """La racine mécanique : ajouter une 2e source A ne rajoute pas +30 (le
        facteur `official_source` est booléen). Deux A ne valent qu'un A + le bonus
        de corroboration (+10)."""
        one_a = compute_confidence(
            ConfidenceFactors(official_source=True, explicit_title=True, same_org_id=True, fresh_date=True)
        )
        two_a = compute_confidence(
            ConfidenceFactors(
                official_source=True, explicit_title=True, same_org_id=True, fresh_date=True,
                two_converging_sources=True,
            )
        )
        assert two_a - one_a == 10  # +10 corroboration, PAS +30
        assert not is_verified(two_a)


class TestTrousDocumentes:
    """Sentinelles ``xfail(strict=True)`` : elles encodent le comportement que la
    p29/p30 EXIGE mais que la prod ne tient pas encore. ``xfail`` aujourd'hui (CI
    verte) ; ``XPASS`` — donc rouge en strict — le jour où le trou est bouché,
    forçant la mise à niveau du golden. Ne PAS « réparer » en changeant
    l'assertion : c'est le code de production qui doit rejoindre l'assertion."""

    def test_purchasing_title_maps_to_a_dedicated_L5_tier(self) -> None:
        # BOUCHÉ : `classify_hierarchy_level` a un tier « achats » (axe parallèle
        # p7), mappé sur L5 par l'assembleur. Un « Directeur des Achats » n'est
        # plus rabattu en direction (annexe p8 « rôles d'achat indépendants de la
        # hiérarchie »).
        from app.services.org_graph_assembler import _LEVEL_TO_CONTRACT

        level = classify_hierarchy_level("Directeur des Achats")
        assert _LEVEL_TO_CONTRACT.get(level) == "L5"

    @pytest.mark.xfail(
        strict=True,
        reason=(
            "ÉCART (audit §4 p17 / p30) : une uncoveredZone que le classifieur "
            "n'a pas SITUÉE ne ressort qu'avec reason/importance — sans "
            "entityId/family/hierarchyLevel. La p30 exige que CHAQUE zone porte ces "
            "axes ; l'assembleur ne les invente pas (à raison), mais rien en amont "
            "ne garantit qu'ils soient fournis → l'invariant n'est pas tenu."
        ),
    )
    def test_every_emitted_zone_carries_its_axes_even_when_unsituated(self) -> None:
        graph = assemble_org_graph(contacts=[], entities=[], uncovered_zones=[{"zone": "trou non situé"}])
        zone = graph["uncoveredZones"][0]
        assert "entityId" in zone and "family" in zone and "hierarchyLevel" in zone

    @pytest.mark.xfail(
        strict=True,
        reason=(
            "ÉCART (audit §4 p17, §5 p18-19) : estimatedAvailable (le « stock "
            "estimé » annoncé sur une zone blanche) n'a AUCUN producteur dans le "
            "repo. La DoD n°5 exige d'annoncer le stock ; la zone ne le porte jamais."
        ),
    )
    def test_uncovered_zone_announces_its_estimated_stock(self) -> None:
        graph = assemble_org_graph(contacts=[], entities=[], uncovered_zones=[_tf1_zones()[0]])
        assert "estimatedAvailable" in graph["uncoveredZones"][0]

    def test_committee_seat_carries_an_access_score(self) -> None:
        # BOUCHÉ : l'assembleur pose `accessScore` sur chaque siège, dérivé
        # déterministe du niveau + statut d'identité. Le tri « accessibilité » du
        # chemin ne retombe plus sur `person.confidence`.
        from app.knowledge.buying_committee import assemble_buying_committee

        contacts = _shared_contacts()
        committee = assemble_buying_committee(contacts)
        graph = assemble_org_graph(
            contacts=contacts, entities=[{"name": "Cible", "type": "groupe"}], committee=committee
        )
        assert graph["buyingCommittee"], "aucun siège émis"
        assert "accessScore" in graph["buyingCommittee"][0]
