"""Registre des règles métier (roadmap §14 / §17 P1) : chaque règle critique a un
STATUT et — dès qu'elle est ``tested``/``active`` — un test qui prouve qu'elle est
RÉELLEMENT appliquée.

Deux familles de tests :

1. **Preuves d'application** — un test par règle active vérifie que la règle
   produit bien son effet (la grille /25 rend le bon verdict sur un cas connu ;
   une exclusion écarte un faux positif ; un signal vieux passe en archive…).
   Le nom de chaque test correspond au ``test_ref`` déclaré dans le registre.

2. **Garde-fous du registre** — auto-cohérence + anti-dérive : une règle ne peut
   pas passer ``active``/``tested`` sans test associé, ni ``specified`` en
   revendiquant du code ; le fingerprint est déterministe ; le stamp par run est
   bien câblé dans les métadonnées de la phase 1.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.config.knowledge_config import clear_overrides, set_overrides
from app.knowledge.business_rules import (
    BUSINESS_RULES,
    BusinessRule,
    RuleStatus,
    active_rule_ids,
    all_rules,
    business_rules_fingerprint,
    business_rules_registry_version,
    business_rules_run_stamp,
    business_rules_status,
    get_rule,
    rules_requiring_tests,
    status_counts,
    validate_registry,
)

# ── Cibles réelles des règles (les services / prompts qui les implémentent) ───
from app.prompts.bellum_facts import build_system_prompt as facts_prompt
from app.prompts.bellum_strategy import build_system_prompt as strategy_prompt
from app.services.account_score import (
    SCORE_AXES,
    SCORE_MAX,
    cap_score_for_quality,
    score_from_breakdown,
    verdict_for_score,
    verdict_from_global_score,
)
from app.services.contact_priority_score import (
    CONTACT_SCORE_CRITERIA,
    CONTACT_SCORE_MAX,
    SellerContext,
    contact_priority_breakdown,
    contact_priority_score,
    priority_band,
)
from app.services.entities import classify_entity_relevance, derive_no_go_keywords
from app.services.group_relationship import detect_insider
from app.services.perimeter_score import (
    perimeter_score,
    perimeter_tier,
    select_priority_perimeters,
)
from app.services.score_axes import commercial_score_100
from app.services.signal_freshness import (
    FRESHNESS_ARCHIVE,
    FRESHNESS_CURRENT,
    FRESHNESS_UNDATED,
    classify_signal_freshness,
    stamp_signals_freshness,
)
from app.services.source_quality import is_weak_source


@pytest.fixture(autouse=True)
def _reset_overrides():
    clear_overrides()
    yield
    clear_overrides()


# ── 1. Preuves d'application (une par règle active) ──────────────────────────
def test_account_fit_score_25_bands():
    """account_fit_score_25 — 5 axes × 5 = 25, verdict déterministe par bande, et
    le total est RECALCULÉ depuis les axes (pas le total inventé par le LLM)."""
    assert SCORE_MAX == 25
    assert sum(m for _, _, m in SCORE_AXES) == 25
    # Bandes annexe méthodo p25 : GO 20-25 / PRUDENT 14-19 / STOP <14.
    assert verdict_for_score(25) == "GO"
    assert verdict_for_score(20) == "GO"
    assert verdict_for_score(19) == "PRUDENT"
    assert verdict_for_score(14) == "PRUDENT"
    assert verdict_for_score(13) == "STOP"
    # Le total ignore un "total" gonflé et clampe chaque axe à son max (5).
    breakdown = [
        {"axis": "fit_offre", "points": 99},  # clampé à 5
        {"axis": "accessibilite", "points": 5},
        {"axis": "timing", "points": 5},
        {"axis": "concurrence", "points": 5},
        {"axis": "capacite", "points": 5},
    ]
    assert score_from_breakdown(breakdown) == 25


def test_quality_gate_caps_verdict():
    """account_verdict_quality_cap — un dossier jugé inexploitable ne peut pas
    afficher un verdict confiant ; le cap ne fait que BAISSER."""
    # hallucination → au plus PRUDENT (19).
    assert cap_score_for_quality(25, "hallucination") == 19
    assert verdict_for_score(cap_score_for_quality(25, "hallucination")) == "PRUDENT"
    # trop_faible → données manquantes : cap 13 (STOP en bande seule ; EXPLORER
    # quand le call site passe data_complete=False, cf. test_phase4_plan).
    assert cap_score_for_quality(25, "trop_faible") == 13
    assert verdict_for_score(cap_score_for_quality(25, "trop_faible")) == "STOP"
    assert verdict_for_score(cap_score_for_quality(25, "trop_faible"), data_complete=False) == "EXPLORER"
    # Ne monte jamais un score, et un verdict "ok" laisse tel quel.
    assert cap_score_for_quality(8, "hallucination") == 8
    assert cap_score_for_quality(25, "ok") == 25


def test_perimeter_fit_score_20_tiers():
    """perimeter_fit_score_20 — 5 axes × 4 = 20, tiers P1≥14/P2/secondaire, et on
    ne pousse que les périmètres actionnables (getsPlay) triés richest-first."""
    hot = {
        "name": "Cible Digital",
        "relevance": "operating",
        "isItEntity": True,
        "whatToSell": ["cloud"],
        "priorityTier": "P1",
        "accessibilityBand": "high",
        "getsPlay": True,
    }
    cold = {
        "name": "Holding SCI",
        "relevance": "holding",
        "isItEntity": False,
        "whatToSell": [],
        "priorityTier": "P3",
        "accessibilityBand": "low",
        "getsPlay": True,
    }
    excluded = {**cold, "name": "Bruit", "getsPlay": False}
    assert perimeter_score(hot) == 20
    assert perimeter_tier(perimeter_score(hot)) == "P1"
    assert perimeter_tier(perimeter_score(cold)) == "secondaire"
    picked = select_priority_perimeters([cold, hot, excluded])
    # getsPlay=False écarté ; trié /20 décroissant → la cible chaude d'abord.
    assert [p["name"] for p in picked] == ["Cible Digital", "Holding SCI"]
    assert picked[0]["tier"] == "P1"


def test_commercial_score_100_band_faithful():
    """commercial_score_100 — le /100 reste dans la bande du verdict : un 19/25
    PRUDENT tombe en 50-69 (jamais lu comme GO ≥70), un 25/25 GO tombe ≥70."""
    prudent = commercial_score_100({"score": 19})
    assert 50 <= prudent < 70
    assert verdict_from_global_score(prudent / 10) == "PRUDENT"
    go = commercial_score_100({"score": 25})
    assert go >= 70
    assert verdict_from_global_score(go / 10) == "GO"


def test_contact_priority_score_100_grid():
    """contact_fit_score_100 — 6 critères pondérés au point près (Σ = 100), score =
    Σ des critères borné, chaque critère relié à une preuve, profileData influe le
    barème (§9), et un critère non-évaluable = 0 (jamais de bonus inventé)."""
    # Lot 758 : la taxonomie garde l'accessibilité NOMMÉE (pastille, hors score) ; les
    # critères NOTÉS font 30/20/15/25/10 = 100.
    assert CONTACT_SCORE_MAX == 100
    assert [m for _, _, m in CONTACT_SCORE_CRITERIA] == [30, 20, 15, 15, 25, 10]

    # Un décideur technique C-level, email vérifié, périmètre P1, source Apollo,
    # angle apparié → score haut ; chaque critère porte sa preuve.
    strong = {
        "role": "technical",
        "title": "DSI Groupe",
        "email": "dsi@cible.com",
        "emailVerified": True,
        "source": "apollo",
        "perimeterTier": "P1",
        "angleMatch": True,
    }
    breakdown = contact_priority_breakdown(strong)
    assert [b["criterion"] for b in breakdown] == [
        "role", "proximity", "seniority", "angle_fit", "freshness"
    ]
    # 28(technical) + 20(P1) + 12(direction/DSI) + 25(offre/angle) + 10(apollo) = 95.
    assert contact_priority_score(strong) == 95
    assert contact_priority_score(strong) == sum(b["points"] for b in breakdown)
    # Chaque critère est borné à son max ET porte une preuve non vide.
    assert all(0 <= b["points"] <= b["max"] and b["proof"] for b in breakdown)
    assert priority_band(contact_priority_score(strong)) == "haute"

    # profileData influe (§9) : une ESN cyber priorise le rôle technique → le RSSI
    # gagne des points vs un scoring profile-agnostic (même contact).
    rssi = {"role": "technical", "title": "RSSI", "source": "apollo"}
    agnostic = contact_priority_score(rssi)
    cyber_seller = SellerContext(priority_roles=frozenset({"technical"}), focus_themes=frozenset({"cyber"}))
    boosted = contact_priority_score(rssi, cyber_seller)
    assert boosted > agnostic

    # Critère non-évaluable = 0 : un contact nu (aucun rôle) score 0 sur le rôle —
    # documenté, pas de bonus fictif. Lot 758 : l'absence de canal ne coûte plus rien.
    bare = contact_priority_breakdown({"title": "Analyste"})
    role_pts = next(b for b in bare if b["criterion"] == "role")["points"]
    assert role_pts == 0
    assert all(b["criterion"] != "accessibility" for b in bare)


def test_no_go_excludes_declared_sector():
    """no_go_sectors — un secteur no-go déclaré écarte l'entité (déterministe) ET
    est injecté dans le prompt stratégie."""
    kws = derive_no_go_keywords(["Assurance"])
    assert "assurance" in kws
    # Une entité "Assurances" est mise hors périmètre (no play), avec la raison.
    relevance, reason = classify_entity_relevance("Foo Assurances", no_go_keywords=kws)
    assert relevance == "out_of_sector"
    assert "no-go" in reason
    # Sans no-go déclaré, la même entité reste vendable (le gate est profile-neutre).
    relevance_ctrl, _ = classify_entity_relevance("Foo Assurances")
    assert relevance_ctrl == "operating"
    # Le prompt stratégie matérialise le no-go déclaré.
    prompt = strategy_prompt({"offers": ["Cloud"], "noGoSectors": ["Défense"]})
    assert "NO-GO" in prompt
    assert "Défense" in prompt


def test_forbidden_as_fact_in_prompts():
    """forbidden_as_fact — la liste DONNÉES INTERDITES (Drive §8) est explicite
    dans les prompts facts ET stratégie."""
    for prompt in (facts_prompt({"size": "50"}), strategy_prompt({})):
        assert "DONNEES INTERDITES" in prompt
        assert "intention d'achat" in prompt
        assert "date de fin de contrat" in prompt


def test_weak_source_excluded():
    """weak_source_exclusion — ``ia_reconstruction`` est faible ; la liste est
    override-able à chaud (config knowledge)."""
    assert is_weak_source("ia_reconstruction") is True
    assert is_weak_source("pappers") is False
    set_overrides({"sources": {"weak_sources": ["ia_reconstruction", "brave_search"]}})
    assert is_weak_source("brave_search") is True


def test_signal_older_than_24m_is_archive():
    """signal_freshness_24m — > ~24 mois = archive, récent = current, non-daté =
    undated (jamais supposé courant)."""
    today = date(2026, 7, 16)
    assert classify_signal_freshness("2021-03-10", today=today) == FRESHNESS_ARCHIVE
    assert classify_signal_freshness("mars 2026", today=today) == FRESHNESS_CURRENT
    assert classify_signal_freshness("Non daté précisément", today=today) == FRESHNESS_UNDATED
    stamped = stamp_signals_freshness(
        [{"date": "2019"}, {"date": "2026-06"}], today=today
    )
    assert [s["freshness"] for s in stamped] == [FRESHNESS_ARCHIVE, FRESHNESS_CURRENT]


def test_insider_detection_generic_needs_exact():
    """group_insider_detection — un nom d'ESN générique exige un match EXACT ; un
    nom distinctif matche en mot entier à l'intérieur d'une entité du groupe."""
    target = {"company_name": "VINCI", "subsidiaries": [{"name": "VINCI Data"}]}
    # "Data" est générique → pas de match "inside" → pas insider.
    assert detect_insider({"companyName": "Data"}, target) is None
    # Match exact d'un nom générique → insider.
    exact = {"company_name": "VINCI", "subsidiaries": [{"name": "Data"}]}
    assert detect_insider({"companyName": "Data"}, exact) is not None
    # Nom distinctif → match en mot entier à l'intérieur.
    axians = {"company_name": "VINCI", "subsidiaries": [{"name": "Axians Communication"}]}
    hit = detect_insider({"companyName": "Axians"}, axians)
    assert hit is not None and hit["matchedEntity"] == "Axians Communication"


# ── 2. Garde-fous du registre (auto-cohérence + anti-dérive) ─────────────────
def _module_test_names() -> set[str]:
    return {name for name, obj in globals().items() if name.startswith("test_") and callable(obj)}


def test_registry_is_self_consistent():
    """Le registre est cohérent : ids uniques, active⇒applied_in, tested/active⇒
    test_ref, specified⇒aucune revendication de code/test."""
    assert validate_registry() == []


def test_tested_and_active_rules_point_to_a_real_test():
    """GARDE-FOU anti-dérive : une règle ``tested``/``active`` DOIT référencer un
    test qui EXISTE réellement dans ce module — impossible d'« activer » une règle
    sans test associé."""
    known = _module_test_names()
    offenders: list[str] = []
    for rule in rules_requiring_tests():
        if not rule.test_ref:
            offenders.append(f"{rule.id} ('{rule.status.value}') sans test_ref")
            continue
        for ref in rule.test_ref:
            if ref not in known:
                offenders.append(f"{rule.id} référence un test absent : {ref}")
    assert offenders == [], offenders


def test_specified_rule_is_a_visible_gap():
    """Invariant ``specified`` : une règle évoquée dans le Drive mais pas encore
    codée ne revendique NI ``applied_in`` NI ``test_ref`` (gap honnête, rien
    d'inventé). Vaut pour toute règle ``specified`` présente — le registre peut
    n'en avoir aucune si tous les gaps connus sont tranchés."""
    for rule in all_rules():
        if rule.status == RuleStatus.SPECIFIED:
            assert rule.applied_in == ()
            assert rule.test_ref == ()


def test_contact_grid_gap_is_now_closed():
    """La grille contact /100 (gap historique « divergence à trancher ») est
    désormais ACTIVE : implémentée déterministe + prouvée par un test réel."""
    contact = get_rule("contact_fit_score_100")
    assert contact is not None
    assert contact.status == RuleStatus.ACTIVE
    assert contact.applied_in  # où la règle s'applique (impl + miroir)
    assert "test_contact_priority_score_100_grid" in contact.test_ref
    assert contact.id in active_rule_ids()


def test_status_summary_is_readable_and_consistent():
    """business_rules_status — statut global lisible, comptes cohérents."""
    summary = business_rules_status()
    counts = status_counts()
    assert summary["counts"] == counts
    assert summary["total"] == len(all_rules())
    assert sum(counts.values()) == len(all_rules())
    # Le registre recense au moins les grilles de scoring canoniques actives.
    assert counts["active"] >= 1
    assert counts["active"] == len(active_rule_ids())


def test_fingerprint_is_deterministic_and_change_sensitive():
    """Comme le prompt registry : le fingerprint est stable pour un registre donné
    et bouge dès qu'une règle change (statut inclus)."""
    fp1 = business_rules_fingerprint()
    fp2 = business_rules_fingerprint()
    assert fp1 == fp2
    assert set(fp1) == {r.id for r in BUSINESS_RULES}
    # Muter une règle (ici son statut) change SON hash.
    rule = BUSINESS_RULES[0]
    mutated = BusinessRule(
        id=rule.id,
        label=rule.label,
        description=rule.description,
        source=rule.source,
        status=RuleStatus.CODED if rule.status != RuleStatus.CODED else RuleStatus.TESTED,
        applied_in=rule.applied_in,
        test_ref=rule.test_ref,
    )
    assert mutated.fingerprint() != rule.fingerprint()
    # Le LIBELLÉ compte lui aussi : il part dans le contexte du modèle (titre du
    # fragment citable), donc le renommer change ce qui a façonné le run.
    renamed = BusinessRule(
        id=rule.id,
        label=f"{rule.label} (renommée)",
        description=rule.description,
        source=rule.source,
        status=rule.status,
        applied_in=rule.applied_in,
        test_ref=rule.test_ref,
    )
    assert renamed.fingerprint() != rule.fingerprint()


def test_registry_version_is_stable_hex():
    version = business_rules_registry_version()
    assert version == business_rules_registry_version()
    assert len(version) == 12
    int(version, 16)  # bien hexadécimal


def test_run_stamp_shape_and_determinism():
    """business_rules_run_stamp — la forme exacte stampée par run (version + règles
    actives + comptes + fingerprint), déterministe."""
    stamp = business_rules_run_stamp()
    assert set(stamp) == {"version", "active", "counts", "fingerprint"}
    assert stamp["version"] == business_rules_registry_version()
    assert stamp["active"] == active_rule_ids()
    assert stamp["counts"] == status_counts()
    assert stamp["fingerprint"] == business_rules_fingerprint()
    assert business_rules_run_stamp() == stamp


def test_run_stamp_is_wired_in_phase1_metadata():
    """Le stamp est bien câblé dans les métadonnées du run, à côté de
    ``prompt_versions`` (garde contre un retrait silencieux)."""
    src = (
        Path(__file__).resolve().parent.parent / "app" / "routers" / "phase1_research.py"
    ).read_text(encoding="utf-8")
    assert "business_rules_run_stamp()" in src
    assert '["business_rules"]' in src
    assert '["prompt_versions"]' in src
