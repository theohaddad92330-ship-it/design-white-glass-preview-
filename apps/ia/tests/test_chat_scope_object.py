"""#1951.2 / #1951.3 — la portée « un consultant » / « un besoin » atteint Laura.

Ce que ces tests tiennent, dans l'ordre d'importance :

1. **Sans portée objet, le prompt est BYTE-IDENTIQUE.** Le golden
   ``tests/golden/system/advisor.txt`` et l'empreinte du registre ne bougent pas :
   le bloc ne s'ajoute qu'au tour qui en porte un.
2. **Avec une portée objet, le bloc ATTEINT le prompt système réel** — pas
   seulement le modèle pydantic. Un champ déclaré, transmis, et jamais rendu est
   le défaut que ce dépôt nomme « pydantic avale le champ ajouté au prompt ».
3. **Le contenu vient du SERVEUR, pas du navigateur** : c'est l'API qui relit la
   fiche dans l'espace actif. Le bloc le dit, et dit quoi faire d'une fiche
   introuvable — ne jamais répondre sur quelqu'un d'autre.
"""

from __future__ import annotations

import json

from app.models.chat import ChatRequest
from app.prompts.chat_scope_object import SCOPE_OBJECT_MAX_CHARS, scope_object_block

# Ce que l'API rend (`renderChatScopeObject`, apps/api). Recopié comme une
# CHARGE UTILE d'exemple : ce fichier vérifie ce que le prompt fait d'un texte.
_RENDERED = (
    "Un consultant du vivier : Sophie Martin\n"
    "- Poste : Consultante Java\n"
    "- Disponibilité : disponible à partir du 2026-10-01\n"
    "- Compétences : Java, Spring, Kafka"
)


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def test_an_absent_scope_object_renders_nothing():
    assert scope_object_block("") == ""
    assert scope_object_block("   \n ") == ""
    assert scope_object_block(None) == ""  # type: ignore[arg-type]


def test_a_scope_object_is_framed_as_the_perimeter_chosen_by_the_person():
    block = scope_object_block(_RENDERED)
    assert block.startswith("\n\n")
    assert "PÉRIMÈTRE CHOISI" in block
    assert "Sophie Martin" in block
    # Ce qui n'est pas dans la fiche n'est pas connu — jamais « 0 », jamais deviné.
    assert "ne le devine pas" in block
    # Une fiche introuvable ne se remplace pas par une autre personne (#1951.17).
    assert "introuvable" in block


def test_the_block_is_bounded():
    # `§` n'apparaît ni dans l'en-tête ni dans les règles de lecture : le compte
    # ne mesure donc que la charge utile (un `x` se retrouvait dans « explicitement »).
    block = scope_object_block("§" * (SCOPE_OBJECT_MAX_CHARS * 3))
    assert block.count("§") == SCOPE_OBJECT_MAX_CHARS


def test_chat_request_accepts_the_field_and_an_old_body_defaults_to_empty():
    legacy = ChatRequest.model_validate({"message": "Bonjour", "user_id": "u1", "account_id": ""})
    assert legacy.scope_object == ""
    req = ChatRequest(message="Bonjour", user_id="u1", scope_object=_RENDERED)
    assert req.scope_object == _RENDERED


def test_the_scope_object_reaches_the_real_system_prompt(client, monkeypatch):
    """La traversée entière : corps HTTP → pydantic → routeur → prompt système."""
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post(
        "/chat/message",
        json={"message": "Où la positionner ?", "user_id": "user-1", "scope_object": _RENDERED},
    )
    assert res.status_code == 200
    assert _terminal_event(res.text)["data"]["reply"] == "réponse"
    assert "PÉRIMÈTRE CHOISI" in captured["system"]
    assert "Sophie Martin" in captured["system"]


def test_without_scope_object_the_router_prompt_carries_no_block(client, monkeypatch):
    """Le témoin : la garde qui sait dire NON."""
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "user-1"})
    assert res.status_code == 200
    assert "PÉRIMÈTRE CHOISI" not in captured["system"]


# Théo L1 — sélecteur avancé — l'offre d'emploi rendue par l'API (`renderChatScopeObject`).
_RENDERED_JOB_OFFER = (
    "Une offre d’emploi repérée chez un compte : Data engineer — plateforme data voyageurs (H/F)\n"
    "- Compte : SNCF Voyageurs\n"
    "- Publiée le : 2026-10-06\n"
    "- Lieu : Lyon (69)\n"
    "- Compétences demandées : Spark, Kafka, Airflow\n"
    "- Publiée sur un site d’emploi (source non nommée)."
)


def test_a_job_offer_scope_reads_as_a_recruitment_signal_never_a_named_source():
    """Théo L1 — une offre d'emploi est un SIGNAL d'un compte : Laura s'en sert pour
    approcher le compte, et ne nomme jamais d'où l'offre vient."""
    block = scope_object_block(_RENDERED_JOB_OFFER)
    assert "Data engineer" in block
    assert "SNCF Voyageurs" in block
    # Une offre ne se remplace pas par une autre quand elle est introuvable.
    assert "ni une autre offre" in block
    # La source non nommée le reste : Laura ne la devine pas.
    assert "ne cherche pas à nommer" in block


def test_the_job_offer_scope_reaches_the_real_system_prompt(client, monkeypatch):
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post(
        "/chat/message",
        json={"message": "Comment l'approcher ?", "user_id": "user-1", "scope_object": _RENDERED_JOB_OFFER},
    )
    assert res.status_code == 200
    assert "Data engineer — plateforme data voyageurs" in captured["system"]
    assert "ni une autre offre" in captured["system"]
