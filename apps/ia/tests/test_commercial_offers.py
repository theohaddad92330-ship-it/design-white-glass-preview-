"""Offres commerciales structurées (roadmap §14) — « EJM et durées apparaissent
sans provenance claire ».

DoD : chaque offre affiche : estimation Bellum, hypothèse, éditable, reliée aux
tarifs du client. Calqué sur le pattern preuve/completeness des plays (#466) :

- toute estimation (effort/durée) est TOUJOURS marquée hypothèse
  (``estimate=True`` + raisonnement en clair dans ``hypothesis``) ;
- ``editable=True`` (constante — signal UI que l'offre est modifiable) ;
- ``rateBasis=None`` par défaut : JAMAIS un tarif inventé présenté comme la
  grille du client (aucune grille tarifaire dans AnalysisProfileData
  aujourd'hui → placeholder éditable) ;
- la ``provenance`` est reliée aux entrées SOURCÉES de la recherche
  (recentSignals/budgetSignals), jamais fabriquée ; une offre sans provenance
  fondée est marquée ``faible`` (jamais supprimée), comme play_completeness."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.models.outputs.plan import CommercialOffer, OfferToPropose
from app.prompts.bellum_plan import build_subsection_user_prompt, build_user_prompt
from app.services.offer_provenance import (
    OFFER_REQUIRED_FIELDS,
    bind_offer_evidence,
    build_commercial_offers,
    evaluate_offer_completeness,
)
from tests.test_phase4_plan import PLAN_CALL_COUNT, SC_EXTRA_CALLS, _plan_dispatch


def _account() -> dict:
    """Research payload carrying the SAME sourced-signal registry the plays'
    ``_play_evidence`` reads (the only entries with a real citation)."""
    return {
        "recentSignals": [
            {
                "signal": "Recrutement de 12 data engineers",
                "source": "France Travail",
                "date": "2026-06",
                "url": "https://candidat.francetravail.fr/offres/x",
            },
        ],
        "budgetSignals": [
            {"signal": "Programme cloud 2026 annonce", "source": "Les Echos", "timeframe": "2026"},
        ],
    }


def _raw_offer() -> dict:
    """A validated ``offersToPropose`` entry (aliased dump) as the LLM emits it."""
    return {
        "title": "Renfort Data Engineering",
        "pitch": "Industrialiser la plateforme data du groupe.",
        "targetContact": "Sophie Martin",
        "painAddressed": "Equipe data sous-staffee face aux recrutements en cours",
        "estimatedTJM": "650 EUR",
        "estimatedTeamSize": "2 consultants",
        "estimatedDuration": "6 mois",
        "estimationHypothesis": "Compte >5k salaries, perimetre data sur 2 BUs -> 2 consultants pendant 6 mois.",
        "justifyingSignals": ["Recrutement de 12 data engineers"],
        "differentiator": "References bancaires",
    }


# ── Modèle ────────────────────────────────────────────────────────────────────


def test_commercial_offer_defaults_are_marked_estimate_editable_no_rate() -> None:
    offer = CommercialOffer()
    assert offer.estimate is True
    assert offer.editable is True
    assert offer.rate_basis is None
    assert offer.provenance is None
    assert offer.hypothesis is None
    assert offer.estimated_effort is None
    assert offer.duration_estimate is None


def test_estimate_and_editable_are_constants_never_disabled() -> None:
    # « estimate:true » / « editable:true » sont des CONSTANTES du contrat —
    # un payload qui tenterait de les éteindre est recadré, pas honoré.
    offer = CommercialOffer.model_validate({"estimate": False, "editable": False})
    assert offer.estimate is True
    assert offer.editable is True


def test_commercial_offer_round_trips_by_alias() -> None:
    offer = CommercialOffer.model_validate(
        {
            "title": "Renfort Data",
            "description": "Pitch",
            "estimatedEffort": "2 consultants × 6 mois",
            "durationEstimate": "6 mois",
            "hypothesis": "2 BUs data -> 2 consultants",
            "provenance": {"source": "France Travail", "signal": "12 postes", "weak": False},
        }
    )
    dumped = offer.model_dump(by_alias=True)
    assert dumped["estimatedEffort"] == "2 consultants × 6 mois"
    assert dumped["durationEstimate"] == "6 mois"
    assert dumped["rateBasis"] is None
    assert dumped["estimate"] is True
    assert dumped["editable"] is True
    assert dumped["provenance"]["source"] == "France Travail"
    # Round-trip: the dumped shape re-validates identically (sérialisation stable).
    assert CommercialOffer.model_validate(dumped).model_dump(by_alias=True) == dumped


def test_offer_to_propose_carries_estimation_fields_through_alias() -> None:
    o = OfferToPropose.model_validate(_raw_offer())
    assert o.estimation_hypothesis.startswith("Compte >5k")
    assert o.justifying_signals == ["Recrutement de 12 data engineers"]
    dumped = o.model_dump(by_alias=True)
    assert dumped["estimationHypothesis"].startswith("Compte >5k")
    assert dumped["justifyingSignals"] == ["Recrutement de 12 data engineers"]


def test_offer_to_propose_defaults_empty_on_legacy_payloads() -> None:
    o = OfferToPropose.model_validate({"title": "Renfort"})
    assert o.estimation_hypothesis == ""
    assert o.justifying_signals == []


# ── Complétude (calque play_completeness) ────────────────────────────────────


def test_required_fields_are_estimation_hypothese_provenance() -> None:
    assert OFFER_REQUIRED_FIELDS == ("estimation", "hypothese", "provenance")


def test_complete_offer_is_complete() -> None:
    verdict = evaluate_offer_completeness(
        {
            "estimatedEffort": "2 consultants × 6 mois",
            "durationEstimate": "6 mois",
            "hypothesis": "2 BUs data -> 2 consultants",
            "provenance": {"source": "France Travail", "signal": "12 postes", "weak": False},
        }
    )
    assert verdict["status"] == "complete"
    assert verdict["missing"] == []
    assert verdict["hasFoundedEvidence"] is True
    assert verdict["requiredFields"] == ["estimation", "hypothese", "provenance"]


def test_offer_without_provenance_is_faible_not_dropped() -> None:
    verdict = evaluate_offer_completeness(
        {
            "estimatedEffort": "2 consultants",
            "hypothesis": "raisonnement",
            "provenance": None,
        }
    )
    assert verdict["status"] == "faible"
    assert "provenance" in verdict["missing"]
    assert verdict["hasFoundedEvidence"] is False


def test_weak_source_provenance_is_not_founded() -> None:
    # Une source faible/reconstruite n'est PAS une preuve (Théo #2) → faible.
    verdict = evaluate_offer_completeness(
        {
            "estimatedEffort": "2 consultants",
            "hypothesis": "raisonnement",
            "provenance": {"source": "ia_reconstruction", "signal": "x", "weak": True},
        }
    )
    assert verdict["status"] == "faible"
    assert verdict["hasFoundedEvidence"] is False


def test_offer_without_hypothesis_is_faible() -> None:
    verdict = evaluate_offer_completeness(
        {
            "estimatedEffort": "2 consultants",
            "hypothesis": "",
            "provenance": {"source": "France Travail", "signal": "x", "weak": False},
        }
    )
    assert verdict["status"] == "faible"
    assert "hypothese" in verdict["missing"]


def test_offer_without_any_estimate_is_faible_on_estimation() -> None:
    verdict = evaluate_offer_completeness(
        {
            "estimatedEffort": None,
            "durationEstimate": "a definir",
            "hypothesis": "raisonnement",
            "provenance": {"source": "France Travail", "signal": "x", "weak": False},
        }
    )
    assert verdict["status"] == "faible"
    assert "estimation" in verdict["missing"]


def test_completeness_is_deterministic() -> None:
    offer = {
        "estimatedEffort": "2 consultants",
        "hypothesis": "raisonnement",
        "provenance": {"source": "France Travail", "signal": "x", "weak": False},
    }
    assert evaluate_offer_completeness(offer) == evaluate_offer_completeness(dict(offer))


# ── Provenance (calque _play_evidence — jamais fabriquée) ────────────────────


def test_evidence_binds_the_sourced_signal_matching_the_offer() -> None:
    ev = bind_offer_evidence(
        "Renfort Data Engineering recrutement data engineers",
        _account()["recentSignals"],
        _account()["budgetSignals"],
        0,
    )
    assert ev is not None
    assert ev["source"] == "France Travail"
    assert ev["signal"] == "Recrutement de 12 data engineers"
    assert ev["url"] == "https://candidat.francetravail.fr/offres/x"
    assert ev["date"] == "2026-06"
    assert ev["weak"] is False


def test_evidence_is_none_when_nothing_is_sourced() -> None:
    # JAMAIS de citation fabriquée (§8) : aucune entrée sourcée → None.
    assert bind_offer_evidence("Renfort Data", [], [], 0) is None
    assert bind_offer_evidence("Renfort Data", [{"signal": "sans source"}], [{"signal": "x", "source": ""}], 0) is None


def test_evidence_falls_back_to_ith_sourced_entry() -> None:
    # Pas de recouvrement textuel → l'entrée positionnelle (provenance distincte
    # par offre), pas une invention.
    ev = bind_offer_evidence("zzz", _account()["recentSignals"], _account()["budgetSignals"], 1)
    assert ev is not None
    assert ev["source"] == "Les Echos"
    assert ev["date"] == "2026"  # budgetSignals portent la date via `timeframe`


def test_weak_source_evidence_is_kept_but_flagged() -> None:
    ev = bind_offer_evidence(
        "Renfort",
        [{"signal": "reconstruit", "source": "ia_reconstruction"}],
        [],
        0,
    )
    assert ev is not None
    assert ev["weak"] is True


# ── Builder (déterministe, additif) ──────────────────────────────────────────


def test_builds_structured_offer_with_estimation_hypothesis_provenance() -> None:
    offers = build_commercial_offers([_raw_offer()], _account())
    assert len(offers) == 1
    o = offers[0]
    assert o["title"] == "Renfort Data Engineering"
    assert o["description"] == "Industrialiser la plateforme data du groupe."
    assert o["targetContact"] == "Sophie Martin"
    # Estimation Bellum = TOUJOURS une hypothèse marquée, dérivée des champs du
    # modèle (jamais un chiffre présenté comme fait).
    assert o["estimate"] is True
    assert o["estimatedEffort"] == "2 consultants × 6 mois"
    assert o["durationEstimate"] == "6 mois"
    assert o["hypothesis"].startswith("Compte >5k")
    assert o["editable"] is True
    # Provenance reliée au signal sourcé qui justifie l'offre.
    assert o["provenance"]["source"] == "France Travail"
    assert o["provenance"]["weak"] is False
    assert o["completeness"]["status"] == "complete"


def test_rate_is_never_fabricated() -> None:
    # Le TJM émis par le LLM (estimatedTJM) n'est JAMAIS repris comme base
    # tarifaire : rateBasis reste None (« à relier aux tarifs du client »).
    offers = build_commercial_offers([_raw_offer()], _account())
    assert offers[0]["rateBasis"] is None


def test_offer_without_sourced_signals_has_no_provenance_and_is_faible() -> None:
    offers = build_commercial_offers([_raw_offer()], {})
    assert offers[0]["provenance"] is None
    assert offers[0]["completeness"]["status"] == "faible"
    assert "provenance" in offers[0]["completeness"]["missing"]


def test_nothing_to_estimate_yields_null_fields_not_invention() -> None:
    raw = dict(_raw_offer(), estimatedTeamSize="", estimatedDuration="a definir", estimationHypothesis="")
    o = build_commercial_offers([raw], _account())[0]
    assert o["estimatedEffort"] is None
    assert o["durationEstimate"] is None
    assert o["hypothesis"] is None
    assert o["completeness"]["status"] == "faible"
    assert "estimation" in o["completeness"]["missing"]
    assert "hypothese" in o["completeness"]["missing"]


def test_effort_falls_back_to_team_size_alone() -> None:
    raw = dict(_raw_offer(), estimatedDuration="")
    o = build_commercial_offers([raw], _account())[0]
    assert o["estimatedEffort"] == "2 consultants"
    assert o["durationEstimate"] is None


def test_builder_is_deterministic_and_skips_non_dict_entries() -> None:
    offers = [_raw_offer(), "junk", None]
    first = build_commercial_offers(offers, _account())
    second = build_commercial_offers(list(offers), _account())
    assert first == second
    assert len(first) == 1


def test_builder_reads_snake_case_signal_keys_too() -> None:
    account = {"recent_signals": _account()["recentSignals"]}
    o = build_commercial_offers([_raw_offer()], account)[0]
    assert o["provenance"]["source"] == "France Travail"


# ── Prompt (ajout ciblé, cohérent avec MÉTHODE SALESCONNECT) ─────────────────


def test_offers_subsection_prompt_requests_hypothesis_and_signals() -> None:
    prompt = build_subsection_user_prompt(company_name="ACME", section="offers")
    assert "estimationHypothesis" in prompt
    assert "justifyingSignals" in prompt
    assert "HYPOTHESE" in prompt
    # Jamais de chiffre/tarif inventé présenté comme fait.
    assert "n'invente JAMAIS" in prompt
    assert "tarif" in prompt


def test_legacy_plan_user_prompt_stays_coherent() -> None:
    prompt = build_user_prompt("ACME", "", "")
    assert "estimationHypothesis" in prompt
    assert "justifyingSignals" in prompt


# ── Intégration Phase 4 (champ additif dans raw_analysis) ────────────────────


def test_phase4_plan_exposes_structured_commercial_offers(client: TestClient) -> None:
    dispatch = _plan_dispatch({"offers": {"offersToPropose": [_raw_offer()]}})
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=dispatch,
    ) as mock_claude:
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "account_data": dict(
                    _account(),
                    sector="Transport",
                    sources={"tags": {"sector": "PUBLIC"}},
                    angles=[{"title": "Modernisation SI"}],
                ),
                "contacts": [{"fullName": "Sophie Martin", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN", "offers": ["Data"]},
            },
        )
    assert res.status_code == 200
    # Génération + 2es passes self-consistency (A1, ON par défaut).
    assert mock_claude.call_count == PLAN_CALL_COUNT + SC_EXTRA_CALLS
    data = res.json()["data"]
    # ADDITIF : la sortie legacy reste inchangée pour les consommateurs actuels…
    legacy = data["offersToPropose"][0]
    assert legacy["title"] == "Renfort Data Engineering"
    assert legacy["estimatedTJM"] == "650 EUR"
    # …et le champ structuré expose estimation marquée + hypothèse + provenance.
    structured = data["commercialOffers"][0]
    assert structured["estimate"] is True
    assert structured["editable"] is True
    assert structured["rateBasis"] is None
    assert structured["hypothesis"].startswith("Compte >5k")
    assert structured["provenance"]["source"] == "France Travail"
    assert structured["completeness"]["status"] == "complete"
