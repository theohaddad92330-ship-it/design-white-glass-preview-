"""CE QUE CHAQUE NŒUD ET CHAQUE LIEN PORTENT — la source, sa date, ce qu'elle prouve.

`T5.md:804-813` (§27.3 « Ce que l'organigramme affiche par nœud ») :

    | Source de l'inférence | ✓ TOUJOURS |
    | Date de la source     | ✓ TOUJOURS |
    | Badge « déduit »      | ✓ si inféré |

`agent_docs/audit-org-mapping-2026-07-22.md:33` et `:164` donnaient les trois
MANQUANTES : `sources: []` en dur, `OrgSource.date` sans aucun producteur, et
« pire, la fraîcheur est affirmée en dur `fresh=True` ». Cinq semaines plus tard
l'archive 05 §O2 le retrouvait intact sur le rattachement.

Ce fichier tient la règle qui relie tout le chantier :

    **Une preuve ne prouve QUE ce qu'elle a observé.**

Elle a trois conséquences mécaniques, toutes gardées ici :

  1. **Chaque source DIT ce qu'elle prouve** (`claim`). Le vocabulaire vivait dans
     le contrat (`orgClaimSchema`) sans aucun producteur — on ne peut pas garder
     ce qui n'a pas de nom, et c'est ce flou qui a laissé la provenance d'IDENTITÉ
     d'un contact étayer une ligne de RELATION.
  2. **Aucune fraîcheur sans date.** `org_confidence.W_FRESH_DATE` vaut +10 sur une
     échelle où `VERIFIED_MIN = 90` : un lien ne peut pas gagner ces points pour
     une fraîcheur qu'aucune date ne démontre.
  3. **Aucun lien sans SA propre preuve.** Un `sourceId` qu'aucun nœud ne porte est
     une preuve fantôme : l'écran le jette, et le trait reste affiché « probable »
     en citant le vide.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.services.org_confidence import W_FRESH_DATE
from app.services.org_graph_assembler import assemble_org_graph

_ENTITIES = [
    {"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"},
    {"name": "TF1 Pub", "type": "filiale_strategique", "parentId": "TF1 Groupe"},
]

_TODAY = datetime.now(UTC).date().isoformat()


def _person(full_name: str, title: str, **extra) -> dict:
    base = {
        "fullName": full_name,
        "title": title,
        "entity": "TF1 Groupe",
        "role": "technical",
        "hierarchyLevel": "c_level",
        "source": "apollo",
    }
    base.update(extra)
    return base


def _contacts() -> list[dict]:
    return [
        _person("Jean Dupont", "DSI", source="pappers"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]


def _graph(**kwargs) -> dict:
    return assemble_org_graph(contacts=_contacts(), entities=_ENTITIES, **kwargs)


def _all_sources(graph: dict) -> list[dict]:
    return [source for node in [*graph["entities"], *graph["people"]] for source in node["sources"]]


# ── 0. La garde LIT quelque chose ─────────────────────────────────────────────


def test_the_graph_under_test_actually_carries_sources() -> None:
    """Sans ce témoin, « toutes les sources portent un claim » serait vrai sur zéro
    source — le motif « garde borgne » exactement."""
    sources = _all_sources(_graph())
    assert len(sources) >= 3, f"corpus trop maigre ({len(sources)} sources)"


# ── 1. Chaque source dit CE QU'ELLE PROUVE ────────────────────────────────────


def test_every_emitted_source_declares_what_it_proves() -> None:
    for source in _all_sources(_graph()):
        assert source.get("claim"), f"source {source['id']} n'annonce pas ce qu'elle prouve"


def test_a_provider_record_proves_an_identity_and_nothing_more() -> None:
    """Apollo / Pappers / le CRM ont vu que cette personne EXISTE et qui elle est.
    Aucun des trois n'a vu à qui elle rapporte, ni ce qu'elle décide."""
    graph = _graph()
    people = {p["fullName"]: p for p in graph["people"]}
    assert [s["claim"] for s in people["Jean Dupont"]["sources"]] == ["identity"]
    assert [s["claim"] for s in people["Marie Martin"]["sources"]] == ["identity"]
    assert [s["claim"] for e in graph["entities"] for s in e["sources"]] == ["identity"]


def test_the_official_page_proves_a_membership_and_carries_its_date() -> None:
    """« L'organisation présente cette personne comme <fonction> », lu le <date>.
    C'est la SEULE preuve datée du graphe, et c'est ce qui la rend opposable."""
    directory = [
        {"fullName": "Jean Dupont", "title": "DSI", "url": "https://tf1.fr/gouvernance", "collectedAt": _TODAY}
    ]
    graph = _graph(official_directory=directory)
    people = {p["fullName"]: p for p in graph["people"]}
    (official,) = [s for s in people["Jean Dupont"]["sources"] if s["kind"] == "official_site"]
    assert official["claim"] == "membership"
    assert official["date"] == _TODAY
    assert official["ref"] == "https://tf1.fr/gouvernance"


# ── 2. Aucune fraîcheur sans date ─────────────────────────────────────────────


def test_an_undated_provenance_never_buys_the_freshness_bonus() -> None:
    """Le défaut du 22/07, resté vivant cinq semaines : `fresh=True` en dur.

    Le rattachement d'un contact Pappers vaut registre (30) + titre (15) + même
    organisation (15) = 60. Avec la fraîcheur fabriquée il valait 70 — dix points
    gagnés pour une date qui n'existe nulle part.
    """
    graph = _graph()
    (member_of,) = [
        edge for edge in graph["hierarchyEdges"] if edge["type"] == "member_of" and edge["fromId"] == "p-jean-dupont"
    ]
    assert member_of["confidence"] == 60
    assert member_of["confidence"] + W_FRESH_DATE == 70  # le score d'AVANT, nommé


def test_a_dated_page_does_buy_it() -> None:
    """La règle n'interdit pas la fraîcheur : elle exige qu'on la PROUVE.

    Registre (30) + titre (15) + même organisation (15) + deux sources
    convergentes (10) + fraîcheur DÉMONTRÉE par le `collectedAt` (10) = 80.
    (Un registre n'est pas un profil fournisseur : il n'a pas les +20 de
    `linkedin_or_provider` — c'est le plateau documenté du golden set.)
    """
    directory = [
        {"fullName": "Jean Dupont", "title": "DSI", "url": "https://tf1.fr/gouvernance", "collectedAt": _TODAY},
    ]
    graph = _graph(official_directory=directory)
    (member_of,) = [
        edge for edge in graph["hierarchyEdges"] if edge["type"] == "member_of" and edge["fromId"] == "p-jean-dupont"
    ]
    assert member_of["confidence"] == 80


def test_a_page_read_two_years_ago_is_not_fresh() -> None:
    """« Un fait périmé redevient inconnu AVEC sa date » : la preuve reste, elle
    n'est simplement plus fraîche. La date n'est ni effacée ni rafraîchie."""
    stale = [
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "url": "https://tf1.fr/gouvernance",
            "collectedAt": "2024-01-15",
        }
    ]
    graph = _graph(official_directory=stale)
    people = {p["fullName"]: p for p in graph["people"]}
    (official,) = [s for s in people["Jean Dupont"]["sources"] if s["kind"] == "official_site"]
    assert official["date"] == "2024-01-15"  # conservée telle quelle
    (member_of,) = [
        edge for edge in graph["hierarchyEdges"] if edge["type"] == "member_of" and edge["fromId"] == "p-jean-dupont"
    ]
    assert member_of["confidence"] == 80 - W_FRESH_DATE


# ── 3. Aucun lien sans SA propre preuve ───────────────────────────────────────


def test_every_hierarchy_edge_cites_a_source_a_node_really_carries() -> None:
    """Un `sourceId` fantôme est jeté par l'écran (`orgSourceResolver`) : le trait
    resterait affiché « probable » en citant le vide."""
    graph = _graph()
    known = {source["id"] for source in _all_sources(graph)}
    assert known
    for edge in graph["hierarchyEdges"]:
        assert edge["sourceIds"], f"lien {edge['fromId']}→{edge['toId']} sans aucune preuve"
        for sid in edge["sourceIds"]:
            assert sid in known, f"preuve fantôme {sid} sur {edge['fromId']}→{edge['toId']}"


def test_a_person_without_provenance_gets_no_attachment_line() -> None:
    """« Aucun trait : relation non prouvée. Le silence est un état correct. »

    Le repli d'avant fabriquait `s-<pid>-ent` — un identifiant qu'aucun nœud ne
    portait — et l'affirmait frais par-dessus. La personne reste dans le graphe et
    garde son entité ; c'est la LIGNE qui disparaît, faute de preuve.
    """
    graph = assemble_org_graph(
        contacts=[_person("Jean Dupont", "DSI", source="")],
        entities=_ENTITIES,
    )
    (person,) = graph["people"]
    assert person["sources"] == []
    assert person["entityId"] == "e-tf1-groupe"  # la structure reste vraie
    assert graph["hierarchyEdges"] == []


# ── 4. Le badge « déduit » ────────────────────────────────────────────────────


def test_a_role_derived_from_a_title_says_it_is_deduced() -> None:
    graph = _graph()
    people = {p["fullName"]: p for p in graph["people"]}
    assert people["Jean Dupont"]["decisionRoles"] == ["technical_buyer"]
    assert people["Jean Dupont"]["roleInferred"] is True


def test_a_role_typed_by_a_human_is_not_deduced() -> None:
    """« Une correction humaine gagne toujours, quelle que soit sa date. »"""
    graph = assemble_org_graph(
        contacts=[_person("Sophie Saisie", "Cheffe de projet", role="champion", source="manual")],
        entities=_ENTITIES,
    )
    (person,) = graph["people"]
    assert person["decisionRoles"] == ["champion"]
    assert person["roleInferred"] is False


def test_a_grey_node_carries_no_deduction_badge_at_all() -> None:
    """Un `false` sur un nœud gris se lirait « rôle confirmé ». Il est ABSENT."""
    graph = assemble_org_graph(
        contacts=[_person("Nadia Neutre", "Chargée de mission", role="user")],
        entities=_ENTITIES,
    )
    (person,) = graph["people"]
    assert person["decisionRoles"] == ["unknown"]
    assert "roleInferred" not in person
