"""DECATHLON 11/10 — une offre DATÉE avec lien passe avant un texte non daté.

Bêta : sur DECATHLON, le premier « recrutement » de la Veille était une page
carrière « Non datée » citée par le modèle ; les offres datées des collecteurs
s'ajoutaient derrière. Le texte non daté ne peut plus être le principal.
"""

from __future__ import annotations

from app.services.dated_signals import merge_collector_signals


def test_dated_job_offers_come_before_an_undated_recruitment_text() -> None:
    model_signals = [
        {"signal": "Page carrière Decathlon : nombreux postes ouverts", "type": "recrutement", "source": "Site"},
        {"signal": "Nouveau directeur digital", "type": "nomination", "date": "2026-10-01"},
    ]
    jobs = [
        {"title": "Développeur Java", "date": "2026-10-05T08:00:00Z", "url": "https://jobs.example/1"},
        {"title": "Data engineer", "date": "2026-10-03", "url": "https://jobs.example/2"},
    ]
    out = merge_collector_signals(model_signals, jobs=jobs)
    recruitment = [s["signal"] for s in out if s.get("type") == "recrutement"]
    assert recruitment == ["Développeur Java", "Data engineer", "Page carrière Decathlon : nombreux postes ouverts"]
    # Rien n'est perdu, et les autres natures gardent leur place relative.
    assert len(out) == 4
    assert out[0]["type"] == "nomination"


def test_a_dated_model_signal_keeps_its_place() -> None:
    model_signals = [{"signal": "Recrute 40 ingénieurs", "type": "recrutement", "date": "2026-10-08", "url": "https://p.example/a"}]
    jobs = [{"title": "Développeur Java", "date": "2026-10-05", "url": "https://jobs.example/1"}]
    out = merge_collector_signals(model_signals, jobs=jobs)
    assert [s["signal"] for s in out] == ["Recrute 40 ingénieurs", "Développeur Java"]


def test_undated_recruitment_alone_is_kept() -> None:
    model_signals = [{"signal": "Page carrière", "type": "recrutement"}]
    assert merge_collector_signals(model_signals, jobs=[]) == model_signals
