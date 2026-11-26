"""#3179 (LAU-FINAL-185) — le moteur de décision d'aptitude commerciale.

Chaque test verrouille une règle du retour bêta, jamais seulement un chiffre :
un futur réglage des seuils peut changer les points, il ne doit jamais casser
la RÈGLE (unknown ≠ 0, pas de probabilité, pas de NO_GO sur la seule taille,
Market Memory seule ne crée pas de timing, verdict explicable par axe).
"""

from __future__ import annotations

from app.services.account_suitability import VERDICTS, compute_account_suitability


def _analysis(**overrides):
    base = {
        "painPoints": ["cloud", "cybersécurité"],
        "recentSignals": [
            {"freshness": "current"},
            {"freshness": "current"},
        ],
        "itJobSignals": [1, 2, 3],
        "contacts": [{"email": "a@b.com"}, {"phone": "0600000000"}],
        "competitorsPresent": [],
        "sources": ["a", "b", "c"],
        "entitiesExhaustive": ["x"],
    }
    base.update(overrides)
    return base


def _profile(**overrides):
    base = {"offers": ["cloud", "cybersécurité"], "references": ["ref1"], "consultantSize": "50-100"}
    base.update(overrides)
    return base


def test_all_verdicts_are_the_six_canonical_values():
    assert VERDICTS == ("GO_NOW", "GO_VIA_PARTNER", "GO_AFTER_PROOF", "WATCH", "NO_GO_NOW", "NOT_EVALUABLE")


def test_strong_account_on_every_axis_is_go_now():
    result = compute_account_suitability(_analysis(), _profile(), company="Acme")
    assert result["verdict"] == "GO_NOW"
    assert result["dominant_reasons"]
    assert all("axis" in reason and "evidence" in reason for reason in result["dominant_reasons"])


def test_no_probability_field_anywhere_in_the_output():
    """Aucun pourcentage de chance de signature — jamais un CHIFFRE de
    probabilité. ``account_score_axes`` nomme un axe « cycle commercial
    probable » (un adjectif, pas une mesure) : ce n'est pas ce que la règle
    proscrit, d'où l'assertion sur le mot précis plutôt que la sous-chaîne."""
    result = compute_account_suitability(_analysis(), _profile())
    assert "%" not in str(result)
    assert "verdict_probability" not in result
    assert "closing_probability" not in result
    assert not any(isinstance(v, float) for v in result.values())


def test_weak_capacity_alone_never_produces_no_go_now():
    """« aucune décision fondée uniquement sur la taille du groupe » — fit et
    accessibilité corrects, seule la capacité (taille/concurrence) est faible :
    doit orienter vers un partenaire, jamais un NO_GO."""
    analysis = _analysis(competitorsPresent=["a", "b", "c", "d"])
    profile = _profile(references=[])
    result = compute_account_suitability(analysis, profile)
    assert result["verdict"] != "NO_GO_NOW"
    assert result["verdict"] == "GO_VIA_PARTNER"
    assert "best_route" in result


def test_market_memory_signal_alone_never_produces_go_now():
    """Signal fort, mais fit et accessibilité faibles (pas par manque de
    donnée, par constat réel) : le timing seul ne suffit pas."""
    analysis = _analysis(painPoints=[], contacts=[])
    profile = _profile(offers=["cloud"])
    result = compute_account_suitability(analysis, profile)
    assert result["verdict"] != "GO_NOW"


def test_no_contact_but_good_fit_is_go_after_proof():
    analysis = _analysis(contacts=[])
    result = compute_account_suitability(analysis, _profile())
    assert result["verdict"] == "GO_AFTER_PROOF"
    assert result["proof_needed"]
    assert "large_account_without_access" not in result


def test_go_after_proof_on_a_large_account_is_named():
    """#3223 (lot R17, épopée #3223) — même seuil que `analysisScopeGuardrailFor`
    (TS, 5000 salariés) : un `GO_AFTER_PROOF` sur un grand compte se NOMME,
    pour l'alerte « GO sur grands comptes sans accès » du tableau de pilotage."""
    analysis = _analysis(contacts=[])
    result = compute_account_suitability(analysis, _profile(), employees="5 000 à 9 999 salariés")
    assert result["verdict"] == "GO_AFTER_PROOF"
    assert result["large_account_without_access"] is True


def test_go_after_proof_on_a_small_account_is_not_named_large():
    analysis = _analysis(contacts=[])
    result = compute_account_suitability(analysis, _profile(), employees="10 à 19 salariés")
    assert result["verdict"] == "GO_AFTER_PROOF"
    assert "large_account_without_access" not in result


def test_go_now_on_a_large_account_is_never_named_without_access():
    """Le drapeau ne porte QUE sur `GO_AFTER_PROOF` — un `GO_NOW` sur un grand
    compte a, par construction, une accessibilité mesurée suffisante."""
    result = compute_account_suitability(_analysis(), _profile(), employees="Plus de 10 000 salariés")
    assert result["verdict"] == "GO_NOW"
    assert "large_account_without_access" not in result


def test_unreadable_headcount_is_not_a_large_account():
    analysis = _analysis(contacts=[])
    result = compute_account_suitability(analysis, _profile(), employees="non renseigné")
    assert result["verdict"] == "GO_AFTER_PROOF"
    assert "large_account_without_access" not in result


def test_missing_profile_and_data_is_not_evaluable_never_a_low_score():
    result = compute_account_suitability({}, {})
    assert result["verdict"] == "NOT_EVALUABLE"
    assert result["blocking_factors"] == []
    assert result["unknowns"]


def test_unevaluable_axes_are_named_with_a_reason_never_guessed():
    result = compute_account_suitability(_analysis(), _profile())
    named = {u["axis"] for u in result["unknowns"]}
    assert "partenaires" in named
    assert "coût d'opportunité" in named


def test_missing_tech_offer_alone_is_not_an_automatic_no_go():
    """Un profil ESN sans offre déclarée plafonne `fit` (limitedByData), il
    ne l'envoie jamais dans les facteurs bloquants."""
    analysis = _analysis()
    profile = _profile(offers=[])
    result = compute_account_suitability(analysis, profile)
    assert all(f["axis"] != "adéquation offre / besoin" for f in result["blocking_factors"])


def test_verdict_is_relative_to_profile_same_account_different_profile_different_verdict():
    analysis = _analysis()
    rich_profile = _profile()
    poor_profile = _profile(offers=[], references=[])
    rich = compute_account_suitability(analysis, rich_profile)
    poor = compute_account_suitability(analysis, poor_profile)
    assert rich["verdict"] != poor["verdict"] or rich["dominant_reasons"] != poor["dominant_reasons"]


def test_genuine_bad_fit_and_no_access_is_no_go_now_with_named_blocking_factors():
    analysis = _analysis(painPoints=["rh"], contacts=[])
    profile = _profile(offers=["cloud"], references=[])
    result = compute_account_suitability(analysis, profile)
    assert result["verdict"] == "NO_GO_NOW"
    assert {f["axis"] for f in result["blocking_factors"]} == {"adéquation offre / besoin", "accessibilité"}


# ── #185.2 (épopée #3242) — l'axe « partenaires » PAR COMPTE, lu d'`account_partners` ──


def _unevaluated_names(result):
    return [u["axis"] for u in result["unknowns"]]


def test_partners_axis_stays_unevaluated_without_a_partner_reading():
    """Sans lecture du pont (`partners=None`) : sortie byte-identique, l'axe reste nommé non évalué."""
    result = compute_account_suitability(_analysis(), _profile())
    assert "partenaires" in _unevaluated_names(result)
    assert "partners_on_account" not in result


def test_partners_axis_stays_unevaluated_when_no_partner_is_declared():
    """Aucune ligne ≠ « aucun partenaire » : l'axe reste non évalué, avec la raison de l'absence."""
    result = compute_account_suitability(_analysis(), _profile(), partners=[])
    reason = next(u["reason"] for u in result["unknowns"] if u["axis"] == "partenaires")
    assert "aucun partenaire déclaré" in reason
    assert "partners_on_account" not in result


def test_declared_partner_is_measured_named_and_leaves_the_unknowns():
    partners = [{"name": "Alten", "relationship": "partner", "rank": "rank2", "source": "declared"}]
    result = compute_account_suitability(_analysis(), _profile(), partners=partners)
    assert "partenaires" not in _unevaluated_names(result)
    assert result["partners_on_account"] == [{"name": "Alten", "rank": "rank2", "source": "declared"}]


def test_competitor_and_dismissed_rows_are_not_partners():
    partners = [
        {"name": "Rival", "relationship": "competitor", "rank": "rank1"},
        {"name": "Écarté", "relationship": "partner", "dismissed_at": "2026-09-01T00:00:00Z"},
    ]
    result = compute_account_suitability(_analysis(), _profile(), partners=partners)
    assert "partners_on_account" not in result
    assert "partenaires" in _unevaluated_names(result)


def test_go_via_partner_route_names_the_declared_partner():
    analysis = _analysis(competitorsPresent=["a", "b", "c", "d"])
    partners = [{"name": "Alten", "relationship": "partner", "rank": "rank1", "source": "declared"}]
    result = compute_account_suitability(analysis, _profile(references=[]), partners=partners)
    assert result["verdict"] == "GO_VIA_PARTNER"
    assert "Alten" in result["best_route"]


def test_partner_reading_never_changes_the_verdict():
    base = compute_account_suitability(_analysis(), _profile())["verdict"]
    partners = [{"name": "Alten", "relationship": "partner"}]
    assert compute_account_suitability(_analysis(), _profile(), partners=partners)["verdict"] == base


# ── #3476 (#3242 / #185.2) — l'axe « références et preuves mobilisables », lu de
# `referenceSectors` (les secteurs où l'ESN DÉCLARE une référence réelle, onboarding
# › Secteurs, #2041.2) contre le secteur du compte. Saisi depuis le lot 26, jamais lu.

_REFERENCES_AXIS = "références et preuves mobilisables"


def _reference_reason(result):
    return next(u["reason"] for u in result["unknowns"] if u["axis"] == _REFERENCES_AXIS)


def test_declared_reference_sector_matching_the_account_is_measured_and_named():
    profile = _profile(referenceSectors=["Banque de détail & Banque privée", "Transport ferroviaire & Aérien"])
    result = compute_account_suitability(_analysis(), profile, sector="Banque")
    assert _REFERENCES_AXIS not in _unevaluated_names(result)
    assert result["sector_reference"] == {
        "declared_sector": "Banque de détail & Banque privée",
        "account_sector": "Banque",
    }


def test_declared_reference_sectors_that_do_not_match_say_so_without_scoring_zero():
    """Sait dire NON : un secteur déclaré qui ne recoupe pas le compte ne mesure rien —
    l'absence de déclaration n'est pas une absence de référence."""
    profile = _profile(referenceSectors=["Transport ferroviaire & Aérien"])
    result = compute_account_suitability(_analysis(), profile, sector="Banque")
    assert "sector_reference" not in result
    reason = _reference_reason(result)
    assert "aucune référence déclarée dans le secteur de ce compte (Banque)" in reason


def test_a_loose_prefix_is_not_a_sector_match():
    profile = _profile(referenceSectors=["Banque de détail & Banque privée"])
    result = compute_account_suitability(_analysis(), profile, sector="Banquettes et mobilier")
    assert "sector_reference" not in result


def test_unknown_account_sector_is_named_never_guessed():
    profile = _profile(referenceSectors=["Banque de détail & Banque privée"])
    result = compute_account_suitability(_analysis(), profile)
    assert "sector_reference" not in result
    assert "secteur de ce compte est inconnu" in _reference_reason(result)


def test_no_declared_reference_sector_names_the_missing_declaration():
    result = compute_account_suitability(_analysis(), _profile(), sector="Banque")
    assert "sector_reference" not in result
    assert "aucun secteur de référence déclaré" in _reference_reason(result)


def test_not_evaluable_verdict_still_carries_the_sector_reference():
    profile = {"referenceSectors": ["Banque de détail & Banque privée"]}
    result = compute_account_suitability({}, profile, sector="Banque")
    assert result["verdict"] == "NOT_EVALUABLE"
    assert result["sector_reference"]["declared_sector"] == "Banque de détail & Banque privée"
