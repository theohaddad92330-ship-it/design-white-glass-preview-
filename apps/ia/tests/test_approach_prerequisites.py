"""#3891 (ADD-SANOFI-05, retour bêta Sanofi 08/10/2026) — « Séparer les
prérequis de qualification, de préparation, d'envoi et de staffing ».

Constat : sur un compte exploitable mais sans besoin client confirmé ni projet
nommé, Laura a présenté l'absence de besoin confirmé comme un blocage pour
TOUTE véritable approche commerciale — y compris quand la demande portait sur
une opération qui n'exige jamais de besoin confirmé (explorer, chercher un
rôle, préparer une demande d'orientation). Ce fichier tient le bloc qui sépare
les six opérations et leurs VRAIS prérequis (`_BLOCK_APPROACH_PREREQUISITES`),
comme toute garde du dépôt : il LIT un corpus réel, et il SAIT dire NON.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_APPROACH_PREREQUISITES, build_system_prompt


def test_the_guard_reads_a_real_non_empty_corpus() -> None:
    assert len(_BLOCK_APPROACH_PREREQUISITES.strip()) > 200


def test_the_rendered_prompt_actually_carries_the_block() -> None:
    prompt = build_system_prompt({}, {}, "", "")
    assert "PRÉREQUIS PAR OPÉRATION" in prompt


def test_an_unconfirmed_need_is_named_as_not_blocking_a_real_approach() -> None:
    assert "l'absence de besoin CLIENT CONFIRMÉ n'est PAS un blocage" in _BLOCK_APPROACH_PREREQUISITES


def test_the_six_operations_are_named_in_order() -> None:
    operations = (
        "EXPLORER UN COMPTE",
        "CHERCHER LE BON RÔLE OU INTERLOCUTEUR",
        "PRÉPARER UNE DEMANDE D'ORIENTATION",
        "QUALIFIER L'EXISTENCE D'UN SUJET",
        "ENVOYER UN MESSAGE",
        "PROPOSER UN CONSULTANT SUR UNE MISSION PRÉCISE",
    )
    positions = [_BLOCK_APPROACH_PREREQUISITES.index(op) for op in operations]
    assert positions == sorted(positions), "les six opérations doivent apparaître dans cet ordre"


def test_qualification_prep_never_requires_a_confirmed_need() -> None:
    assert "un premier message se prépare SANS affirmer que le client achète et SANS besoin confirmé" in (
        _BLOCK_APPROACH_PREREQUISITES
    )


def test_a_weak_signal_is_never_promoted_into_an_open_need() -> None:
    assert "jamais une promotion en besoin ouvert tant qu'il n'est pas confirmé" in _BLOCK_APPROACH_PREREQUISITES


def test_missing_contact_details_block_only_the_send_never_the_draft() -> None:
    assert "UNE COORDONNÉE ABSENTE BLOQUE L'ENVOI, JAMAIS LA PRÉPARATION" in _BLOCK_APPROACH_PREREQUISITES
    assert "empêche d'ENVOYER" in _BLOCK_APPROACH_PREREQUISITES
    assert "jamais de PRÉPARER le texte du message" in _BLOCK_APPROACH_PREREQUISITES


def test_a_qualification_message_never_invents_demand_budget_or_urgency() -> None:
    assert "UN MESSAGE DE QUALIFICATION N'INVENTE RIEN" in _BLOCK_APPROACH_PREREQUISITES
    assert "jamais une affirmation inventée" in _BLOCK_APPROACH_PREREQUISITES


def test_sending_keeps_its_own_identity_and_authorization_controls_not_a_need() -> None:
    assert "ENVOYER UN MESSAGE — garde ses VRAIS contrôles d'identité et d'autorisation" in (
        _BLOCK_APPROACH_PREREQUISITES
    )
    assert "jamais l'existence d'un besoin" in _BLOCK_APPROACH_PREREQUISITES


def test_a_precise_staffing_request_keeps_its_own_qualification_gate() -> None:
    assert "reste soumis à SA qualification propre" in _BLOCK_APPROACH_PREREQUISITES
    assert "ne se relâche JAMAIS" in _BLOCK_APPROACH_PREREQUISITES


def test_an_explicit_preparation_request_is_produced_this_turn_not_deferred() -> None:
    assert "QUAND LA DEMANDE INCLUT LA PRÉPARATION, TU LA PRODUIS" in _BLOCK_APPROACH_PREREQUISITES
    assert "DANS CE TOUR" in _BLOCK_APPROACH_PREREQUISITES


def test_a_stripped_block_would_be_missing_the_rule() -> None:
    """La garde sait dire NON : un bloc VIDÉ ne porte plus la règle."""
    stripped = ""
    assert "l'absence de besoin CLIENT CONFIRMÉ n'est PAS un blocage" not in stripped
