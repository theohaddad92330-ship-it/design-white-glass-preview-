"""Tests for the DETERMINISTIC discover score (contract: agent_docs/discover-v2-contract.md).

The v1 score was invented by the LLM (`priorityScore` in a badge that looked
precise). The v2 score is computed here: every point must be attributable to a
NAMED factor carrying its evidence, and a missing datum must never invent a
point nor penalise a candidate — the exact philosophy of
`apps/api/src/modules/accounts/similar-scoring.ts` (sector > geo = size, missing
input on either side contributes 0) and of `app/services/score_axes.py`
(commercial score and data confidence are two DISTINCT axes).
"""

from __future__ import annotations

from datetime import date

import pytest

from app.services.discover_scoring import (
    DISCOVER_SCORE_MAX,
    data_confidence,
    parse_headcount_range,
    score_candidate,
)

# ── Fixtures ────────────────────────────────────────────────────────────────

ACME = {
    "name": "ACME INDUSTRIE",
    "siren": "552081317",
    "nafCode": "62.02A",
    "sector": "Conseil en systèmes et logiciels informatiques",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "100 à 199 salariés",
    "creationDate": "2005-03-14",
}

PROFILE = {
    "companyName": "Skaizen",
    "sectors": ["Banque & Assurance", "Industrie"],
    "geoZone": "Lyon & Auvergne-Rhône-Alpes",
    "targetCompanyTypes": ["PME (50-500 salariés)"],
    "positioning": "ESN de proximité",
}

TODAY = date(2026, 7, 19)


def _labels(result: dict) -> list[str]:
    return [factor["label"] for factor in result["factors"]]


def _points_for(result: dict, needle: str) -> int:
    return sum(f["points"] for f in result["factors"] if needle.lower() in f["label"].lower())


# ── Invariants du contrat ───────────────────────────────────────────────────


def test_score_is_bounded_0_100() -> None:
    """A perfect candidate maxes at 100, an empty one floors at 0 — the badge is
    on a real scale, not the model's mood."""
    perfect = score_candidate(
        ACME,
        profile=PROFILE,
        filters={"nafCode": "62.02A", "department": "69", "headcountMin": 50, "headcountMax": 500},
        signals=[
            {"type": "tender", "label": "AO IT publié", "date": "2026-06-01"},
            {"type": "hiring", "label": "5 postes data", "date": "2026-05-01"},
            {"type": "award", "label": "Marché attribué", "date": "2026-04-01"},
        ],
        now=TODAY,
    )
    assert 0 <= perfect["score"] <= DISCOVER_SCORE_MAX == 100
    # Le maximum ATTEIGNABLE au stade registre n'est pas 100 : « accessibilité »
    # (20 points du barème p41) demande des interlocuteurs identifiés, ce qu'on
    # n'a pas encore. Le bloc est déclaré non mesuré et son plafond quitte le
    # dénominateur — un candidat parfait fait donc le plein de CE qui est
    # mesurable, pas d'un total théorique.
    assert perfect["score"] > 0
    assert perfect["score"] <= perfect["scoreMax"] <= DISCOVER_SCORE_MAX
    assert "accessibility" in perfect["unmeasured"]

    # Un candidat sans AUCUNE donnée ne « plancher pas à 0 » : il n'a rien de
    # mesurable, donc pas de score du tout (cf. l'axe mesurabilité plus bas).
    empty = score_candidate({"name": "X"}, now=TODAY)
    assert empty["score"] is None
    assert empty["factors"] == []


def test_every_point_is_attributable_to_a_named_factor() -> None:
    """Contract: `score` MUST equal the sum of its factors — no unexplained
    residue, which is what made the v1 badge unauditable."""
    result = score_candidate(
        ACME,
        profile=PROFILE,
        filters={"nafCode": "62.01Z", "department": "69"},
        signals=[{"type": "tender", "label": "AO IT", "date": "2026-06-01"}],
        now=TODAY,
    )
    assert result["score"] == sum(factor["points"] for factor in result["factors"])
    for factor in result["factors"]:
        assert factor["label"].strip(), "un facteur sans libellé n'est pas une explication"
        assert factor["points"] > 0, "un facteur à 0 point n'est pas une preuve"
        assert factor["evidence"], "chaque facteur porte la donnée brute qui le justifie"


def test_missing_data_never_penalises_and_never_invents() -> None:
    """Mirrors similar-scoring.ts: a criterion whose input is missing on EITHER
    side is never a negative and never a guessed point. Il n'est pas non plus un
    « 0 sur 30 » : sans donnée, il n'y a pas de mesure du tout (`unmeasured`)."""
    blind = {"name": "SANS DONNEES", "siren": "111222333"}
    result = score_candidate(blind, profile=PROFILE, filters={"department": "69"}, now=TODAY)
    # Un SIREN résolu est en soi une preuve : le bloc « qualité des preuves »
    # devient mesurable, les six autres restent muets. Le candidat n'est donc pas
    # « sans score », il est « connu et rien d'autre » — ce qui est exact.
    assert result["unmeasured"] == [
        "activity",
        "geography",
        "headcount",
        "age",
        "it_surface",
        "signals",
        "accessibility",
    ]
    assert all(factor["label"] == "qualité des preuves" for factor in result["factors"])
    assert all(factor["points"] > 0 for factor in result["factors"])


def test_empty_profile_and_empty_filters_yield_registry_only_score() -> None:
    """No profile, no filters → nothing to match against, so only intrinsic
    factors (signals, ancienneté) can score. Guarantees a profile-neutral run
    degrades to a neutral ranking rather than to noise."""
    result = score_candidate(ACME, profile={}, filters={}, now=TODAY)
    assert _points_for(result, "NAF") == 0
    assert _points_for(result, "zone") == 0
    # Ce qui reste marquable sans profil ni critère : ce que le registre dit du
    # candidat lui-même — son ancienneté, sa surface informatique déduite de sa
    # taille, et la qualité de sa fiche.
    intrinsic = (
        _points_for(result, "ancienneté")
        + _points_for(result, "surface informatique")
        + _points_for(result, "qualité des preuves")
    )
    assert result["score"] == intrinsic


def test_scoring_is_pure_and_stable() -> None:
    """Same inputs → same output, twice. No clock, no network, no randomness."""
    args = {"profile": PROFILE, "filters": {"department": "69"}, "now": TODAY}
    assert score_candidate(ACME, **args) == score_candidate(ACME, **args)


# ── Facteur NAF / secteur ───────────────────────────────────────────────────


def test_exact_naf_beats_division_beats_sector_keyword() -> None:
    """NAF proximity is graded, not binary: exact code > même division > simple
    mot-clé secteur. A « 62.02A » asked for and delivered is a stronger fact
    than « le libellé contient informatique »."""
    exact = score_candidate(ACME, filters={"nafCode": "62.02A"}, now=TODAY)
    division = score_candidate(ACME, filters={"nafCode": "62.09Z"}, now=TODAY)
    unrelated = score_candidate(ACME, filters={"nafCode": "10.11Z"}, now=TODAY)

    assert _points_for(exact, "NAF") > _points_for(division, "NAF") > _points_for(unrelated, "NAF") == 0
    assert "62.02A" in " ".join(f["evidence"] for f in exact["factors"] if "NAF" in f["label"])


def test_sector_keyword_matches_profile_target_sectors() -> None:
    """Reuses similar-scoring's philosophy: a meaningful keyword of the SELLER's
    target sectors found in the candidate's activity label. Prefix match both
    ways so « assurance » ↔ « assurances » match."""
    insurer = {**ACME, "nafCode": "65.12Z", "sector": "Autres assurances"}
    result = score_candidate(insurer, profile={"sectors": ["Banque & Assurance"]}, now=TODAY)
    assert _points_for(result, "secteur") > 0


def test_sector_stopwords_do_not_create_a_match() -> None:
    """« Services financiers » must not match « Services de nettoyage » on the
    filler word alone — the v1 noise generator."""
    cleaner = {**ACME, "nafCode": "81.21Z", "sector": "Nettoyage courant des bâtiments"}
    result = score_candidate(cleaner, profile={"sectors": ["Services financiers"]}, now=TODAY)
    assert _points_for(result, "secteur") == 0


# ── Facteur géographie ──────────────────────────────────────────────────────


def test_requested_department_scores_above_profile_region() -> None:
    """An explicitly REQUESTED department is a harder fact than a region merely
    inferred from the seller's geo zone."""
    requested = score_candidate(ACME, filters={"department": "69"}, now=TODAY)
    inferred = score_candidate(ACME, profile=PROFILE, now=TODAY)
    assert _points_for(requested, "zone") > _points_for(inferred, "zone") > 0


def test_wrong_department_scores_zero_not_negative() -> None:
    result = score_candidate(ACME, filters={"department": "75"}, now=TODAY)
    assert _points_for(result, "zone") == 0


def test_open_geo_zone_is_not_a_discriminator() -> None:
    """« National » expresses no restriction — it cannot discriminate between
    two candidates, so the criterion is skipped (same rule as similar-scoring)."""
    result = score_candidate(ACME, profile={"geoZone": "National"}, now=TODAY)
    assert _points_for(result, "zone") == 0


# ── Facteur effectif ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("100 à 199 salariés", (100, 199)),
        ("50 à 99 salariés", (50, 99)),
        ("10 000 salariés et plus", (10000, None)),
        ("1 ou 2 salariés", (1, 2)),
        ("0 salarié", (0, 0)),
        ("", None),
        ("Unités non employeuses", None),
        # #3814 — recette prod 08/10 : le tri « Taille (effectif) » n'était
        # pas monotone. La borne basse est le PREMIER nombre du libellé
        # (celui que la tranche publie en tête), jamais le plus petit trouvé
        # n'importe où dans le texte — un chiffre qui traînerait ailleurs
        # (une note, un code) ne doit pas faire lire une tranche de 10 000+
        # comme une poignée de salariés.
        ("10 000 salariés et plus (code 53)", (10000, None)),
        ("2 000 à 4 999 salariés (code 51)", (2000, 4999)),
    ],
)
def test_parse_headcount_range(label: str, expected: tuple[int, int | None] | None) -> None:
    """Registry tranche labels (INSEE/recherche-entreprises wording) parsed as
    real bounds — the seller's own numbers, never a guessed bucket."""
    assert parse_headcount_range(label) == expected


def test_headcount_overlap_with_requested_range_scores() -> None:
    inside = score_candidate(ACME, filters={"headcountMin": 50, "headcountMax": 500}, now=TODAY)
    outside = score_candidate(ACME, filters={"headcountMin": 5000, "headcountMax": 10000}, now=TODAY)
    assert _points_for(inside, "effectif") > 0
    assert _points_for(outside, "effectif") == 0


def test_headcount_falls_back_to_profile_target_company_types() -> None:
    """No explicit range asked → the seller's onboarding « PME (50-500 salariés) »
    provides the bound, parsed from the label's own numbers."""
    result = score_candidate(ACME, profile=PROFILE, now=TODAY)
    assert _points_for(result, "effectif") > 0


# ── #3092 — « Startups & Scale-ups » : la tranche d'effectifs seule ne suffit
# plus. Retour bêta Apricot Labs : « Laura a renvoyé des micro-entreprises et
# pas des startups ». 1-250 salariés recoupe aussi bien une jeune pousse
# qu'une TPE vieille de vingt ans.


def test_startup_target_type_needs_a_confirmed_young_creation_date() -> None:
    old_small_company = {**ACME, "headcountRange": "3 à 5 salariés", "creationDate": "1998-06-01"}
    result = score_candidate(old_small_company, profile={"targetCompanyTypes": ["Startups & Scale-ups"]}, now=TODAY)
    assert _points_for(result, "effectif") == 0


def test_startup_target_type_matches_a_confirmed_young_company_and_names_the_date() -> None:
    young_small_company = {**ACME, "headcountRange": "3 à 5 salariés", "creationDate": "2024-01-15"}
    result = score_candidate(young_small_company, profile={"targetCompanyTypes": ["Startups & Scale-ups"]}, now=TODAY)
    assert _points_for(result, "effectif") > 0
    evidence = " ".join(f["evidence"] for f in result["factors"] if "effectif" in f["label"].lower())
    assert "2024-01-15" in evidence


def test_startup_target_type_without_a_creation_date_still_matches_no_data_invented() -> None:
    """Absent creation date ⇒ no penalty, no invented signal: the criterion
    matches exactly as it did before #3092 (never excluded on missing data)."""
    unknown_age_company = {**ACME, "headcountRange": "3 à 5 salariés", "creationDate": None}
    result = score_candidate(unknown_age_company, profile={"targetCompanyTypes": ["Startups & Scale-ups"]}, now=TODAY)
    assert _points_for(result, "effectif") > 0


def test_a_different_target_type_on_the_same_old_company_is_unaffected() -> None:
    old_mid_company = {**ACME, "headcountRange": "500 à 999 salariés", "creationDate": "1998-06-01"}
    result = score_candidate(
        old_mid_company,
        profile={"targetCompanyTypes": ["ETI (500-5 000 salariés)", "Startups & Scale-ups"]},
        now=TODAY,
    )
    assert _points_for(result, "effectif") > 0


# ── Facteur signaux (« pourquoi maintenant ») ───────────────────────────────


def test_signals_add_points_capped_and_carry_their_date() -> None:
    """Signals are the « pourquoi maintenant ». Each carries its date as
    evidence; the block is capped so ten weak signals never outweigh a real
    sector+geo fit."""
    many = score_candidate(
        ACME,
        signals=[{"type": "hiring", "label": f"poste {i}", "date": "2026-06-01"} for i in range(20)],
        now=TODAY,
    )
    assert 0 < _points_for(many, "signa") <= 25
    evidence = " ".join(f["evidence"] for f in many["factors"] if "signa" in f["label"].lower())
    assert "2026-06-01" in evidence


def test_recent_signal_outweighs_an_old_one() -> None:
    fresh = score_candidate(ACME, signals=[{"type": "tender", "label": "AO", "date": "2026-06-01"}], now=TODAY)
    stale = score_candidate(ACME, signals=[{"type": "tender", "label": "AO", "date": "2025-01-01"}], now=TODAY)
    assert _points_for(fresh, "signa") > _points_for(stale, "signa") > 0


def test_archived_signal_beyond_24_months_scores_zero() -> None:
    """Same freshness horizon as `confidence.compute_confidence` (> ~24 months =
    archived). An AO from 2019 is not a reason to call today."""
    ancient = score_candidate(ACME, signals=[{"type": "tender", "label": "AO", "date": "2019-01-01"}], now=TODAY)
    assert _points_for(ancient, "signa") == 0


def test_signal_without_a_date_is_ignored() -> None:
    """The contract makes `date` mandatory on a signal — an undated signal is
    not a « pourquoi maintenant » and must not score."""
    undated = score_candidate(ACME, signals=[{"type": "tender", "label": "AO"}], now=TODAY)
    assert _points_for(undated, "signa") == 0


# ── Axe 2 — confiance donnée ────────────────────────────────────────────────


def test_data_confidence_is_a_separate_axis_from_the_score() -> None:
    """score_axes.py rule: commercial score and data confidence are DISTINCT.
    A complete registry row is confidently known even if it scores 0 for fit."""
    result = score_candidate(ACME, profile={}, filters={}, now=TODAY)
    assert result["score"] == 0 or result["score"] < 30
    assert result["dataConfidence"] >= 80


def test_data_confidence_degrades_with_missing_registry_fields() -> None:
    thin = {"name": "PARTIELLE", "siren": "111222333"}
    assert data_confidence(thin, signals=[], degraded=[], now=TODAY) < data_confidence(
        ACME, signals=[], degraded=[], now=TODAY
    )


def test_data_confidence_degrades_when_a_source_is_degraded() -> None:
    """A source in `degraded[]` means we know LESS — it must show on the
    confidence axis, never be silently masked."""
    healthy = data_confidence(ACME, signals=[], degraded=[], now=TODAY)
    broken = data_confidence(ACME, signals=[], degraded=[{"source": "boamp", "reason": "http_500"}], now=TODAY)
    assert broken < healthy


def test_data_confidence_is_bounded() -> None:
    assert 0 <= data_confidence({}, signals=[], degraded=[{"source": s, "reason": "x"} for s in "abcdef"], now=TODAY) <= 100


# ── Axe 3 — MESURABILITÉ : « pas mesuré » ≠ « mesuré à zéro » ────────────────
#
# Le bug vécu par l'utilisateur : l'écran Découvrir affichait « 0/100 » pour
# CHAQUE entreprise. Deux affirmations très différentes se retrouvaient sur le
# même chiffre — « ce compte ne correspond à aucun de vos critères » et « nous
# n'avons pas pu évaluer vos critères ». La seconde n'est pas un score, c'est
# une absence de mesure, et le contrat doit la dire (règle CLAUDE.md : jamais de
# donnée inventée — un 0 qui a l'air mesuré EST une donnée inventée).


def test_unmeasurable_criterion_is_reported_not_scored_as_zero() -> None:
    """Un critère sans donnée sort dans `unmeasured`, et son plafond quitte le
    dénominateur — il ne devient JAMAIS un « 0 sur 30 »."""
    # Aucun critère d'activité possible : pas de nafCode demandé, pas de secteur
    # au profil. Le reste (géo, effectif, signaux, ancienneté) est mesurable.
    result = score_candidate(
        ACME,
        profile={"geoZone": "Lyon", "targetCompanyTypes": ["PME (50-500 salariés)"]},
        filters={"department": "69"},
        signals=[{"type": "tender", "label": "AO IT", "date": "2026-06-01"}],
        now=TODAY,
    )
    assert "activity" in result["unmeasured"]
    assert "geography" not in result["unmeasured"]
    assert "signals" not in result["unmeasured"]
    # Le plafond du bloc activité est retiré du dénominateur affiché — comme
    # celui de l'accessibilité, jamais mesurable au stade registre.
    assert result["scoreMax"] == 100 - 10 - 20


def test_measured_but_unmet_criterion_stays_a_real_zero() -> None:
    """L'inverse doit rester vrai : un critère qu'on a PU évaluer et que le
    candidat ne remplit pas vaut bien 0 — et compte dans le dénominateur."""
    result = score_candidate(ACME, filters={"department": "75"}, now=TODAY)
    assert "geography" not in result["unmeasured"], "le département était comparable : c'est un vrai 0"
    assert _points_for(result, "zone") == 0
    assert result["scoreMax"] >= 20


def test_nothing_measurable_yields_no_score_at_all() -> None:
    """Zéro critère évaluable → `score is None` (« indisponible »), jamais 0 ni
    une valeur médiane rassurante. C'est exactement le cas que l'écran rendait
    « 0/100 »."""
    # Pas même un SIREN : l'identité n'est pas résolue, donc la qualité des
    # preuves elle-même n'est pas mesurable.
    blind = {"name": "SANS DONNEES"}
    result = score_candidate(blind, profile={}, filters={}, now=TODAY)
    assert result["score"] is None
    assert result["scoreMax"] == 0
    assert set(result["unmeasured"]) == {
        "activity",
        "geography",
        "headcount",
        "age",
        "it_surface",
        "signals",
        "accessibility",
        "evidence",
    }
    assert result["factors"] == []


def test_score_never_exceeds_its_own_denominator() -> None:
    """Invariant : `score <= scoreMax`, et `scoreMax <= 100`. Sans quoi le badge
    « 42/45 » mentirait autant que le « 0/100 » d'origine."""
    result = score_candidate(
        ACME,
        profile=PROFILE,
        filters={"nafCode": "62.02A", "department": "69"},
        signals=[{"type": "tender", "label": "AO", "date": "2026-06-01"}],
        now=TODAY,
    )
    assert result["score"] <= result["scoreMax"] <= DISCOVER_SCORE_MAX


def test_empty_signal_list_is_unknown_not_a_measured_absence() -> None:
    """Aucun signal COLLECTÉ ne prouve pas qu'il n'y en a aucun : le chemin
    registre passe volontairement `signals=[]` (cf. `discover.py`). C'est une
    absence de mesure, pas un « ce compte ne bouge pas »."""
    result = score_candidate(ACME, filters={"department": "69"}, signals=[], now=TODAY)
    assert "signals" in result["unmeasured"]


def test_signals_present_but_all_archived_is_a_measured_zero() -> None:
    """À l'inverse, des signaux réellement collectés mais tous archivés (> ~24
    mois) sont MESURÉS : le compte ne bouge pas, et c'est une information."""
    result = score_candidate(
        ACME, filters={"department": "69"}, signals=[{"type": "tender", "label": "AO", "date": "2019-01-01"}], now=TODAY
    )
    assert "signals" not in result["unmeasured"]
    assert _points_for(result, "signa") == 0


def test_missing_creation_date_makes_age_unmeasurable() -> None:
    """Le chemin Signaux n'a pas de date de création (les sources de signal ne la
    publient pas) : le bloc ancienneté doit se déclarer non mesuré."""
    no_date = {**ACME, "creationDate": None}
    result = score_candidate(no_date, filters={"department": "69"}, now=TODAY)
    assert "age" in result["unmeasured"]
    assert "age" not in score_candidate(ACME, filters={"department": "69"}, now=TODAY)["unmeasured"]


# ── Barème de l'addendum final (p41) ────────────────────────────────────────


def test_the_five_blocks_sum_to_exactly_one_hundred() -> None:
    """Le barème du rapport tient à 100, blocs additionnés.

    C'est l'invariant le plus fragile du module : chaque sous-critère du fit se
    règle indépendamment, et il suffit d'en remonter un pour que le total dérive.
    Le badge « 78/85 » cesserait alors de vouloir dire quoi que ce soit.
    """
    from app.services.discover_scoring import _BLOCK_MAXIMA

    assert sum(maximum for _block, maximum in _BLOCK_MAXIMA) == DISCOVER_SCORE_MAX


def test_accessibility_is_declared_but_never_measured_at_registry_stage() -> None:
    """« Sait-on par qui entrer ? » n'a pas de réponse au stade registre.

    Le bloc existe (il vaut 20 points du barème) mais il sort du dénominateur :
    un « 0 sur 20 » ferait croire que le compte est inatteignable, alors qu'on
    n'a simplement pas encore cherché. C'est la même discipline que le reste du
    module — « pas mesuré » n'est pas « mesuré à zéro ».
    """
    result = score_candidate(ACME, profile=PROFILE, filters={"department": "69"}, now=TODAY)
    assert "accessibility" in result["unmeasured"]
    assert all("accessibilit" not in factor["label"] for factor in result["factors"])
    assert result["scoreMax"] <= DISCOVER_SCORE_MAX - 20


def test_every_factor_carries_the_block_it_came_from() -> None:
    """Un facteur dit de quel bloc il vient, et l'écran cesse de le deviner.

    Le web rattachait chaque facteur à son bloc par MOTS-CLÉS de son libellé,
    faute de clé transportée — commentaire de `discover-score.ts` : « le contrat
    ne transporte pas le bloc d'origine ». Trois blocs sur huit tombaient donc
    dans « divers », dont celui qu'on s'apprête à remplir : remplir
    l'accessibilité sans cette clé l'afficherait en « autre ».
    """
    from app.services.discover_scoring import _BLOCK_MAXIMA

    known = {block for block, _max in _BLOCK_MAXIMA}
    result = score_candidate(ACME, profile=PROFILE, filters={"department": "69"}, now=TODAY)
    assert result["factors"], "le candidat de référence doit produire des facteurs"
    for factor in result["factors"]:
        assert factor.get("block") in known, f"facteur sans bloc connu : {factor}"


def test_a_factor_block_matches_the_points_of_its_block() -> None:
    """La clé de bloc n'est pas décorative : la somme des facteurs d'un bloc ne
    dépasse jamais le plafond de CE bloc. Sans cette garde, une clé mal posée
    laisserait un badge afficher « 24/20 » sans qu'aucun test ne tombe."""
    from app.services.discover_scoring import _BLOCK_MAXIMA

    maxima = dict(_BLOCK_MAXIMA)
    result = score_candidate(ACME, profile=PROFILE, filters={"department": "69"}, now=TODAY)
    totals: dict[str, int] = {}
    for factor in result["factors"]:
        totals[factor["block"]] = totals.get(factor["block"], 0) + factor["points"]
    for block, total in totals.items():
        assert total <= maxima[block], f"{block} dépasse son plafond : {total} > {maxima[block]}"


def test_the_module_docstring_states_the_barème_it_actually_applies() -> None:
    """Le docstring annonçait encore le barème à 5 blocs (30/20/20/25/5) pendant
    que le code en appliquait 8. Un commentaire faux coûte plus cher qu'un
    commentaire absent : c'est lui qu'on lit avant de toucher au calcul."""
    import app.services.discover_scoring as mod

    doc = mod.__doc__ or ""
    for block, maximum in mod._BLOCK_MAXIMA:
        assert f"{maximum}" in doc, f"le docstring ne mentionne pas le plafond de {block}"
    assert "30" not in doc.split("Barème")[-1], "l'ancien barème (30) traîne encore dans le docstring"


# ── Adressabilité — les 20 points réservés depuis le premier jour ────────────
#
# Tome 1 §6. Le bloc valait 20 points du barème et n'était JAMAIS calculé. La
# règle qui le gouverne est celle du reste du module, appliquée à l'AXE et non
# au bloc : un axe sans donnée sort du dénominateur, il ne vaut pas zéro.


def _addr(result: dict) -> dict:
    return result["addressability"]


def test_addressability_is_a_separate_number_never_folded_into_the_score() -> None:
    """« Deux nombres, jamais fondus » (§6.4).

    « INTÉRÊT 68/80 · ADRESSABILITÉ 17/20 » dit qu'un compte est parfait et
    inatteignable jusqu'en novembre. Un 61 unique ne dit rien, et c'est le
    compte qui sortirait en tête de liste.
    """
    result = score_candidate(ACME, profile=PROFILE, now=TODAY)
    assert "addressability" in result
    # Le score d'intérêt ne contient AUCUN facteur d'adressabilité.
    assert all(factor["block"] != "accessibility" for factor in result["factors"])
    assert result["scoreMax"] <= DISCOVER_SCORE_MAX - 20


def test_a_public_award_says_someone_is_already_in_place() -> None:
    """Une attribution DECP est un FAIT : un fournisseur est en place chez cet
    acheteur. Ce n'est pas « verrouillé » — on ignore l'échéance du marché,
    DECP ne la publie pas ici — c'est « il y a une porte, elle passe par
    quelqu'un »."""
    result = score_candidate(
        ACME,
        profile=PROFILE,
        signals=[{"type": "award", "label": "marché attribué à Sopra", "date": "2026-06-01"}],
        now=TODAY,
    )
    lock = next(f for f in _addr(result)["factors"] if f["axis"] == "lock")
    assert lock["points"] == 4
    # #4315 — le mot du rail : « Marché public remporté », plus « marché attribué ».
    assert "marché public remporté" in lock["evidence"].lower()


def test_an_open_tender_is_the_door_being_open_right_now() -> None:
    result = score_candidate(
        ACME,
        profile=PROFILE,
        signals=[{"type": "tender", "label": "AO refonte SI", "date": "2026-06-01"}],
        now=TODAY,
    )
    lock = next(f for f in _addr(result)["factors"] if f["axis"] == "lock")
    assert lock["points"] == 6
    # #4315 — le mot du rail : « Appel d'offres public en cours ».
    assert "appel d'offres public en cours" in lock["evidence"].lower()


def test_no_public_trace_leaves_the_lock_unmeasured_not_open() -> None:
    """L'interdit central du §15 : « estimer un verrouillage faute de donnée ».

    Sa réciproque est pire encore — déclarer un compte OUVERT parce qu'on n'a
    rien trouvé. Une entreprise privée n'apparaît JAMAIS dans DECP : l'absence
    de trace n'y prouve rigoureusement rien.
    """
    result = score_candidate(ACME, profile=PROFILE, now=TODAY)
    assert "lock" in _addr(result)["unmeasured"]
    assert all(f["axis"] != "lock" for f in _addr(result)["factors"])


def test_proportion_tells_a_two_person_firm_it_will_not_open_bnp_in_direct() -> None:
    """Le cas que Théo a expliqué à Loïc de vive voix, et qui doit vivre dans le
    produit : « BNP, 190 000 personnes. Avec 2 consultants tu n'ouvres pas ce
    compte en direct. »"""
    huge = {**ACME, "headcountRange": "10 000 salariés et plus"}
    tiny_esn = {**PROFILE, "size": "1-10"}
    result = score_candidate(huge, profile=tiny_esn, now=TODAY)
    proportion = next(f for f in _addr(result)["factors"] if f["axis"] == "proportion")
    assert proportion["points"] == 0
    # Zéro n'est pas une pénalité : c'est un fit nul, et le message le dit.
    assert "filiale" in proportion["evidence"].lower() or "direct" in proportion["evidence"].lower()


def test_proportion_rewards_a_company_sized_for_the_firm() -> None:
    small = {**ACME, "headcountRange": "100 à 199 salariés"}
    tiny_esn = {**PROFILE, "size": "1-10"}
    result = score_candidate(small, profile=tiny_esn, now=TODAY)
    proportion = next(f for f in _addr(result)["factors"] if f["axis"] == "proportion")
    assert proportion["points"] == 5


def test_proportion_needs_both_sides_like_every_other_axis() -> None:
    no_headcount = {**ACME, "headcountRange": None}
    result = score_candidate(no_headcount, profile={**PROFILE, "size": "1-10"}, now=TODAY)
    assert "proportion" in _addr(result)["unmeasured"]

    result = score_candidate({**ACME, "headcountRange": "100 à 199 salariés"}, profile={}, now=TODAY)
    assert "proportion" in _addr(result)["unmeasured"]


def test_the_three_axes_that_registry_stage_cannot_know_are_named() -> None:
    """Chemin, relation et coût d'accès ne sont pas connaissables au stade
    registre : le chemin suppose un graphe d'accès, la relation suppose la
    couche zéro, le coût est DÉCLARATIF. Les taire ferait lire un 11/11 comme
    un 11/20.

    ⚠️ #1631.5 — « au stade REGISTRE », et c'est ici tout le sujet : la relation
    se mesure depuis Phase 1, qui reçoit le relevé du CRM de l'ESN. Un candidat
    de Découvrir n'en a pas — par définition, un prospect qu'on découvre n'est
    pas déjà dans le CRM. L'axe reste donc NON MESURÉ sur ce chemin-ci, jamais
    à zéro. Le cas symétrique est tenu par GA-272
    (``test_discover_scoring_addressability_axes.py``)."""
    result = score_candidate(ACME, profile=PROFILE, now=TODAY)
    for axis in ("path", "relation", "access_cost"):
        assert axis in _addr(result)["unmeasured"]


def test_the_denominator_is_the_sum_of_the_measurable_axes_only() -> None:
    result = score_candidate(
        {**ACME, "headcountRange": "100 à 199 salariés"},
        profile={**PROFILE, "size": "1-10"},
        signals=[{"type": "award", "label": "marché attribué", "date": "2026-06-01"}],
        now=TODAY,
    )
    # verrouillage (6) + proportion (5) = 11 ; les trois autres sortent.
    assert _addr(result)["max"] == 11
    assert _addr(result)["score"] == sum(f["points"] for f in _addr(result)["factors"])


def test_nothing_measurable_yields_no_score_rather_than_a_zero() -> None:
    result = score_candidate({**ACME, "headcountRange": None}, profile={}, now=TODAY)
    assert _addr(result)["score"] is None
    assert _addr(result)["max"] == 0


def test_the_five_axes_sum_to_the_twenty_points_the_scale_reserves() -> None:
    from app.services.discover_scoring import _ADDRESSABILITY_AXES, _MAX_ACCESSIBILITY

    assert sum(maximum for _axis, maximum in _ADDRESSABILITY_AXES) == _MAX_ACCESSIBILITY


def test_it_surface_reads_size_and_technical_signals_not_the_naf_code() -> None:
    """Une banque n'a aucun code NAF technique et pilote une des plus grosses
    DSI de France : lire la surface informatique dans le NAF exclurait
    précisément les meilleurs comptes."""
    bank = {**ACME, "nafCode": "64.19Z", "sector": "Autres intermédiations monétaires", "headcountRange": "500 à 999 salariés"}
    result = score_candidate(bank, now=TODAY)
    assert _points_for(result, "surface informatique") > 0


def test_it_surface_adds_up_hiring_and_stack_signals() -> None:
    small = {**ACME, "headcountRange": "10 à 19 salariés"}
    with_signals = score_candidate(
        small,
        signals=[
            {"type": "hiring", "label": "3 postes data", "date": "2026-06-01"},
            {"type": "tech", "label": "Kubernetes détecté", "date": "2026-06-01"},
        ],
        now=TODAY,
    )
    without = score_candidate(small, now=TODAY)
    assert _points_for(with_signals, "surface informatique") > _points_for(without, "surface informatique")


def test_it_surface_is_unmeasured_when_nothing_is_known() -> None:
    nameless = {"name": "X", "siren": "111222333"}
    assert "it_surface" in score_candidate(nameless, now=TODAY)["unmeasured"]


def test_evidence_quality_now_counts_in_the_score() -> None:
    """Deux candidats également notés ne se valent pas si l'un repose sur un
    dossier complet et l'autre sur trois champs vides. Le produit calculait déjà
    cet axe et se contentait de l'afficher à côté."""
    complete = score_candidate(ACME, now=TODAY)
    partial = score_candidate({"name": ACME["name"], "siren": ACME["siren"]}, now=TODAY)
    assert _points_for(complete, "qualité des preuves") > _points_for(partial, "qualité des preuves")


def test_evidence_quality_is_unmeasurable_without_a_resolved_identity() -> None:
    # Sans SIREN, l'identité n'est pas résolue : on ne peut rien dire de la
    # qualité des preuves, pas même « mauvaise ».
    assert "evidence" in score_candidate({"name": "SANS SIREN"}, now=TODAY)["unmeasured"]


# ── Le tri proposé d'entrée (§8.3) ──────────────────────────────────────────


def test_a_starting_firm_opens_on_addressability() -> None:
    """« Une ESN de moins de 5 consultants ouvre Découvrir trié par
    adressabilité. » C'est la différence entre un outil qui sert à démarrer et
    un outil qui sert à couvrir un portefeuille."""
    from app.services.discover_scoring import recommended_sort

    assert recommended_sort({"size": "1-10"}) == "addressability"


def test_an_established_firm_opens_on_interest() -> None:
    from app.services.discover_scoring import recommended_sort

    assert recommended_sort({"size": "80-200"}) == "interest"
    assert recommended_sort({"size": "500+"}) == "interest"


def test_a_mid_sized_firm_opens_balanced() -> None:
    from app.services.discover_scoring import recommended_sort

    assert recommended_sort({"size": "10-30"}) == "balanced"


def test_no_profile_bets_on_nothing() -> None:
    """Proposer l'intérêt à une ESN dont on ignore la taille lui montrerait
    d'abord les comptes qu'elle a le moins de chances d'ouvrir."""
    from app.services.discover_scoring import recommended_sort

    assert recommended_sort(None) == "balanced"
    assert recommended_sort({}) == "balanced"
    assert recommended_sort({"size": "illisible"}) == "balanced"


# ── #2490 — la liste de codes et le territoire, lus en entier ───────────────


def test_a_naf_code_inside_the_requested_list_is_an_exact_match() -> None:
    # #2490.5 — l'écran envoie « 64.19Z,62.02A,… » : comparée en bloc, la liste
    # ne rendait jamais « exact ».
    result = score_candidate(ACME, filters={"nafCode": "64.19Z,62.02A,62.01Z"}, now=TODAY)
    exact = [f for f in result["factors"] if f.get("label_key") == "factors.nafExact"]
    assert [f["points"] for f in exact] == [10]
    assert "62.02A" in exact[0]["evidence"]


def test_a_division_match_names_the_code_of_the_same_division() -> None:
    result = score_candidate(ACME, filters={"nafCode": "64.19Z,62.01Z"}, now=TODAY)
    division = [f for f in result["factors"] if f.get("label_key") == "factors.nafDivision"]
    assert [f["label_params"]["code"] for f in division] == ["62.01Z"]


def test_a_head_office_in_any_requested_department_scores_the_zone() -> None:
    # #2490.6 — le second département du territoire valait 0.
    result = score_candidate(ACME, filters={"department": "31", "departments": ["31", "69"]}, now=TODAY)
    assert "factors.geoDepartmentRequested" in {f.get("label_key") for f in result["factors"]}
    assert "geography" not in result["unmeasured"]
    outside = score_candidate(ACME, filters={"departments": ["31", "33"]}, now=TODAY)
    assert "factors.geoDepartmentRequested" not in {f.get("label_key") for f in outside["factors"]}
    assert "geography" not in outside["unmeasured"], "hors zone est une MESURE, pas une absence"
