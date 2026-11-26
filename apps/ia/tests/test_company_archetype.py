"""#3202 — COMPANY ARCHETYPE & MARKET SEMANTICS ONTOLOGY : le NO-GO du ticket
(« Laura utilise le filtre "petite entreprise informatique" comme synonyme de
startup ») encodé comme test, pas seulement comme prose de prompt."""

from __future__ import annotations

from app.services.actor_typology import ActorType, classify_actor_type
from app.services.company_archetype import (
    ArchetypeConfidence,
    ArchetypeVerdict,
    CompanyArchetype,
    StartupSignals,
    account_decision_structure_block,
    archetype_from_actor_type,
    archetype_verdict_from_account_data,
    classify_startup,
    confidence_at_least,
    decision_structure_hint,
    dedupe_evidence,
    french_tech_coverage_gap,
)


def test_no_go_headcount_sector_date_alone_never_establishes_startup() -> None:
    # Le NO-GO exact du ticket : petite, IT, récente — et RIEN d'autre.
    signals = StartupSignals(headcount=6, sector_is_it=True, creation_date="2024-01-01")
    verdict = classify_startup(signals)
    assert verdict.archetype == CompanyArchetype.STARTUP
    assert verdict.confidence == ArchetypeConfidence.NOT_ESTABLISHED
    assert verdict.evidence  # jamais nu, même NOT_ESTABLISHED


def test_confirmed_on_qualified_source() -> None:
    signals = StartupSignals(qualified_sources=["French Tech"])
    verdict = classify_startup(signals)
    assert verdict.confidence == ArchetypeConfidence.CONFIRMED


def test_supported_on_three_converging_signals() -> None:
    signals = StartupSignals(funding_detected=True, growth_detected=True, hiring_detected=True)
    verdict = classify_startup(signals)
    assert verdict.confidence == ArchetypeConfidence.SUPPORTED
    assert len(verdict.evidence) == 3


def test_possible_on_one_signal() -> None:
    signals = StartupSignals(claimed_innovation=True)
    verdict = classify_startup(signals)
    assert verdict.confidence == ArchetypeConfidence.POSSIBLE


def test_confidence_ordering() -> None:
    assert confidence_at_least(ArchetypeConfidence.SUPPORTED, ArchetypeConfidence.POSSIBLE)
    assert not confidence_at_least(ArchetypeConfidence.POSSIBLE, ArchetypeConfidence.SUPPORTED)


def test_archetype_from_actor_type_bridges_esn() -> None:
    verdict = archetype_from_actor_type(ActorType.ESN)
    assert verdict is not None
    assert verdict.archetype == CompanyArchetype.ESN
    assert verdict.confidence == ArchetypeConfidence.CONFIRMED


def test_archetype_from_actor_type_none_when_no_bridge() -> None:
    # GA-26 — GROUPE/FILIALE n'ont aucun signal réel (docstring d'ActorType) :
    # ce module ne les invente pas non plus.
    assert archetype_from_actor_type(ActorType.GROUPE) is None
    assert archetype_from_actor_type(None) is None


def test_french_tech_coverage_gap_announced_when_source_missing() -> None:
    message = french_tech_coverage_gap(False)
    assert message is not None
    assert "French Tech" in message


def test_french_tech_coverage_gap_silent_when_source_present() -> None:
    assert french_tech_coverage_gap(True) is None


def test_dedupe_evidence_preserves_order_and_dedupes() -> None:
    v1 = classify_startup(StartupSignals(funding_detected=True))
    v2 = classify_startup(StartupSignals(funding_detected=True, growth_detected=True))
    assert dedupe_evidence([v1, v2]) == ["financement détecté", "croissance"]


def test_archetype_verdict_from_account_data_lit_lactor_type_deja_resolu() -> None:
    verdict = archetype_verdict_from_account_data({"actorType": "ESN"})
    assert verdict is not None
    assert verdict.archetype == CompanyArchetype.ESN


def test_archetype_verdict_from_account_data_sans_actor_type() -> None:
    assert archetype_verdict_from_account_data({}) is None
    assert archetype_verdict_from_account_data(None) is None


def test_archetype_verdict_from_account_data_valeur_inconnue_jamais_devinee() -> None:
    # Une valeur corrompue ou obsolète ne fait planter personne et ne devine rien.
    assert archetype_verdict_from_account_data({"actorType": "n'existe pas"}) is None


# ── #3202.6 — le MODE DE DÉCISION qu'implique l'archétype ────────────────────


def test_decision_structure_named_for_a_recruitment_cabinet() -> None:
    verdict = ArchetypeVerdict(archetype=CompanyArchetype.CABINET_RECRUTEMENT, confidence=ArchetypeConfidence.CONFIRMED)
    hint = decision_structure_hint(verdict)
    assert hint is not None
    assert "directe" in hint


def test_decision_structure_named_for_a_grand_groupe() -> None:
    verdict = ArchetypeVerdict(archetype=CompanyArchetype.GRAND_GROUPE, confidence=ArchetypeConfidence.CONFIRMED)
    hint = decision_structure_hint(verdict)
    assert hint is not None
    assert "collective" in hint


def test_decision_structure_absent_when_archetype_not_established() -> None:
    # NOT_ESTABLISHED = on a regardé et rien n'a convergé — jamais un mode de
    # décision affirmé sur un archétype qui n'est lui-même pas établi.
    verdict = ArchetypeVerdict(archetype=CompanyArchetype.STARTUP, confidence=ArchetypeConfidence.NOT_ESTABLISHED)
    assert decision_structure_hint(verdict) is None


def test_decision_structure_silent_for_archetypes_where_size_dominates() -> None:
    # ESN va du freelance seul au groupe de 5000 : l'archétype seul ne dit RIEN
    # du mode de décision — jamais deviné pour combler la case (même refus que
    # `archetype_from_actor_type` pour GROUPE/FILIALE).
    verdict = ArchetypeVerdict(archetype=CompanyArchetype.ESN, confidence=ArchetypeConfidence.CONFIRMED)
    assert decision_structure_hint(verdict) is None


def test_account_decision_structure_block_named_on_a_real_naf() -> None:
    # 78.10Z = agence de placement (intermediation.py) → CABINET_RECRUTEMENT,
    # CONFIRMED — le même pont NAF que `_search_item` (chat_tools.py, GA-26),
    # jamais un second calcul de l'archétype à partir d'un autre signal.
    actor_type = classify_actor_type(naf="78.10Z", name="Chasseurs de Talents SAS")
    assert actor_type == ActorType.CABINET_RECRUTEMENT
    block = account_decision_structure_block(naf_code="78.10Z", company_name="Chasseurs de Talents SAS")
    assert "cabinet de recrutement" in block
    assert "directe" in block
    assert "3202.6" in block


def test_account_decision_structure_block_empty_without_naf() -> None:
    assert account_decision_structure_block(naf_code=None, company_name="Sans NAF SAS") == ""


def test_account_decision_structure_block_empty_when_archetype_gives_no_hint() -> None:
    # NAF ESN classique (62.02A, ESN_NAF_CODES) : archétype ESN résolu, mais
    # AUCUN mode de décision n'en découle (voir ci-dessus) — le bloc reste
    # vide, jamais une ligne qui prétendrait savoir.
    actor_type = classify_actor_type(naf="62.02A", name="Une SSII SAS")
    assert actor_type == ActorType.ESN
    assert account_decision_structure_block(naf_code="62.02A", company_name="Une SSII SAS") == ""


# ── #3243 (recette Y23) — l'ESN du référentiel au NAF de SIÈGE ─────────────────────────────────
from app.services.company_archetype import archetype_verdict_from_account_data as _verdict  # noqa: E402


def test_a_known_esn_with_a_head_office_naf_is_an_esn_even_when_phase_one_said_client_final():
    for name in ("CAPGEMINI SE", "CAPGEMINI", "Sopra Steria Group"):
        v = _verdict({"company_name": name, "naf_code": "70.10Z", "actor_type": "client final"})
        assert v is not None and v.archetype is CompanyArchetype.ESN, name


def test_sait_dire_non_a_business_naf_stays_a_client_even_under_an_esn_name():
    assert _verdict({"company_name": "CAPGEMINI", "naf_code": "47.11F", "actor_type": "client final"}) is None


def test_sait_dire_non_an_unknown_name_with_a_head_office_naf_is_not_guessed():
    assert _verdict({"company_name": "TF1 HOLDING", "naf_code": "70.10Z", "actor_type": "client final"}) is None
    # Appariement STRICT : « Open Classrooms » n'est pas « Open ».
    assert _verdict({"company_name": "OPEN CLASSROOMS", "naf_code": "70.10Z", "actor_type": "client final"}) is None


def test_sait_dire_non_without_any_naf_the_name_alone_never_classifies():
    assert _verdict({"company_name": "CAPGEMINI"}) is None
