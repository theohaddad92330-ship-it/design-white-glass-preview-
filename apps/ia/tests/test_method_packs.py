"""Le schéma à 11 champs et les packs nommés (#3221, #206.3/#206.4, #3200).

Deux garanties : le schéma porte exactement les 11 champs du ticket (#206.4),
et chaque pack sourcé (service existant ou énoncé verbatim #3200) est complet
et RETROUVABLE — un domaine ne peut pas être à la fois « sans règle » et
porteur d'une règle silencieuse.
"""

from __future__ import annotations

import dataclasses

from app.knowledge.method_packs import (
    ALLOWED_EVIDENCE_KINDS,
    CITATION_LABEL_BY_DOMAIN,
    METHOD_PACK_DOMAINS,
    METHOD_PACK_DOMAINS_WITHOUT_RULE,
    METHOD_PACK_RULES,
    MethodPackRule,
)

_SPEC_FIELDS = {
    "rule_id",
    "title",
    "domain",
    "trigger",
    "prerequisites",
    "recommendation",
    "counter_example",
    "stop_condition",
    "allowed_evidence",
    "version",
    "source",
}


def test_le_schema_porte_exactement_les_onze_champs_du_ticket():
    field_names = {f.name for f in dataclasses.fields(MethodPackRule)}
    assert field_names == _SPEC_FIELDS
    assert len(_SPEC_FIELDS) == 11


def test_les_seize_packs_du_ticket_sont_tous_nommes():
    assert len(METHOD_PACK_DOMAINS) == 16
    assert len(set(METHOD_PACK_DOMAINS)) == 16


def test_un_domaine_est_soit_sourcé_soit_documenté_manquant_jamais_les_deux():
    domains_with_rule = {rule.domain for rule in METHOD_PACK_RULES}
    assert domains_with_rule.isdisjoint(METHOD_PACK_DOMAINS_WITHOUT_RULE)
    assert domains_with_rule | set(METHOD_PACK_DOMAINS_WITHOUT_RULE) == set(METHOD_PACK_DOMAINS)


def test_chaque_regle_est_complete_et_sourcee():
    seen_ids = set()
    for rule in METHOD_PACK_RULES:
        assert rule.rule_id not in seen_ids, f"rule_id dupliqué : {rule.rule_id}"
        seen_ids.add(rule.rule_id)
        assert rule.domain in METHOD_PACK_DOMAINS, rule.rule_id
        assert rule.title.strip()
        assert rule.trigger.strip()
        assert rule.recommendation.strip()
        # Jamais un fondement anonyme (instruction commune #3249) : chaque type
        # d'évidence cité doit venir du vocabulaire autorisé.
        assert rule.allowed_evidence, rule.rule_id
        assert set(rule.allowed_evidence) <= set(ALLOWED_EVIDENCE_KINDS), rule.rule_id
        # Auditable : jamais une règle sortie de nulle part.
        assert rule.source.strip()
        assert rule.version.strip()


def test_chaque_regle_sourcee_porte_un_libelle_de_citation():
    """Le panneau de transparence cite « Méthode Bellum : <libellé> » (#3200,
    section CITATION) — jamais un rule_id ni un domain brut."""
    for rule in METHOD_PACK_RULES:
        assert rule.domain in CITATION_LABEL_BY_DOMAIN, rule.rule_id
        label = CITATION_LABEL_BY_DOMAIN[rule.domain]
        assert label.strip()
        assert "_" not in label, f"libellé non humain pour {rule.domain} : {label!r}"


def test_aucune_regle_ne_recite_le_nom_dune_methodologie_interne():
    """#206.7 (déjà livré) : Laura ne doit jamais réciter le nom d'une méthodologie
    commerciale interne — une garde locale pour que ce nouveau contenu ne le
    réintroduise pas."""
    forbidden = ("salesconnect", "sales connect")
    for rule in METHOD_PACK_RULES:
        haystack = f"{rule.title} {rule.recommendation} {rule.counter_example or ''}".lower()
        assert not any(term in haystack for term in forbidden), rule.rule_id
