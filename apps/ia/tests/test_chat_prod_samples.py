"""#2899 / #2443.10 — le LECTEUR des échantillons de production anonymisés.

Le corpus « erreurs production anonymisées » (`ChatCorpusSource.ANONYMIZED_PRODUCTION_ERRORS`)
relit ce que les espaces qui ont coché ont versé (`chat_eval_samples`, côté API). Aucun appel
modèle, aucun réseau : le pont est simulé. Sans pont configuré = no-op strict, jamais une
mesure « zéro échantillon ».
"""

from __future__ import annotations

import asyncio

from app.eval import chat_prod_samples as mod
from app.eval.chat_prod_samples import ProdSampleStatus, screen_sample


def _run(coro):
    return asyncio.run(coro)


def _bridge(monkeypatch, result):
    async def fake(limit):
        return result

    monkeypatch.setattr(mod.bellum_api, "chat_eval_samples", fake)


def test_bridge_not_configured_is_named_never_zero(monkeypatch):
    _bridge(monkeypatch, None)
    report = _run(mod.load_prod_samples())
    assert report.status is ProdSampleStatus.UNAVAILABLE
    assert report.samples == []
    assert report.measured is False  # « non mesuré » — jamais 0


def test_reads_texts_and_drops_every_other_field(monkeypatch):
    _bridge(
        monkeypatch,
        {
            "samples": [
                {
                    "text": "prépare une relance pour le DSI de [nom]",
                    "sampledAt": "2026-10-10T08:00:00Z",
                    "workspace_id": "ws-1",
                }
            ]
        },
    )
    report = _run(mod.load_prod_samples())
    assert report.status is ProdSampleStatus.OK
    assert [s.text for s in report.samples] == ["prépare une relance pour le DSI de [nom]"]
    assert not hasattr(report.samples[0], "workspace_id")
    assert report.measured is True


def test_an_empty_list_is_ok_and_measured_but_empty(monkeypatch):
    _bridge(monkeypatch, {"samples": []})
    report = _run(mod.load_prod_samples())
    assert report.status is ProdSampleStatus.OK
    assert report.measured is True
    assert report.samples == []


def test_malformed_items_are_skipped_not_invented(monkeypatch):
    _bridge(
        monkeypatch,
        {"samples": [{"text": "  "}, {"nope": 1}, "x", {"text": "une question", "sampledAt": "2026-10-10T08:00:00Z"}]},
    )
    report = _run(mod.load_prod_samples())
    assert [s.text for s in report.samples] == ["une question"]


def test_a_malformed_payload_is_unavailable(monkeypatch):
    _bridge(monkeypatch, {"unexpected": True})
    assert _run(mod.load_prod_samples()).status is ProdSampleStatus.UNAVAILABLE


def test_screen_flags_a_sample_that_is_not_anonymous():
    for leaked in ("écris à marie@nova.fr", "appelle le 06 12 34 56 78", "voir https://nova.fr/x", "SIREN 552 100 554"):
        assert screen_sample(leaked) is not None, leaked
    assert screen_sample("prépare une relance pour le DSI de [nom]") is None


def test_report_counts_leaks_so_the_gate_can_say_no(monkeypatch):
    _bridge(
        monkeypatch,
        {
            "samples": [
                {"text": "écris à marie@nova.fr", "sampledAt": "2026-10-10T08:00:00Z"},
                {"text": "une question", "sampledAt": "2026-10-10T08:00:00Z"},
            ]
        },
    )
    report = _run(mod.load_prod_samples())
    assert report.not_anonymous == 1
    assert report.clean == 1
