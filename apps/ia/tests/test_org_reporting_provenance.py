"""Une preuve d'IDENTITÉ ne prouve jamais une RELATION (paquet OrgGraph FINAL, §6).

Le défaut, mesuré sur `main` : le champ `reportingTo` du prompt contacts demande
« à qui cette personne rapporte **probablement** (titre du N+1) » — c'est une
SUPPOSITION du modèle. L'assembleur lui attachait pourtant la provenance
d'IDENTITÉ de la personne (Apollo, Pappers…) et la faisait entrer dans
`hierarchyEdges` :

    apollo   → grounding B, confiance 60, ligne hiérarchique tracée
    pappers  → grounding A (« source officielle » +30), confiance 70

Le registre prouve que Marie Martin EXISTE et qui elle est. Il n'a jamais observé
à qui elle rapporte. Un « probablement » du modèle se présentait donc à l'écran
avec la caution d'un registre légal.

Le fichier savait déjà faire juste vingt lignes plus bas : les relations typées
de `llm_relations` portent une provenance `llm` → grounding C → le resolver les
range en INFLUENCE, plafond 49. `reportingTo` contournait ce garde-fou pour la
seule raison qu'il arrivait comme un CHAMP du contact et non comme une entrée de
`llm_relations`. C'est le motif « la garde protège la forme qu'elle a vue, pas la
règle ».

Ce que ces tests tiennent :
  · un `reportingTo` ne peut plus produire de ligne hiérarchique, quelle que soit
    la provenance d'identité de la personne (la GARDE, qui balaie tout le corpus
    `_SOURCE_TO_KIND`) ;
  · il reste une PISTE d'influence, nommée comme telle et plafonnée ;
  · la capacité de tracer une vraie ligne hiérarchique vérifiée est INTACTE —
    elle demande une preuve qui a réellement observé le lien (contrôle négatif) ;
  · `member_of` n'est pas touché : sa convergence provenance + page officielle
    continue de le faire monter jusqu'à « vérifié » (non-régression).
"""

from __future__ import annotations

import pytest

from app.services.org_confidence import LLM_ONLY_CEILING, VERIFIED_MIN
from app.services.org_graph_assembler import _SOURCE_TO_KIND, assemble_org_graph
from app.services.org_graph_validate import validate_org_graph
from app.services.org_resolver import EdgeSource, grounding_for, resolve_edges

_ENTITIES = [
    {"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"},
]

#: Le sujet que l'assembleur donne à une relation de reporting.
_REPORTING_TOPIC = "rattachement hiérarchique"


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


def _official(full_name: str, title: str) -> dict:
    return {
        "fullName": full_name,
        "title": title,
        "url": "https://www.tf1.fr/gouvernance",
        "collectedAt": "2026-08-20",
    }


def _graph(provider: str, **kwargs) -> dict:
    """Le cas réel : le modèle a écrit « Marie rapporte au DSI »."""
    contacts = [
        _person("Jean Dupont", "DSI", source=provider),
        _person(
            "Marie Martin",
            "Responsable Data",
            hierarchyLevel="management",
            source=provider,
            reportingTo="DSI",
        ),
    ]
    return assemble_org_graph(contacts=contacts, entities=_ENTITIES, **kwargs)


def _reporting_lines(graph: dict) -> list[dict]:
    return [e for e in graph["hierarchyEdges"] if e["type"] == "reports_to"]


def _reporting_hints(graph: dict) -> list[dict]:
    return [e for e in graph["influenceEdges"] if e["topic"] == _REPORTING_TOPIC]


def _by_name(graph: dict) -> dict[str, dict]:
    return {p["fullName"]: p for p in graph["people"]}


# ── Le défaut ────────────────────────────────────────────────────────────────


def test_a_provider_identity_no_longer_draws_a_reporting_line():
    """Apollo prouve que Marie Martin existe. Pas à qui elle rapporte.

    Avant : `hierarchyEdges` contenait un `reports_to` à 60 de confiance.
    """
    g = _graph("apollo")
    assert _reporting_lines(g) == []
    assert validate_org_graph(g) == []


def test_a_legal_registry_no_longer_lends_its_grounding_a_to_a_guess():
    """Le pire cas : Pappers vaut grounding A (+30 « source officielle »).

    Avant : une ligne hiérarchique à 70, portant la caution du registre légal.
    """
    assert grounding_for(_SOURCE_TO_KIND["pappers"]) == "A"
    g = _graph("pappers")
    assert _reporting_lines(g) == []


def test_the_guess_survives_as_an_influence_hint_named_for_what_it_is():
    """Un lien absent n'est pas la réponse : la piste reste, correctement qualifiée."""
    g = _graph("apollo")
    (hint,) = _reporting_hints(g)
    people = _by_name(g)
    assert (hint["fromId"], hint["toId"]) == (people["Marie Martin"]["id"], people["Jean Dupont"]["id"])
    assert hint["confidence"] <= LLM_ONLY_CEILING
    # La raison DIT que c'est une supposition du modèle — c'est ce que le
    # commercial lit à l'écran avant de décider d'y croire.
    assert hint["reasoning"].strip()
    assert "modèle" in hint["reasoning"].lower()


def test_the_reporting_hint_never_cites_the_person_identity_record():
    """La provenance d'identité reste sur ce qu'elle a réellement observé.

    Structurel : les ids de source d'une personne n'apparaissent QUE sur des
    lignes de rattachement (`member_of`), jamais sur une ligne de reporting.
    """
    g = _graph("pappers")
    identity_ids = {s["id"] for p in g["people"] for s in p["sources"]}
    assert identity_ids  # le corpus n'est pas vide : les personnes ONT une provenance
    for edge in g["hierarchyEdges"]:
        if edge["type"] == "reports_to":
            pytest.fail(f"une ligne de reporting subsiste : {edge}")
        assert edge["type"] == "member_of"


# ── LA GARDE : elle LIT un corpus, et elle sait dire NON ─────────────────────


def test_guard_no_identity_provenance_can_back_a_reporting_line():
    """Balaie TOUTE la table des provenances, pas le seul cas qu'on avait vu.

    Le défaut d'origine venait exactement de là : la règle était comprise pour
    `llm_relations` et pas appliquée à `reportingTo`. Une garde qui ne
    vérifierait qu'Apollo laisserait repasser Pappers.
    """
    # 1. La garde LIT quelque chose — et c'est bien le corpus de production.
    corpus = dict(_SOURCE_TO_KIND)
    assert len(corpus) >= 5, "corpus de provenances vide ou tronqué : la garde ne lit rien"
    assert {"apollo", "pappers", "manual", "brave_search", "ia_reconstruction"} <= set(corpus)
    groundings = {grounding_for(kind) for kind in corpus.values()}
    assert {"A", "B", "C"} <= groundings, "le corpus doit contenir des provenances A ET B, sinon il ne prouve rien"

    # 2. La garde sait dire NON — pour CHACUNE d'elles.
    #
    # Mesuré en cassant le code exprès : rétablir la seule provenance d'identité
    # sur `reports_to` ne fait repasser QUE Pappers au-dessus du seuil de 50
    # (55) — Apollo tombe à 45 et le lien part en « zone à vérifier ». Une garde
    # qui n'aurait testé qu'Apollo aurait donc été verte sur du code fautif, et
    # une garde qui ne vérifierait que l'absence de ligne accepterait une
    # régression qui SUPPRIME le lien. D'où les deux sens, sur tout le corpus.
    checked = 0
    for provider in [*corpus, "", "fournisseur-jamais-vu"]:
        g = _graph(provider)
        assert _reporting_lines(g) == [], (
            f"provenance {provider!r} : une supposition du modèle est redevenue "
            f"une ligne hiérarchique — une preuve d'identité ne prouve pas une relation"
        )
        hints = _reporting_hints(g)
        assert len(hints) == 1, (
            f"provenance {provider!r} : la piste de reporting a disparu — un lien "
            f"requalifié doit rester visible, pas être supprimé"
        )
        assert hints[0]["confidence"] <= LLM_ONLY_CEILING, provider
        assert validate_org_graph(g) == []
        checked += 1
    assert checked == len(corpus) + 2


# ── Contrôle négatif n°1 : la capacité n'est pas désactivée ─────────────────


def test_a_source_that_really_observed_the_link_still_draws_a_verified_line():
    """Ce qu'on a retiré est la FAUSSE preuve, pas la possibilité d'en avoir une.

    Un organigramme publié, corroboré par le profil fournisseur de la personne, a
    lui réellement observé le rattachement : le resolver en fait toujours une
    ligne VÉRIFIÉE. C'est le chemin qu'emprunte « Vérifier ce lien »
    (`/org/verify-relation`), qui cherche cette preuve-là sur demande.
    """
    resolved = resolve_edges(
        [
            {
                "fromId": "p-marie-martin",
                "toId": "p-jean-dupont",
                "relation": "reports_to",
                "sources": [
                    EdgeSource(id="s-orgchart", kind="org_chart", fresh=True),
                    EdgeSource(id="s-provider", kind="linkedin", fresh=True),
                ],
                "explicit_title": True,
                "same_org_id": True,
            }
        ]
    )
    (edge,) = resolved.hierarchy
    assert edge["type"] == "reports_to"
    assert edge["confidence"] >= VERIFIED_MIN and edge["verified"] is True
    assert edge["sourceIds"] == ["s-orgchart", "s-provider"]


# ── Contrôle négatif n°2 : `member_of` n'est pas touché ─────────────────────


def test_member_of_keeps_its_provenance_and_its_official_page_bonus():
    """La convergence « provenance fournisseur + page officielle » est ce qui fait
    monter le rattachement jusqu'à vérifié. Le correctif ne doit pas l'entamer.

    ⚠️ Le rattachement NU vaut 50, pas 60 : fournisseur (20) + titre explicite (15)
    + même organisation (15). Le +10 de fraîcheur a disparu parce qu'il était
    affirmé EN DUR sur une provenance sans date (archive 05 §O2) — « une date
    absente n'est jamais remplacée par la date du jour ». La page officielle, elle,
    porte son `collectedAt` : sa fraîcheur est DÉMONTRÉE, et le lien atteint 100.
    """
    directory = [_official("Jean Dupont", "DSI"), _official("Marie Martin", "Responsable Data")]

    plain = _graph("apollo")
    member_of_plain = [e for e in plain["hierarchyEdges"] if e["type"] == "member_of"]
    assert len(member_of_plain) == 2
    assert all(e["confidence"] == 50 and e["verified"] is False for e in member_of_plain)

    with_page = _graph("apollo", official_directory=directory)
    member_of_page = [e for e in with_page["hierarchyEdges"] if e["type"] == "member_of"]
    assert len(member_of_page) == 2
    assert all(e["confidence"] == 100 and e["verified"] is True for e in member_of_page)
    assert all(e["sourceIds"] for e in member_of_page)


def test_the_official_page_still_proves_nothing_about_the_reporting_line():
    """Une page équipe nomme des fonctions ; elle ne dit pas qui rapporte à qui.
    Elle ne doit donc pas relever la piste de reporting non plus."""
    directory = [_official("Jean Dupont", "DSI"), _official("Marie Martin", "Responsable Data")]
    without = _reporting_hints(_graph("apollo"))
    with_page = _reporting_hints(_graph("apollo", official_directory=directory))
    assert [e["confidence"] for e in with_page] == [e["confidence"] for e in without]
    assert _reporting_lines(_graph("apollo", official_directory=directory)) == []


# ── Le N+1 reste RÉSOLU : on change sa preuve, pas sa résolution ────────────


def test_the_manager_is_still_resolved_by_title_and_by_name():
    """La résolution du N+1 (titre « DSI » → la personne) reste acquise —
    c'est la PREUVE du lien qui change, pas la capacité à désigner la cible."""
    by_title = _graph("apollo")
    people = _by_name(by_title)
    (hint,) = _reporting_hints(by_title)
    assert (hint["fromId"], hint["toId"]) == (people["Marie Martin"]["id"], people["Jean Dupont"]["id"])

    g = assemble_org_graph(
        contacts=[
            _person("Jean Dupont", "DSI"),
            _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="Jean Dupont"),
        ],
        entities=_ENTITIES,
    )
    assert len(_reporting_hints(g)) == 1


def test_an_ambiguous_title_still_creates_nothing_at_all():
    """Deux « DSI » : on ne choisit toujours pas — ni ligne, ni piste."""
    g = assemble_org_graph(
        contacts=[
            _person("Jean Dupont", "DSI"),
            _person("Paul Durand", "DSI"),
            _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
        ],
        entities=_ENTITIES,
    )
    assert _reporting_lines(g) == [] and _reporting_hints(g) == []


# ── Le même lien n'est pas annoncé deux fois ────────────────────────────────


def test_the_same_reporting_relation_is_never_listed_twice():
    """`reportingTo` et `hierarchyRelations` disent parfois la MÊME chose. Depuis
    qu'ils suivent le même chemin, ils atterriraient côte à côte sur l'écran."""
    contacts = [
        _person("Jean Dupont", "DSI"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]
    g = assemble_org_graph(
        contacts=contacts,
        entities=_ENTITIES,
        llm_relations=[
            {
                "type": "reports_to",
                "from": "Marie Martin",
                "to": "Jean Dupont",
                "evidence": "page équipe",
                "reasoning": "le modèle le déduit de l'organisation Data",
            }
        ],
    )
    assert len(_reporting_hints(g)) == 1
    assert _reporting_lines(g) == []
