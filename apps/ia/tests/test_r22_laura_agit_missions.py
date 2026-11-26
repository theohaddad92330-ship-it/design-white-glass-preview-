"""R22-LG (#4421.2 FAIL, recette prod /chat 22/10) — « trouve-moi des missions »
SANS consultant désigné : Laura reposait « Tu cherches des missions pour un
consultant précis ou… ? ». Doctrine c124 : elle ne s'arrête jamais — sans
consultant, elle bascule SEULE vers les missions du MARCHÉ (comptes qui
recrutent, offres DATÉES), avec le geste « Préparer le mail ».
"""

from __future__ import annotations

import pytest

from app.prompts.laura_acts import market_missions_turn_block
from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import split_reply_blocks

# ── la consigne du tour ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "message",
    [
        "Trouve-moi des missions",
        "trouve moi des missions",
        "Quelles missions sont ouvertes en ce moment ?",
        "find me missions",
    ],
)
def test_missions_without_a_consultant_switch_to_the_market(message):
    block = market_missions_turn_block(message, scope_object="", page_context="")
    assert "run_account_search" in block and "hiring" in block
    assert "tu ne demandes PAS" in block
    assert "Préparer le mail" in block


@pytest.mark.parametrize(
    ("message", "scope_object", "page_context"),
    [
        ("Trouve-moi des missions", "Consultant : Hugo Houyez — Java, Toulouse", ""),
        ("Trouve-moi des missions", "", "Page : fiche consultant Hugo Houyez"),
        ("Trouve-moi des missions pour Hugo Houyez", "", ""),
        ("Trouve-moi des missions pour ce profil", "", ""),
        ("Trouve des missions pour ce consultant", "", ""),
        ("Quelles missions finissent dans 30 jours ?", "", ""),
        ("Trouve-moi 10 comptes aéronautique à Toulouse", "", ""),
        ("", "", ""),
    ],
)
def test_the_block_knows_how_to_say_no(message, scope_object, page_context):
    assert market_missions_turn_block(message, scope_object=scope_object, page_context=page_context) == ""


# ── le geste « Préparer le mail » sur un compte qui recrute (offre datée) ───


def _search_output() -> dict:
    return {
        "axes": ["Signal : recrutement"],
        "criteria": {"signals": ["hiring"]},
        "recruiting_companies": ["AIRBUS"],
        "items": [
            {
                "name": "AIRBUS",
                "siren": "383474814",
                "why": ["Aéronautique, Toulouse"],
                "current_demands": [{"type": "hiring", "label": "Développeur Java", "date": "2026-10-18"}],
            },
            {"name": "THALES", "siren": "552059024", "why": ["Défense"], "current_demands": []},
        ],
    }


def _items(out: str) -> list[dict]:
    blocks = [s.block for s in split_reply_blocks(out) if s.kind == "block" and s.block]
    assert len(blocks) == 1
    return blocks[0]["items"]


@pytest.mark.parametrize(("language", "label"), [("fr", "Préparer le mail"), ("en", "Prepare the email")])
def test_a_recruiting_account_carries_its_dated_offer_and_the_mail_gesture(language, label):
    read = shape_read_from_tool("run_account_search", _search_output(), language=language)
    out = route_known_shapes(
        "Voici.", [{"shape_read": read}], user_message="trouve-moi des missions", language=language
    )
    airbus, thales = _items(out)
    assert any("Développeur Java" in w and "2026-10-18" in w for w in airbus["why"])
    assert [f["label"] for f in airbus["follow_ups"]] == [label]
    ask = airbus["follow_ups"][0]["ask"]
    assert "AIRBUS" in ask and "Développeur Java" in ask
    # Jamais un envoi : le mail est préparé, le commercial l'envoie.
    assert "moi-même" in ask or "myself" in ask
    # Sans offre datée, aucun geste : jamais un geste sans objet.
    assert "follow_ups" not in thales


# ── la traversée : corps HTTP → routeur → prompt système ───────────────────


def _capture(monkeypatch) -> dict:
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    return captured


def test_the_market_block_reaches_the_real_system_prompt(client, monkeypatch):
    captured = _capture(monkeypatch)
    res = client.post("/chat/message", json={"message": "Trouve-moi des missions", "user_id": "user-1"})
    assert res.status_code == 200
    assert "MISSIONS DU MARCHÉ" in captured["system"]


def test_a_selected_consultant_keeps_the_talent_path(client, monkeypatch):
    captured = _capture(monkeypatch)
    res = client.post(
        "/chat/message",
        json={
            "message": "Trouve-moi des missions",
            "user_id": "user-1",
            "scope_object": "Un consultant : Sophie Martin",
        },
    )
    assert res.status_code == 200
    assert "MISSIONS DU MARCHÉ" not in captured["system"]
