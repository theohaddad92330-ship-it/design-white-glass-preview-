"""#3226 (#3202.6) — le playbook commercial MESSAGE + PARTENARIAT de
l'archétype. Deux des huit dimensions du ticket, première tranche."""

from __future__ import annotations

import pytest

from app.services.company_archetype import ArchetypeConfidence, ArchetypeVerdict, CompanyArchetype
from app.services.company_archetype_playbook import archetype_commercial_hint, is_partnership_candidate_archetype


def test_esn_recoit_un_angle_partenariat_jamais_client() -> None:
    verdict = ArchetypeVerdict(
        archetype=CompanyArchetype.ESN,
        confidence=ArchetypeConfidence.CONFIRMED,
        evidence=["NAF ESN"],
    )
    hint = archetype_commercial_hint(verdict)
    assert hint is not None
    assert "partenaire" in hint.partnership_note.lower()
    assert "staffing" in hint.message_angle.lower()


def test_sans_verdict_aucun_angle() -> None:
    assert archetype_commercial_hint(None) is None


def test_verdict_not_established_aucun_angle() -> None:
    verdict = ArchetypeVerdict(
        archetype=CompanyArchetype.STARTUP,
        confidence=ArchetypeConfidence.NOT_ESTABLISHED,
        evidence=["aucun signal disponible"],
    )
    assert archetype_commercial_hint(verdict) is None


def test_tous_les_21_archetypes_ont_un_angle_ou_sont_absents_jamais_de_texte_vide() -> None:
    """Un archétype sans jugement écrit rend None — jamais une chaîne vide ou
    un texte générique fabriqué pour combler la case."""
    for archetype in CompanyArchetype:
        verdict = ArchetypeVerdict(archetype=archetype, confidence=ArchetypeConfidence.CONFIRMED, evidence=["x"])
        hint = archetype_commercial_hint(verdict)
        if hint is not None:
            assert hint.message_angle.strip()
            assert hint.partnership_note.strip()


def test_esn_est_une_candidate_partenariat() -> None:
    verdict = ArchetypeVerdict(archetype=CompanyArchetype.ESN, confidence=ArchetypeConfidence.CONFIRMED, evidence=["x"])
    assert is_partnership_candidate_archetype(verdict) is True


def test_grand_groupe_nest_pas_une_candidate_partenariat() -> None:
    verdict = ArchetypeVerdict(
        archetype=CompanyArchetype.GRAND_GROUPE, confidence=ArchetypeConfidence.CONFIRMED, evidence=["x"]
    )
    assert is_partnership_candidate_archetype(verdict) is False


def test_sans_verdict_jamais_candidate() -> None:
    assert is_partnership_candidate_archetype(None) is False


def test_verdict_faible_jamais_candidate() -> None:
    verdict = ArchetypeVerdict(
        archetype=CompanyArchetype.ESN, confidence=ArchetypeConfidence.NOT_ESTABLISHED, evidence=["x"]
    )
    assert is_partnership_candidate_archetype(verdict) is False


# ── #3226 (#3202.6) — INTERLOCUTEURS + CYCLE, sous une règle de PRIMAUTÉ ─────
from app.services.company_archetype_playbook import archetype_buyer_block, archetype_buyer_hint  # noqa: E402


def _v(
    archetype: CompanyArchetype, confidence: ArchetypeConfidence = ArchetypeConfidence.CONFIRMED
) -> ArchetypeVerdict:
    return ArchetypeVerdict(archetype=archetype, confidence=confidence, evidence=["NAF"])


def test_buyer_hint_fills_interlocutors_and_cycle_when_size_sector_is_unknown() -> None:
    hint = archetype_buyer_hint(_v(CompanyArchetype.ETABLISSEMENT_FINANCIER), None)
    assert hint is not None
    assert "comité d'achat" in hint.cycle
    assert hint.interlocutors


@pytest.mark.parametrize("size_sector", ["startup", "pme_eti", "grand_groupe", "banque_assurance", "public"])
def test_size_sector_archetype_keeps_primacy_so_the_two_axes_never_contradict(size_sector: str) -> None:
    """Le NŒUD de #3226 : `sales_context` calibre déjà cycle et portes d'entrée
    (action_recommender.py:313) — quand il a un verdict, la nature commerciale se TAIT."""
    assert archetype_buyer_hint(_v(CompanyArchetype.INDUSTRIEL), size_sector) is None


def test_an_unknown_size_sector_archetype_does_not_take_primacy() -> None:
    assert archetype_buyer_hint(_v(CompanyArchetype.INDUSTRIEL), "inconnu") is not None
    assert archetype_buyer_hint(_v(CompanyArchetype.INDUSTRIEL), "") is not None


def test_no_buyer_hint_without_verdict_or_below_possible_or_without_written_judgement() -> None:
    assert archetype_buyer_hint(None, None) is None
    assert archetype_buyer_hint(_v(CompanyArchetype.INDUSTRIEL, ArchetypeConfidence.NOT_ESTABLISHED), None) is None
    assert archetype_buyer_hint(_v(CompanyArchetype.ESN), None) is None  # aucun jugement écrit : pas de remplissage


def test_buyer_block_names_the_company_and_never_states_a_probability() -> None:
    block = archetype_buyer_block(archetype_buyer_hint(_v(CompanyArchetype.ORGANISME_PUBLIC), None), "Mairie de Lyon")
    assert "Mairie de Lyon" in block and "appel d'offres" in block
    assert "%" not in block and "probab" not in block.lower()
    assert archetype_buyer_block(None, "X") == ""


def test_the_buyer_block_is_wired_into_the_plan_route_under_the_size_sector_guard() -> None:
    """L'APPELANT (un module juste que personne n'appelle n'est pas livré) :
    `phase4_plan.py` passe le calibrage taille/secteur du dossier à la règle de primauté."""
    from pathlib import Path

    source = (Path(__file__).parent.parent / "app" / "routers" / "phase4_plan.py").read_text(encoding="utf-8")
    assert "archetype_buyer_block(" in source and "archetype_buyer_hint(" in source
    assert '.get("salesContext")' in source


# ── #3226 (#3202.6, W05 01/10) — DÉCISION directe/collective + FORMALISATION ACHATS ──
# Deux dimensions de plus du § UTILISATION COMMERCIALE, RECOUPÉES des jugements
# déjà écrits ci-dessus : un archétype sans phrase source garde le champ VIDE
# (jamais une nuance inventée), et la ligne ne s'écrit alors pas.


@pytest.mark.parametrize(
    ("archetype", "decision_word", "formality_word"),
    [
        (CompanyArchetype.INDUSTRIEL, "collective", "comité d'achat"),
        (CompanyArchetype.ETABLISSEMENT_FINANCIER, "collective", "comité d'achat"),
        (CompanyArchetype.ORGANISME_PUBLIC, "achats", "appel d'offres"),
        (CompanyArchetype.AGENCE, "directe", "aucun comité"),
        (CompanyArchetype.GRAND_GROUPE, "collective", "appel d'offres"),
        (CompanyArchetype.FILIALE_INTEGREE, "groupe", "centralisé"),
        (CompanyArchetype.SAAS, "équipe", "self-service"),
    ],
)
def test_decision_and_procurement_formality_come_from_the_written_judgements(
    archetype: CompanyArchetype, decision_word: str, formality_word: str
) -> None:
    hint = archetype_buyer_hint(_v(archetype), None)
    assert hint is not None
    assert decision_word in hint.decision
    assert formality_word in hint.procurement_formality
    block = archetype_buyer_block(hint, "ACME")
    assert "Décision :" in block and "Formalisation achats :" in block


def test_a_missing_source_sentence_leaves_the_line_out_instead_of_inventing_it() -> None:
    hint = archetype_buyer_hint(_v(CompanyArchetype.FILIALE_AUTONOME), None)
    assert hint is not None
    assert hint.procurement_formality == ""
    block = archetype_buyer_block(hint, "ACME")
    assert "Décision :" in block
    assert "Formalisation achats :" not in block


def test_the_size_sector_primacy_silences_the_two_new_lines_too() -> None:
    assert archetype_buyer_block(archetype_buyer_hint(_v(CompanyArchetype.INDUSTRIEL), "grand_groupe"), "ACME") == ""
