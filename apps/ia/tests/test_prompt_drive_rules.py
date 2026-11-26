"""Drive business rules made explicit in the prompts (Théo: "l'interprétation
n'est pas assez basée sur le drive"). No-go sectors (Drive §7) and the
forbidden-as-fact list (Drive §8) must be spelled out, not merely implied."""

from __future__ import annotations

from app.prompts.bellum_facts import build_system_prompt as facts_prompt
from app.prompts.bellum_strategy import build_system_prompt as strategy_prompt


def test_strategy_prompt_injects_declared_no_go_sectors():
    prompt = strategy_prompt({"offers": ["Cloud"], "noGoSectors": ["Défense", "Tabac"]})
    assert "NO-GO" in prompt
    assert "Défense" in prompt and "Tabac" in prompt


def test_strategy_prompt_no_go_degrades_gracefully_without_declaration():
    prompt = strategy_prompt({"offers": ["Cloud"]})
    assert "NO-GO" in prompt
    assert "aucun declare" in prompt


def test_forbidden_as_fact_list_present_in_facts_and_strategy():
    for prompt in (facts_prompt({"size": "50"}), strategy_prompt({})):
        assert "DONNEES INTERDITES" in prompt
        # A few of the Drive §8 forbidden items.
        assert "intention d'achat" in prompt
        assert "date de fin de contrat" in prompt


# ── Accents in contact names ─────────────────────────────────────────────────
# `bellum_contacts` and `bellum_messages` are written in unaccented French, and
# a model imitates the orthography of its prompt: it answered "Sebastien
# Chauffray" for a contact given as "Sébastien Chauffray". Both write-back paths
# match on the name, so the mismatch silently dropped the whole enrichment.
# The API now matches accent-insensitively; the prompt must ALSO stop provoking
# the drift, because the name it echoes is what the user finally reads.


def test_contacts_prompt_demands_verbatim_accents() -> None:
    from app.prompts.bellum_contacts import build_system_prompt

    prompt = build_system_prompt({})
    lowered = prompt.lower()
    assert "accent" in lowered, "the prompt must state that accents are copied verbatim"
    # The rule has to name the field it protects, or it reads as generic advice.
    assert "caractere pour caractere" in lowered or "caractère pour caractère" in lowered


def test_messages_prompt_demands_verbatim_accents() -> None:
    from app.prompts.bellum_messages import build_system_prompt

    prompt = build_system_prompt({})
    assert "accent" in prompt.lower()
