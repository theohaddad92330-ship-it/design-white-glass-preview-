"""Un organigramme tronqué ne doit pas faire échouer un dossier complet.

Incident réel (compte FREE) : ``bellum_organigramme`` a tronqué sa sortie
(``ClaudeIncompleteOutputError``) et TOUTE l'analyse s'est marquée « Erreur » en
phase classify — alors que la vue d'ensemble, les signaux, les sources et le
score étaient déjà persistés. La cause : les batches de contacts dégradent (un
batch en échec renvoie ``[]``) mais l'organigramme, lui, propageait l'exception.

Ces tests verrouillent la symétrie : org en échec ⇒ graphe de décision vide, le
dossier part quand même ; les contacts restent classés.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.models.classify import ClassifyRequest
from app.models.outputs.contacts import ContactsOutput
from app.services import classification
from app.services.claude_service import ClaudeIncompleteOutputError


def _contact(name: str) -> dict[str, Any]:
    return {"fullName": name, "title": "DSI", "entity": "ACME"}


def _classified(name: str) -> dict[str, Any]:
    return {
        "fullName": name,
        "title": "DSI",
        "entity": "ACME",
        "role": "sponsor",
        "priority": 1,
        "summary": "Décideur IT",
        "whyContact": "Budget",
    }


def _install_claude_with_truncated_org(monkeypatch: pytest.MonkeyPatch, *, names: list[str]) -> None:
    """``call_claude`` classe les contacts mais TRONQUE l'organigramme."""

    async def fake_call_claude(_system: str, _user: str, **kwargs: Any) -> tuple[Any, None]:
        prompt_name = kwargs.get("prompt_name", "")
        if "organigramme" in prompt_name:
            raise ClaudeIncompleteOutputError(
                prompt_name="bellum_organigramme",
                model="claude-haiku-4-5",
                max_tokens=kwargs.get("max_tokens", 0),
            )
        return ContactsOutput.model_validate({"contacts": [_classified(n) for n in names]}), None

    monkeypatch.setattr(classification, "call_claude", fake_call_claude)


@pytest.mark.asyncio
async def test_truncated_organigramme_does_not_fail_the_run(monkeypatch: pytest.MonkeyPatch) -> None:
    names = ["Alice Un", "Bob Deux"]
    _install_claude_with_truncated_org(monkeypatch, names=names)

    # Ne DOIT PAS lever : le dossier est par ailleurs complet.
    result = await classification.classify_contacts_and_organigramme(
        ClassifyRequest(
            account_id="acc-free",
            contacts=[_contact(n) for n in names],
            profile_data={"companyName": "FREE"},
        )
    )

    # Contacts toujours classés.
    assert [c["fullName"] for c in result["contacts"]] == names
    # Graphe de décision vide (dégradé), pas fabriqué.
    assert result["organigramme"] == []


@pytest.mark.asyncio
async def test_cancellation_still_propagates(monkeypatch: pytest.MonkeyPatch) -> None:
    """La dégradation ne doit pas avaler une annulation (déconnexion client)."""
    import asyncio

    async def fake_call_claude(_system: str, _user: str, **kwargs: Any) -> tuple[Any, None]:
        if "organigramme" in kwargs.get("prompt_name", ""):
            raise asyncio.CancelledError()
        return ContactsOutput.model_validate({"contacts": []}), None

    monkeypatch.setattr(classification, "call_claude", fake_call_claude)

    with pytest.raises(asyncio.CancelledError):
        await classification.classify_contacts_and_organigramme(
            ClassifyRequest(
                account_id="acc-free",
                contacts=[_contact("Alice Un")],
                profile_data={"companyName": "FREE"},
            )
        )
