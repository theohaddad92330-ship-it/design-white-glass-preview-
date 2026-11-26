"""La SECONDE source : la page équipe/dirigeants du site officiel du compte.

Suite de `test_org_graph_reporting_and_sources.py`, qui verrouille le constat de
l'audit : avec UNE seule preuve par personne, la formule p14 plafonne à 70 et la
vue « organigramme vérifié » (seuil 90) reste vide.

Ici on mesure ce que la page officielle débloque VRAIMENT — y compris quand elle
ne débloque rien. Les deux cas sont dans le fichier, côte à côte, parce que le
résultat négatif est aussi un livrable (deux sources officielles restent à 80).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.official_directory import collect_official_directory
from app.services.org_graph_assembler import assemble_org_graph

_ENTITIES = [
    {"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"},
    {"name": "TF1 Pub", "type": "filiale_strategique", "parentId": "TF1 Groupe"},
]

_TODAY = datetime.now(UTC).date().isoformat()
_THREE_YEARS_AGO = (datetime.now(UTC).date() - timedelta(days=3 * 365 + 30)).isoformat()

_PAGE = "https://www.groupe-tf1.fr/fr/gouvernance"


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


def _official(full_name: str, title: str, *, collected_at: str = _TODAY, url: str = _PAGE) -> dict:
    return {"fullName": full_name, "title": title, "url": url, "collectedAt": collected_at}


def _by_name(graph: dict) -> dict[str, dict]:
    return {p["fullName"]: p for p in graph["people"]}


def _member_of(graph: dict, person_id: str) -> dict | None:
    for edge in graph["hierarchyEdges"]:
        if edge["type"] == "member_of" and edge["fromId"] == person_id:
            return edge
    return None


# ── La provenance : URL + date, sinon la source ne vaut rien ─────────────────


def test_the_page_is_cited_with_its_url_and_its_collection_date():
    g = assemble_org_graph(
        contacts=[_person("Jean Dupont", "DSI")],
        entities=_ENTITIES,
        official_directory=[_official("Jean Dupont", "Directeur des Systèmes d'Information")],
    )
    sources = _by_name(g)["Jean Dupont"]["sources"]
    official = [s for s in sources if s["kind"] == "official_site"]
    assert len(official) == 1
    assert official[0]["grounding"] == "A"
    assert official[0]["ref"] == _PAGE  # la page exacte, pas « le site »
    assert official[0]["date"] == _TODAY  # datée : c'est ce qui la rend fraîche


def test_the_provider_source_survives_next_to_the_official_one():
    """La page officielle CORROBORE, elle ne remplace pas la provenance existante."""
    g = assemble_org_graph(
        contacts=[_person("Jean Dupont", "DSI", linkedinUrl="https://www.linkedin.com/in/jd")],
        entities=_ENTITIES,
        official_directory=[_official("Jean Dupont", "DSI")],
    )
    kinds = {s["kind"] for s in _by_name(g)["Jean Dupont"]["sources"]}
    assert kinds == {"linkedin", "official_site"}


# ── LA MESURE : le seuil 90 est-il atteint ? ─────────────────────────────────


def test_a_provider_person_confirmed_by_the_official_page_reaches_verified():
    """Apollo (B, +20) + site officiel (A, +30) + titre (+15) + même org (+15)
    + 2 sources (+10) + fraîcheur (+10) = 100 ⇒ la vue n°1 n'est plus vide."""
    g = assemble_org_graph(
        contacts=[_person("Jean Dupont", "DSI")],
        entities=_ENTITIES,
        official_directory=[_official("Jean Dupont", "DSI")],
    )
    edge = _member_of(g, _by_name(g)["Jean Dupont"]["id"])
    assert edge is not None
    assert edge["confidence"] == 100
    assert edge["verified"] is True
    assert edge["sourceIds"]  # une ligne vérifiée cite toujours ses preuves


def test_a_registry_person_confirmed_by_the_official_page_stays_below_the_threshold():
    """RÉSULTAT NÉGATIF ASSUMÉ (mesure demandée) : registre + site officiel = 80.

    Les deux preuves sont de grounding A et remplissent le MÊME facteur p14
    (« source officielle », +30). Le +20 restant est réservé à une source de
    nature fournisseur/LinkedIn — que le registre n'est pas. Un mandataire social
    sans trace fournisseur reste donc « probable » (pointillé), pas « vérifié ».
    """
    g = assemble_org_graph(
        contacts=[_person("Jean Dupont", "DSI", source="pappers")],
        entities=_ENTITIES,
        official_directory=[_official("Jean Dupont", "Directeur Général")],
    )
    edge = _member_of(g, _by_name(g)["Jean Dupont"]["id"])
    assert edge is not None
    assert edge["confidence"] == 80
    assert edge["verified"] is False


def test_a_contact_without_any_provenance_becomes_sourced_by_the_page():
    """Sans provenance, l'ancien comportement retombait en grounding C (aucune
    ligne hiérarchique). La page officielle lui donne sa première vraie preuve."""
    contacts = [_person("Jean Dupont", "DSI", source="")]
    before = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    after = assemble_org_graph(
        contacts=contacts, entities=_ENTITIES, official_directory=[_official("Jean Dupont", "DSI")]
    )
    assert _member_of(before, _by_name(before)["Jean Dupont"]["id"]) is None
    edge = _member_of(after, _by_name(after)["Jean Dupont"]["id"])
    assert edge is not None and edge["confidence"] == 70 and edge["verified"] is False


def test_a_page_collected_long_ago_loses_the_freshness_bonus():
    contacts = [_person("Jean Dupont", "DSI", source="")]
    g = assemble_org_graph(
        contacts=contacts,
        entities=_ENTITIES,
        official_directory=[_official("Jean Dupont", "DSI", collected_at=_THREE_YEARS_AGO)],
    )
    edge = _member_of(g, _by_name(g)["Jean Dupont"]["id"])
    assert edge is not None and edge["confidence"] == 60  # 70 - 10 (fraîcheur)


def test_from_a_scraped_page_to_a_verified_line():
    """La chaîne complète, telle que le run l'exécute : une page du site du compte
    déjà scrapée → l'annuaire officiel → une ligne vérifiée dans le graphe."""
    pages = [
        {
            "url": "https://www.groupe-tf1.fr/fr/gouvernance",
            "title": "Gouvernance",
            "markdown": "### Jean Dupont\nDirecteur des Systèmes d'Information\n",
        }
    ]
    directory = collect_official_directory(
        pages, website="https://www.groupe-tf1.fr", collected_at=_TODAY
    )
    g = assemble_org_graph(
        contacts=[_person("Jean Dupont", "DSI")], entities=_ENTITIES, official_directory=directory
    )
    edge = _member_of(g, _by_name(g)["Jean Dupont"]["id"])
    assert edge is not None and edge["verified"] is True
    cited = {s["id"] for p in g["people"] for s in p["sources"]}
    assert set(edge["sourceIds"]) <= cited  # la ligne cite des sources qui existent


# ── Ce que la page ne prouve PAS ─────────────────────────────────────────────


def test_the_page_never_proves_a_reporting_line():
    """La page nomme des personnes et des fonctions — jamais « X rapporte à Y ».

    Déduire le N+1 de la mise en page serait exactement la donnée inventée que le
    produit s'interdit. La page ne rejoint donc PAS les preuves du lien de
    reporting : ajouter l'annuaire officiel ne doit rien changer à ce lien-là,
    ni à son rangement, ni à sa confiance.
    """
    contacts = [
        _person("Jean Dupont", "DSI"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]
    directory = [_official("Jean Dupont", "DSI"), _official("Marie Martin", "Responsable Data")]
    without = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    with_page = assemble_org_graph(contacts=contacts, entities=_ENTITIES, official_directory=directory)

    def _reporting(graph: dict) -> list[dict]:
        return [e for e in graph["influenceEdges"] if e["topic"] == "rattachement hiérarchique"]

    assert _reporting(with_page) == _reporting(without) != []
    # …et il n'est jamais promu en ligne hiérarchique par la page.
    assert not [e for e in with_page["hierarchyEdges"] if e["type"] == "reports_to"]


def test_only_the_person_actually_named_on_the_page_is_confirmed():
    contacts = [_person("Jean Dupont", "DSI"), _person("Marie Martin", "Responsable Data")]
    g = assemble_org_graph(
        contacts=contacts, entities=_ENTITIES, official_directory=[_official("Jean Dupont", "DSI")]
    )
    people = _by_name(g)
    assert any(s["kind"] == "official_site" for s in people["Jean Dupont"]["sources"])
    assert not any(s["kind"] == "official_site" for s in people["Marie Martin"]["sources"])


def test_a_near_miss_name_is_not_the_same_person():
    g = assemble_org_graph(
        contacts=[_person("Jean Dupont", "DSI")],
        entities=_ENTITIES,
        official_directory=[_official("Jean Dupond", "DSI")],
    )
    assert not any(s["kind"] == "official_site" for s in _by_name(g)["Jean Dupont"]["sources"])


def test_the_match_ignores_accents_and_case_like_the_rest_of_the_pipeline():
    g = assemble_org_graph(
        contacts=[_person("Sébastien Chauffray", "DSI")],
        entities=_ENTITIES,
        official_directory=[_official("SEBASTIEN CHAUFFRAY", "Directeur des SI")],
    )
    assert any(s["kind"] == "official_site" for s in _by_name(g)["Sébastien Chauffray"]["sources"])


# ── Additif : un compte sans page équipe produit le MÊME dossier ─────────────


def test_an_account_without_a_team_page_is_byte_identical():
    contacts = [
        _person("Jean Dupont", "DSI", source="pappers"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]
    before = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    for empty in (None, [], [_official("Personne Inconnue", "Directeur Général")]):
        assert assemble_org_graph(contacts=contacts, entities=_ENTITIES, official_directory=empty) == before


def test_a_malformed_directory_never_breaks_the_graph():
    contacts = [_person("Jean Dupont", "DSI")]
    before = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    junk = ["nope", 42, {}, {"fullName": ""}, {"fullName": "Jean Dupont"}]
    after = assemble_org_graph(contacts=contacts, entities=_ENTITIES, official_directory=junk)  # type: ignore[arg-type]
    # Une entrée sans URL ni date n'est pas une preuve citable : elle est ignorée.
    assert after == before
