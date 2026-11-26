"""Golden set for the Claude USER prompts touched by the domain lens (Drive #9,
Phase 2). The registry golden test only covers SYSTEM prompts, so this file is
the byte-identity proof for the USER prompts whose lens now derives from the ESN
profile (no env flag).

Two guarantees, mirroring the system-prompt golden:

1. **IT / empty profile → byte-identical.** An IT-services ESN (the current
   customer) — or a profile with no offers (``None``) — renders exactly the
   committed baseline (the pre-generalisation IT output) under
   ``tests/golden/user/``, so no live output shifts.
2. **Non-IT ESN → generalised.** A genuinely non-IT ESN drops the hard-coded IT
   lens for its own domain.

Regenerate the baselines after an INTENTIONAL user-prompt edit:

    UPDATE_USER_PROMPT_GOLDEN=1 pytest tests/test_domain_focus_user_prompts.py -q

then review the diff and commit the updated .txt files with the change.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.prompts import bellum_contacts, bellum_facts, bellum_plan, bellum_signals

_GOLDEN_DIR = Path(__file__).parent / "golden" / "user"
_UPDATE = os.getenv("UPDATE_USER_PROMPT_GOLDEN") == "1"

# A genuinely non-IT ESN (the case Phase 2 unlocks) and an IT ESN (the current
# customer, whose output must never move). Same fixtures as test_domain_focus.
_NON_IT_ESN = {
    "companyName": "MecaConseil",
    "offers": ["Ingénierie mécanique", "Calcul de structures", "Essais"],
}
_IT_ESN = {"companyName": "DataForge", "offers": ["Data & IA", "Cloud AWS", "Cybersécurité"]}

# Fixed sample source args so the ONLY variable across renders is the domain
# lens. Must match the committed baselines under tests/golden/user/.
_SAMPLE = {
    "facts": dict(
        target_company="ACME",
        brave_results="BRAVE_SAMPLE",
        scraped_content="SCRAPE_SAMPLE",
        pappers_data="PAPPERS_SAMPLE",
        user_context="CTX_SAMPLE",
    ),
    "signals": dict(
        target_company="ACME",
        brave_results="BRAVE_SAMPLE",
        scraped_content="SCRAPE_SAMPLE",
        pappers_data="PAPPERS_SAMPLE",
        dated_signals="DATED_SAMPLE",
    ),
    "contacts": dict(
        company_name="ACME",
        contacts="CONTACTS_SAMPLE",
        entities="ENTITIES_SAMPLE",
        angles="ANGLES_SAMPLE",
        pains="PAINS_SAMPLE",
    ),
    "plan_evaluation": dict(company_name="ACME", section="evaluation"),
}


def _render(name: str, profile: dict | None) -> str:
    """Render one user prompt with the fixed sample args + given profile."""
    if name == "facts":
        return bellum_facts.build_user_prompt(**_SAMPLE["facts"], profile_data=profile)
    if name == "signals":
        return bellum_signals.build_user_prompt(**_SAMPLE["signals"], profile_data=profile)
    if name == "contacts":
        return bellum_contacts.build_user_prompt(**_SAMPLE["contacts"], profile_data=profile)
    if name == "plan_evaluation":
        return bellum_plan.build_subsection_user_prompt(**_SAMPLE["plan_evaluation"], profile_data=profile)
    raise AssertionError(f"unknown prompt {name}")


_NAMES = ("facts", "signals", "contacts", "plan_evaluation")


def test_regenerate_baselines_when_asked():
    """Escape hatch: `UPDATE_USER_PROMPT_GOLDEN=1` rewrites the baselines from the
    current IT/empty render. A no-op assertion otherwise, so the suite stays green."""
    if not _UPDATE:
        pytest.skip("set UPDATE_USER_PROMPT_GOLDEN=1 to regenerate")
    _GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    for name in _NAMES:
        (_GOLDEN_DIR / f"{name}.txt").write_text(_render(name, None), encoding="utf-8")


@pytest.mark.parametrize("name", _NAMES)
@pytest.mark.parametrize("profile_label", ["none", "it"])
def test_it_and_empty_profiles_are_byte_identical(name, profile_label):
    """An IT ESN (the current customer) and an empty profile both render the
    committed baseline (the non-negotiable safety guarantee — no live output
    shifts)."""
    profile = {"none": None, "it": _IT_ESN}[profile_label]
    expected = (_GOLDEN_DIR / f"{name}.txt").read_text(encoding="utf-8")
    assert _render(name, profile) == expected


def test_generalises_facts_for_a_non_it_esn():
    facts = _render("facts", _NON_IT_ESN)
    # Hard-coded IT lens is gone…
    assert "entite IT/digitale" not in facts
    assert "programmes IT " not in facts
    assert "Besoins IT NES" not in facts
    assert "data, cloud, cyber, run/TMA" not in facts
    # …and the ESN's own domain drives the wording.
    assert "Ingénierie mécanique" in facts
    assert "Besoins Ingénierie mécanique NES" in facts
    # The data-contract JSON keys are untouched (parsers depend on them).
    assert '"itAutonomy":' in facts
    assert '"it_implications_for_esn":' in facts
    assert '"programNames":' in facts


def test_generalises_signals_for_a_non_it_esn():
    signals = _render("signals", _NON_IT_ESN)
    assert "besoin IT " not in signals
    assert "achats IT." not in signals
    assert "besoin Ingénierie mécanique" in signals
    assert "achats Ingénierie mécanique" in signals


def test_generalises_contacts_for_a_non_it_esn():
    contacts = _render("contacts", _NON_IT_ESN)
    assert "decisions IT/digital" not in contacts
    # label_long joins the first three offers.
    assert "decisions Ingénierie mécanique / Calcul de structures / Essais" in contacts


def test_generalises_plan_evaluation_for_a_non_it_esn():
    plan = _render("plan_evaluation", _NON_IT_ESN)
    assert "budget IT " not in plan
    assert "signaux IT," not in plan
    assert "budget Ingénierie mécanique" in plan
    assert "signaux Ingénierie mécanique" in plan
