"""Phase 3 knows WHO IS SELLING — the seller profile is not the target account.

``classify_contacts_and_organigramme`` used a single ``profile_data`` dict for two
different jobs: the « PROFIL ESN » block of the system prompts (who is selling) and
the target slices of the user prompt (entities / angles / pains / company name).

On the pipeline path the merged dict overwrote ``companyName`` with the TARGET's
name, so the model was told « PROFIL ESN — Nom : TF1 » while classifying TF1's own
people. On the on-demand path (« Enrichir organigramme ») the whole dict IS the
target's ``raw_analysis`` — no offers, no expertise → the seller boost of the
canonical /100 scored on an empty context and the domain lens fell back to IT.

``esn_profile`` carries the real seller. Absent (default) → the previous behaviour,
byte for byte.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from app.models.classify import ClassifyRequest
from app.models.outputs.contacts import (
    ContactsOutput,
    DecisionChain,
    EnrichedContact,
    OrganigrammeOutput,
)
from app.prompts import bellum_contacts
from app.services.classification import (
    classify_contacts_and_organigramme,
    seller_profile_for,
)
from app.services.contact_priority_score import (
    contact_priority_score,
    seller_context_from_profile,
)

# The seller: a cyber ESN. Its expertise drives the /100 seller boost (technical).
_ESN: dict[str, Any] = {
    "companyName": "Skaizen",
    "size": 120,
    "offers": ["cybersécurité", "SOC managé"],
    "expertise_areas": ["cybersécurité"],
}

# What the on-demand path passes today as ``profile_data``: the TARGET's raw_analysis.
_TARGET: dict[str, Any] = {
    "companyName": "TF1",
    "entities": [{"name": "TF1 PUB"}],
    "angles": ["angle cible"],
    "pains": ["douleur cible"],
}

_SEEDS = [{"fullName": "Alice Martin", "title": "RSSI", "entity": "TF1"}]


def _classified() -> EnrichedContact:
    return EnrichedContact(
        full_name="Alice Martin",
        title="RSSI",
        entity="TF1",
        role="technical",
        priority=5,
        summary="Responsable sécurité",
        why_contact="Porte le sujet SOC",
    )


def _fake_claude(captured: dict[str, str]):
    """Capture each prompt by name and answer with a minimal valid output."""

    async def side_effect(system: str, user: str, **kwargs: Any):
        name = str(kwargs.get("prompt_name") or "")
        captured[name] = system
        captured[f"{name}::user"] = user
        usage = {"input_tokens": 1, "output_tokens": 1}
        if name.startswith("bellum_contacts"):
            return ContactsOutput(contacts=[_classified()]), usage
        return (
            OrganigrammeOutput(
                organigramme=[],
                decision_chain=DecisionChain(),
                uncovered_zones=[],
                approach_order=[],
            ),
            usage,
        )

    return side_effect


async def _run(req: ClassifyRequest) -> tuple[dict[str, Any], dict[str, str]]:
    captured: dict[str, str] = {}
    with patch(
        "app.services.classification.call_claude", side_effect=_fake_claude(captured)
    ):
        merged = await classify_contacts_and_organigramme(req)
    return merged, captured


def test_seller_profile_falls_back_to_profile_data() -> None:
    """No ``esn_profile`` → the previous behaviour, unchanged."""
    req = ClassifyRequest(account_id="a1", contacts=_SEEDS, profile_data=_TARGET)
    assert seller_profile_for(req) == _TARGET


def test_seller_profile_prefers_the_declared_esn_profile() -> None:
    req = ClassifyRequest(
        account_id="a1", contacts=_SEEDS, profile_data=_TARGET, esn_profile=_ESN
    )
    assert seller_profile_for(req) == _ESN


def test_empty_esn_profile_is_not_a_seller() -> None:
    """``{}`` (nothing declared) must not blank out the historical fallback."""
    req = ClassifyRequest(
        account_id="a1", contacts=_SEEDS, profile_data=_TARGET, esn_profile={}
    )
    assert seller_profile_for(req) == _TARGET


@pytest.mark.asyncio
async def test_system_prompt_describes_the_seller_not_the_target() -> None:
    req = ClassifyRequest(
        account_id="a1", contacts=_SEEDS, profile_data=_TARGET, esn_profile=_ESN
    )
    _, captured = await _run(req)

    contacts_system = captured["bellum_contacts_batch_1_of_1"]
    assert "- Nom : Skaizen" in contacts_system
    assert "- Nom : TF1" not in contacts_system
    assert "cybersécurité" in contacts_system

    # The organigramme prompt reasons with the same seller.
    assert "- Nom : Skaizen" in captured["bellum_organigramme"]


@pytest.mark.asyncio
async def test_target_slices_still_come_from_profile_data() -> None:
    """The seller drives the system prompt; the ACCOUNT still drives the user prompt."""
    req = ClassifyRequest(
        account_id="a1", contacts=_SEEDS, profile_data=_TARGET, esn_profile=_ESN
    )
    _, captured = await _run(req)

    user = captured["bellum_contacts_batch_1_of_1::user"]
    assert "TF1" in user
    assert "douleur cible" in user
    assert "angle cible" in user


@pytest.mark.asyncio
async def test_without_esn_profile_the_prompt_is_byte_identical() -> None:
    req = ClassifyRequest(account_id="a1", contacts=_SEEDS, profile_data=_TARGET)
    _, captured = await _run(req)

    assert captured["bellum_contacts_batch_1_of_1"] == bellum_contacts.build_system_prompt(
        _TARGET
    )


def test_the_seller_boost_has_something_to_bite_on() -> None:
    """The target's raw_analysis declares no expertise → an empty (neutral) context.

    Same RSSI, same grid: scored against the cyber ESN the technical role is
    prioritised (+boost), scored against the target it is not. This is the
    « capturé ≠ consommé » gap the wiring below closes.
    """
    # Lot 758 — une source qui PROUVE la personne : sans elle, le plancher de preuve p26
    # (69) plafonnait les deux scores, désormais tous deux au-dessus, et masquait l'écart.
    contact = {"fullName": "Alice Martin", "title": "RSSI", "role": "technical", "source": "apollo"}
    seller_ctx = seller_context_from_profile(_ESN)
    target_ctx = seller_context_from_profile(_TARGET)

    assert "technical" in seller_ctx.priority_roles
    assert target_ctx.is_empty
    assert contact_priority_score(contact, seller_ctx) > contact_priority_score(
        contact, target_ctx
    )


@pytest.mark.asyncio
async def test_the_canonical_priority_scores_against_the_seller() -> None:
    """Phase 3 hands the SELLER — not the target — to the /100 seller context."""
    seen: list[Any] = []
    real = seller_context_from_profile

    def spy(profile: Any) -> Any:
        seen.append(profile)
        return real(profile)

    req = ClassifyRequest(
        account_id="a1", contacts=_SEEDS, profile_data=_TARGET, esn_profile=_ESN
    )
    with patch("app.services.classification.seller_context_from_profile", side_effect=spy):
        merged, _ = await _run(req)

    assert seen == [_ESN]
    # The classified contact keeps a canonical rank (1-5), never the model's 5.
    assert merged["contacts"][0]["priority"] in (1, 2, 3, 4, 5)
