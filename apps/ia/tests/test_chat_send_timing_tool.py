"""#3289 (#3264.31/.32/.33) — `get_send_timing` : le créneau d'envoi que l'ESPACE
a appris, rejoué de bout en bout (entrée → outil appelé → réponse).

Question exacte à poser en recette dans /chat : « À quel moment de la semaine
j'ai le plus de réponses quand je relance par e-mail ? ». Attendu : Laura appelle
`get_send_timing`, cite le créneau avec ses comptes (« 4 réponses sur 4
tentatives »), sans pourcentage ; sur un espace sans assez d'historique, elle dit
qu'il n'y a pas encore assez de gestes mesurés — jamais un créneau générique.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app.access.rights_matrix import READ_ONLY_TOOLS
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"

MEASURED = {
    "seniority": None,
    "channels": [
        {
            "channel": "email",
            "attempts": 10,
            "answered": 5,
            "ignored": 1,
            "best": {"weekday": "tuesday", "band": "morning", "answered": 4, "attempts": 4},
            "reason": None,
        },
        {
            "channel": "phone",
            "attempts": 3,
            "answered": 1,
            "ignored": 0,
            "best": None,
            "reason": "not_enough_attempts",
        },
    ],
}


def _run(monkeypatch, bridge_result, tool_input=None):
    calls: list[tuple] = []

    async def fake(user_id, *, seniority=None):
        calls.append((user_id, seniority))
        return bridge_result

    monkeypatch.setattr(bellum_api, "workspace_timing", fake)
    out = asyncio.run(execute_chat_tool("get_send_timing", tool_input or {}, user_id=USER, profile_data=None))
    return out, calls


def test_declare_en_fin_de_catalogue_avant_push_profile_et_en_lecture_seule():
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "get_send_timing" in names
    assert names[-1] == "push_profile"
    assert names.index("get_send_timing") < names.index("push_profile")
    assert "get_send_timing" in READ_ONLY_TOOLS


def test_le_tour_rejoue_le_bon_creneau_en_comptes_jamais_en_pourcentage(monkeypatch):
    out, calls = _run(monkeypatch, MEASURED)
    assert calls == [(USER, None)]
    email = next(c for c in out["channels"] if c["channel"] == "email")
    assert email["best"]["label"] == "mardi matin"
    assert email["best"]["answered"] == 4 and email["best"]["attempts"] == 4
    blob = json.dumps(out, ensure_ascii=False)
    assert "%" not in blob and "taux" not in blob.lower() and "probab" not in blob.lower()


def test_sans_assez_de_tentatives_le_manque_est_nomme_pas_un_creneau_generique(monkeypatch):
    out, _ = _run(monkeypatch, MEASURED)
    phone = next(c for c in out["channels"] if c["channel"] == "phone")
    assert phone["best"] is None
    assert "pas assez" in phone["message"].lower()


def test_espace_sans_historique_dit_quil_ny_a_rien_a_mesurer(monkeypatch):
    out, _ = _run(monkeypatch, {"seniority": None, "channels": []})
    assert out["channels"] == []
    assert "aucun geste" in out["message"].lower()


def test_pont_eteint_ou_lecture_impossible_est_une_erreur_claire(monkeypatch):
    out, _ = _run(monkeypatch, None)
    assert "error" in out
    out, _ = _run(monkeypatch, {"error": "send_timing_unreadable"})
    assert "error" in out


def test_le_filtre_de_persona_est_transmis_tel_quel(monkeypatch):
    _, calls = _run(monkeypatch, {"seniority": "director", "channels": []}, {"seniority": "director"})
    assert calls == [(USER, "director")]


def test_ne_devine_pas_un_creneau_si_le_pont_en_rend_un_hors_vocabulaire(monkeypatch):
    bad = {
        "seniority": None,
        "channels": [
            {"channel": "email", "attempts": 9, "answered": 5, "ignored": 0,
             "best": {"weekday": "sunday", "band": "night", "answered": 5, "attempts": 5}, "reason": None}
        ],
    }
    out, _ = _run(monkeypatch, bad)
    assert out["channels"][0]["best"] is None
