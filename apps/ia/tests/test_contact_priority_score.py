"""Contact Priority Score /100 — canonical grid 03_BUSINESS_RULES §3.

Deterministic barème: each of the 6 criteria bounded to its cap, the total is
Σ(criteria) (≤ 100), each criterion tied to a proof, profileData (§9) shifts the
weighting, and an unevaluable criterion scores 0 (never an invented bonus).
"""

from __future__ import annotations

from app.services.contact_priority_score import (
    CONTACT_SCORE_CRITERIA,
    CONTACT_SCORE_MAX,
    CONTACT_SCORE_PASTILLE_CRITERIA,
    SellerContext,
    contact_priority_breakdown,
    contact_priority_coverage,
    contact_priority_score,
    contact_reachability,
    deterministic_priority,
    priority_band,
    priority_rank_from_score,
    seller_context_from_profile,
)

# A top-of-funnel decider: technical C-level, verified email, P1 perimeter, angle
# match, fresh Apollo source. Should score near the ceiling.
STRONG = {
    "role": "technical",
    "title": "DSI Groupe",
    "email": "dsi@cible.com",
    "emailVerified": True,
    "source": "apollo",
    "perimeterTier": "P1",
    "angleMatch": True,
}
# A gatekeeper with only a LinkedIn from a weak source, out-of-sector entity.
WEAK = {
    "role": "blocker",
    "title": "Assistant",
    "linkedinUrl": "https://linkedin.com/in/x",
    "source": "ia_reconstruction",
    "entityRelevance": "out_of_sector",
    "angleMatch": False,
}


def test_criteria_caps_are_the_drive_grid():
    """Lot 758 : la taxonomie garde ``accessibility`` NOMMÉE (jumeau GA-08) mais en
    pastille ; les critères NOTÉS font 30/20/15/25/10 = 100."""
    assert [(k, m) for k, _, m in CONTACT_SCORE_CRITERIA] == [
        ("role", 30),
        ("proximity", 20),
        ("seniority", 15),
        ("accessibility", 15),
        ("angle_fit", 25),
        ("freshness", 10),
    ]
    assert {"accessibility"} == CONTACT_SCORE_PASTILLE_CRITERIA
    assert CONTACT_SCORE_MAX == 100


def test_each_criterion_is_bounded_and_total_never_exceeds_100():
    for contact in (STRONG, WEAK, {}, {"role": "economic", "title": "CEO"}):
        bd = contact_priority_breakdown(contact)
        for item in bd:
            assert 0 <= item["points"] <= item["max"]
        assert 0 <= contact_priority_score(contact) <= 100
        # With FULL coverage the total is literally Σ(points) — the number and its
        # justification cannot drift. With partial coverage it is Σ(evaluated
        # points) read over Σ(their caps): a criterion we could not evaluate leaves
        # the denominator instead of silently costing the contact points.
        # Le plancher de preuve p26 (« bloquant si faible ») peut abaisser le
        # total — mais jamais en silence : quand il s'applique, la couverture le
        # DÉCLARE, et le score reste exactement min(justification, plancher).
        cov = contact_priority_coverage(bd, contact)
        brut = (
            sum(i["points"] for i in bd)
            if cov["evaluatedMax"] == 100
            else round(cov["points"] * 100 / cov["evaluatedMax"])
        )
        attendu = min(brut, cov["proofFloor"]) if "proofFloor" in cov else brut
        assert contact_priority_score(contact) == attendu


def test_score_is_sum_of_breakdown_with_the_expected_points():
    bd = {i["criterion"]: i["points"] for i in contact_priority_breakdown(STRONG)}
    # 28 technical + 20 P1 + 12 direction (DSI) + 25 offre/angle + 10 apollo — the
    # verified e-mail is a pastille (lot 758), not points.
    assert bd == {
        "role": 28,
        "proximity": 20,
        "seniority": 12,
        "angle_fit": 25,
        "freshness": 10,
    }
    assert contact_priority_score(STRONG) == 95


def test_every_criterion_carries_a_proof():
    for item in contact_priority_breakdown(STRONG):
        assert item["proof"], f"{item['criterion']} sans preuve"
        assert item["label"]
    # The proofs name the real signal, not a generic filler.
    proofs = {i["criterion"]: i["proof"] for i in contact_priority_breakdown(STRONG)}
    assert "technique" in proofs["role"]
    assert "P1" in proofs["proximity"]
    assert "accessibility" not in proofs
    assert contact_reachability(STRONG) == {"kind": "verified_email", "proof": "email vérifié"}
    assert "Apollo" in proofs["freshness"]


def test_bands_follow_the_score():
    assert priority_band(contact_priority_score(STRONG)) == "haute"
    assert priority_band(70) == "haute"
    assert priority_band(69) == "moyenne"
    assert priority_band(45) == "moyenne"
    assert priority_band(44) == "faible"
    assert priority_band(contact_priority_score(WEAK)) == "faible"


def test_strong_outscores_weak():
    assert contact_priority_score(STRONG) > contact_priority_score(WEAK)


def test_unevaluable_criterion_scores_zero_never_invents_a_bonus():
    """A bare contact (no role, no channel, out-of-sector) scores 0 on those
    criteria — documented absence, not a fabricated middle."""
    bare = {"title": "Analyste", "entityRelevance": "noise", "angleMatch": False, "source": "unknown"}
    bd = {i["criterion"]: i["points"] for i in contact_priority_breakdown(bare)}
    assert bd["role"] == 0  # no weighted role
    assert "accessibility" not in bd  # lot 758 — reachability is a pastille
    assert contact_reachability(bare) is None  # no channel → no pastille, never « injoignable »
    assert bd["proximity"] == 0  # noise entity
    assert bd["angle_fit"] == 0  # explicitly out of the angles
    # Freshness for an unknown source defaults to the neutral middle (5), documented.
    assert bd["freshness"] == 5


def test_profile_data_influences_the_score_section_9():
    """Drive §9 — the seller profile shifts the barème: an ESN whose expertise is
    cyber values a technical decider (RSSI) more than a profile-agnostic scoring."""
    rssi = {"role": "technical", "title": "RSSI", "source": "apollo"}
    agnostic = contact_priority_score(rssi)
    cyber_seller = SellerContext(
        priority_roles=frozenset({"technical"}), focus_themes=frozenset({"cyber", "rssi"})
    )
    boosted = contact_priority_score(rssi, cyber_seller)
    assert boosted > agnostic
    # The role proof states the profile priorité.
    role_item = next(i for i in contact_priority_breakdown(rssi, cyber_seller) if i["criterion"] == "role")
    assert "profil" in role_item["proof"]


def test_profile_boost_respects_the_role_cap():
    """The §9 boost lifts toward the /30 cap but never past it: an economic buyer
    already at 30 stays at 30 (no over-cap bonus)."""
    econ = {"role": "economic", "title": "CFO", "source": "apollo"}
    seller = SellerContext(priority_roles=frozenset({"economic"}))
    role_item = next(i for i in contact_priority_breakdown(econ, seller) if i["criterion"] == "role")
    assert role_item["points"] == 30


def test_empty_seller_context_is_neutral():
    """No profile → identical to the profile-agnostic grid (no live score shifts)."""
    assert contact_priority_score(STRONG, SellerContext()) == contact_priority_score(STRONG)
    assert contact_priority_score(STRONG, None) == contact_priority_score(STRONG)


def test_focus_themes_lift_the_angle_fit_from_the_title():
    """A seller focus theme that matches the contact's title supplies the fit-angle
    boost even without an explicit angleMatch (Drive §9)."""
    contact = {"role": "technical", "title": "Responsable Cybersécurité", "source": "apollo"}
    seller = SellerContext(focus_themes=frozenset({"cybersecurite"}))
    base = next(i for i in contact_priority_breakdown(contact) if i["criterion"] == "angle_fit")["points"]
    lifted = next(i for i in contact_priority_breakdown(contact, seller) if i["criterion"] == "angle_fit")["points"]
    assert base == 0  # not evaluated (no angle context) — excluded, not scored a neutral
    assert lifted == 25  # matched the seller's offer (lot 758 : /25)


def test_lot758_un_head_of_data_passe_devant_un_chef_de_l_architecture_pour_une_esn_data():
    """Julien : la porte d'entrée était le chef de l'architecture au lieu du chef data.
    Même rôle MEDDIC, même source ; l'architecte a même un e-mail VÉRIFIÉ — la joignabilité
    ne pèse plus, seul le rôle face à l'offre les sépare."""
    data_esn = seller_context_from_profile({"offers": ["Data & IA"]})
    head_of_data = {"role": "technical", "title": "Head of Data", "source": "apollo", "email": "a@x.fr"}
    architect = {
        "role": "technical", "title": "Directeur de l'architecture", "source": "apollo",
        "email": "b@x.fr", "emailVerified": True,
    }
    assert contact_priority_score(head_of_data, data_esn) > contact_priority_score(architect, data_esn)
    offer = next(i for i in contact_priority_breakdown(architect, data_esn) if i["criterion"] == "angle_fit")
    assert offer["points"] == 0 and offer["evaluated"] is True
    assert offer["proof"] == "hors de ton offre"


def test_lot758_la_joignabilite_ne_change_jamais_le_score():
    base = {"role": "technical", "title": "Head of Data", "source": "apollo"}
    sans = contact_priority_score(base)
    assert contact_priority_score({**base, "email": "a@x.fr", "emailVerified": True}) == sans
    assert contact_priority_score({**base, "linkedinUrl": "https://linkedin.com/in/x"}) == sans


def test_lot758_un_rssi_reste_dans_l_offre_d_une_esn_cyber():
    """Les familles de métier : « RSSI » ne partage aucun mot avec « cybersécurité »."""
    cyber = seller_context_from_profile({"offers": ["cybersécurité"]})
    offer = next(
        i for i in contact_priority_breakdown({"title": "RSSI", "role": "technical"}, cyber)
        if i["criterion"] == "angle_fit"
    )
    assert offer["points"] == 25


def test_employer_mismatch_collapses_freshness():
    """A row whose current employer left the target is stale → freshness = 1,
    whatever the source."""
    stale = {**STRONG, "employerMismatch": True}
    fresh = next(i for i in contact_priority_breakdown(stale) if i["criterion"] == "freshness")
    assert fresh["points"] == 1
    assert "obsolète" in fresh["proof"]


def test_seller_context_from_profile_derives_themes_and_roles():
    """A cyber/data profile yields technical priority-roles + expertise focus
    themes; an empty/absent profile → empty (neutral) context."""
    profile = {"expertise_areas": ["Cybersécurité & SOC", "Data Engineering"]}
    ctx = seller_context_from_profile(profile)
    assert "technical" in ctx.priority_roles
    assert any("cyber" in t or "secur" in t for t in ctx.focus_themes)
    assert seller_context_from_profile(None).is_empty
    assert seller_context_from_profile({}).is_empty


def test_priority_rank_is_band_faithful_to_the_100():
    """1-5 tri bucket projected from the /100, faithful to the haute/moyenne/faible
    bands (haute ≥70 → 1-2, moyenne 45-69 → 3, faible <45 → 4-5)."""
    assert priority_rank_from_score(100) == 1
    assert priority_rank_from_score(85) == 1
    assert priority_rank_from_score(84) == 2
    assert priority_rank_from_score(70) == 2
    assert priority_rank_from_score(69) == 3
    assert priority_rank_from_score(45) == 3
    assert priority_rank_from_score(44) == 4
    assert priority_rank_from_score(30) == 4
    assert priority_rank_from_score(29) == 5
    assert priority_rank_from_score(0) == 5


def test_priority_rank_clamps_out_of_range_input():
    assert priority_rank_from_score(150) == 1
    assert priority_rank_from_score(-10) == 5


def test_deterministic_priority_top_decider_is_rank_1_weak_is_rank_5():
    """The tri priority follows the explained /100, not the model's mood."""
    assert deterministic_priority(STRONG) == 1
    assert deterministic_priority(WEAK) == 5


def test_seller_boost_never_worsens_the_deterministic_rank():
    """Scoring a technical contact through a cyber seller's lens can only lift its
    rank toward 1, never push it down."""
    seller = seller_context_from_profile({"expertise_areas": ["cybersécurité", "SOC"]})
    tech = {
        "role": "technical",
        "title": "Responsable Cybersécurité",
        "email": "rssi@cible.com",
        "source": "apollo",
    }
    assert deterministic_priority(tech, seller) <= deterministic_priority(tech, None)


# ── Séniorité NON MESURÉE ≠ séniorité basse (item 80 du Recovery Pack) ────────


def test_an_unreadable_title_stops_claiming_a_rank():
    """Sans titre exploitable, la preuve cesse d'affirmer « Opérationnel ».

    C'est TOUT ce qui change : l'axe reste évalué à 0 et dans le dénominateur.
    Il appartient à la famille des absences qui sont un FAIT SUR LA LIGNE (comme
    « aucun canal joignable »), pas à celle des trous de connaissance sur le
    COMPTE (périmètre, angle), qui seuls sortent du calcul."""
    contact = {"fullName": "Jane Doe", "title": "", "email": "jane@acme.fr", "source": "apollo"}
    axes = {i["criterion"]: i for i in contact_priority_breakdown(contact)}
    assert axes["seniority"]["evaluated"] is True
    assert axes["seniority"]["points"] == 0
    assert "Opérationnel" not in axes["seniority"]["proof"]
    assert "inconnu" in axes["seniority"]["proof"]


def test_not_knowing_a_job_never_makes_a_contact_rank_higher():
    """La garde qui a fait revenir sur la première version du correctif.

    Mesuré : en sortant l'axe du dénominateur, un contact SANS titre marquait 45
    quand le même contact intitulé « Analyste » marquait 39 — le dénominateur
    rétrécit plus vite que le numérateur, et l'ignorance devenait un avantage de
    classement."""
    base = {"fullName": "Jane Doe", "email": "jane@acme.fr", "source": "apollo"}
    sans_titre = contact_priority_score({**base, "title": ""})
    avec_titre = contact_priority_score({**base, "title": "Analyste"})
    assert sans_titre < avec_titre


def test_a_present_title_keeps_its_seniority_points():
    """« Opérationnel » est une mesure, pas une absence : un titre présent garde
    ses points, même bas."""
    contact = {"fullName": "Jane Doe", "title": "Développeur", "email": "jane@acme.fr", "source": "apollo"}
    axes = {i["criterion"]: i for i in contact_priority_breakdown(contact)}
    assert axes["seniority"]["evaluated"] is True
    assert axes["seniority"]["points"] == 2

