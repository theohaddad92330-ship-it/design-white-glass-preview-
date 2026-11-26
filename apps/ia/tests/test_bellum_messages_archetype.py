"""#3226 (#3202.6) — l'archétype du compte cible atteint le prompt messages,
sans rien changer quand l'archétype n'est pas établi (prompt byte-identique,
même garantie que `market_memory_angle_block`, testée dans
`test_bellum_messages_market_memory.py`)."""

from __future__ import annotations

from app.prompts import bellum_messages
from app.services.company_archetype import ArchetypeConfidence, ArchetypeVerdict, CompanyArchetype
from app.services.company_archetype_playbook import archetype_commercial_hint

CONTACTS = [{"fullName": "Claire Dubois", "title": "DSI", "hierarchyLevel": "c_level"}]


def _messages_prompt(archetype_block: str = "") -> str:
    return bellum_messages.build_user_prompt("ACME", "contexte compte", CONTACTS, archetype_block=archetype_block)


def test_sans_hint_le_bloc_est_vide() -> None:
    assert bellum_messages.account_archetype_message_block(None) == ""


def test_sans_bloc_archetype_le_prompt_reste_byte_identique() -> None:
    baseline = bellum_messages.build_user_prompt("ACME", "contexte compte", CONTACTS)
    assert _messages_prompt("") == baseline


def test_le_bloc_esn_porte_langle_message_et_le_partenariat() -> None:
    verdict = ArchetypeVerdict(archetype=CompanyArchetype.ESN, confidence=ArchetypeConfidence.CONFIRMED, evidence=["x"])
    hint = archetype_commercial_hint(verdict)
    block = bellum_messages.account_archetype_message_block(hint)
    assert "ARCHÉTYPE DU COMPTE CIBLE" in block
    assert "staffing" in block.lower()
    assert "partenaire" in block.lower()
    prompt = _messages_prompt(block)
    assert "ARCHÉTYPE DU COMPTE CIBLE" in prompt


def test_archetype_not_established_ne_produit_aucun_bloc() -> None:
    verdict = ArchetypeVerdict(
        archetype=CompanyArchetype.STARTUP, confidence=ArchetypeConfidence.NOT_ESTABLISHED, evidence=["x"]
    )
    hint = archetype_commercial_hint(verdict)
    assert hint is None
    assert bellum_messages.account_archetype_message_block(hint) == ""
