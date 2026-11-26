"""#2370 (épopée #2947) — chaque canal du CONTRAT a sa règle IA, ou est nommé sans.

``packages/contracts/src/schemas/outreach-canonical.ts`` (``OUTREACH_MESSAGE_CHANNELS``)
est la source des canaux de message. Un canal ajouté là sans règle de forme dans
``bellum_outreach._CHANNEL_RULES`` serait rédigé avec la règle de l'e-mail (repli
de ``build_system_prompt``) : une note LinkedIn de 130 mots, un SMS avec un objet.
Ce test le refuse. Il lit le fichier TS (présent en CI, absent d'une image
Railway : il se saute alors) et PROUVE qu'il lit quelque chose avant de comparer.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import get_args
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.knowledge.channel_length import CHANNEL_LENGTH, CHANNEL_MAX_CHARS
from app.prompts import bellum_outreach
from app.prompts.bellum_outreach import build_system_prompt
from app.routers import message as message_router

_TS_REL = Path("packages/contracts/src/schemas/outreach-canonical.ts")

#: Les canaux du contrat qui n'ont PAS de générateur, et pourquoi — un choix, pas un oubli.
CHANNELS_WITHOUT_AI_RULE: dict[str, str] = {
    "manual": "le commercial écrit lui-même son message hors des canaux nommés : rien à générer "
    "(l'aperçu de style le refuse déjà, `message-style.service.ts`)",
    # Théo B C5.A24 / C7.A3 (décision Louis 22/10/2026) — retirés de la GÉNÉRATION ; le contrat les garde pour que
    # l'historique déjà écrit reste lisible (on archive, on ne supprime pas).
    "voicemail": "canal retiré (Théo B C7.A3) : historique en lecture seule",
    "sms": "canal retiré (Théo B C5.A24) : historique en lecture seule",
    "whatsapp": "canal retiré (Théo B C5.A24) : historique en lecture seule",
}

#: Les huit canaux de #2370, chacun avec un fragment qui n'appartient qu'à sa règle.
NEW_CHANNEL_MARKERS: dict[str, str] = {
    "introduction_request": "CANAL = demande d'introduction",
    "partner_message": "CANAL = message à un partenaire",
    "follow_up_email": "CANAL = e-mail de suivi",
    "profile_push": "CANAL = push de profil consultant",
    "linkedin_connection_note": "CANAL = note de connexion LinkedIn",
}


def _contract_source() -> str:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / _TS_REL
        if candidate.is_file():
            return candidate.read_text(encoding="utf-8")
    pytest.skip("contrat TS absent (image sans monorepo)")


def _strip_line_comments(source: str) -> str:
    return re.sub(r"^\s*//.*$", "", source, flags=re.M)


def contract_channels(source: str) -> list[str]:
    match = re.search(r"export const OUTREACH_MESSAGE_CHANNELS = \[(.*?)\] as const", source, re.S)
    assert match, "OUTREACH_MESSAGE_CHANNELS introuvable dans le contrat"
    return re.findall(r"'([a-z_]+)'", _strip_line_comments(match.group(1)))


def contract_max_chars(source: str) -> dict[str, int]:
    match = re.search(r"export const OUTREACH_CHANNEL_MAX_CHARS[^=]*= \{(.*?)\}", source, re.S)
    assert match, "OUTREACH_CHANNEL_MAX_CHARS introuvable dans le contrat"
    body = _strip_line_comments(match.group(1))
    return {key: int(value) for key, value in re.findall(r"([a-z_]+):\s*(\d+)", body)}


def channels_without_ai_rule(channels: list[str]) -> list[str]:
    """Les canaux du contrat qui n'ont ni règle IA, ni raison écrite de ne pas en avoir."""
    generated = set(get_args(message_router.Channel))
    return [
        channel
        for channel in channels
        if channel not in CHANNELS_WITHOUT_AI_RULE
        and (
            channel not in bellum_outreach._CHANNEL_RULES
            or channel not in bellum_outreach._CHANNEL_OWN_FIELDS
            or channel not in CHANNEL_LENGTH
            or channel not in generated
        )
    ]


def test_the_guard_reads_the_contract_before_comparing():
    channels = contract_channels(_contract_source())
    assert len(channels) >= 14
    assert {"email", "sms", "linkedin_connection_note"} <= set(channels)


def test_every_channel_of_the_contract_has_an_ai_rule_or_a_written_reason():
    assert channels_without_ai_rule(contract_channels(_contract_source())) == []


def test_theo_b_the_retired_channels_have_no_generator():
    generated = set(get_args(message_router.Channel))
    assert not {"voicemail", "sms", "whatsapp"} & generated
    assert not {"voicemail", "sms", "whatsapp"} & set(bellum_outreach._CHANNEL_RULES)


def test_the_guard_says_no_to_a_channel_without_rule():
    # Une garde qui ne sait pas dire NON ne garde rien.
    assert channels_without_ai_rule(["email", "pigeon"]) == ["pigeon"]


def test_the_exemptions_are_real_contract_channels():
    channels = set(contract_channels(_contract_source()))
    assert set(CHANNELS_WITHOUT_AI_RULE) <= channels


def test_the_two_literal_channel_lists_of_the_ia_agree():
    assert set(get_args(message_router.Channel)) == set(get_args(bellum_outreach.Channel))


def test_the_hard_character_ceilings_are_those_of_the_contract():
    ceilings = contract_max_chars(_contract_source())
    # `sms` reste au contrat (historique) mais n'a plus de générateur : seul le plafond LinkedIn est dur côté IA.
    assert ceilings == {"sms": 160, "linkedin_connection_note": 300}
    assert CHANNEL_MAX_CHARS == {"linkedin_connection_note": 300}


@pytest.mark.parametrize("channel", sorted(NEW_CHANNEL_MARKERS))
def test_2370_each_new_channel_gets_its_own_rule_and_it_leaks_nowhere(channel: str):
    marker = NEW_CHANNEL_MARKERS[channel]
    assert marker in build_system_prompt({"companyName": "Acme"}, channel)  # type: ignore[arg-type]
    for other in bellum_outreach._CHANNEL_RULES:
        if other != channel:
            assert marker not in build_system_prompt({"companyName": "Acme"}, other)  # type: ignore[arg-type]


def test_2370_the_connection_note_rule_names_the_300_characters():
    assert "300 caractères" in bellum_outreach._CHANNEL_RULES["linkedin_connection_note"]


def test_2370_the_prepared_channels_never_promise_a_send():
    # Le copilote PRÉPARE, le commercial envoie : aucune règle neuve ne dit à Laura d'envoyer.
    for channel in NEW_CHANNEL_MARKERS:
        assert "envoie" not in bellum_outreach._CHANNEL_RULES[channel].lower()


# ── Le routeur : forme de sortie et plafond dur ─────────────────────────────

_CONTACT = {
    "first_name": "Olivier",
    "last_name": "Martin",
    "title": "CTO",
    "decision_role": "Référent technique",
    "entity": "CIB",
    "account_id": "acc-1",
}
_ACCOUNT = {"company_name": "BNP Paribas", "raw_analysis": {"recent_signals": [{"title": "Cession Uptevia"}]}}


def _generate(client: TestClient, channel: str, claude_return: dict):
    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch("app.routers.message.call_claude", new_callable=AsyncMock, return_value=(claude_return, None)),
    ):
        return client.post(
            "/message/generate",
            json={"contact_id": "c1", "user_id": "u1", "channel": channel, "profile_data": {"companyName": "Acme"}},
        )


@pytest.mark.parametrize("channel", ["follow_up_email", "profile_push"])
def test_2370_the_email_shaped_channels_keep_their_subject(client: TestClient, channel: str):
    res = _generate(client, channel, {"subject": "Suite à notre échange", "body": "Bonjour Olivier, merci."})
    assert res.status_code == 200
    assert res.json()["data"]["subject"] == "Suite à notre échange"


@pytest.mark.parametrize("channel", ["linkedin_connection_note", "partner_message"])
def test_2370_the_short_channels_drop_any_subject(client: TestClient, channel: str):
    res = _generate(client, channel, {"subject": "Objet parasite", "body": "Bonjour Olivier, une question rapide ?"})
    assert res.status_code == 200
    assert res.json()["data"]["subject"] == ""


def test_2370_a_connection_note_over_300_characters_is_refused_and_named(client: TestClient):
    res = _generate(client, "linkedin_connection_note", {"body": "Bonjour Olivier, " + "x" * 300})
    assert res.status_code == 422
    assert "300" in res.json()["detail"]


def test_2370_a_note_within_its_ceiling_passes(client: TestClient):
    res = _generate(client, "linkedin_connection_note", {"body": "Bonjour Olivier, ravi d'échanger ?"})
    assert res.status_code == 200
