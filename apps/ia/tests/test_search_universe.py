"""#3208/#214 (épopée #3229) — SEARCH UNIVERSE, paliers de couverture NON
FUSIONNÉS, seuils qualité (non mesuré ≠ 0, GA-18/19) et réponse à une demande
trop large (les meilleurs vérifiés + job + couverture + approfondissement).
"""

from __future__ import annotations

from app.services.search_universe import (
    CoverageReport,
    SearchUniverse,
    broad_request_instruction_block,
    broad_request_response,
    build_search_universe,
    coverage_of_priority_roles,
    coverage_report_lines,
    detect_broad_population_marker,
    entity_coverage,
    exhaustiveness_claim_allowed,
    freshness_coverage,
    precision_at_k,
    unknown_share,
)


# ── SearchUniverse (#214.1) ─────────────────────────────────────────────


def test_search_universe_les_dix_champs():
    universe = SearchUniverse(
        population="décideurs achats des filiales françaises",
        entities_covered=("Filiale A", "Filiale B"),
        geographies=("France",),
        roles=("DAF", "Directeur achats"),
        periods=("2026",),
        sources=("CRM", "recherche publique"),
        exclusions=("filiales cédées",),
        limits=("profils publics uniquement",),
        pagination="50 par page",
        relevance_criteria=("poste actif", "coordonnée pro"),
    )
    wire = universe.to_wire()
    assert set(wire) == {
        "population",
        "entities_covered",
        "geographies",
        "roles",
        "periods",
        "sources",
        "exclusions",
        "limits",
        "pagination",
        "relevance_criteria",
    }
    assert wire["population"] == "décideurs achats des filiales françaises"


def test_search_universe_champs_absents_restent_vides_jamais_devines():
    universe = SearchUniverse(population="tous les décideurs")
    assert universe.entities_covered == ()
    assert universe.pagination is None


# ── build_search_universe (#214.1, réel) — construit à partir d'un message ───


def test_detect_broad_population_marker_on_the_ticket_s_own_examples():
    assert detect_broad_population_marker("Peux-tu lister toutes les filiales du groupe ?") is True
    assert detect_broad_population_marker("Il me faut tous les décideurs de ce compte.") is True
    assert detect_broad_population_marker("Donne-moi les cinquante personnes prioritaires.") is True


def test_detect_broad_population_marker_is_false_on_the_partial_wordings():
    assert detect_broad_population_marker("Voici les principaux projets.") is False
    assert detect_broad_population_marker("Qui travaille sur ce compte ?") is False


def test_build_search_universe_population_is_the_message_verbatim():
    universe = build_search_universe("Tous les décideurs achats des filiales françaises")
    assert universe.population == "Tous les décideurs achats des filiales françaises"


def test_build_search_universe_detects_geographies():
    universe = build_search_universe("Cible les décideurs sur la France entière, avec un focus Grand Est")
    assert universe.geographies == ("France entière", "Grand Est")


def test_build_search_universe_detects_roles_from_buying_committee_labels():
    # L'ordre rendu est l'ordre CANONIQUE de ROLE_LABELS (buying_committee.py),
    # jamais l'ordre de mention dans le message — même logique que les DIX
    # couches canoniques de source_plan.py.
    universe = build_search_universe("Je veux tous les RH et le champion de ce compte")
    assert universe.roles == ("Champion", "RH")


def test_build_search_universe_generic_decideurs_maps_to_the_two_buyer_roles():
    universe = build_search_universe("Tous les décideurs de ce compte")
    assert universe.roles == ("Décideur budget", "Décideur technique")


def test_build_search_universe_detects_exclusions():
    universe = build_search_universe("Toutes les filiales, sauf les entités cédées en 2025.")
    assert universe.exclusions == ("les entités cédées en 2025",)


def test_build_search_universe_champs_non_extractibles_restent_vides():
    universe = build_search_universe("Tous les décideurs")
    assert universe.periods == ()
    assert universe.sources == ()
    assert universe.limits == ()
    assert universe.pagination is None
    assert universe.relevance_criteria == ()


# ── CoverageReport (#214.2/.3) — jamais fusionné ────────────────────────


def test_to_wire_ne_fusionne_jamais_les_paliers():
    report = CoverageReport(
        detected=214,
        resolved=81,
        verified=9,
        relevant=18,
        enriched=6,
        excluded=3,
        unresolved=2,
        sources_unavailable=("BODACC",),
        estimated_coverage=0.42,
        coverage_basis="profils LinkedIn publics + CRM",
    )
    wire = report.to_wire()
    # Dix clés distinctes, exactement l'exemple contacts du ticket.
    assert wire["detected"] == 214
    assert wire["resolved"] == 81
    assert wire["relevant"] == 18
    assert wire["verified"] == 9
    assert wire["enriched"] == 6
    assert wire["excluded"] == 3
    assert wire["unresolved"] == 2
    assert wire["sources_unavailable"] == ["BODACC"]
    assert wire["estimated_coverage"] == 0.42
    assert "total" not in wire
    assert "count" not in wire


def test_estimated_coverage_non_mesure_reste_none_jamais_zero():
    report = CoverageReport(detected=10)
    assert report.estimated_coverage is None
    assert report.to_wire()["estimated_coverage"] is None


def test_coverage_report_lines_exemple_contacts_du_ticket():
    report = CoverageReport(detected=214, resolved=81, relevant=18, verified=9, enriched=6)
    lines = coverage_report_lines(report, "fr")
    assert lines[0] == "214 détecté(s)."
    assert lines[1] == "81 classé(s)."
    assert lines[2] == "18 correspondent aux rôles recherchés."
    assert lines[3] == "9 vérifié(s) récemment."
    assert lines[4] == "6 disposent d'une coordonnée exploitable."


def test_coverage_report_lines_fr_et_en_distinctes():
    report = CoverageReport(detected=10, resolved=5, relevant=3, verified=2, enriched=1)
    assert coverage_report_lines(report, "fr") != coverage_report_lines(report, "en")


# ── EXHAUSTIVITÉ — le contrat de #exhaustiveness_claim_allowed ──────────


def test_aucune_couverture_mesuree_n_autorise_l_absolu():
    report = CoverageReport(detected=214, resolved=81, relevant=18, verified=9, enriched=6)
    assert exhaustiveness_claim_allowed(report) is False


def test_couverture_partielle_n_autorise_pas_l_absolu():
    report = CoverageReport(detected=10, resolved=10, relevant=10, verified=10, enriched=10, estimated_coverage=0.9)
    assert exhaustiveness_claim_allowed(report) is False


def test_exclusions_ou_non_resolus_interdisent_l_absolu_meme_a_100_pour_cent():
    report = CoverageReport(
        detected=10, resolved=10, relevant=10, verified=10, enriched=10, excluded=1, estimated_coverage=1.0
    )
    assert exhaustiveness_claim_allowed(report) is False


def test_source_indisponible_interdit_l_absolu():
    report = CoverageReport(
        detected=10, resolved=10, relevant=10, verified=10, enriched=10, sources_unavailable=("BODACC",), estimated_coverage=1.0
    )
    assert exhaustiveness_claim_allowed(report) is False


def test_couverture_complete_mesuree_et_sans_gap_autorise_l_absolu():
    report = CoverageReport(detected=10, resolved=10, relevant=10, verified=10, enriched=10, estimated_coverage=1.0)
    assert exhaustiveness_claim_allowed(report) is True


# ── Seuils qualité (#214.5) — None = non mesuré, jamais 0 ────────────────


def test_precision_at_k_sans_donnee_est_none():
    assert precision_at_k(None, 10) is None
    assert precision_at_k(5, 0) is None


def test_precision_at_k_calcule():
    assert precision_at_k(7, 10) == 0.7


def test_coverage_of_priority_roles_sans_total_est_none():
    assert coverage_of_priority_roles(3, None) is None
    assert coverage_of_priority_roles(3, 0) is None


def test_coverage_of_priority_roles_calcule():
    assert coverage_of_priority_roles(3, 4) == 0.75


def test_entity_coverage_et_freshness_coverage_et_unknown_share_sans_donnee():
    assert entity_coverage(None, 10) is None
    assert freshness_coverage(None, 10) is None
    assert unknown_share(None, 10) is None


def test_entity_coverage_et_freshness_coverage_et_unknown_share_calcules():
    assert entity_coverage(8, 10) == 0.8
    assert freshness_coverage(4, 10) == 0.4
    assert unknown_share(2, 10) == 0.2


# ── Réponse à une demande trop large (#214.6) ────────────────────────────


def test_broad_request_response_borne_les_verifies():
    report = CoverageReport(detected=214, resolved=81, relevant=18, verified=9, enriched=6)
    labels = [f"contact-{i}" for i in range(9)]
    response = broad_request_response(report, labels, max_verified_shown=6)
    assert response.verified_best == tuple(labels[:6])
    assert response.remainder_as_job is True  # 9 > 6


def test_broad_request_response_pas_de_job_si_tout_tient_et_rien_ne_manque():
    report = CoverageReport(detected=5, resolved=5, relevant=5, verified=5, enriched=5)
    labels = [f"contact-{i}" for i in range(5)]
    response = broad_request_response(report, labels, max_verified_shown=10)
    assert response.remainder_as_job is False


def test_broad_request_response_job_si_des_elements_sont_exclus_ou_non_resolus():
    report = CoverageReport(detected=5, resolved=5, relevant=5, verified=5, enriched=5, unresolved=1)
    response = broad_request_response(report, ["a", "b"], max_verified_shown=10)
    assert response.remainder_as_job is True


def test_broad_request_response_porte_ce_qui_exige_un_approfondissement():
    report = CoverageReport(detected=5)
    response = broad_request_response(report, [], needs_deepening=("filiale non qualifiée",))
    assert response.needs_deepening == ("filiale non qualifiée",)


def test_broad_request_response_ne_fabrique_jamais_plus_que_les_verifies_fournis():
    report = CoverageReport(detected=3)
    response = broad_request_response(report, ["a", "b"], max_verified_shown=50)
    assert response.verified_best == ("a", "b")


# ── Bloc de prompt (#214.6, câblé sur LAUNCH_JOB) ─────────────────────────


def test_broad_request_instruction_block_fr_et_en_non_vides_et_distincts():
    fr = broad_request_instruction_block("fr")
    en = broad_request_instruction_block("en")
    assert fr.strip() and en.strip()
    assert fr != en
    assert fr.startswith("\n\n")


def test_broad_request_instruction_block_interdit_de_fabriquer():
    assert "jamais" in broad_request_instruction_block("fr").lower()
    assert "never" in broad_request_instruction_block("en").lower()


def test_aucun_nom_de_fournisseur_dans_le_bloc():
    banned = ("anthropic", "claude", "openai", "gpt", "haiku", "opus", "sonnet", "brave")
    for lang in ("fr", "en"):
        lowered = broad_request_instruction_block(lang).lower()
        for word in banned:
            assert word not in lowered


# ── #3229 — un CoverageReport construit sur de VRAIS résultats d'outil ───
# La famille « liste de contacts » (`search_workspace_contacts`) : un contact
# se compte par ce que la ligne dit (rôle posé, coordonnée), jamais comme une
# filiale. Un palier que la sortie ne permet pas de mesurer reste None.

from app.services.search_universe import coverage_report_from_contact_list  # noqa: E402


def _contact(role: str | None, *, email: bool = False, profile: bool = False) -> dict[str, object]:
    return {"contact_id": "c", "decision_role": role, "has_email": email, "has_network_profile": profile}


def test_contacts_liste_complete_mesure_chaque_palier_sur_la_meme_population():
    output = {
        "total": 4,
        "truncated": False,
        "contacts": [
            _contact("technical", email=True),
            _contact("technical", profile=True),
            _contact("economic"),
            _contact(None),
        ],
        "scope": {"role": "technical"},
    }
    report = coverage_report_from_contact_list(output)
    assert report is not None
    assert (report.detected, report.resolved, report.relevant, report.enriched) == (4, 3, 2, 2)
    assert report.unresolved == 1
    # Aucune donnée de vérification dans cette sortie : non mesuré, jamais 0.
    assert report.verified is None


def test_contacts_liste_tronquee_ne_mesure_que_le_detecte():
    output = {"total": 214, "truncated": True, "contacts": [_contact("technical", email=True)] * 10}
    report = coverage_report_from_contact_list(output)
    assert report is not None
    assert report.detected == 214
    # 10 lignes vues sur 214 : tout palier calculé sur l'échantillon mentirait.
    assert report.resolved is None and report.relevant is None and report.enriched is None


def test_contacts_sans_critere_de_role_le_palier_pertinent_reste_non_mesure():
    output = {"total": 1, "truncated": False, "contacts": [_contact("technical")], "scope": {"company": "X"}}
    report = coverage_report_from_contact_list(output)
    assert report is not None and report.relevant is None


def test_contacts_total_illisible_ou_sortie_en_erreur_ne_donne_aucun_rapport():
    assert coverage_report_from_contact_list({"total": None, "contacts": []}) is None
    assert coverage_report_from_contact_list({"error": "x"}) is None
    assert coverage_report_from_contact_list("pas un dict") is None  # type: ignore[arg-type]


def test_contacts_zero_trouve_ne_donne_aucun_rapport():
    assert coverage_report_from_contact_list({"total": 0, "truncated": False, "contacts": []}) is None


def test_contacts_une_couverture_d_espace_n_autorise_jamais_l_absolu():
    # GA-259 : un taux mesure ce qu'on SAIT de l'espace, jamais ce que le marché
    # FAIT. Même complète, la lecture de l'espace ne lève pas le ban « tous ».
    output = {"total": 2, "truncated": False, "contacts": [_contact("technical", email=True)] * 2}
    report = coverage_report_from_contact_list(output)
    assert report is not None
    assert report.estimated_coverage is None
    assert exhaustiveness_claim_allowed(report) is False
    assert "espace" in report.coverage_basis


def test_lignes_de_couverture_omettent_un_palier_non_mesure():
    report = CoverageReport(detected=214, resolved=None, relevant=None, verified=None, enriched=None)
    assert coverage_report_lines(report, "fr") == ["214 détecté(s)."]
    wire = report.to_wire()
    assert wire["verified"] is None and wire["resolved"] is None
