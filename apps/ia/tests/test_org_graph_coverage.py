"""La couverture du compte cesse d'être plafonnée par la vague d'enrichissement.

Le défaut : ``CONTACTS_ENRICH_MAX`` (50) coupait la liste AVANT le prompt
organigramme ET avant l'assemblage. Sur un compte à 2 241 contacts découverts,
le graphe en portait 30 à 50 et rien, nulle part, ne disait que les autres
existaient — le commercial concluait raisonnablement « Bellum ne connaît que
ces gens-là ».

Ces tests tiennent les deux moitiés de la décorrélation :
  * ce que la VAGUE a enrichi reste plafonné (le coût ne bouge pas) ;
  * ce que le COMPTE contient est compté et dit.
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.graph import nodes
from app.models.outputs.contacts import (
    ApproachStep,
    ContactsOutput,
    DecisionChain,
    EnrichedContact,
    OrganigrammeOutput,
)
from app.services import org_graph_build
from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_build import build_org_graph_payload
from app.services.org_graph_validate import validate_org_graph


def _enriched(n: int) -> list[dict]:
    """``n`` contacts tels que la vague les rend (classés par le LLM)."""
    return [
        {
            "fullName": f"Enrichi {i}",
            "title": "Directeur des Systèmes d'Information",
            "entity": "Airbus SE",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "apollo",
            "bucket": "decideur",
        }
        for i in range(n)
    ]


def _seeds(n: int, *, title: str | None = "Ingénieur") -> list[dict]:
    """``n`` graines de découverte — ce que la phase 2 met en base.

    Une graine porte ``fullName`` / ``title`` / ``source``. Elle ne porte
    JAMAIS d'entité ni de rôle : c'est la classification qui les produit.
    """
    return [{"fullName": f"Graine {i}", "title": title, "source": "apollo"} for i in range(n)]


def _entities() -> list[dict]:
    return [{"name": "Airbus SE", "type": "groupe", "parentId": None, "siren": "383474814"}]


# ── Sans corpus : rien ne change ──────────────────────────────────────────


def test_sans_corpus_aucun_bloc_coverage():
    """Appelant qui ne passe pas le corpus : graphe identique à avant."""
    graph = assemble_org_graph(contacts=_enriched(3), entities=_entities())
    assert "coverage" not in graph


def test_le_graphe_reste_valide_avec_coverage():
    graph = assemble_org_graph(
        contacts=_enriched(3),
        entities=_entities(),
        discovered_contacts=_seeds(120),
    )
    assert validate_org_graph(graph) == []


# ── La décorrélation elle-même ────────────────────────────────────────────


def test_la_couverture_annonce_le_compte_pas_la_vague():
    """2 241 découverts, 50 enrichis : les deux nombres coexistent."""
    graph = assemble_org_graph(
        contacts=_enriched(50),
        entities=_entities(),
        discovered_contacts=_seeds(2241),
        enrichment_batch_size=50,
    )
    coverage = graph["coverage"]
    # 2 241 graines + 50 enrichis portant d'autres noms = 2 291 personnes connues.
    assert coverage["discovered"] == 2291
    assert coverage["llmEnriched"] == 50
    assert coverage["enrichmentBatchSize"] == 50
    # #2512 — le graphe grossit désormais jusqu'au compte : les 2 241 graines
    # entrent comme nœuds `seed`, à côté des 50 enrichis. « La couverture
    # annonce le compte » ne vaut plus seulement pour le CHIFFRE, mais pour
    # l'ORGANIGRAMME lui-même — c'est exactement le retour de Louis (« certains
    # comptes paraissent vides »).
    assert len(graph["people"]) == 2291


def test_le_nombre_de_noeuds_ne_borne_pas_le_decouvert():
    """Un compte à 500 contacts dont 2 enrichis annonce 500 découverts — et,
    depuis #2512, un graphe qui les porte tous les 502, pas seulement les 2."""
    graph = assemble_org_graph(
        contacts=_enriched(2),
        entities=_entities(),
        discovered_contacts=_seeds(500),
    )
    assert graph["coverage"]["discovered"] == 502
    assert len(graph["people"]) == 502


def test_une_personne_ecartee_reste_decouverte():
    """Le bruit sort du graphe, il ne sort pas du compte — et ne ressuscite pas
    sous forme de nœud `seed` si son nom réapparaît dans les graines (#2512)."""
    contacts = [
        *_enriched(2),
        {"fullName": "Stagiaire Bruit", "title": None, "source": "apollo", "bucket": "bruit"},
    ]
    graph = assemble_org_graph(contacts=contacts, entities=_entities(), discovered_contacts=_seeds(10))
    assert graph["coverage"]["discovered"] == 13
    assert graph["coverage"]["llmEnriched"] == 3
    # 2 enrichis + 10 graines (#2512) — « Stagiaire Bruit » reste écarté.
    assert len(graph["people"]) == 12
    assert "Stagiaire Bruit" not in {p["fullName"] for p in graph["people"]}


# ── #2512 — les DÉCOUVERTS non enrichis ENTRENT dans le graphe ────────────
#
# Louis, en recette : « par défaut, mettre aussi les gens NON ENRICHIS dans
# l'organigramme ; aujourd'hui certains paraissent vides et avec peu de
# profondeur ». Le web (`unenrichedOrgContacts`, focalOrgData.ts) affichait déjà
# ces gens À PART, sans niveau, faute de mieux — le vrai correctif est ici :
# l'assembleur les émet comme des nœuds `OrgPerson`, avec un niveau L0-L4
# DÉDUIT DU SEUL INTITULÉ (le même classifieur déterministe que
# `deterministicClassified`, 0 crédit), jamais deviné.


def test_un_decouvert_entre_dans_le_graphe_avec_un_niveau_deduit_du_titre():
    graph = assemble_org_graph(
        contacts=_enriched(1),
        entities=_entities(),
        discovered_contacts=[
            {"fullName": "Camille Voyer", "title": "Directeur des systèmes d'information", "source": "apollo"}
        ],
    )
    people = {p["fullName"]: p for p in graph["people"]}
    decouverte = people["Camille Voyer"]
    # « Directeur » place la personne en direction (L2) — la même règle
    # déterministe que pour un contact enrichi (`classify_hierarchy_level`).
    assert decouverte["hierarchyLevel"] == "L2"
    assert decouverte["identityStatus"] == "seed"
    assert decouverte["entityId"] is None
    # Rien n'est deviné au-delà du niveau : ni entité, ni rôle de décision.
    assert decouverte["decisionRoles"] == ["unknown"]


def test_un_decouvert_sans_titre_exploitable_a_un_niveau_absent_jamais_devine():
    """Intitulé absent ou illisible → niveau ABSENT (jamais deviné)."""
    graph = assemble_org_graph(
        contacts=_enriched(1),
        entities=_entities(),
        discovered_contacts=[{"fullName": "Sans Titre", "title": None, "source": "apollo"}],
    )
    people = {p["fullName"]: p for p in graph["people"]}
    decouverte = people["Sans Titre"]
    assert "hierarchyLevel" not in decouverte
    assert decouverte["identityStatus"] == "seed"


def test_un_decouvert_deja_dans_la_vague_ne_se_double_pas():
    """Même personne des deux côtés (rapprochée par nom normalisé) : UN nœud,
    la version ENRICHIE — pas un second nœud `seed` à côté."""
    graph = assemble_org_graph(
        contacts=_enriched(1),
        entities=_entities(),
        discovered_contacts=[
            {"fullName": "enrichi 0", "title": "Directeur des Systèmes d'Information", "source": "apollo"}
        ],
    )
    matches = [p for p in graph["people"] if p["fullName"].lower() == "enrichi 0"]
    assert len(matches) == 1
    assert matches[0]["identityStatus"] != "seed"


def test_sans_discovered_contacts_le_graphe_ne_gagne_aucun_noeud_seed():
    """`discovered_contacts` absent (défaut) : comportement byte-identique —
    même convention que pour `coverage` (voir plus haut)."""
    graph = assemble_org_graph(contacts=_enriched(1), entities=_entities())
    assert all(p["identityStatus"] != "seed" for p in graph["people"])


def test_sait_dire_non_retirer_literation_sur_discovered_contacts_ferait_echouer_ce_test():
    """Cliquet : si l'assembleur cesse d'itérer `discovered_contacts` pour
    émettre des nœuds, ce test tombe. `coverage`, lui, itère déjà
    `discovered_contacts` depuis avant ce correctif — ce test-ci porte
    spécifiquement sur `graph.people`, pas sur le compte."""
    graph = assemble_org_graph(
        contacts=[],
        entities=_entities(),
        discovered_contacts=[{"fullName": "Seule Graine", "title": "Ingénieur", "source": "apollo"}],
    )
    assert any(p["fullName"] == "Seule Graine" for p in graph["people"])


# ── Les invariants du contrat ─────────────────────────────────────────────


def test_enrichi_jamais_superieur_a_decouvert_meme_si_le_modele_ajoute_des_noms():
    """Le modèle rend 5 personnes là où le corpus en comptait 3.

    Sans l'union des noms, ``llmEnriched`` (5) dépasserait ``discovered`` (3) et
    le contrat refuserait le graphe entier. Une personne que le modèle nomme est
    une personne DÉCOUVERTE : elle entre dans le dénominateur.
    """
    graph = assemble_org_graph(
        contacts=_enriched(5),
        entities=_entities(),
        discovered_contacts=_seeds(3),
    )
    coverage = graph["coverage"]
    assert coverage["llmEnriched"] <= coverage["discovered"]
    assert coverage["discovered"] == 8


def test_un_meme_nom_des_deux_cotes_nest_compte_quune_fois():
    seeds = [{"fullName": "Jean Dupont", "title": "DSI", "source": "apollo"}]
    contacts = [
        {
            "fullName": "jean  DUPONT",
            "title": "DSI",
            "entity": "Airbus SE",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "apollo",
            "bucket": "decideur",
        }
    ]
    graph = assemble_org_graph(contacts=contacts, entities=_entities(), discovered_contacts=seeds)
    assert graph["coverage"]["discovered"] == 1
    assert graph["coverage"]["llmEnriched"] == 1


# ── « Non mesuré » n'est jamais « 0 » ─────────────────────────────────────


def test_le_rattachement_a_une_entite_nest_jamais_annonce():
    """Une graine ne porte pas d'entité : la compter donnerait le nombre
    d'ENRICHIS présenté comme un nombre de RATTACHÉS. Le trou reste nommé."""
    graph = assemble_org_graph(
        contacts=_enriched(50),
        entities=_entities(),
        discovered_contacts=_seeds(2241),
    )
    assert "attachedToEntity" not in graph["coverage"]


def test_la_taille_de_vague_absente_nest_pas_zero():
    graph = assemble_org_graph(contacts=_enriched(3), entities=_entities(), discovered_contacts=_seeds(10))
    assert "enrichmentBatchSize" not in graph["coverage"]


# ── #2543.5 : l'état de la source et sa population ANNONCÉE ────────────────


def test_letat_de_la_source_absent_nest_pas_invente():
    """Appelant qui ne mesure pas l'état Apollo : aucune clé sourceStatus /
    sourceTotalEntries — jamais un « ok » deviné."""
    graph = assemble_org_graph(contacts=_enriched(3), entities=_entities(), discovered_contacts=_seeds(10))
    assert "sourceStatus" not in graph["coverage"]
    assert "sourceTotalEntries" not in graph["coverage"]


def test_letat_de_la_source_traverse_jusquau_bloc_coverage():
    """Un appelant qui MESURE l'état Apollo (statut + population annoncée) le
    voit apparaître nommé dans `coverage` — c'est ce qui permet de distinguer
    « la source est tombée » d'un compte réellement vide."""
    graph = assemble_org_graph(
        contacts=_enriched(3),
        entities=_entities(),
        discovered_contacts=_seeds(5),
        apollo_source_status="rate_limited",
        apollo_total_entries=340,
    )
    assert graph["coverage"]["sourceStatus"] == "rate_limited"
    assert graph["coverage"]["sourceTotalEntries"] == 340


def test_build_org_graph_payload_porte_letat_de_la_source():
    payload = build_org_graph_payload(
        data={},
        contacts=_enriched(2),
        discovered_contacts=_seeds(5),
        apollo_source_status="down",
        apollo_total_entries=None,
    )
    coverage = payload["orgGraph"]["coverage"]
    assert coverage["sourceStatus"] == "down"
    assert "sourceTotalEntries" not in coverage


# ── #2543.5b : le résultat du repli, jusqu'à la couverture ─────────────────


def test_le_repli_absent_nest_pas_invente():
    """Appelant qui ne mesure pas le repli : aucune clé ``fallback`` dans
    ``coverage`` — jamais un « non tenté » deviné."""
    graph = assemble_org_graph(contacts=_enriched(3), entities=_entities(), discovered_contacts=_seeds(10))
    assert "fallback" not in graph["coverage"]


def test_le_repli_traverse_jusquau_bloc_coverage():
    """Trois états à distinguer, jamais confondus : non tenté, tenté (même
    0 trouvé), tenté et échoué (l'échec est NOMMÉ)."""
    graph = assemble_org_graph(
        contacts=_enriched(3),
        entities=_entities(),
        discovered_contacts=_seeds(5),
        apollo_fallback={"attempted": True, "foundCount": 0, "failure": None},
    )
    assert graph["coverage"]["fallback"] == {"attempted": True, "foundCount": 0, "failure": None}


def test_le_repli_echoue_porte_lechec_nomme():
    graph = assemble_org_graph(
        contacts=_enriched(3),
        entities=_entities(),
        discovered_contacts=_seeds(5),
        apollo_fallback={"attempted": True, "foundCount": None, "failure": "RateLimitError"},
    )
    assert graph["coverage"]["fallback"]["failure"] == "RateLimitError"
    assert graph["coverage"]["fallback"]["foundCount"] is None


def test_build_org_graph_payload_porte_le_repli():
    payload = build_org_graph_payload(
        data={},
        contacts=_enriched(2),
        discovered_contacts=_seeds(5),
        apollo_fallback={"attempted": True, "foundCount": 3, "failure": None},
    )
    coverage = payload["orgGraph"]["coverage"]
    assert coverage["fallback"] == {"attempted": True, "foundCount": 3, "failure": None}


def test_la_route_http_phase3_repasse_le_repli(client: TestClient) -> None:
    """Bouton « Enrichir l'organigramme » (#2543.5b) : le repli mesuré par une
    phase 2 précédente doit ressortir dans ``coverage.fallback`` — sinon
    chaque enrichissement à la demande efface l'état que la phase 2 a mesuré."""
    contacts_result = (
        ContactsOutput(
            contacts=[
                EnrichedContact(full_name="Jean Dupont", title="DSI", entity="Airbus SE", role="sponsor", priority=1)
            ]
        ),
        {"input_tokens": 100, "output_tokens": 50},
    )
    org_result = (
        OrganigrammeOutput(organigramme=[], decision_chain=DecisionChain(), uncovered_zones=[], approach_order=[]),
        {"input_tokens": 100, "output_tokens": 50},
    )

    async def side_effect(*_args, **kwargs):
        name = kwargs.get("prompt_name") or ""
        if name.startswith("bellum_contacts"):
            return contacts_result
        if name == "bellum_organigramme":
            return org_result
        raise AssertionError(f"unexpected prompt_name: {name}")

    with patch("app.services.classification.call_claude", new_callable=AsyncMock, side_effect=side_effect):
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc-123",
                "contacts": [{"fullName": "Ada Lovelace", "title": "Ingénieure"}],
                "profile_data": {"companyName": "Airbus", "offers": ["Cloud"]},
                "apollo_fallback": {"attempted": True, "foundCount": 2, "failure": None},
            },
        )

    assert res.status_code == 200
    coverage = res.json()["data"]["org_graph"]["orgGraph"]["coverage"]
    assert coverage["fallback"] == {"attempted": True, "foundCount": 2, "failure": None}


# ── Le classement déterministe — 0 crédit ─────────────────────────────────


def test_le_classement_deterministe_couvre_le_corpus_entier():
    """Un titre situable place la personne SANS un seul appel au modèle.

    C'est la moitié gratuite de la couverture : 2 103 personnes classées sur
    2 241 alors que 50 seulement ont coûté un crédit.
    """
    situables = [{"fullName": f"Dir {i}", "title": "Directeur Technique", "source": "apollo"} for i in range(30)]
    illisibles = [{"fullName": f"Vide {i}", "title": None, "source": "apollo"} for i in range(20)]
    graph = assemble_org_graph(
        contacts=[],
        entities=_entities(),
        discovered_contacts=[*situables, *illisibles],
    )
    coverage = graph["coverage"]
    assert coverage["discovered"] == 50
    assert coverage["deterministicClassified"] == 30
    assert coverage["llmEnriched"] == 0


def test_un_corpus_entierement_illisible_annonce_zero_classe():
    """Ici « 0 » est VRAI : on a lu 10 titres et aucun ne situe personne."""
    graph = assemble_org_graph(
        contacts=[],
        entities=_entities(),
        discovered_contacts=_seeds(10, title=None),
    )
    assert graph["coverage"]["deterministicClassified"] == 0
    assert graph["coverage"]["discovered"] == 10


# ── Le payload complet (les deux chemins de production) ───────────────────


def test_build_org_graph_payload_sans_corpus_ne_change_rien():
    payload = build_org_graph_payload(data={}, contacts=_enriched(3))
    assert "coverage" not in payload["orgGraph"]


def test_build_org_graph_payload_porte_la_couverture_et_la_taille_de_vague():
    payload = build_org_graph_payload(
        data={},
        contacts=_enriched(4),
        discovered_contacts=_seeds(300),
    )
    coverage = payload["orgGraph"]["coverage"]
    assert coverage["discovered"] == 304
    assert coverage["llmEnriched"] == 4
    # La taille de vague vient de son UNIQUE réglage (`CONTACTS_ENRICH_MAX`),
    # pas d'une constante recopiée ici.
    from app.services.classification import CONTACTS_ENRICH_MAX

    assert coverage["enrichmentBatchSize"] == CONTACTS_ENRICH_MAX


# ── D405 : la date de dérivation du run (GA-139) ───────────────────────────
#
# `assemble_org_graph` reste PUR : sans `derived_at`, il n'invente rien. La
# VRAIE horloge du run vit ici — `build_org_graph_payload` est la porte
# d'entrée qui sait réellement quand le run a lieu.


def _reporting_contacts() -> list[dict]:
    """Un contact avec `reportingTo` : garantit une influenceEdge (le lien
    reste `llm`, jamais promu en hiérarchie — voir `org_resolver`)."""
    return [
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "entity": "Airbus SE",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "pappers",
            "bucket": "decideur",
        },
        {
            "fullName": "Marie Martin",
            "title": "Responsable Data",
            "entity": "Airbus SE",
            "role": "user",
            "hierarchyLevel": "management",
            "source": "apollo",
            "reportingTo": "Jean Dupont",
            "bucket": "operationnel",
        },
    ]


def test_build_org_graph_payload_pose_une_seule_date_de_derivation_par_run():
    payload = build_org_graph_payload(data={}, contacts=_reporting_contacts())
    edges = payload["orgGraph"]["influenceEdges"]
    assert len(edges) > 0, "corpus vide : rien à vérifier"
    dates = {e["derivedAt"] for e in edges}
    assert len(dates) == 1  # une seule date pour tout le run, pas une par edge

    from datetime import datetime

    datetime.fromisoformat(next(iter(dates)))  # lève si ce n'est pas une vraie date ISO


def test_build_org_graph_payload_respecte_une_date_de_derivation_explicite():
    payload = build_org_graph_payload(data={}, contacts=_reporting_contacts(), derived_at="2026-08-30T09:00:00+00:00")
    edges = payload["orgGraph"]["influenceEdges"]
    assert edges and all(e["derivedAt"] == "2026-08-30T09:00:00+00:00" for e in edges)


def test_3820_build_org_graph_payload_transmet_le_cadrage_a_lassembleur():
    """#3820 — `scope_selection` (ville/site compris) n'atteignait JAMAIS
    `assemble_org_graph` depuis ce point d'appel : l'appelant manquait,
    littéralement — du code juste (`assemble_org_graph` sait déjà filtrer sur
    `scope_selection`) que personne n'appelait avec le bon argument."""
    captured = {}
    original = org_graph_build.assemble_org_graph

    def _spy(**kwargs):
        captured.update(kwargs)
        return original(**kwargs)

    scope = {"geo_perimeter": "city", "geo_areas": ["Lille"]}
    with patch("app.services.org_graph_build.assemble_org_graph", side_effect=_spy):
        build_org_graph_payload(data={}, contacts=_reporting_contacts(), scope_selection=scope)

    assert captured.get("scope_selection") == scope


def test_3820_sans_cadrage_le_comportement_reste_byte_identique():
    captured = {}
    original = org_graph_build.assemble_org_graph

    def _spy(**kwargs):
        captured.update(kwargs)
        return original(**kwargs)

    with patch("app.services.org_graph_build.assemble_org_graph", side_effect=_spy):
        build_org_graph_payload(data={}, contacts=_reporting_contacts())

    assert captured.get("scope_selection") is None


# ── Le CÂBLAGE — la moitié que les tests d'unité ne voient pas ────────────
#
# Les tests ci-dessus prouvent que l'assembleur sait compter. Ils ne prouvent
# RIEN sur ce que les deux chemins de production lui donnent à compter : en
# remplaçant `state["contacts"]` par la vague au point d'appel, ils restaient
# tous verts pendant que la couverture redevenait le plafond de 50. C'est le
# défaut n°1 du dépôt — du code juste que personne n'appelle correctement —
# et ces deux tests-ci sont la porte qui le voit.


def _fake_classifier_agent(contacts: list[EnrichedContact]):
    class FakeAgent:
        async def run(self, company, profile, research, contacts_in, *, account_feedback=""):
            from app.models.agent_envelope import AgentEnvelope, AgentMeta, AgentStatus
            from app.models.classified_data import ClassifiedData

            return AgentEnvelope[ClassifiedData](
                status=AgentStatus.SUCCESS,
                data=ClassifiedData(contacts=[c.model_dump(by_alias=True) for c in contacts]),
                meta=AgentMeta(
                    agent_name="bellum_contacts",
                    agent_version="1.0.0",
                    started_at="2026-08-29T00:00:00Z",
                    finished_at="2026-08-29T00:00:01Z",
                    duration_ms=1000,
                ),
            )

    return FakeAgent


@pytest.mark.asyncio
async def test_le_noeud_du_run_passe_le_corpus_ENTIER_pas_la_vague(monkeypatch):
    """`classify_node` doit donner `state["contacts"]` (la découverte), pas la
    liste classée. Passer la seconde ramènerait la couverture au plafond de 50 —
    c'est-à-dire au défaut d'origine, avec un bandeau pour le rendre crédible."""
    classified = [EnrichedContact(full_name="Jean Dupont", title="DSI", entity="Airbus SE", role="sponsor", priority=1)]
    monkeypatch.setattr(nodes, "ClassifierAgent", _fake_classifier_agent(classified))
    monkeypatch.setattr(nodes, "enrich_top_deciders", AsyncMock(side_effect=lambda c, _n, **_kw: c))
    captured: dict = {}

    def fake_assemble(**kwargs):
        captured.update(kwargs)
        return {"graphVersion": 1}

    monkeypatch.setattr(org_graph_build, "assemble_org_graph", fake_assemble)

    await nodes.classify_node({"company_name": "Airbus", "contacts": _seeds(120)})

    assert len(captured["discovered_contacts"]) == 120
    # …et surtout : ce n'est PAS la vague qui a été passée.
    assert len(captured["contacts"]) == 1


@pytest.mark.asyncio
async def test_classify_node_alimente_letat_de_la_source(monkeypatch):
    """#2543.5a — ``build_org_graph_payload`` accepte déjà ``apollo_source_status``
    / ``apollo_total_entries`` (voir tests ci-dessus) ; celui-ci prouve que
    ``classify_node`` les LIT réellement depuis l'état du graphe (posé par
    ``contacts_node``, voir test_analysis_graph.py) au lieu de les laisser à
    ``None`` sur le chemin qui alimente réellement le dossier."""
    classified = [EnrichedContact(full_name="Jean Dupont", title="DSI", entity="Airbus SE", role="sponsor", priority=1)]
    monkeypatch.setattr(nodes, "ClassifierAgent", _fake_classifier_agent(classified))
    monkeypatch.setattr(nodes, "enrich_top_deciders", AsyncMock(side_effect=lambda c, _n, **_kw: c))
    captured: dict = {}

    def fake_assemble(**kwargs):
        captured.update(kwargs)
        return {"graphVersion": 1}

    monkeypatch.setattr(org_graph_build, "assemble_org_graph", fake_assemble)

    await nodes.classify_node(
        {
            "company_name": "Airbus",
            "contacts": _seeds(3),
            "apollo_source_status": "rate_limited",
            "apollo_total_entries": 340,
        }
    )

    assert captured["apollo_source_status"] == "rate_limited"
    assert captured["apollo_total_entries"] == 340


def test_la_route_http_passe_le_corpus_recu(client: TestClient) -> None:
    """Bouton « Enrichir l'organigramme » : l'API envoie tous les contacts du
    compte, la route doit les compter — pas seulement ceux que le modèle rend."""
    contacts_result = (
        ContactsOutput(
            contacts=[
                EnrichedContact(full_name="Jean Dupont", title="DSI", entity="Airbus SE", role="sponsor", priority=1)
            ]
        ),
        {"input_tokens": 100, "output_tokens": 50},
    )
    org_result = (
        OrganigrammeOutput(organigramme=[], decision_chain=DecisionChain(), uncovered_zones=[], approach_order=[]),
        {"input_tokens": 100, "output_tokens": 50},
    )

    async def side_effect(*_args, **kwargs):
        name = kwargs.get("prompt_name") or ""
        if name.startswith("bellum_contacts"):
            return contacts_result
        if name == "bellum_organigramme":
            return org_result
        raise AssertionError(f"unexpected prompt_name: {name}")

    with patch("app.services.classification.call_claude", new_callable=AsyncMock, side_effect=side_effect):
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc-123",
                "contacts": [{"fullName": f"Découvert {i}", "title": "Ingénieur"} for i in range(80)],
                "profile_data": {"companyName": "Airbus", "offers": ["Cloud"]},
            },
        )

    assert res.status_code == 200
    coverage = res.json()["data"]["org_graph"]["orgGraph"]["coverage"]
    # 80 découverts + « Jean Dupont » que le modèle nomme = 81.
    assert coverage["discovered"] == 81
    assert coverage["llmEnriched"] == 1


# ── #2755 : le bouton « Enrichir l'organigramme » relit un research persisté,
# donc snake_case ─────────────────────────────────────────────────────────


def test_la_route_http_lit_le_research_snake_case_de_raw_analysis(client: TestClient) -> None:
    """Sur le chemin bouton, ``profile_data`` = ``account.raw_analysis`` — TOUJOURS
    snake_case (``accounts.service.ts:3404`` fait passer tout le blob par
    ``toSnakeCaseKeys`` avant persistance). Sans repli snake_case, ``entities_
    exhaustive``/``sales_context``/``official_directory`` étaient invisibles
    ici alors qu'ils existent en base : le graphe restait vide malgré une
    classification réussie."""
    contacts_result = (
        ContactsOutput(
            contacts=[
                EnrichedContact(
                    full_name="Jean Dupont",
                    title="Présidente du conseil d'administration",
                    role="sponsor",
                    priority=1,
                    source="apollo",
                ),
                EnrichedContact(
                    full_name="Marie Martin",
                    title="Directeur Technique",
                    role="champion",
                    priority=2,
                    source="apollo",
                ),
            ]
        ),
        {"input_tokens": 100, "output_tokens": 50},
    )
    org_result = (
        OrganigrammeOutput(
            organigramme=[],
            decision_chain=DecisionChain(),
            uncovered_zones=[],
            approach_order=[
                ApproachStep(step=1, contact="Jean Dupont"),
                ApproachStep(step=2, contact="Marie Martin"),
            ],
        ),
        {"input_tokens": 100, "output_tokens": 50},
    )

    async def side_effect(*_args, **kwargs):
        name = kwargs.get("prompt_name") or ""
        if name.startswith("bellum_contacts"):
            return contacts_result
        if name == "bellum_organigramme":
            return org_result
        raise AssertionError(f"unexpected prompt_name: {name}")

    with patch("app.services.classification.call_claude", new_callable=AsyncMock, side_effect=side_effect):
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc-123",
                "contacts": [
                    {"fullName": "Jean Dupont", "title": "Présidente du conseil d'administration"},
                    {"fullName": "Marie Martin", "title": "Directeur Technique"},
                ],
                "profile_data": {
                    "companyName": "Airbus",
                    "entities_exhaustive": [{"name": "Airbus Defence and Space"}],
                    "sales_context": {"relationship": {"state": "connu"}},
                    "official_directory": [
                        {
                            "full_name": "Jean Dupont",
                            "url": "https://airbus.com/gouvernance",
                            "collected_at": "2026-09-01",
                        }
                    ],
                },
            },
        )

    assert res.status_code == 200
    org_graph = res.json()["data"]["org_graph"]["orgGraph"]

    # entities_exhaustive (snake_case) nourrit `entities`.
    entity_names = {e["name"] for e in org_graph["entities"]}
    assert "Airbus Defence and Space" in entity_names

    # official_directory (snake_case) : Jean Dupont gagne une source
    # `official_site` et une confiance plancher à 85.
    jean = next(p for p in org_graph["people"] if p["fullName"] == "Jean Dupont")
    assert any(s["kind"] == "official_site" for s in jean["sources"])
    assert jean["confidence"] >= 85

    # sales_context (snake_case) : relation "connu" = compte chaud, le
    # garde-fou DoD (board jamais en 1re approche à froid) ne démote PAS
    # Jean Dupont (gouvernance, L0) — il reste 1er du chemin recommandé.
    assert org_graph["recommendedPath"][0]["personId"] == jean["id"]


def test_lechec_dassemblage_est_journalise_avec_la_trace(caplog: pytest.LogCaptureFixture) -> None:
    """Best-effort par construction (docstring de ``build_org_graph_payload``) :
    un raté d'assemblage du graphe TYPÉ ne doit jamais faire perdre les clés
    héritées ni faire échouer la classification — mais il ne doit plus
    disparaître en silence (#2755) : sans trace ERROR, un ``org_graph`` vide en
    prod n'était pas diagnosticable."""
    with (
        patch("app.services.org_graph_build.assemble_org_graph", side_effect=RuntimeError("boom")),
        caplog.at_level(logging.ERROR, logger="app.services.org_graph_build"),
    ):
        payload = build_org_graph_payload(
            data={"organigramme": [{"contact": "Jean Dupont"}]},
            contacts=_enriched(1),
        )

    assert "orgGraph" not in payload
    assert payload["organigramme"] == [{"contact": "Jean Dupont"}]
    error_records = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert error_records, "l'échec d'assemblage doit être journalisé en ERROR"
    assert error_records[0].exc_info is not None


# ── #4749 — une graine qui PORTE son entité y est rattachée, jamais devinée ──
#
# Mesuré en production : 1 673 personnes, 0 `entityId`. La graine n'était jamais tentée, même quand
# elle nomme l'entité du compte. Le rattachement ne se fait QUE sur le nom d'entité exact (la même
# clé que la vague) — jamais sur le nom de la personne, le secteur ou un intitulé approchant.


def test_une_graine_qui_nomme_une_entite_connue_y_est_rattachee():
    graph = assemble_org_graph(
        contacts=_enriched(1),
        entities=_entities(),
        discovered_contacts=[
            {"fullName": "Graine Rattachee", "title": "Ingénieur", "source": "apollo", "entity": "Airbus SE"}
        ],
    )
    people = {p["fullName"]: p for p in graph["people"]}
    entity_id = next(e["id"] for e in graph["entities"] if e["name"] == "Airbus SE")
    assert people["Graine Rattachee"]["entityId"] == entity_id
    assert validate_org_graph(graph) == []


def test_une_graine_sans_entite_ou_a_entite_inconnue_reste_non_rattachee():
    graph = assemble_org_graph(
        contacts=_enriched(1),
        entities=_entities(),
        discovered_contacts=[
            {"fullName": "Graine Muette", "title": "Ingénieur", "source": "apollo"},
            {"fullName": "Graine Inconnue", "title": "Ingénieur", "source": "apollo", "entity": "Autre Societe"},
            {"fullName": "Airbus SE", "title": "Ingénieur", "source": "apollo"},
        ],
    )
    people = {p["fullName"]: p for p in graph["people"]}
    assert people["Graine Muette"].get("entityId") is None
    assert people["Graine Inconnue"].get("entityId") is None
    # Un NOM DE PERSONNE qui ressemble à une entité n'en est jamais un signal.
    assert people["Airbus SE"].get("entityId") is None
