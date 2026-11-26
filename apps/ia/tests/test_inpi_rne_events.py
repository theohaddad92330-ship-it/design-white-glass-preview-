"""#3921.9 — les événements du registre national des entreprises (RNE) : changement de
dirigeant, ouverture / fermeture d'établissement. Contrat vérifié le 16/10/2026 par appel réel.

Ce que ces tests tiennent :
- MINIMISATION : du dirigeant, nom + prénoms + rôle + date d'effet — JAMAIS la date de
  naissance ni l'adresse du domicile, ni dans la sortie ni dans les journaux ;
- chaque événement est daté PAR le registre, sinon écarté ; rattaché au SIREN ;
- sans identifiants = no-op STRICT (zéro appel) ; panne = ``failed``, jamais un vide.
"""

from __future__ import annotations

import logging
from datetime import date
from unittest.mock import AsyncMock

import pytest

from app.routers import public_registry
from app.services.data_sources import inpi_rne
from app.services.data_sources.inpi_rne import events_from_payload

SIREN = "552059024"
TODAY = date(2026, 10, 16)


def _payload() -> dict:
    return {
        "siren": SIREN,
        "formality": {
            "historique": [
                {
                    "dateIntegration": "2026-03-02T10:00:00Z",
                    "codeEvenement": "35M",
                    "numeroLiasse": "L1",
                    "dateEffet": "2026-02-20",
                },
                {"dateIntegration": "2026-01-05T10:00:00Z", "codeEvenement": "01Y", "numeroLiasse": "L0"},
                {
                    "dateIntegration": "2019-01-05T10:00:00Z",
                    "codeEvenement": "35M",
                    "numeroLiasse": "OLD",
                    "dateEffet": "2019-01-01",
                },
            ],
            "content": {
                "personneMorale": {
                    "etablissementPrincipal": {"descriptionEtablissement": {"siret": SIREN + "00011"}},
                    "autresEtablissements": [
                        {
                            "descriptionEtablissement": {"siret": SIREN + "00029", "statutPourFormalite": "O"},
                            "adresse": {"codePostal": "69003", "commune": "Lyon"},
                            "activites": [{"dateDebut": "2026-06-01", "codeApe": "6202A"}, {"dateDebut": "2026-07-01"}],
                        },
                        {
                            "descriptionEtablissement": {"siret": SIREN + "00037", "dateEffetFermeture": "2026-09-30"},
                            "adresse": {"commune": "Nantes"},
                            "activites": [{"dateDebut": "2010-01-01"}],
                        },
                        {  # homonyme : autre SIREN, jamais retenu
                            "descriptionEtablissement": {"siret": "999999999" + "00011"},
                            "activites": [{"dateDebut": "2026-06-01"}],
                        },
                    ],
                    "composition": {
                        "pouvoirs": [
                            {
                                "roleEntreprise": "73",
                                "typeDePersonne": "INDIVIDU",
                                "actif": True,
                                "representantId": "r1",
                                "dateEffet": "2026-02-20",
                                "individu": {
                                    "descriptionPersonne": {
                                        "nom": "DUPONT",
                                        "prenoms": ["Jeanne", "Marie"],
                                        "role": "Président",
                                        "dateDeNaissance": "1970-04-12",
                                    },
                                    "adresseDomicile": {"voie": "12 rue Secrète", "commune": "Paris"},
                                },
                            }
                        ]
                    },
                }
            },
        },
    }


def test_executive_change_names_the_person_with_role_and_effect_date_only() -> None:
    events = events_from_payload(_payload(), SIREN, today=TODAY, since_days=730)
    execs = [e for e in events if e["kind"] == "executive_change"]
    assert [e["date"] for e in execs] == [
        "2026-02-20"
    ]  # le 35M du même jour est absorbé, le 35M de 2019 est hors fenêtre
    assert execs[0]["label"] == "Nomination — Jeanne Marie DUPONT (Président)"
    assert execs[0]["ref"].startswith("pouvoir:")


def test_minimisation_no_birthdate_no_address_in_output() -> None:
    blob = repr(events_from_payload(_payload(), SIREN, today=TODAY, since_days=730))
    for forbidden in ("1970", "Secrète", "dateDeNaissance", "adresseDomicile"):
        assert forbidden not in blob


def test_35m_alone_gives_a_dated_generic_event() -> None:
    p = _payload()
    p["formality"]["content"]["personneMorale"]["composition"] = {"pouvoirs": []}
    execs = [e for e in events_from_payload(p, SIREN, today=TODAY, since_days=730) if e["kind"] == "executive_change"]
    assert [(e["date"], e["label"]) for e in execs] == [("2026-02-20", "Changement de dirigeant")]


def test_establishment_opening_dated_by_earliest_activity_and_closure_by_effect_date() -> None:
    events = events_from_payload(_payload(), SIREN, today=TODAY, since_days=730)
    opening = [e for e in events if e["kind"] == "new_establishment"]
    closure = [e for e in events if e["kind"] == "establishment_closure"]
    assert [(e["ref"], e["date"], e["label"]) for e in opening] == [
        (SIREN + "00029", "2026-06-01", "Nouvel établissement — Lyon")
    ]
    assert [(e["ref"], e["date"], e["label"]) for e in closure] == [
        (f"closure:{SIREN}00037", "2026-09-30", "Fermeture d'établissement — Nantes")
    ]
    assert opening[0]["url"].endswith(f"/etablissement/{SIREN}00029")


def test_future_or_unreadable_dates_are_dropped() -> None:
    p = _payload()
    p["formality"]["historique"] = [
        {"codeEvenement": "35M", "dateEffet": "2027-01-01"},
        {"codeEvenement": "35M", "dateEffet": "n/a"},
    ]
    p["formality"]["content"]["personneMorale"]["composition"] = {"pouvoirs": []}
    assert [
        e for e in events_from_payload(p, SIREN, today=TODAY, since_days=730) if e["kind"] == "executive_change"
    ] == []


def test_wrong_siren_payload_yields_nothing() -> None:
    p = _payload()
    p["siren"] = "111111111"
    assert events_from_payload(p, SIREN, today=TODAY, since_days=730) == []


@pytest.mark.asyncio
async def test_route_is_a_strict_noop_without_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INPI_USERNAME", raising=False)
    monkeypatch.delenv("INPI_PASSWORD", raising=False)
    spy = AsyncMock()
    monkeypatch.setattr(inpi_rne, "_company_payload", spy)
    out = await public_registry.rne_events(public_registry.RneEventsRequest(siren=SIREN))
    assert out == {"configured": False, "failed": False, "events": []}
    spy.assert_not_awaited()


@pytest.mark.asyncio
async def test_route_reports_failure_never_an_empty_reading(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INPI_USERNAME", "u")
    monkeypatch.setenv("INPI_PASSWORD", "p")
    monkeypatch.setattr(inpi_rne, "_company_payload", AsyncMock(side_effect=RuntimeError("boom")))
    monkeypatch.setattr(inpi_rne.provider_cache, "get_json", AsyncMock(return_value=None))
    out = await public_registry.rne_events(public_registry.RneEventsRequest(siren=SIREN))
    assert out["configured"] is True and out["failed"] is True and out["events"] == []


@pytest.mark.asyncio
async def test_route_returns_events_and_logs_no_personal_data(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("INPI_USERNAME", "u")
    monkeypatch.setenv("INPI_PASSWORD", "p")
    monkeypatch.setattr(inpi_rne, "_company_payload", AsyncMock(return_value=_payload()))
    monkeypatch.setattr(inpi_rne.provider_cache, "get_json", AsyncMock(return_value=None))
    monkeypatch.setattr(inpi_rne.provider_cache, "set_json", AsyncMock())
    with caplog.at_level(logging.DEBUG):
        out = await public_registry.rne_events(public_registry.RneEventsRequest(siren=SIREN))
    assert out["failed"] is False and {e["kind"] for e in out["events"]} >= {"executive_change", "new_establishment"}
    assert "DUPONT" not in caplog.text and "1970" not in caplog.text
