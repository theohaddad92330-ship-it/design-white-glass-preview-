"""#4347 — « Préparer un message » depuis la fiche consultant : Laura RÉDIGE l'objet et le corps.

La personne n'ouvre plus une boîte vide (décision Louis 19/10 : « préparer les appels, les messages,
les mails, ça doit être généré par l'IA / Laura, pas des champs vides à remplir »). Ce fichier prouve
le CONTRAT du moteur : le prompt (données fenêtrées, aucun critère protégé, aucun éditeur), la sortie
(refusée, jamais corrigée), et l'endpoint (aucun appel sans clé de modèle, aucun texte inventé).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.prompts.bellum_talent_message import build_system_prompt, build_user_prompt
from app.services.talent_message import accept_draft

_CONSULTANT = {
    "first_name": "Sophie",
    "title": "Développeuse Java senior",
    "skills": ["Java", "Kubernetes"],
    "availability": "available_from",
    "available_from": "2026-11-15",
}
_NEED = {
    "title": "Tech lead Java",
    "client_name": "SNCF",
    "skills": ["Java", "Kafka"],
    "start_on": "2026-11-16",
    "duration_months": 6,
}


def _body(**over):
    base = {"user_id": "u1", "channel": "email", "consultant": _CONSULTANT, "need": _NEED}
    base.update(over)
    return base


def test_the_prompt_fences_the_facts_and_names_no_protected_criterion() -> None:
    prompt = build_user_prompt(
        channel="email", consultant=_CONSULTANT, need=_NEED, variant=None, previous=None
    )
    assert "<consultant>" in prompt and "<besoin>" in prompt
    assert "Sophie" in prompt and "SNCF" in prompt
    for protected in ("âge", "genre", "origine", "photo", "adresse"):
        assert protected not in prompt.lower().split("<consultant>")[1].split("</consultant>")[0]
    assert "</consultant>" in prompt  # le bloc se ferme : une donnée n'échappe pas à son enclos


def test_the_system_prompt_forbids_inventing_and_names_no_vendor() -> None:
    system = build_system_prompt()
    assert "n'invente" in system.lower()
    for vendor in ("HubSpot", "Salesforce", "Apollo", "Pappers", "Claude", "Anthropic"):
        assert vendor not in system


def test_variants_change_the_instruction_not_the_facts() -> None:
    shorter = build_user_prompt(
        channel="email", consultant=_CONSULTANT, need=_NEED, variant="shorter", previous="Avant"
    )
    direct = build_user_prompt(
        channel="email", consultant=_CONSULTANT, need=_NEED, variant="more_direct", previous="Avant"
    )
    assert "plus court" in shorter.lower() and "plus court" not in direct.lower()
    assert "direct" in direct.lower()
    assert "Avant" in shorter and "Avant" in direct


def test_accept_draft_refuses_a_placeholder_a_vendor_and_an_empty_body() -> None:
    assert accept_draft(
        {"subject": "Mission Java", "body": "Bonjour Sophie, une mission Java démarre le 16/11."}, "email"
    )
    assert accept_draft({"subject": "x", "body": "Bonjour [Prénom], voici une mission."}, "email") is None
    assert (
        accept_draft(
            {"subject": "x", "body": "Bonjour Sophie, retrouve-moi sur HubSpot pour la suite du dossier."}, "email"
        )
        is None
    )
    assert accept_draft({"subject": "x", "body": "  "}, "email") is None
    assert accept_draft("pas un objet", "email") is None


def test_accept_draft_drops_the_subject_outside_email() -> None:
    draft = accept_draft({"subject": "Objet", "body": "Bonjour Sophie, une mission Java démarre le 16/11."}, "linkedin")
    assert draft is not None and draft["subject"] is None


def test_endpoint_without_a_model_key_invents_nothing(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    res = client.post("/talent/message-draft", json=_body())
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "generation_unavailable"


def test_endpoint_returns_the_drafted_subject_and_body(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    draft = {
        "subject": "Mission Java — SNCF",
        "body": "Bonjour Sophie, une mission de tech lead Java démarre le 16/11.",
    }
    with patch("app.routers.talent_message.call_claude", new_callable=AsyncMock, return_value=(draft, None)):
        res = client.post("/talent/message-draft", json=_body())
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["subject"] == "Mission Java — SNCF"
    assert data["body"].startswith("Bonjour Sophie")


def test_endpoint_refuses_a_rejected_draft_instead_of_correcting_it(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    bad = {"subject": "x", "body": "Bonjour [Prénom], une mission."}
    with patch("app.routers.talent_message.call_claude", new_callable=AsyncMock, return_value=(bad, None)):
        res = client.post("/talent/message-draft", json=_body())
    assert res.status_code == 502
    assert res.json()["detail"]["code"] == "draft_rejected"


def test_endpoint_failure_leaks_no_content(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with patch(
        "app.routers.talent_message.call_claude", new_callable=AsyncMock, side_effect=RuntimeError("Sophie SNCF secret")
    ):
        res = client.post("/talent/message-draft", json=_body())
    assert res.status_code == 502
    assert "Sophie" not in res.text and "SNCF" not in res.text


# #4347.2 — le message au consultant TUTOIE sur tous les canaux : régénérer E-mail → Réseau professionnel
# rendait « Je vous contacte », « Seriez-vous intéressée ».
def test_the_prompt_commands_the_informal_register_on_every_channel() -> None:
    assert "TUTOIEMENT" in build_system_prompt()
    for channel in ("email", "linkedin", "phone"):
        prompt = build_user_prompt(channel=channel, consultant=_CONSULTANT, need=_NEED, variant=None, previous=None)
        assert "tutoiement" in prompt
        assert "vouvoiement" not in prompt


def test_accept_draft_refuses_a_formal_register_and_keeps_the_informal_one() -> None:
    assert accept_draft({"subject": None, "body": "Bonjour Sophie, je te contacte pour une mission Java."}, "linkedin")
    assert accept_draft({"subject": None, "body": "Bonjour Sophie, je vous contacte pour une mission."}, "linkedin") is None
    assert accept_draft({"subject": None, "body": "Seriez-vous intéressée par cette mission ?"}, "linkedin") is None
    assert accept_draft({"subject": "Votre mission", "body": "Bonjour Sophie, une mission Java."}, "email") is None
    assert accept_draft({"subject": "Mission", "body": "Dis-moi si ton profil colle à ces vos besoins."}, "email") is None


def test_endpoint_refuses_a_formal_draft_even_when_the_model_slips(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    slip = {"subject": None, "body": "Bonjour Sophie, je vous contacte pour une mission."}
    with patch("app.routers.talent_message.call_claude", new_callable=AsyncMock, return_value=(slip, None)):
        res = client.post("/talent/message-draft", json=_body(channel="linkedin"))
    assert res.status_code == 502
    assert res.json()["detail"]["code"] == "draft_rejected"


def test_accept_draft_refuses_a_vouvoiement_4347_2() -> None:
    # #4347.2 — le message à un consultant TUTOIE (registre ESN ↔ consultant) : un « vous » est refusé.
    assert accept_draft({"subject": "Mission", "body": "Bonjour Fatou, je te contacte : serais-tu dispo ?"}, "email")
    for vouvoye in ("Je vous contacte pour une mission.", "Seriez-vous disponible ?", "Votre profil nous intéresse."):
        assert accept_draft({"subject": "x", "body": f"Bonjour Fatou, {vouvoye}"}, "email") is None
        assert accept_draft({"subject": None, "body": f"Bonjour Fatou, {vouvoye}"}, "linkedin") is None


def test_the_prompt_always_tutoie_whatever_the_formality_4347_2() -> None:
    assert "vous" not in build_user_prompt(
        channel="email", consultant=_CONSULTANT, need=_NEED, variant=None, previous=None
    ).split("</besoin>")[0].split("Ton :")[1].split("\n")[0]
    assert "tutoiement" in build_system_prompt().lower()
