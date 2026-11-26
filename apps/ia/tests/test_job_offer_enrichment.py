"""#2322.70 — rôle / équipe / compétences / tension d'une offre, par règles seules."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.job_offer_enrichment import enrich_job_offers

NOW = datetime(2026, 10, 31, tzinfo=UTC)


def _one(offer: dict) -> dict:
    return enrich_job_offers([offer], now=NOW)[0]


def test_role_team_and_skills_come_from_the_offer_text() -> None:
    out = _one(
        {
            "title": "Data Engineer",
            "description": "Au sein de l'équipe Plateforme Data, tu travailles avec Python et Kafka.",
            "skills": [],
        }
    )
    assert out["role"] == "data_ia"
    assert out["team"] == "plateforme data"
    assert {"Python", "Kafka"} <= set(out["skills"])


def test_absent_fields_make_no_key_never_a_guess() -> None:
    out = _one({"title": "Poste", "description": "Rejoins-nous."})
    for key in ("role", "team", "tension", "tension_reason", "tension_days"):
        assert key not in out
    assert out["skills"] == []


def test_source_skills_are_kept_and_not_duplicated() -> None:
    out = _one({"title": "Dev", "description": "Java", "skills": ["Java", "Spring"]})
    assert out["skills"].count("Java") == 1
    assert "Spring" in out["skills"]


def test_tension_from_source_flag_keeps_its_reason() -> None:
    out = _one({"title": "Architecte", "tension": True})
    assert out["tension"] is True
    assert out["tension_reason"] == "source_flag"


def test_tension_only_when_the_text_proves_it() -> None:
    urgent = _one({"title": "Dev", "description": "Recrutement urgent, poste à pourvoir immédiatement."})
    assert urgent["tension"] is True and urgent["tension_reason"] == "urgent_text"
    republished = _one({"title": "Dev", "description": "Offre republiée suite à un manque de candidatures."})
    assert republished["tension_reason"] == "republished_text"
    calm = _one({"title": "Dev", "description": "Nous recrutons un développeur."})
    assert "tension" not in calm


def test_tension_from_measured_publication_duration() -> None:
    old = (NOW - timedelta(days=75)).date().isoformat()
    out = _one({"title": "Dev", "date": old})
    assert out["tension"] is True
    assert out["tension_reason"] == "online_long"
    assert out["tension_days"] == 75
    fresh = _one({"title": "Dev", "date": (NOW - timedelta(days=10)).date().isoformat()})
    assert "tension" not in fresh
    historical = _one({"title": "Dev", "date": old, "historical": True})
    assert "tension" not in historical


def test_non_dict_rows_pass_through_untouched() -> None:
    assert enrich_job_offers(["x", None], now=NOW) == ["x", None]
