"""#4078 — parité démo : les blocs 01 / 14 / 15 du dossier complet, produits par
une vraie analyse (``POST /dossier-blocks``).

Ce fichier prouve le CONTRAT du service IA — l'écriture (seulement les clés
absentes, sources jamais nommées) se juge côté API (``dossier-blocks.step.spec.ts``) :

* le prompt : rien d'inventé, un bloc sans matière reste VIDE, aucune source
  nommée par son outil, l'écosystème n'est ni une entité du compte ni une ESN ;
* l'entrée : fenêtrée comme des DONNÉES et bornée ;
* l'endpoint : UN appel groupé pour les trois blocs, forme ``keyNoteSchema``
  exacte, chiffres (``amount``/``currency``/``period``) jamais laissés au
  modèle, note sans libellé jetée, erreur claire sans clé ou sur sortie illisible,
  aucun contenu journalisé.
"""

from __future__ import annotations

import json
import logging
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.prompts.bellum_dossier_blocks import MAX_INPUT_CHARS, build_system_prompt, build_user_prompt
from app.services.model_policy import model_for

_PATCH = "app.routers.dossier_blocks.call_claude"

_KEYS = ("structural_reading_axes", "ecosystem_third_parties", "opportunity_domains")
_NOTE_KEYS = {"label", "constat", "interpretation", "implication", "reliability", "amount", "currency", "period"}


def _note(label: str | None = "Organisation par métiers", **over: object) -> dict:
    note: dict = {
        "label": label,
        "constat": "Trois pôles métiers déclarés au registre.",
        "interpretation": "Les achats IT se décident par pôle.",
        "implication": "Entrer par un pôle, pas par le groupe.",
        "reliability": "Registre",
    }
    note.update(over)
    return note


def _output(**over: object) -> dict:
    out: dict = {
        "structural_reading_axes": [_note()],
        "ecosystem_third_parties": [],
        "opportunity_domains": [_note("Data & IA", constat="Six offres d'emploi data ouvertes.")],
    }
    out.update(over)
    return out


def _payload(**over: object) -> dict:
    body: dict = {
        "account_name": "Acme Industrie",
        "dossier": {"activity_label": "Fabrication de machines", "it_job_signals": [{"title": "Data engineer"}]},
    }
    body.update(over)
    return body


# ── Le prompt ────────────────────────────────────────────────────────────────


def test_system_prompt_forbids_inventing_and_allows_an_empty_block():
    prompt = build_system_prompt()
    assert "N'INVENTE RIEN" in prompt
    assert "LISTE VIDE" in prompt
    for key in _KEYS:
        assert key in prompt


def test_system_prompt_never_names_a_source_by_its_tool():
    assert "AUCUNE SOURCE NOMMÉE" in build_system_prompt()


def test_system_prompt_keeps_the_ecosystem_apart_from_entities_and_esn():
    prompt = build_system_prompt()
    assert "entités du compte" in prompt and "ESN" in prompt


def test_user_prompt_fences_the_dossier_as_data_and_is_bounded():
    prompt = build_user_prompt("Acme", {"activity_label": "x" * (MAX_INPUT_CHARS * 2)})
    assert "<dossier>" in prompt and "<compte>" in prompt
    assert len(prompt) <= MAX_INPUT_CHARS + 1_000


def test_the_blocks_run_on_the_model_of_the_neighbouring_brief_step():
    assert model_for("bellum_dossier_blocks") == model_for("bellum_commercial_brief")


# ── L'endpoint ───────────────────────────────────────────────────────────────


def test_endpoint_returns_the_three_blocks_in_the_key_note_shape(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    raw = "Voici :\n```json\n" + json.dumps(_output()) + "\n```"
    with patch(_PATCH, new_callable=AsyncMock, return_value=(raw, None)) as claude:
        res = client.post("/dossier-blocks", json=_payload())
    assert res.status_code == 200, res.text
    blocks = res.json()["data"]["blocks"]
    assert set(blocks) == set(_KEYS)
    assert blocks["ecosystem_third_parties"] == []
    for note in blocks["structural_reading_axes"] + blocks["opportunity_domains"]:
        assert set(note) == _NOTE_KEYS
    # UN seul appel pour les trois blocs, sur le modèle de l'étape voisine.
    assert claude.await_count == 1
    kwargs = claude.await_args.kwargs
    assert kwargs["prompt_name"] == "bellum_dossier_blocks"
    assert kwargs["model"] == model_for("bellum_commercial_brief")


def test_endpoint_never_lets_the_model_write_a_figure(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    out = _output(structural_reading_axes=[_note(amount=12_000_000, currency="EUR", period="2024")])
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(out), None)):
        note = client.post("/dossier-blocks", json=_payload()).json()["data"]["blocks"]["structural_reading_axes"][0]
    assert note["amount"] is None and note["currency"] is None and note["period"] is None


def test_endpoint_says_no_to_a_note_without_label_and_a_missing_block(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    out = {"structural_reading_axes": [_note(None), _note("   "), "pas une note"]}
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(out), None)):
        blocks = client.post("/dossier-blocks", json=_payload()).json()["data"]["blocks"]
    assert blocks == {key: [] for key in _KEYS}


def test_an_empty_dossier_costs_no_model_call(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with patch(_PATCH, new_callable=AsyncMock) as claude:
        res = client.post("/dossier-blocks", json=_payload(dossier={}))
    assert res.status_code == 200
    assert res.json()["data"]["blocks"] == {key: [] for key in _KEYS}
    assert claude.await_count == 0


def test_without_a_model_key_a_clear_error_is_returned(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with patch(_PATCH, new_callable=AsyncMock) as claude:
        res = client.post("/dossier-blocks", json=_payload())
    assert res.status_code == 503
    assert claude.await_count == 0


def test_an_unreadable_output_is_a_clear_failure_and_logs_no_content(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    caplog.set_level(logging.INFO)
    with patch(_PATCH, new_callable=AsyncMock, return_value=("Fabrication de machines, pas de JSON", None)):
        res = client.post("/dossier-blocks", json=_payload())
    assert res.status_code == 502
    assert "Fabrication de machines" not in caplog.text


def test_16_10_ceiling_is_8000_and_timeout_matches_the_brief(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers.commercial_brief import _MODEL_TIMEOUT_S

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    usage = type("U", (), {"output_tokens": 500, "cost_usd": 0.1})()
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps({}), usage)) as claude:
        res = client.post("/dossier-blocks", json={"account_name": "X", "dossier": {"a": 1}})
    assert res.status_code == 200, res.text
    assert claude.await_args.kwargs["max_tokens"] == 8_000
    assert claude.await_args.kwargs["timeout"] == _MODEL_TIMEOUT_S


def test_16_10_truncated_blocks_are_retried_once_with_a_doubled_ceiling(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    cut = ('{"structural_reading_axes": [', type("U", (), {"output_tokens": 8_000, "cost_usd": 0.1})())
    ok = (json.dumps({"structural_reading_axes": [_note()]}), type("U", (), {"output_tokens": 900, "cost_usd": 0.1})())
    with patch(_PATCH, new_callable=AsyncMock, side_effect=[cut, ok]) as claude:
        res = client.post("/dossier-blocks", json={"account_name": "X", "dossier": {"a": 1}})
    assert res.status_code == 200, res.text
    assert [c.kwargs["max_tokens"] for c in claude.await_args_list] == [8_000, 16_000]


def test_16_10_second_truncation_is_a_502_without_third_call(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with patch(
        _PATCH,
        new_callable=AsyncMock,
        side_effect=[('{"a": [', type("U", (), {"output_tokens": 8_000})()), ('{"a": [', type("U", (), {"output_tokens": 16_000})())],
    ) as claude:
        res = client.post("/dossier-blocks", json={"account_name": "X", "dossier": {"a": 1}})
    assert res.status_code == 502
    assert claude.await_count == 2
