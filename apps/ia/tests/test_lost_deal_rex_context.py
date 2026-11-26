"""#3272.6 — Laura cite le REX de perte du compte.

L'API NestJS condense les REX de perte déjà persistés d'un compte en
quelques lignes courtes (jamais le REX mot pour mot,
``apps/api/.../ia-proxy/lost-deal-rex-context.ts``) et les envoie ici via
``lost_deal_rex_context``. Deux garanties verrouillées ici, même discipline
que ``test_account_feedback.py`` :

1. **Byte-identité** : sans REX (champ absent ou vide), le prompt est
   strictement identique à avant la feature.
2. **Injection prudente** : avec un REX, le bloc apparaît et rappelle
   explicitement de ne jamais le réciter mot pour mot ni présenter une
   hypothèse comme un fait acquis.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt as build_advisor_prompt
from app.services.lost_deal_rex_context import lost_deal_rex_context_block

CONTEXT = (
    "Perte du 2026-05-12 — route utilisée : « approche directe, sans détour par le "
    "sponsor » ; sponsor : non identifié ; motif déclaré : budget ; dernière action "
    "(hypothèse, non confirmée) : relance email restée sans réponse."
)


# ── Le bloc lui-même ─────────────────────────────────────────────────────────


def test_block_is_empty_without_context():
    assert lost_deal_rex_context_block("") == ""
    assert lost_deal_rex_context_block(None) == ""
    assert lost_deal_rex_context_block("   \n  ") == ""


def test_block_carries_the_condensed_context():
    block = lost_deal_rex_context_block(CONTEXT)
    assert "REX DE PERTE" in block
    assert CONTEXT in block


def test_block_instructs_never_to_recite_verbatim():
    block = lost_deal_rex_context_block(CONTEXT)
    assert "mot pour mot" in block


def test_block_instructs_hypothesis_stays_a_hypothesis():
    block = lost_deal_rex_context_block(CONTEXT)
    assert "hypothèse" in block


def test_block_caps_hostile_payloads():
    block = lost_deal_rex_context_block("x" * 100_000)
    assert len(block) < 3_000


# ── Chat (copilote) ──────────────────────────────────────────────────────────


def test_advisor_prompt_byte_identical_without_lost_deal_rex_context():
    baseline = build_advisor_prompt({}, {}, "", "")
    assert build_advisor_prompt({}, {}, "", "", lost_deal_rex_context="") == baseline
    assert "REX DE PERTE" not in baseline


def test_advisor_prompt_injects_lost_deal_rex_block():
    prompt = build_advisor_prompt({}, {}, "", "", lost_deal_rex_context=CONTEXT)
    assert "REX DE PERTE" in prompt
    assert CONTEXT in prompt
    # Additif : retirer le bloc redonne exactement le prompt de base.
    assert prompt.replace(lost_deal_rex_context_block(CONTEXT), "") == build_advisor_prompt({}, {}, "", "")


def test_advisor_prompt_composes_feedback_and_lost_deal_rex_blocks_independently():
    # Les deux blocs additifs (feedback loop A2 + REX de perte) coexistent sans
    # se marcher dessus — chacun apparaît, chacun reste identifiable.
    prompt = build_advisor_prompt(
        {}, {}, "", "", account_feedback="- retour cité", lost_deal_rex_context=CONTEXT
    )
    assert "RETOURS UTILISATEUR SUR CE COMPTE" in prompt
    assert "REX DE PERTE" in prompt
