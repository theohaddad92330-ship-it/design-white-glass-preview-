"""GA-98 / GA-99 — une preuve ne porte QUE ce qu'elle a observé.

Ce que ce fichier tient, et pourquoi il existe À CÔTÉ de
``test_org_reporting_provenance.py`` plutôt qu'à sa place.

Le P0 du paquet OrgGraph (§6 du FINAL, décision n°6) a été corrigé le 29/08 :
``reportingTo`` ne porte plus la provenance d'IDENTITÉ de la personne, il suit le
chemin de ``llm_relations`` — grounding C, rangé en influence, plafond 49.
``test_org_reporting_provenance.py`` tient ce correctif de bout en bout.

Il tient une FORME. Le champ ``reportingTo``, sa résolution par titre, ses huit
provenances. Or le défaut d'origine n'était pas une forme, c'était une RÈGLE
appliquée à un producteur et pas à l'autre : la règle était comprise pour
``llm_relations``, écrite en commentaire au-dessus de ``member_of``, et
``reportingTo`` la contournait « uniquement parce qu'il arrive comme un CHAMP du
contact ». Le jour où un nouveau champ, un nouveau producteur ou une nouvelle
relation typée réutilise ``identity_evidence``, le P0 rouvre et
``test_org_reporting_provenance.py`` reste VERT — il ne regarde pas par là.
C'est très exactement le motif que le FINAL nomme : « la garde protège la forme
qu'elle a vue, pas la règle. »

Ce qui manquait pour garder la règle elle-même, c'est que la règle soit un
MÉCANISME. Le vocabulaire existait — ``orgClaimSchema`` (`identity` · `title` ·
`level` · `membership` · `roles` · `relation`) — et l'assembleur l'ÉCRIVAIT
consciencieusement sur chaque ``OrgSource``. Personne ne le LISAIT : le chemin
qui score un lien (``EdgeSource`` → ``factors_from_sources`` →
``compute_confidence`` → ``route_for``) n'a aucune notion de claim. La séparation
tenait par deux expressions écrites à la main et par des commentaires. Côté API,
au contraire, le claim EST lu (``ORG_CORRECTION_CLAIM_BY_FIELD``, chemin des
corrections humaines) : la règle était donc mécanique d'un côté et déclarative de
l'autre. C'est le motif « du code juste que personne n'appelle ».

Depuis, l'assembleur passe TOUT candidat par ``_honour_claims`` :

  GA-98  une preuve dont le claim n'étaye pas la relation ne compte pas pour elle.
         En particulier `identity` — « ce fournisseur a vu que cette personne
         existe » — n'étaye JAMAIS un lien entre DEUX PERSONNES.
  GA-99  une preuve dont on ne sait pas ce qu'elle prouve n'étaye rien non plus.
         C'est la moitié qui ferme la porte aux formes qu'on n'a pas encore vues :
         un producteur neuf qui forge un ``EdgeSource`` sans déclarer son claim
         est refusé par le code, pas par un relecteur.

Et le lien n'est pas effacé : « on ne falsifie pas la structure ». Il est DÉGRADÉ
à ce qu'il est — une inférence, qui garde sa cible et dit pourquoi elle n'est
qu'une piste.
"""

from __future__ import annotations

import pytest

from app.services.org_confidence import LLM_ONLY_CEILING
from app.services.org_graph_assembler import (
    _CLAIMS_BACKING,
    _SOURCE_TO_KIND,
    _honour_claims,
    assemble_org_graph,
)
from app.services.org_resolver import HIERARCHY_RELATIONS, EdgeSource

#: Les six claims du contrat (`packages/contracts/src/schemas/org-graph.ts`).
_CONTRACT_CLAIMS = frozenset({"identity", "title", "level", "membership", "roles", "relation"})

#: Les relations qui lient DEUX PERSONNES. C'est sur celles-là que porte le P0 :
#: une preuve d'identité situe une personne (elle, et son employeur) ; elle n'a
#: jamais rien observé d'un lien entre deux personnes.
_PERSON_TO_PERSON = frozenset({"reports_to", "sponsors", "owns_budget", "procures_for"})

_ENTITIES = [{"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"}]

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


def _contacts(provider: str = "apollo") -> list[dict]:
    return [
        _person("Jean Dupont", "DSI", source=provider),
        _person(
            "Marie Martin",
            "Responsable Data",
            hierarchyLevel="management",
            source=provider,
            reportingTo="DSI",
        ),
    ]


def _graph(provider: str = "apollo", **kwargs) -> dict:
    return assemble_org_graph(contacts=_contacts(provider), entities=_ENTITIES, **kwargs)


# ═══════════════════════════════════════════════════════════════════════════
# 0. LA GARDE LIT QUELQUE CHOSE — sinon elle est verte sur du vide
# ═══════════════════════════════════════════════════════════════════════════


def test_the_claim_map_covers_every_hierarchy_relation_no_more_no_less():
    """Le corpus de la garde, c'est la table des relations. Elle doit être
    EXACTEMENT celle du resolver : une relation qui manquerait à la table
    passerait la porte sans être regardée, et la garde serait verte."""
    assert _CLAIMS_BACKING, "table des claims vide : la garde ne lit rien"
    assert set(_CLAIMS_BACKING) == set(HIERARCHY_RELATIONS), (
        "une relation hiérarchique n'a pas de claim requis — elle traverserait "
        f"la porte sans contrôle : {set(HIERARCHY_RELATIONS) ^ set(_CLAIMS_BACKING)}"
    )
    assert set(HIERARCHY_RELATIONS) > _PERSON_TO_PERSON
    for relation, backing in _CLAIMS_BACKING.items():
        assert backing, f"{relation} : aucun claim ne l'étaye, aucun lien ne pourrait exister"
        assert backing <= _CONTRACT_CLAIMS, f"{relation} : claim hors du vocabulaire du contrat"
    # LA frontière du §6, encodée : aucune relation entre deux personnes ne peut
    # s'appuyer sur une preuve d'identité.
    for relation in _PERSON_TO_PERSON:
        assert "identity" not in _CLAIMS_BACKING[relation]


def test_every_proof_the_assembler_emits_declares_what_it_proves():
    """« On ne peut pas garder ce qui n'a pas de nom. » Le claim doit être posé
    sur CHAQUE source émise — sans quoi la porte n'aurait rien à lire."""
    graph = _graph("pappers", official_directory=[
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "url": "https://www.tf1.fr/gouvernance",
            "collectedAt": "2026-08-20",
        }
    ])
    sources = [s for node in [*graph["entities"], *graph["people"]] for s in node["sources"]]
    assert len(sources) >= 4, f"corpus de preuves trop maigre pour prouver quoi que ce soit : {sources}"
    for source in sources:
        assert source.get("claim") in _CONTRACT_CLAIMS, f"preuve sans claim lisible : {source}"
    # Les deux natures qui font la démonstration sont bien présentes.
    claims = {s["claim"] for s in sources}
    assert {"identity", "membership"} <= claims, claims


def test_the_gate_runs_on_every_candidate_the_assembler_actually_builds(monkeypatch):
    """La porte est-elle BRANCHÉE ? On intercepte le flux RÉEL de candidats juste
    avant le resolver et on vérifie qu'aucun n'y arrive avec une preuve hors
    claim. C'est la lecture qui manquait : une porte déclarée mais non appelée
    est un mécanisme qui n'existe pas."""
    import app.services.org_graph_assembler as mod

    seen: list[dict] = []
    registries: list[dict[str, str]] = []
    real_resolve, real_gate = mod.resolve_edges, mod._honour_claims

    def _spy_gate(candidates, claim_by_source_id):
        registries.append(claim_by_source_id)
        return real_gate(candidates, claim_by_source_id)

    def _spy_resolve(candidates, **kwargs):
        seen.extend(candidates)
        return real_resolve(candidates, **kwargs)

    monkeypatch.setattr(mod, "_honour_claims", _spy_gate)
    monkeypatch.setattr(mod, "resolve_edges", _spy_resolve)
    graph = _graph(
        "apollo",
        llm_relations=[
            {
                "type": "sponsors",
                "from": "Jean Dupont",
                "to": "Marie Martin",
                "evidence": "communiqué programme Data",
                "reasoning": "le modèle le déduit du programme",
            }
        ],
    )
    assert graph["people"], "graphe vide : la garde n'observe rien"
    assert len(seen) >= 3, f"flux de candidats trop maigre : {len(seen)}"
    assert len(registries) == 1, "la porte n'a pas été appelée exactement une fois par assemblage"
    registry = registries[0]
    assert len(registry) >= 3, f"registre de claims trop maigre : {registry}"
    for cand in seen:
        backing = _CLAIMS_BACKING.get(cand["relation"])
        assert backing is not None, cand["relation"]
        for src in cand["sources"]:
            claim = registry.get(src.id)
            assert claim is not None, f"preuve non déclarée en vol : {src.id}"
            assert claim in backing, (
                f"une preuve « {claim} » étaye « {cand['relation']} » : "
                f"une preuve d'identité prouve une relation, le P0 est rouvert"
            )


# ═══════════════════════════════════════════════════════════════════════════
# GA-98 — une preuve d'IDENTITÉ n'étaye JAMAIS un lien entre deux personnes
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("relation", sorted(_PERSON_TO_PERSON))
@pytest.mark.parametrize("provider", sorted(_SOURCE_TO_KIND))
def test_ga98_an_identity_proof_never_backs_a_person_to_person_relation(relation, provider):
    """LA garde, et elle balaie DEUX axes — toutes les provenances × toutes les
    relations entre personnes — parce que le défaut d'origine était précisément
    de n'avoir regardé qu'une case.

    On force le cas fautif : un candidat dont la SEULE preuve est
    l'enregistrement d'identité réellement émis sur le nœud. C'est, mot pour mot,
    ce que faisait l'assembleur avant le 29/08.
    """
    graph = _graph(provider)
    marie, jean = (p for p in graph["people"] if p["fullName"] in ("Marie Martin", "Jean Dupont"))
    identity = [s for s in graph["people"][0]["sources"] if s["claim"] == "identity"]
    assert identity, f"{provider} : pas de preuve d'identité, le cas fautif n'est pas reproduit"

    registry = {s["id"]: s["claim"] for p in graph["people"] for s in p["sources"]}
    candidate = {
        "fromId": marie["id"],
        "toId": jean["id"],
        "relation": relation,
        "topic": "rattachement hiérarchique",
        "sources": [EdgeSource(id=s["id"], kind=s["kind"], fresh=True) for s in identity],
        "explicit_title": True,
        "same_org_id": True,
    }
    (gated,) = _honour_claims([candidate], registry)

    # 1. La preuve d'identité ne compte plus pour cette relation.
    assert [s.id for s in gated["sources"]] != [s["id"] for s in identity]
    assert all(registry.get(s.id) in _CLAIMS_BACKING[relation] for s in gated["sources"])
    # 2. Le lien n'est pas effacé : il est dégradé en inférence, et il le DIT.
    assert gated["reasoning"].strip()
    assert gated["explicit_title"] is False, "un titre nomme la fonction, pas le lien"
    # 3. Et il ne peut plus atteindre l'organigramme.
    from app.services.org_resolver import resolve_edges

    resolved = resolve_edges([gated])
    assert resolved.hierarchy == [], f"{provider}/{relation} : une preuve d'identité a tracé une ligne"
    assert len(resolved.influence) == 1
    assert resolved.influence[0]["confidence"] <= LLM_ONLY_CEILING


def test_ga98_the_person_entity_attachment_is_untouched():
    """Contrôle négatif. Une preuve d'identité situe la personne ET son employeur
    (« Marie Martin, Responsable Data chez TF1 ») : le rattachement personne →
    entité est le seul lien qu'elle ait réellement observé. Le retirer ferait
    disparaître la structure vraie de l'organigramme."""
    assert "identity" in _CLAIMS_BACKING["member_of"]
    graph = _graph("apollo")
    member_of = [e for e in graph["hierarchyEdges"] if e["type"] == "member_of"]
    assert len(member_of) == 2, member_of
    assert all(e["sourceIds"] for e in member_of), "un rattachement sans preuve citée"


def test_ga98_a_proof_that_really_observed_the_link_still_draws_its_line():
    """Second contrôle négatif : on a retiré la FAUSSE preuve, pas la capacité
    d'en avoir une vraie. Une preuve qui déclare `relation` traverse la porte."""
    registry = {"s-orgchart": "relation"}
    (gated,) = _honour_claims(
        [
            {
                "fromId": "p-marie",
                "toId": "p-jean",
                "relation": "reports_to",
                "sources": [EdgeSource(id="s-orgchart", kind="org_chart", fresh=True)],
                "explicit_title": True,
                "same_org_id": True,
            }
        ],
        registry,
    )
    assert [s.id for s in gated["sources"]] == ["s-orgchart"]
    assert gated["explicit_title"] is True, "la porte a dégradé un lien réellement prouvé"


def test_ga98_an_off_claim_proof_is_dropped_without_taking_the_valid_ones_with_it():
    """Preuves mélangées : la porte retire la preuve hors claim et garde l'autre.
    Un lien réellement prouvé ne doit pas être puni pour une preuve parasite."""
    registry = {"s-identity": "identity", "s-orgchart": "relation"}
    (gated,) = _honour_claims(
        [
            {
                "fromId": "p-marie",
                "toId": "p-jean",
                "relation": "reports_to",
                "sources": [
                    EdgeSource(id="s-identity", kind="registry", fresh=True),
                    EdgeSource(id="s-orgchart", kind="org_chart", fresh=True),
                ],
                "explicit_title": True,
                "same_org_id": True,
            }
        ],
        registry,
    )
    assert [s.id for s in gated["sources"]] == ["s-orgchart"]


# ═══════════════════════════════════════════════════════════════════════════
# GA-99 — une preuve dont on ignore ce qu'elle prouve n'étaye rien
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("relation", sorted(_PERSON_TO_PERSON))
def test_ga99_an_undeclared_proof_never_backs_a_relation(relation):
    """La moitié qui ferme la porte aux formes qu'on n'a pas encore vues.

    GA-98 refuse la preuve d'identité — celle dont on connaît le nom. Un
    producteur neuf qui forgerait un ``EdgeSource`` sans déclarer ce qu'il prouve
    échapperait à GA-98 par le haut : on ne peut pas comparer un claim qui
    n'existe pas. Le défaut par DÉFAUT est donc le refus, jamais le bénéfice du
    doute — « une source sans claim est une source dont on ne sait pas ce qu'elle
    établit », et on ne trace pas une ligne d'organigramme là-dessus.
    """
    (gated,) = _honour_claims(
        [
            {
                "fromId": "p-marie",
                "toId": "p-jean",
                "relation": relation,
                "sources": [EdgeSource(id="s-inconnue", kind="registry", fresh=True)],
                "explicit_title": True,
                "same_org_id": True,
            }
        ],
        {},
    )
    assert "s-inconnue" not in [s.id for s in gated["sources"]]
    from app.services.org_resolver import resolve_edges

    assert resolve_edges([gated]).hierarchy == []


def test_ga99_a_degraded_relation_keeps_its_target_and_says_why():
    """« On ne falsifie pas la structure » : un lien non prouvé ne devient pas un
    lien vérifié, mais il ne s'efface pas non plus en silence. Il garde sa cible,
    sa nature et sa raison — c'est ce que le commercial lit avant d'y croire."""
    (gated,) = _honour_claims(
        [
            {
                "fromId": "p-marie",
                "toId": "p-jean",
                "relation": "reports_to",
                "topic": _REPORTING_TOPIC,
                "sources": [EdgeSource(id="s-identite", kind="registry", fresh=True)],
            }
        ],
        {"s-identite": "identity"},
    )
    assert (gated["fromId"], gated["toId"]) == ("p-marie", "p-jean")
    assert gated["relation"] == "reports_to" and gated["topic"] == _REPORTING_TOPIC
    assert gated["sources"], "le lien a perdu toute preuve : il serait REJETÉ, donc effacé"
    assert "observé" in gated["reasoning"]

    from app.services.org_resolver import resolve_edges

    resolved = resolve_edges([gated])
    assert resolved.rejected == [], "un lien dégradé ne doit pas être jeté"
    assert len(resolved.influence) == 1
    assert resolved.influence[0]["topic"] == _REPORTING_TOPIC


def test_ga99_the_synthesised_inference_proof_is_itself_declared():
    """La preuve d'inférence que la porte pose à la place déclare, elle aussi, ce
    qu'elle prouve. Sans quoi la porte produirait ce qu'elle refuse."""
    registry = {"s-identite": "identity"}
    (gated,) = _honour_claims(
        [
            {
                "fromId": "p-marie",
                "toId": "p-jean",
                "relation": "reports_to",
                "sources": [EdgeSource(id="s-identite", kind="registry")],
            }
        ],
        registry,
    )
    for src in gated["sources"]:
        assert registry.get(src.id) == "relation", f"preuve de sortie non déclarée : {src.id}"
        assert src.kind == "llm", "une inférence doit rester en grounding C"
        assert src.fresh is False, "une inférence n'a pas de date de collecte"


# ═══════════════════════════════════════════════════════════════════════════
# Le cliquet ne change rien aujourd'hui — il empêche demain
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("provider", sorted(_SOURCE_TO_KIND))
def test_the_gate_is_output_neutral_on_todays_graph(provider, monkeypatch):
    """Le correctif du 29/08 a déjà mis ``reportingTo`` du bon côté : toutes les
    preuves du graphe d'aujourd'hui sont déjà dans leur claim. La porte ne doit
    donc RIEN changer — un cliquet qui modifierait la sortie serait une
    régression déguisée en garde.

    On le prouve en COMPARANT le graphe entier avec et sans la porte, plutôt
    qu'en récitant un nombre d'arêtes attendu : un compte écrit à la main se
    contente du cas qu'on a imaginé, l'égalité couvre tout ce que le graphe
    porte. Et elle reste vraie pour les provenances qui ne tracent aucune ligne
    (`manual` et `brave_search` plafonnent à 30, `ia_reconstruction` est en
    grounding C) — c'est justement là qu'un cliquet mal posé se verrait le moins.
    """
    import app.services.org_graph_assembler as mod

    with_gate = _graph(provider)
    monkeypatch.setattr(mod, "_honour_claims", lambda candidates, claims: candidates)
    without_gate = _graph(provider)
    assert with_gate == without_gate, "la porte a changé le graphe d'aujourd'hui"
    assert with_gate["people"], "graphe vide : l'égalité ne prouverait rien"

    hints = [e for e in with_gate["influenceEdges"] if e["topic"] == _REPORTING_TOPIC]
    assert len(hints) == 1 and hints[0]["confidence"] <= LLM_ONLY_CEILING
    assert not [e for e in with_gate["hierarchyEdges"] if e["type"] == "reports_to"]
