"""LOT (15/10) DATA-B — les projections pures : bornées, datées, sans fournisseur, sans « 0 »."""

from __future__ import annotations

from app.services import laura_dossier_reads as reads
from app.services.laura_dossier_reads import firmographics_block, intelligence_block, registry_block


def test_intelligence_block_est_vide_sans_donnee() -> None:
    assert intelligence_block({}, None) == {}
    assert intelligence_block(None, None) == {}
    assert intelligence_block({"budget_signals": [], "regulations": [{}]}, {}) == {}


def test_intelligence_block_lit_snake_et_camel_et_garde_date_et_source() -> None:
    raw = {
        "budgetSignals": [{"signal": "Budget cloud +12 %", "timeframe": "T4 2026", "source": "Les Échos", "junk": "x"}],
        "qualified_hypotheses": [
            {"hypothesis": "Arbitre ses applicatifs", "confidence": "a_verifier", "based_on_signals": ["s1", "s2", "s3", "s4"]}
        ],
        "regulations": [{"name": "DORA", "deadline": "2025-01-17"}],
        "programNames": [{"name": "Plan 2029", "horizon": "2029"}],
        "sites_france": [{"city": "Paris", "is_headquarters": True}, {"city": "Lyon"}],
        "it_implications_for_esn": "Renfort sur la migration cloud.",
    }
    out = intelligence_block(raw, None)
    assert out["budget_signals"] == [{"signal": "Budget cloud +12 %", "timeframe": "T4 2026", "source": "Les Échos"}]
    assert out["qualified_hypotheses"][0]["based_on_signals"] == ["s1", "s2", "s3"]
    assert out["regulations"] == [{"name": "DORA", "deadline": "2025-01-17"}]
    assert out["program_names"] == [{"name": "Plan 2029", "horizon": "2029"}]
    assert out["sites_france"] == [{"city": "Paris", "is_headquarters": True}, {"city": "Lyon"}]
    assert out["it_implications_for_esn"] == "Renfort sur la migration cloud."


def test_intelligence_block_est_borne() -> None:
    raw = {
        "budget_signals": [{"signal": f"s{i}"} for i in range(40)],
        "sites_france": [{"city": f"v{i}"} for i in range(40)],
        "detected_tech_stack": [f"t{i}" for i in range(80)],
        "it_implications_for_esn": "x" * 5000,
    }
    out = intelligence_block(raw, None)
    assert len(out["budget_signals"]) == 6
    assert len(out["sites_france"]) == 10 and out["sites_france_total"] == 40
    assert len(out["detected_tech_stack"]) == 15
    assert len(out["it_implications_for_esn"]) <= 1200


def test_intelligence_block_prend_technos_et_esn_en_place_de_la_facade_avec_leur_source() -> None:
    context = {
        "technologies": {
            "state": "known",
            "value": [{"name": "SAP", "usage": "ERP"}],
            "provenance": {"source": "dataforge", "observedAt": "2026-10-01T00:00:00Z"},
        },
        "incumbentEsn": {
            "state": "known",
            "value": [{"name": "Capgemini", "contractType": "régie", "strengths": "présence", "weaknesses": None}],
            "provenance": {"source": "human_correction", "observedAt": "2026-09-30T00:00:00Z"},
        },
    }
    out = intelligence_block({"detected_tech_stack": ["SAP", "Kafka"]}, context)
    assert out["technologies"]["items"] == [{"name": "SAP", "usage": "ERP"}]
    assert out["technologies"]["source"] == "base commune Bellum"
    assert out["technologies"]["observed_at"] == "2026-10-01T00:00:00Z"
    assert out["detected_tech_stack"] == ["Kafka"]  # SAP déjà rendu par la façade : pas deux fois
    assert out["incumbents"]["items"] == [{"name": "Capgemini", "contract_type": "régie", "strengths": "présence"}]
    assert out["incumbents"]["source"] == "correction humaine"


def test_une_facade_inconnue_ne_fait_aucune_ligne() -> None:
    context = {"incumbentEsn": {"state": "unknown", "reason": "never_analyzed"}, "technologies": {"state": "unknown"}}
    assert intelligence_block({}, context) == {}


def test_aucun_nom_de_fournisseur_ne_voyage() -> None:
    raw = {"budget_signals": [{"signal": "Source Apollo : budget en hausse (via Pappers)"}]}
    text = str(intelligence_block(raw, None)).lower()
    assert "apollo" not in text and "pappers" not in text


def test_firmographics_lit_l_enrichissement_du_compte_sans_jamais_ecrire_zero() -> None:
    account = {
        "apollo_enrichment": {
            "estimatedNumEmployees": 1200,
            "foundedYear": 1998,
            "totalFundingPrinted": "$40M",
            "latestFundingStage": "Series C",
            "latestFundingRoundDate": "2026-03-01",
            "departmentalHeadCount": {"engineering": 300, "sales": 0, "hr": 20},
            "retailLocationCount": 0,
            "technologies": ["AWS", "Kafka"],
        },
        "raw_analysis": {
            "detectedTechStack": ["Java", "Kafka"],
            "githubSignals": {"org": "acme", "public_repos": 42, "top_languages": ["Java"], "last_activity": "2026-08-07"},
            "subsidiaries": ["Acme Pay", "Acme Cloud"],
            "employees": "1 000 à 1 999 salariés",
        },
    }
    out = firmographics_block(account)
    firmo = out["firmographics"]
    assert firmo["headcount_estimate"] == 1200 and firmo["founded_year"] == 1998
    assert firmo["latest_funding_round_date"] == "2026-03-01"
    assert firmo["headcount_by_department"] == {"engineering": 300, "hr": 20}  # 0 = absence, pas une ligne
    assert "location_count" not in firmo or firmo["location_count"] != 0
    assert out["detected_tech_stack"] == ["Java", "Kafka"]
    assert out["github_signals"]["public_repos"] == 42
    assert out["subsidiaries"] == ["Acme Pay", "Acme Cloud"]
    assert out["headcount_band"] == "1 000 à 1 999 salariés"
    assert "apollo" not in str(out).lower()


def test_firmographics_vide_sans_donnee() -> None:
    assert firmographics_block({"apollo_enrichment": None, "raw_analysis": {}}) == {}
    assert firmographics_block({}) == {}


def test_registry_block_ne_relaie_ni_beneficiaires_ni_naissance() -> None:
    profile = {
        "legal_name": "ACME SA",
        "c_level": [{"first_name": "Claire", "last_name": "Dubois", "role": "Directrice générale", "birth": "1980"}],
        "subsidiaries": [{"name": "Acme Pay"}],
        "parent_companies": [],
        "group_affiliation": {"role": "filiale", "head_name": "Acme Groupe", "head_siren": "123456789"},
        "beneficial_owners": [{"last_name": "Secret"}],
        "headcount_label": "250 à 499 salariés",
    }
    out = registry_block(profile)
    assert out["executives"] == [{"name": "Claire Dubois", "role": "Directrice générale"}]
    assert out["subsidiaries"] == ["Acme Pay"] and "parent_companies" not in out
    assert out["group_affiliation"] == {"role": "filiale", "head_name": "Acme Groupe"}
    assert "Secret" not in str(out) and "1980" not in str(out)
    assert registry_block(None) == {} and registry_block({}) == {}


def test_les_libelles_de_source_couvrent_toute_la_hierarchie() -> None:
    assert set(reads.SOURCE_LABELS) == {
        "human_correction", "current_data", "registry_identity", "connected_tools",
        "dataforge", "public_sources", "market_memory", "inference",
    }
