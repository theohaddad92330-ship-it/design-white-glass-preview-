"""Confidence split into 4 sub-scores (retour Thales 2026-07-07).

Théo: 100/100 is impossible when the SIREN is wrong, quality=a_corriger, INPI
skipped, tech-detect skipped, Firecrawl 3 pages, weak sources, many hypotheses.
The single score is split into four honest axes — technique / identité / sources /
commerciale — and the global is capped by the identity axis, so a homonym can
never present as high confidence even when the web dossier is rich.
"""

from __future__ import annotations

from app.services.confidence import (
    _SOURCES_SLACK,
    _TIER_HIGH,
    ConfidenceAxes,
    _tier,
    compute_confidence,
)

# A truly complete, trusted dossier — the ONLY shape that may reach ~100.
_RICH_METRICS = {
    "brave_results_count": 30,
    "firecrawl_pages_scraped": 12,  # ≥ _FC_ADEQUATE (10) — full vannes-ouvertes run
    "pappers_siren": "552120222",
}
_RICH_DATA = {
    "sector": "Banque",
    "employees": "100 000+",
    "revenue": "26 Md€",
    "headquarters": "Paris",
    "businessDescription": "Groupe bancaire.",
    "angles": [{"title": "Cloud souverain"}],
    "recentSignals": [{"date": "2026-06-01"}],
    "beneficialOwners": [{"name": "X"}],  # INPI ran
    "detectedTechStack": ["SAP", "Salesforce"],  # tech-detect ran
    "data_freshness": {"signals": "recent", "financials": "recent", "contacts": "recent"},
    "identity": {"status": "verified", "identityConfidence": 1.0, "useRegistryData": True},
}


def test_rich_trusted_dossier_reaches_high_confidence() -> None:
    res = compute_confidence(
        metrics=_RICH_METRICS,
        data=_RICH_DATA,
        sources={"facts": {k: ["pappers:1"] for k in ("sector", "employees", "revenue", "headquarters")}},
    )
    assert isinstance(res.axes, ConfidenceAxes)
    assert res.axes.identite == 100
    assert res.axes.technique >= 90
    assert res.score >= 90


def test_homonym_caps_global_even_with_rich_web() -> None:
    # The Thales case: rich web dossier but the registry entity is a homonym.
    # Identity collapses and CAPS the global — no 100, no even 60.
    data = {
        **_RICH_DATA,
        "identity": {"status": "homonyme", "identityConfidence": 0.15, "useRegistryData": False},
    }
    res = compute_confidence(metrics=_RICH_METRICS, data=data)
    assert res.axes.identite <= 20
    # Global is capped hard by the identity axis.
    assert res.score <= 45
    # Legal grounding is revoked even though a SIREN was resolved (hard rule).
    assert res.factors.legal_grounding == 0.0
    # But the commercial axis can stay high — the web dossier IS actionable.
    assert res.axes.commerciale >= 60


def test_skipped_stages_pull_technique_down() -> None:
    # Firecrawl 3 pages, INPI skipped, tech-detect skipped → technique < 100 → no 100.
    metrics = {"brave_results_count": 10, "firecrawl_pages_scraped": 3, "pappers_siren": "1"}
    data = {
        "sector": "Tech",
        "employees": "500",
        "businessDescription": "x",
        "angles": [{"title": "a"}],
        "recentSignals": [{"date": "2026-01"}],
        # no beneficialOwners (INPI skipped), no detectedTechStack (tech-detect skipped)
        "identity": {"identityConfidence": 1.0, "useRegistryData": True},
    }
    res = compute_confidence(metrics=metrics, data=data)
    assert res.axes.technique < 80
    assert res.score < 100


def test_axes_present_without_identity_block_backcompat() -> None:
    # Old callers that don't pass an identity block still get axes; a resolved
    # SIREN with no identity verdict is treated as trusted (verified default).
    res = compute_confidence(
        metrics=_RICH_METRICS,
        data={k: v for k, v in _RICH_DATA.items() if k != "identity"},
    )
    assert res.axes.identite == 100
    assert res.factors.legal_grounding == 1.0


def test_many_hypotheses_lower_the_sources_axis() -> None:
    # « beaucoup d'hypothèses » (Théo) : un dossier surtout hypothétique vs sourcé
    # doit voir sa confiance SOURCES baisser.
    base = {k: v for k, v in _RICH_DATA.items() if k != "identity"}
    grounded = compute_confidence(metrics=_RICH_METRICS, data={**base, "qualified_hypotheses": []})
    hypothetical = compute_confidence(
        metrics=_RICH_METRICS,
        data={**base, "qualified_hypotheses": [{"hypothesis": f"h{i}"} for i in range(8)]},
    )
    assert hypothetical.axes.sources < grounded.axes.sources
    assert hypothetical.score < grounded.score


def test_no_registry_lowers_identity_axis() -> None:
    res = compute_confidence(
        metrics={"brave_results_count": 5, "firecrawl_pages_scraped": 5, "pappers_siren": None},
        data={"sector": "Tech", "identity": {"status": "no_registry", "identityConfidence": 0.4, "useRegistryData": False}},
    )
    assert res.axes.identite == 40
    assert res.factors.legal_grounding == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# LE PALIER EST PLAFONNÉ PAR L'AXE SOURCES — retour Julien Laszlo
# (Aquila Data Enabler), 03/09/2026 : « ça ressemble à des reco très génériques
# […] si on creuse c'est assez creux ».
#
# Mesuré sur son run KNDS (03/09) et sur les 19 autres du monitoring : le
# dossier affichait « confiance 75/100 (high) » au-dessus de « Sources 48/100 »,
# et le back-office comptait 5 faits sourcés contre 8 hypothèses — 38 %, pour
# une cible à 95 %, « cible atteinte 0/20 ».
#
# La cause est arithmétique : le global est la MOYENNE de quatre axes, et trois
# axes hauts (identité 100, commerciale 100, technique 78) noient un axe sources
# à 48. Le mot « élevée » se déduisait ensuite de cette moyenne. Un dossier dont
# moins de la moitié des faits est sourcée ne peut pas s'annoncer « fiabilité
# élevée » : c'est la même faute qu'un « 0 » posé sur une valeur non mesurée —
# le chiffre est calculable, l'affirmation qu'il porte est fausse.
#
# Le mécanisme n'est pas nouveau : l'axe IDENTITÉ plafonne déjà le global depuis
# le retour Thales, pour que jamais un homonyme ne s'annonce en confiance haute.
# On étend le même plafond à l'axe qui répond à « est-ce vrai ? ».
# ─────────────────────────────────────────────────────────────────────────────



def test_un_dossier_a_sources_faibles_ne_peut_pas_etre_de_confiance_haute() -> None:
    """Le cas KNDS, aux chiffres exacts lus sur le run du 03/09/2026."""
    axes = ConfidenceAxes(technique=78, identite=100, sources=48, commerciale=100)
    mean = (axes.technique + axes.identite + axes.sources + axes.commerciale) / 4.0
    assert mean >= _TIER_HIGH, "sans plafond, la moyenne annonçait bien une confiance haute"

    plafonne = min(mean, axes.sources + _SOURCES_SLACK)
    assert _tier(round(plafonne)) != "high"


def test_le_plafond_sources_ne_penalise_pas_un_dossier_bien_source() -> None:
    """La garde doit savoir dire NON : un dossier réellement sourcé garde son rang."""
    axes = ConfidenceAxes(technique=78, identite=100, sources=85, commerciale=100)
    mean = (axes.technique + axes.identite + axes.sources + axes.commerciale) / 4.0
    assert _tier(round(min(mean, axes.sources + _SOURCES_SLACK))) == "high"


def test_le_plafond_sources_s_applique_dans_compute_confidence() -> None:
    """Le plafond vit dans le calcul, pas seulement dans l'arithmétique du test.

    Un dossier riche côté web mais SANS source citable ni corroboration : la
    moyenne reste haute, le verdict ne doit pas l'être.
    """
    result = compute_confidence(metrics=_RICH_METRICS, data=_RICH_DATA, sources=None)
    assert result.score <= result.axes.sources + _SOURCES_SLACK


# ─────────────────────────────────────────────────────────────────────────────
# #2307.19 — niveau NON ÉVALUABLE : une collecte qui n'a RIEN retourné (aucune
# des trois sources externes n'a répondu) note un score bas comme n'importe
# quel dossier pauvre, mais les deux ne veulent pas dire la même chose : l'un
# dit « on a jugé, et c'est mauvais », l'autre dit « il n'y a rien à juger ».
# Confondre les deux affiche « confiance faible » là où c'est la COLLECTE qui
# a échoué (doctrine CLAUDE.md : « non mesuré » n'est jamais un 0/une note
# basse déguisée).
# ─────────────────────────────────────────────────────────────────────────────


def test_zero_source_collection_is_non_evaluable_not_low() -> None:
    """Brave/Firecrawl/Pappers tous muets : rien n'a pu être vérifié."""
    metrics = {"brave_results_count": 0, "firecrawl_pages_scraped": 0, "pappers_siren": None}
    result = compute_confidence(metrics=metrics, data={})
    assert result.tier == "non_evaluable"


def test_a_single_responding_source_stays_evaluable() -> None:
    """Dès qu'UNE source a répondu, on a de quoi juger — même mal, jamais
    « non évaluable » : un SIREN résolu donne un ancrage légal réel, quand
    bien même le reste (technique, sources citées) reste pauvre."""
    metrics = {"brave_results_count": 0, "firecrawl_pages_scraped": 0, "pappers_siren": "552120222"}
    result = compute_confidence(metrics=metrics, data={})
    assert result.tier != "non_evaluable"
    assert result.tier in ("low", "medium")


def test_rich_dossier_stays_high_not_non_evaluable() -> None:
    """Régression : un dossier riche garde `tier == "high"`, jamais dégradé."""
    result = compute_confidence(
        metrics=_RICH_METRICS,
        data=_RICH_DATA,
        sources={"facts": {k: ["pappers:1"] for k in ("sector", "employees", "revenue", "headquarters")}},
    )
    assert result.tier == "high"


def test_tier_helper_still_takes_a_bare_score_by_default() -> None:
    """Les appels historiques à `_tier(score)` (tests ci-dessus) restent valides :
    sans indication d'évaluabilité, `_tier` reste un simple seuillage du score."""
    assert _tier(0) == "low"
    assert _tier(50) == "medium"
    assert _tier(80) == "high"
