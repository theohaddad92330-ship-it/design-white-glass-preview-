"""#2368.2 / #2368.12 / #2368.14 — ce que le packet de contexte refuse."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.evidence_gate import (
    assert_claims_are_grounded,
    assert_context_is_not_vague,
    assert_draft_is_clean,
    find_draft_defects,
    has_personal_reason,
)
from app.services.recommendation_specificity import registry_from_inputs


class _Claim:
    def __init__(self, text: str, proof: str) -> None:
        self.text = text
        self.proof = proof


def test_has_personal_reason_is_false_on_name_title_company_alone() -> None:
    # #2368.2 — le dossier n'offre qu'un contact sans entité ni signal daté.
    registry = registry_from_inputs(
        profile={"companyName": "Acme"},
        research={"companyName": "Acme"},
        contacts=[{"fullName": "Jean Dupont"}],
    )
    assert has_personal_reason(registry, context="", parameters={}) is False


def test_has_personal_reason_is_true_with_a_typed_angle() -> None:
    # Un angle tapé par le commercial EST une raison propre à la personne.
    registry = registry_from_inputs(
        profile={"companyName": "Acme"}, research={"companyName": "Acme"}, contacts=[{"fullName": "Jean Dupont"}]
    )
    assert has_personal_reason(registry, context="il vient de prendre le poste de DSI", parameters={}) is True


def test_has_personal_reason_is_true_with_a_structured_entity() -> None:
    # Une entité déclarée au-delà du nom du contact est une raison réelle.
    registry = registry_from_inputs(
        profile={"companyName": "Acme"},
        research={"companyName": "Acme"},
        contacts=[{"fullName": "Jean Dupont", "entity": "CIB"}],
    )
    assert has_personal_reason(registry, context="", parameters={}) is True


def test_assert_context_is_not_vague_raises_422_on_name_only() -> None:
    # #2368.2 — génération bloquée AVANT tout appel modèle.
    registry = registry_from_inputs(
        profile={"companyName": "Acme"}, research={"companyName": "Acme"}, contacts=[{"fullName": "Jean Dupont"}]
    )
    with pytest.raises(HTTPException) as exc:
        assert_context_is_not_vague(registry, context="", parameters={})
    assert exc.value.status_code == 422


def test_assert_context_is_not_vague_passes_with_a_signal_parameter() -> None:
    registry = registry_from_inputs(
        profile={"companyName": "Acme"}, research={"companyName": "Acme"}, contacts=[{"fullName": "Jean Dupont"}]
    )
    assert_context_is_not_vague(registry, context="", parameters={"signal": "levée de fonds série B"})


def test_assert_claims_are_grounded_passes_when_proof_is_in_the_packet() -> None:
    packet = "SIGNAUX RÉCENTS : Cession Uptevia annoncée en mars 2026."
    assert_claims_are_grounded([_Claim("cession Uptevia", "Cession Uptevia annoncée en mars 2026")], packet)


def test_assert_claims_are_grounded_blocks_on_a_fabricated_proof() -> None:
    # #2368.14 — NO-GO : la preuve déclarée n'existe pas dans le packet.
    packet = "SIGNAUX RÉCENTS : Cession Uptevia annoncée en mars 2026."
    with pytest.raises(HTTPException) as exc:
        assert_claims_are_grounded([_Claim("levée de fonds", "levée de 40M€ en 2025")], packet)
    assert exc.value.status_code == 422
    assert "levée de fonds" in exc.value.detail


def test_assert_claims_are_grounded_blocks_on_an_empty_proof() -> None:
    with pytest.raises(HTTPException):
        assert_claims_are_grounded([_Claim("un fait", "")], "peu importe le packet")


# ── #3248 (recette prod 29/09) — brouillon qui laisse fuir l'annonce
# d'hypothèse (« tu peux corriger ») ou se coupe sur une signature tronquée ──


def test_find_draft_defects_is_empty_on_a_clean_body() -> None:
    body = "Bonjour Claire, je vous contacte au sujet de votre migration cloud. Bien à vous, Louis."
    assert find_draft_defects(body) == []


def test_find_draft_defects_names_a_leaked_hypothesis_announcement() -> None:
    # #3248.3 — reproduction du retour bêta : « Je pars sur Je partirai sur… »
    # — l'annonce d'hypothèse de laura_role_and_voice a fui dans un texte
    # destiné au prospect, jamais réservé à la réponse de Laura elle-même.
    body = "Je pars sur Je partirai sur le siège parisien. Bonjour, je vous contacte au sujet de votre DSI."
    defects = find_draft_defects(body)
    assert defects
    assert any("hypothèse" in defect for defect in defects)


def test_find_draft_defects_names_a_correction_offer_left_in_the_draft() -> None:
    body = "Bonjour Claire, je vous contacte au sujet de votre migration cloud. Tu peux corriger si besoin."
    defects = find_draft_defects(body)
    assert defects
    assert any("hypothèse" in defect for defect in defects)


def test_find_draft_defects_names_a_truncated_signoff() -> None:
    # #3248.4 — reproduction du retour bêta : « pour L. » tronqué.
    body = "Bonjour Claire, je vous contacte au sujet de votre DSI. Bien à vous, pour L."
    defects = find_draft_defects(body)
    assert defects
    assert any("tronqu" in defect for defect in defects)


def test_find_draft_defects_does_not_flag_a_real_two_letter_initial_signoff() -> None:
    # Une vraie initiale à la fin d'une phrase (nom de famille court) ne doit
    # jamais être confondue avec une troncature : seule la préposition « pour »
    # suivie d'une majuscule coupée est visée, jamais un « M. » ou un nom seul.
    body = "Bonjour Claire, je vous contacte au sujet de votre DSI. Bien à vous, Louis M."
    assert find_draft_defects(body) == []


def test_assert_draft_is_clean_raises_422_on_a_leaked_hypothesis() -> None:
    with pytest.raises(HTTPException) as exc:
        assert_draft_is_clean("Je pars sur Je partirai sur le siège parisien.")
    assert exc.value.status_code == 422


def test_assert_draft_is_clean_passes_on_a_clean_body() -> None:
    assert_draft_is_clean("Bonjour Claire, je vous contacte au sujet de votre migration cloud.")
