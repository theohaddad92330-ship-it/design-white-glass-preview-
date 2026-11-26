"""Domain focus — dé-siloter du IT/data (Drive #9).

The domain lens is ALWAYS derived from the ESN profile; there is no env flag.
The ``_looks_like_it_esn`` guard is the safety net, so:
  1. An IT-services ESN (the current customer) — or a profile with no offers —
     resolves to the exact IT strings, so prompts render exactly as before (the
     golden test covers the byte-identity; here we pin the resolver contract).
  2. Only a *non-IT* ESN gets a generalised lens, built from its own offers, so
     no current customer's live output shifts.
"""

from __future__ import annotations

from app.prompts import bellum_facts, bellum_signals, bellum_strategy
from app.services.domain_focus import resolve_domain_focus

_NON_IT_ESN = {"companyName": "MecaConseil", "offers": ["Ingénierie mécanique", "Calcul de structures"]}
_IT_ESN = {"companyName": "DataForge", "offers": ["Data & IA", "Cloud AWS", "Cybersécurité"]}


def test_it_esn_resolves_to_it_defaults():
    focus = resolve_domain_focus(_IT_ESN)  # IT customer → IT lens, unchanged
    assert focus["label"] == "IT"
    assert focus["label_long"] == "IT/digital"
    assert focus["system_label"] == "SI"
    assert focus["budget_signal"].startswith("Budget IT visible")


def test_generalises_a_non_it_esn():
    focus = resolve_domain_focus(_NON_IT_ESN)
    assert focus["label"] == "Ingénierie mécanique"
    assert "Ingénierie mécanique" in focus["budget_signal"]
    assert "IT" not in focus["label"]


def test_empty_profile_stays_it():
    assert resolve_domain_focus({})["label"] == "IT"  # unknown domain → safe IT default
    assert resolve_domain_focus(None)["label"] == "IT"


def test_prompts_drop_the_hardcoded_it_lens_for_a_non_it_esn():
    """End-to-end: for a non-IT ESN, the pipeline prompts no longer force the IT
    lens — the ESN's own domain drives the wording."""
    facts = bellum_facts.build_system_prompt(_NON_IT_ESN)
    strategy = bellum_strategy.build_system_prompt(_NON_IT_ESN)
    signals = bellum_signals.build_system_prompt(_NON_IT_ESN)

    assert "Budget IT visible" not in facts
    assert "programmes IT " not in facts
    assert "defis IT," not in strategy
    assert "SIGNAUX DYNAMIQUES IT " not in signals
    # …and the ESN's real domain surfaces instead.
    assert "Ingénierie mécanique" in strategy


def test_it_esn_exposes_it_defaults_for_the_user_prompt_keys():
    """Phase-2 user-prompt keys keep the exact historical IT wording for an IT ESN."""
    focus = resolve_domain_focus(_IT_ESN)
    assert focus["tech_entity_directive"].startswith("IMPERATIF: identifie l'entite IT/digitale du groupe")
    assert "c'est la cible n1 d'un ESN" in focus["tech_entity_directive"]
    assert focus["sell_examples"] == "data, cloud, cyber, run/TMA, paiements, mobile, MLOps"


def test_generalises_the_user_prompt_keys_for_a_non_it_esn():
    focus = resolve_domain_focus(_NON_IT_ESN)
    # The entity hunt targets the ESN's own domain, not an assumed IT subsidiary.
    assert "IT/digitale" not in focus["tech_entity_directive"]
    assert "Ingénierie mécanique" in focus["tech_entity_directive"]
    # sell_examples become the ESN's declared offers.
    assert focus["sell_examples"] == "Ingénierie mécanique, Calcul de structures"
