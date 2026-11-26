"""#1956.21 — garde de SORTIE : PII non autorisée, sur les outils dont le
corpus est PARTAGÉ entre espaces (`search_market_memory`, `search_partners`,
`get_territory_overview`, `get_esn_on_account`).

Voir le docstring de `shared_corpus_pii_guard.py` pour ce que cette garde
N'EST PAS : un filtre PII général — elle ne touche jamais un outil qui lit le
portefeuille de l'appelant (`get_account_contacts`…), où un e-mail ou un
téléphone de contact est la RAISON D'ÊTRE de l'outil.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools
from app.services.shared_corpus_pii_guard import (
    SHARED_CORPUS_TOOLS,
    guard_shared_corpus_pii,
    guard_shared_corpus_pii_reporting_leak,
)

USER = "11111111-1111-4111-8111-111111111111"


# ── (a) La garde sait dire NON — elle masque là où elle doit ────────────────


def test_an_email_inside_a_shared_corpus_result_is_masked():
    leaked = {"company_name": "Acme", "observed_zone": {"note": "contact: jean.dupont@acme.fr"}}
    cleaned = guard_shared_corpus_pii("search_market_memory", leaked)
    assert "jean.dupont@acme.fr" not in str(cleaned)
    assert cleaned["observed_zone"]["note"] == "contact: [email masqué]"


def test_a_phone_inside_a_shared_corpus_result_is_masked():
    leaked = {"matches": [{"note": "joignable au 06 12 34 56 78"}]}
    cleaned = guard_shared_corpus_pii("search_partners", leaked)
    assert "06 12 34 56 78" not in str(cleaned)
    assert "[téléphone masqué]" in cleaned["matches"][0]["note"]


def test_a_personal_linkedin_url_inside_a_shared_corpus_result_is_masked():
    """#2287.29 — une URL de profil PERSONNEL (LinkedIn /in/) est une identité
    de personne au même titre qu'un e-mail ou un téléphone. Un lien vers une
    page ENTREPRISE (/company/…) reste un fait sur le marché, jamais une
    identité — cette forme-là ne doit jamais être masquée (test voisin
    ci-dessous)."""
    leaked = {"matches": [{"note": "vu sur https://www.linkedin.com/in/jean-dupont-92"}]}
    cleaned = guard_shared_corpus_pii("search_market_memory", leaked)
    assert "jean-dupont-92" not in str(cleaned)
    assert "[URL personnelle masquée]" in cleaned["matches"][0]["note"]


def test_a_linkedin_company_url_is_never_masked():
    """Témoin de cas légitime voisin : une page ENTREPRISE LinkedIn n'identifie
    personne — la garde ne doit RIEN y voir, sous peine de masquer un fait
    marché légitime."""
    intact = {"note": "page LinkedIn : https://www.linkedin.com/company/acme"}
    assert guard_shared_corpus_pii("search_market_memory", intact) == intact


@pytest.mark.parametrize("tool_name", sorted(SHARED_CORPUS_TOOLS))
def test_every_shared_corpus_tool_is_covered(tool_name: str):
    leaked = {"anything": "joignable à contact@exemple.fr"}
    cleaned = guard_shared_corpus_pii(tool_name, leaked)
    assert "@" not in str(cleaned["anything"])


# ── (b) La garde sait se TAIRE — un outil de portefeuille n'est jamais touché ─


def test_get_account_contacts_is_never_touched():
    """Témoin de cas légitime voisin : un e-mail de CONTACT est le produit
    lui-même sur cet outil, jamais une fuite. La garde ne doit RIEN y voir."""
    real_contact = {"contacts": [{"email": "vraie.personne@client.fr", "phone": "01 23 45 67 89"}]}
    assert guard_shared_corpus_pii("get_account_contacts", real_contact) == real_contact


def test_an_unlisted_tool_name_passes_through_untouched():
    payload = {"note": "contact@exemple.fr"}
    assert guard_shared_corpus_pii("get_account_briefing", payload) is payload


# ── (b bis) La variante qui RAPPORTE la fuite, #2879/#2442.15 ───────────────


def test_reporting_variant_flags_a_real_leak():
    leaked = {"note": "contact: jean.dupont@acme.fr"}
    cleaned, reported = guard_shared_corpus_pii_reporting_leak("search_market_memory", leaked)
    assert reported is True
    assert "jean.dupont@acme.fr" not in str(cleaned)


def test_reporting_variant_never_flags_a_clean_result():
    intact = {"company_name": "Acme"}
    cleaned, reported = guard_shared_corpus_pii_reporting_leak("search_market_memory", intact)
    assert reported is False
    assert cleaned == intact


def test_reporting_variant_never_flags_an_unlisted_tool_even_with_an_email():
    payload = {"note": "contact@exemple.fr"}
    cleaned, reported = guard_shared_corpus_pii_reporting_leak("get_account_contacts", payload)
    assert reported is False
    assert cleaned == payload


# ── (c) Câblée au vrai point d'entrée ────────────────────────────────────────


@pytest.mark.asyncio
async def test_execute_chat_tool_applies_the_guard_to_every_result(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, object]] = []
    original = chat_tools.guard_shared_corpus_pii_reporting_leak

    def _spy(tool_name: str, value: object) -> object:
        calls.append((tool_name, value))
        return original(tool_name, value)

    async def _noop_record(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(chat_tools, "guard_shared_corpus_pii_reporting_leak", _spy)
    monkeypatch.setattr(chat_tools, "record_tool_call", _noop_record)
    monkeypatch.setattr(chat_tools, "record_leak_detected", _noop_record)

    result = await chat_tools.execute_chat_tool("un_outil_qui_nexiste_pas", {}, user_id=USER, profile_data=None)

    assert calls, "execute_chat_tool n'a jamais appelé guard_shared_corpus_pii_reporting_leak"
    assert calls[0][0] == "un_outil_qui_nexiste_pas"
    assert result == {"error": "Outil inconnu: un_outil_qui_nexiste_pas"}


@pytest.mark.asyncio
async def test_execute_chat_tool_records_a_leak_when_the_guard_reports_one(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2879/#2442.15 — un tour de chat sur `search_market_memory` dont le
    résultat contient une identité de personne doit écrire le signal, pas
    seulement nettoyer en silence."""
    recorded: list[str] = []

    async def _spy_record(tool_name: str, *, user_id: str) -> None:
        recorded.append(tool_name)

    async def _fake_dispatch(name, tool_input, **kw):
        return {"note": "contact: jean.dupont@acme.fr"}

    async def _noop_audit(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(chat_tools, "_execute_chat_tool_dispatch", _fake_dispatch)
    monkeypatch.setattr(chat_tools, "record_leak_detected", _spy_record)
    monkeypatch.setattr(chat_tools, "record_tool_call", _noop_audit)

    result = await chat_tools.execute_chat_tool("search_market_memory", {}, user_id=USER, profile_data=None)

    assert recorded == ["search_market_memory"]
    assert "jean.dupont@acme.fr" not in str(result)


@pytest.mark.asyncio
async def test_execute_chat_tool_never_records_a_leak_on_a_clean_result(monkeypatch: pytest.MonkeyPatch) -> None:
    recorded: list[str] = []

    async def _spy_record(tool_name: str, *, user_id: str) -> None:
        recorded.append(tool_name)

    async def _fake_dispatch(name, tool_input, **kw):
        return {"company_name": "Acme"}

    async def _noop_audit(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(chat_tools, "_execute_chat_tool_dispatch", _fake_dispatch)
    monkeypatch.setattr(chat_tools, "record_leak_detected", _spy_record)
    monkeypatch.setattr(chat_tools, "record_tool_call", _noop_audit)

    await chat_tools.execute_chat_tool("search_market_memory", {}, user_id=USER, profile_data=None)

    assert recorded == []
