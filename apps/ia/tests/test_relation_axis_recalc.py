"""#2298.4 (19/09/2026, lot I3) — LE REJEU GRATUIT DE L'AXE RELATION SEUL.

─────────────────────────────────────────────────────────────────────────────
POURQUOI CETTE FONCTION EXISTE, ET POURQUOI ELLE N'EST PAS UNE COPIE
─────────────────────────────────────────────────────────────────────────────
`_relation_axis` (`discover_scoring.py`) est LA dérivation — GA-26, « une
dérivation vit à un seul endroit ». Le rattrapage ciblé (#AF, #2543.7) rejoue
des segments entiers via `AnalysisOnDemandService` (`refreshResearch`,
`replan`…), tous PAYANTS. La relation, elle, a QUATRE sources dont TROIS sont
déjà en base sans le moindre appel sortant (missions signées, agenda, e-mails
— `RelationAxisReaderService`, table `activities`/`missions`) et une
quatrième posée par un humain (`relationship_memory.relation`, déjà chargée
sur le compte). Rejouer CET axe seul ne coûte donc rien — ni crédit, ni appel
réseau — et `relation_axis_recalc` REUTILISE `_relation_axis` telle quelle :
zéro seconde implémentation du barème.

Le CRM est délibérément ABSENT des paramètres : `CrmReadService` interroge un
fournisseur CONNECTÉ en LIVE (HubSpot/Salesforce) à chaque appel — ce serait
un appel sortant, exactement ce que ce chemin gratuit refuse. L'appelant API
(`AnalysisOnDemandService.recalculateRelationAxis`) ne DOWNGRADE jamais un
axe déjà mesuré par un ancien calcul CRM : voir son propre test pour cette
garde (`analysis-ondemand.service.spec.ts`).
"""

from __future__ import annotations

from app.services.discover_scoring import _AXIS_RELATION, relation_axis_recalc


def test_no_source_stays_unmeasured_never_a_zero() -> None:
    result = relation_axis_recalc()
    assert result["score"] is None
    assert result["max"] == 0
    assert result["unmeasured"] == ["relation"]
    assert result["factors"] == []


def test_a_signed_mission_alone_measures_the_axis_at_its_cap() -> None:
    result = relation_axis_recalc(missions_count=3)
    assert result["score"] == _AXIS_RELATION
    assert result["max"] == _AXIS_RELATION
    assert result["unmeasured"] == []
    assert len(result["factors"]) == 1
    factor = result["factors"][0]
    assert factor["axis"] == "relation"
    assert "3 missions" in factor["evidence"]


def test_a_human_correction_alone_measures_the_axis() -> None:
    result = relation_axis_recalc(human_correction="ancien client, référé par Marc")
    assert result["score"] == _AXIS_RELATION
    assert "ancien client, référé par Marc" in result["factors"][0]["evidence"]


def test_never_reads_crm_it_has_no_parameter_for_it() -> None:
    # Preuve ROUGE : `relation_axis_recalc` n'a AUCUN paramètre `crm_presence` —
    # un appelant ne peut structurellement pas lui transmettre une lecture CRM
    # (donc pas d'appel sortant vers un fournisseur CRM caché derrière ce chemin
    # gratuit).
    import inspect

    params = inspect.signature(relation_axis_recalc).parameters
    assert "crm_presence" not in params


# ── #4680 — les contacts CONNUS (import / CRM) rattachés au compte sont une source ───────────────


def test_known_contacts_alone_measure_the_axis_at_its_cap() -> None:
    result = relation_axis_recalc(known_contacts_count=2)
    assert result["score"] == _AXIS_RELATION
    assert result["unmeasured"] == []
    evidence = result["factors"][0]["evidence"]
    assert "2 contacts connus" in evidence


def test_a_single_known_contact_is_singular() -> None:
    evidence = relation_axis_recalc(known_contacts_count=1)["factors"][0]["evidence"]
    assert "1 contact connu" in evidence
    assert "contacts connus" not in evidence


def test_zero_or_missing_known_contacts_is_not_a_source_never_a_zero() -> None:
    for count in (None, 0):
        result = relation_axis_recalc(known_contacts_count=count)
        assert result["score"] is None
        assert result["unmeasured"] == ["relation"]
        assert result["factors"] == []


def test_known_contacts_never_carry_a_name() -> None:
    # La preuve est un NOMBRE : la fonction n'a aucun paramètre qui pourrait porter un nom de contact.
    import inspect

    from app.services.discover_scoring import relation_axis_recalc as fn

    assert "known_contacts_count" in inspect.signature(fn).parameters
    assert not {"contact_names", "known_contacts", "names"} & set(inspect.signature(fn).parameters)


def test_known_contacts_do_not_replace_the_other_sources() -> None:
    evidence = relation_axis_recalc(missions_count=1, known_contacts_count=3)["factors"][0]["evidence"]
    assert "1 mission" in evidence
    assert "3 contacts connus" in evidence
