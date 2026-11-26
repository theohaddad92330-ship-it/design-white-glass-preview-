"""#4115 — la grille de signaux de Découvrir : garder / rejeter PAR TYPE, et le
classement adéquation › fraîcheur › force (deux signaux indépendants battent un
seul signal fort). Aucune probabilité, aucun pourcentage."""

from __future__ import annotations

import pytest

from app.services.discover_signal_grid import (
    CONTEXT,
    MAX_CONTEXT,
    MAX_STRONG,
    SIGNAL_GRID,
    STRONG,
    arrange_signals,
    candidate_rank_key,
    decide_signal,
)


def sig(type_: str, label: str = "Un fait utile", date: str = "2026-10-01", **extra) -> dict:
    return {"type": type_, "label": label, "date": date, **extra}


# ── La table : chaque type connu a une décision, l'inconnu est rejeté ───────


def test_grid_decides_every_known_type_explicitly() -> None:
    expected = {
        "hiring",
        "tender",
        "award",
        "funding",
        "nomination",
        "business",
        "tech",
        "headcount",
        "legal",
    }
    assert expected <= set(SIGNAL_GRID)
    for rule in SIGNAL_GRID.values():
        assert isinstance(rule.keep, bool)
        assert rule.reason
        if rule.keep:
            assert rule.tier in (STRONG, CONTEXT)


@pytest.mark.parametrize(
    ("type_", "tier"),
    [
        ("hiring", STRONG),
        ("tender", STRONG),
        ("award", STRONG),
        ("funding", STRONG),
        ("nomination", STRONG),
        ("business", CONTEXT),
        ("tech", CONTEXT),
        ("headcount", CONTEXT),
        ("legal", CONTEXT),
    ],
)
def test_known_type_is_kept_with_its_tier(type_: str, tier: str) -> None:
    decision = decide_signal(sig(type_))
    assert decision.keep is True
    assert decision.tier == tier


def test_unknown_type_is_rejected() -> None:
    decision = decide_signal(sig("horoscope"))
    assert decision.keep is False
    assert decision.reason == "unknown_type"


def test_missing_type_is_rejected() -> None:
    assert decide_signal({"label": "x", "date": "2026-10-01"}).keep is False


# ── Les règles de contenu ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    "label",
    ["Stage développeur Python", "Internship - Data Engineer", "CS27 Bac5 Stage ingénieur", "Stagiaire DevOps"],
)
def test_internship_offer_is_rejected(label: str) -> None:
    decision = decide_signal(sig("hiring", label=label))
    assert decision.keep is False
    assert decision.reason == "internship"


def test_internship_detected_in_detail_too() -> None:
    assert decide_signal(sig("hiring", label="Développeur", detail="Stage · Toulouse")).keep is False


@pytest.mark.parametrize(
    "extra",
    [
        {"label": "Alternance développeur Java"},
        {"label": "Développeur Java en alternance"},
        {"label": "Apprenti ingénieur DevOps"},
        {"label": "Développeur", "detail": "Contrat d'apprentissage · Lyon"},
        {"label": "Développeur", "contractType": "Alternance"},
    ],
)
def test_work_study_offer_is_visible_but_never_strong(extra: dict) -> None:
    # Louis 13/10 : l'alternance reste visible, jamais un signal fort -> contexte.
    decision = decide_signal(sig("hiring", **extra))
    assert decision.keep is True
    assert decision.tier == CONTEXT


def test_account_with_only_work_study_keeps_signals_in_context() -> None:
    out = arrange_signals(
        [
            sig("hiring", label="Alternance développeur Java", date="2026-10-10"),
            sig("hiring", label="Apprenti data engineer", date="2026-10-09"),
        ]
    )
    assert len(out) == 2
    assert {s["tier"] for s in out} == {CONTEXT}


def test_hiring_is_not_filtered_by_a_fixed_it_list() -> None:
    # Signaux de recrutement = secteur de l'ESN, pas de filtre IT fixe (09/10).
    for label in ("Ingénieur process industrie", "Responsable cybersécurité", "Chef de projet SAP"):
        assert decide_signal(sig("hiring", label=label)).keep is True


def test_intermediated_hiring_is_context_not_strong() -> None:
    decision = decide_signal(sig("hiring", intermediated=True))
    assert decision.keep is True
    assert decision.tier == CONTEXT


def test_signal_without_date_or_title_is_noise() -> None:
    assert decide_signal(sig("hiring", date="")).keep is False
    assert decide_signal(sig("business", label="   ")).keep is False


def test_detected_date_is_never_a_why_now() -> None:
    decision = decide_signal(sig("funding", dateIsDetection=True))
    assert decision.keep is True
    assert decision.tier == CONTEXT


@pytest.mark.parametrize(
    "label",
    ["Résultats financiers 2025 : chiffre d'affaires en hausse", "Dépôt des comptes annuels", "Rapport financier semestriel"],
)
def test_generic_financial_news_is_rejected(label: str) -> None:
    decision = decide_signal(sig("business", label=label))
    assert decision.keep is False
    assert decision.reason == "generic_financial"


@pytest.mark.parametrize(
    "label",
    [
        "Nomination d'un nouveau DSI",
        "Lancement d'un programme de transformation SI",
        "Levée de fonds de 20 M€",
        "Signature d'un contrat cadre avec la région",
    ],
)
def test_business_news_naming_a_strong_fact_is_strong(label: str) -> None:
    decision = decide_signal(sig("business", label=label))
    assert decision.keep is True
    assert decision.tier == STRONG


def test_plain_business_news_is_context() -> None:
    decision = decide_signal(sig("business", label="Participation au salon VivaTech"))
    assert decision.tier == CONTEXT


# ── L'ordre d'un signal : adéquation › fraîcheur › force ────────────────────


def test_fresher_signal_first_at_equal_adequation() -> None:
    old = sig("hiring", label="Offre ancienne", date="2026-08-01")
    fresh = sig("hiring", label="Offre récente", date="2026-10-10")
    out = arrange_signals([old, fresh])
    assert [s["label"] for s in out] == ["Offre récente", "Offre ancienne"]


def test_adequation_beats_freshness() -> None:
    fresh = sig("hiring", label="Frais mais hors sujet", date="2026-10-10")
    fit = sig("hiring", label="Plus ancien mais recoupe la recherche", date="2026-09-01", keywordMatch=True)
    out = arrange_signals([fresh, fit])
    assert out[0]["label"].startswith("Plus ancien")


def test_strength_breaks_a_tie_on_freshness() -> None:
    context = sig("tech", label="Pile technique observée", date="2026-10-01")
    strong = sig("tender", label="Appel d'offres", date="2026-10-01")
    out = arrange_signals([context, strong])
    assert out[0]["label"] == "Appel d'offres"


def test_same_fact_from_two_sources_is_one_line() -> None:
    a = sig("hiring", label="Développeur Java", date="2026-10-01")
    b = sig("hiring", label="développeur java", date="2026-10-01")
    assert len(arrange_signals([a, b])) == 1


# ── Le plafond 5 forts + 10 contexte ────────────────────────────────────────


def test_cap_is_five_strong_and_ten_context() -> None:
    # Arbitrage intégration 15/10 : R17 voulait 4 forts — la décision de Louis du 13/10 (5) tient.
    strong = [sig("hiring", label=f"Offre {i}", date=f"2026-10-{i + 1:02d}") for i in range(8)]
    context = [sig("tech", label=f"Techno {i}", date=f"2026-09-{i + 1:02d}") for i in range(14)]
    out = arrange_signals([*strong, *context])
    assert sum(1 for s in out if s["tier"] == STRONG) == MAX_STRONG == 5
    assert sum(1 for s in out if s["tier"] == CONTEXT) <= MAX_CONTEXT == 10
    assert len(out) == 15


def test_strong_overflow_is_demoted_to_context_not_lost() -> None:
    strong = [sig("hiring", label=f"Offre {i}", date=f"2026-10-{i + 1:02d}") for i in range(7)]
    out = arrange_signals(strong)
    assert [s["tier"] for s in out].count(STRONG) == 5
    assert [s["tier"] for s in out].count(CONTEXT) == 2


def test_no_probability_field_anywhere() -> None:
    out = arrange_signals([sig("hiring"), sig("tender"), sig("tech")])
    forbidden = ("prob", "chance", "percent", "pct", "likelihood")
    for s in out:
        assert not any(any(f in key.lower() for f in forbidden) for key in s)


def test_rejected_signals_are_dropped_from_the_arrangement() -> None:
    out = arrange_signals([sig("hiring", label="Stage data"), sig("horoscope"), sig("tender")])
    assert [s["type"] for s in out] == ["tender"]


# ── L'ordre d'un compte : deux indépendants battent un seul fort ────────────


def test_two_independent_weak_signals_beat_one_strong_alone() -> None:
    strong_alone = arrange_signals([sig("tender", date="2026-10-12")])
    two_weak = arrange_signals(
        [
            sig("tech", label="Pile technique", date="2026-09-20"),
            sig("legal", label="Cession de fonds", date="2026-09-25"),
        ]
    )
    assert candidate_rank_key(two_weak) < candidate_rank_key(strong_alone)


def test_two_signals_from_the_same_source_are_not_independent() -> None:
    same_source = arrange_signals(
        [sig("hiring", label="Offre A", date="2026-09-20"), sig("hiring", label="Offre B", date="2026-09-21")]
    )
    strong_fresh = arrange_signals([sig("tender", date="2026-10-12")])
    assert candidate_rank_key(strong_fresh) < candidate_rank_key(same_source)


def test_account_order_freshest_first_at_equal_adequation_and_independence() -> None:
    fresh = arrange_signals([sig("tender", date="2026-10-12")])
    old = arrange_signals([sig("tender", date="2026-08-01")])
    assert candidate_rank_key(fresh) < candidate_rank_key(old)


def test_account_adequation_beats_corroboration() -> None:
    fit = arrange_signals([sig("hiring", keywordMatch=True, date="2026-08-01")])
    corroborated = arrange_signals([sig("tender", date="2026-10-01"), sig("tech", date="2026-10-02")])
    assert candidate_rank_key(fit) < candidate_rank_key(corroborated)


def test_account_without_signal_sorts_last() -> None:
    assert candidate_rank_key(arrange_signals([sig("tender")])) < candidate_rank_key([])


# ── V4-CORRECTIFS-C 4284.23 — la variété des natures survit au plafond ──────


def test_every_nature_present_survives_the_cap_even_under_a_flood_of_offers() -> None:
    # 20 offres fraîches noient 5 forts + 10 contexte ; la levée, le marché et la nomination, plus anciens,
    # étaient coupés : la carte ne disait plus que « RECRUTEMENT » alors que la donnée existait.
    offers = [sig("hiring", f"Offre {i}", date="2026-10-1" + str(i % 9)) for i in range(20)]
    older = [
        sig("funding", "Levée de 10 M€", date="2026-06-01"),
        sig("tender", "Marché de SI", date="2026-05-01"),
        sig("nomination", "Nouveau DSI", date="2026-04-01"),
        sig("tech", "Pile observée", date="2026-03-01"),
    ]
    out = arrange_signals([*offers, *older])
    assert {s["type"] for s in out} == {"hiring", "funding", "tender", "nomination", "tech"}
    assert len([s for s in out if s["tier"] == STRONG]) <= MAX_STRONG
    assert len([s for s in out if s["tier"] == CONTEXT]) <= MAX_CONTEXT


def test_variety_does_not_reorder_what_is_kept() -> None:
    # La garde sait dire NON : sans plafond atteint, l'ordre adéquation › fraîcheur › force est inchangé.
    out = arrange_signals([sig("funding", date="2026-06-01"), sig("hiring", "Dev", date="2026-10-02")])
    assert [s["type"] for s in out] == ["hiring", "funding"]
