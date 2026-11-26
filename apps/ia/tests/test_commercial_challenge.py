"""#3180 (LAU-FINAL-186) — les détecteurs déterministes de la politique de
désaccord commercial.

Chaque test verrouille une règle du retour bêta : jamais un faux positif sur
une recherche déjà cadrée, jamais un challenge sans alternative, la force
toujours nommée et traçable.
"""

from __future__ import annotations

from app.services.commercial_challenge import (
    CHALLENGE_CASES,
    RECIPE_SCENARIOS,
    STRENGTH_DEFINITIONS,
    UNDETECTED_CASES,
    detect_capacity_overreach,
    detect_closed_for_access_level,
    DEPARTED_CONTACT_MARKER,
    RECIPE_DETECTORS,
    detect_declared_exclusion,
    detect_departed_contact,
    detect_too_senior_contact,
    NAMED_CONTACT_MARKER,
    detect_geographic_overreach,
    detect_partner_prospected_as_client,
    detect_recruitment_only_need,
    detect_saturated_account,
    detect_stale_signals,
    detect_unsuitable_account,
)


def test_eleven_canonical_cases_are_named():
    assert len(CHALLENGE_CASES) == 11
    assert "recherche excessivement large" in CHALLENGE_CASES
    assert "compte déjà fortement saturé" in CHALLENGE_CASES


def test_three_strengths_have_the_exact_definition_from_the_report():
    assert STRENGTH_DEFINITIONS["soft"] == "Préférence stratégique."
    assert STRENGTH_DEFINITIONS["firm"] == "Risque commercial important."
    assert STRENGTH_DEFINITIONS["blocking"] == "Conformité, permission, sécurité, mensonge ou action irréversible."


def test_six_cases_are_named_undetected_with_a_reason_never_simulated():
    """#3243 (reste de #186.10) fait passer le compte de neuf à sept ; #3392.2
    (retour bêta 30/09) le fait passer de sept à six : « action dont le coût
    dépasse la valeur probable » a désormais un détecteur réel."""
    # #3243 (04/10) : « interlocuteur beaucoup trop haut » a son détecteur → trois restent.
    # #3243 (#186.10, lot M09) : « message trop générique » a le sien → deux restent.
    assert len(UNDETECTED_CASES) == 1  # #3243.2 : « filiale hors périmètre » a son détecteur
    assert "message trop agressif ou trop générique" not in UNDETECTED_CASES
    assert "interlocuteur beaucoup trop haut" not in UNDETECTED_CASES
    assert all(reason for reason in UNDETECTED_CASES.values())
    assert "compte trop fermé pour le niveau d'accès actuel" not in UNDETECTED_CASES
    assert "besoin supposé à partir d'un simple recrutement CDI" not in UNDETECTED_CASES
    assert "action dont le coût dépasse la valeur probable" not in UNDETECTED_CASES


def test_recipe_scenarios_are_the_six_from_the_report_verbatim():
    assert RECIPE_SCENARIOS == (
        "attaquer le CEO mondial",
        "envoyer cinquante CV à froid",
        "contacter une personne partie",
        "prospecter un partenaire existant comme un client",
        "investir dans un compte sans accès",
        "présenter un besoin historique comme actuel",
    )


def test_geographic_overreach_fires_when_profile_is_narrow_and_search_is_unconstrained():
    challenge = detect_geographic_overreach(department=None, profile={"geo_zones": ["Paris & Île-de-France"]})
    assert challenge is not None
    assert challenge["case"] == "recherche excessivement large"
    assert challenge["strength"] == "soft"
    assert challenge["alternative"]


def test_geographic_overreach_never_fires_without_a_declared_profile():
    """Absence ne restreint rien — même doctrine que `laura_authority_scope`."""
    assert detect_geographic_overreach(department=None, profile=None) is None
    assert detect_geographic_overreach(department=None, profile={}) is None


def test_geographic_overreach_never_fires_when_the_esn_itself_declared_national():
    assert detect_geographic_overreach(department=None, profile={"geo_zones": ["National (toute la France)"]}) is None


def test_geographic_overreach_never_fires_on_a_search_already_scoped_to_a_department():
    assert detect_geographic_overreach(department="75", profile={"geo_zones": ["Paris & Île-de-France"]}) is None


def test_geographic_overreach_never_fires_on_a_search_already_scoped_to_a_region():
    """#3392 (reste, recette prod 30/09) — un code région cadre la recherche
    au même titre qu'un département : jamais un faux positif."""
    assert (
        detect_geographic_overreach(
            department=None, region=["84"], profile={"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]}
        )
        is None
    )


def test_saturated_account_uses_the_same_threshold_as_the_capacity_axis():
    assert detect_saturated_account({"competitorsPresent": ["a", "b"]}) is None
    challenge = detect_saturated_account({"competitorsPresent": ["a", "b", "c"]})
    assert challenge is not None
    assert challenge["strength"] == "soft"
    assert "3" in challenge["problem"]


def test_saturated_account_never_fires_without_data():
    assert detect_saturated_account({}) is None
    assert detect_saturated_account(None) is None


# ── #3243 (reste de #186.10) — les deux détecteurs de plus ──────────────────


def test_closed_for_access_level_fires_on_zero_reachable_contacts():
    """Même axe `accessibility` que le score (GA-26) : zéro interlocuteur
    identifié → challenge `firm`."""
    challenge = detect_closed_for_access_level({"contacts": []})
    assert challenge is not None
    assert challenge["case"] == "compte trop fermé pour le niveau d'accès actuel"
    assert challenge["strength"] == "firm"
    assert challenge["alternative"]


def test_closed_for_access_level_never_fires_with_a_reachable_contact():
    analysis = {"contacts": [{"email": "a@b.fr"}]}
    assert detect_closed_for_access_level(analysis) is None


def test_closed_for_access_level_never_fires_without_any_account_in_context():
    """`None` (aucun compte sur ce tour) ne doit JAMAIS se lire comme un
    compte réel à zéro contact — absence ≠ restriction."""
    assert detect_closed_for_access_level(None) is None


def test_closed_for_access_level_never_fires_when_contacts_are_known_but_unreachable():
    """`points == 1` (des contacts identifiés, aucun joignable) a déjà une
    porte — un enrichissement — donc n'est PAS ce cas-ci (voir docstring)."""
    analysis = {"contacts": [{"name": "Alix Dupont"}]}
    assert detect_closed_for_access_level(analysis) is None


def test_closed_for_access_level_alternative_invites_execution_on_confirmation():
    """#3855 (recette prod 09/10) — « fais-le quand même » sur un compte fermé
    (board Airbus, zéro contact joignable) produisait encore un second refus
    (« reste non exécutable ») plutôt qu'une recherche de contacts. Comme
    `detect_geographic_overreach` et `detect_too_senior_contact`, l'alternative
    doit inviter EXPLICITEMENT l'exécution sur confirmation — jamais une
    offre silencieuse que rien ne relance si le choix est maintenu."""
    challenge = detect_closed_for_access_level({"contacts": []})
    assert challenge is not None
    assert "dis-le" in challenge["alternative"]
    assert "recherche de contacts" in challenge["alternative"]


def test_recruitment_only_need_fires_on_a_lone_job_posting():
    challenge = detect_recruitment_only_need({"itJobSignals": ["Dev backend"]})
    assert challenge is not None
    assert challenge["case"] == "besoin supposé à partir d'un simple recrutement CDI"
    assert challenge["strength"] == "soft"
    assert "1" in challenge["problem"]


def test_recruitment_only_need_never_fires_without_any_job_signal():
    assert detect_recruitment_only_need({}) is None
    assert detect_recruitment_only_need(None) is None


def test_recruitment_only_need_never_fires_when_another_live_signal_corroborates():
    analysis = {
        "itJobSignals": ["Dev backend"],
        "recentSignals": [{"signal": "levée de fonds Série B", "freshness": "recent"}],
    }
    assert detect_recruitment_only_need(analysis) is None


def test_recruitment_only_need_ignores_an_archived_corroborating_signal():
    """Un signal ARCHIVÉ ne corrobore rien — même lecture que l'axe `signal`."""
    analysis = {
        "itJobSignals": ["Dev backend"],
        "recentSignals": [{"signal": "ancien programme", "freshness": "archive"}],
    }
    challenge = detect_recruitment_only_need(analysis)
    assert challenge is not None


def test_every_fired_challenge_names_problem_impact_and_alternative_never_a_bare_refusal():
    for challenge in (
        detect_geographic_overreach(department=None, profile={"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]}),
        detect_saturated_account({"competitorsPresent": ["a", "b", "c", "d"]}),
        detect_closed_for_access_level({"contacts": []}),
        detect_recruitment_only_need({"itJobSignals": ["Dev backend"]}),
        detect_capacity_overreach(requested_limit=100, capped_limit=20),
    ):
        assert challenge is not None
        assert challenge["problem"]
        assert challenge["impact"]
        assert challenge["alternative"]
        assert challenge["strength"] in ("soft", "firm", "blocking")


def test_capacity_overreach_fires_when_the_requested_volume_exceeds_the_cap():
    """#3392.2 (retour bêta 30/09) — « Trouve-moi 100 grands comptes »."""
    challenge = detect_capacity_overreach(requested_limit=100, capped_limit=20)
    assert challenge is not None
    assert challenge["case"] == "action dont le coût dépasse la valeur probable"
    assert challenge["strength"] == "soft"
    assert "100" in challenge["problem"] and "20" in challenge["problem"]
    assert "Sprint" in challenge["alternative"] and "Focus" in challenge["alternative"]
    assert "10" in challenge["alternative"] and "3" in challenge["alternative"]


def test_capacity_overreach_never_fires_without_an_explicit_volume():
    assert detect_capacity_overreach(requested_limit=None, capped_limit=20) is None


def test_capacity_overreach_never_fires_within_the_cap():
    assert detect_capacity_overreach(requested_limit=20, capped_limit=20) is None
    assert detect_capacity_overreach(requested_limit=5, capped_limit=20) is None


# ── #3243 (30/09) — exclusions déclarées, signal trop ancien, verdict d'aptitude ──


def test_declared_exclusion_fires_on_a_no_go_keyword_in_the_account_name():
    c = detect_declared_exclusion("AXA Assurances", {"noGoSectors": ["Assurance & Mutuelles"]})
    assert c is not None
    assert c["case"] == "demande contraire aux exclusions du profil"
    assert c["strength"] == "firm"
    assert "Assurance & Mutuelles" in c["problem"]


def test_declared_exclusion_is_silent_without_declaration_or_name_or_hit():
    assert detect_declared_exclusion("AXA Assurances", {}) is None
    assert detect_declared_exclusion("AXA Assurances", {"noGoSectors": []}) is None
    assert detect_declared_exclusion(None, {"noGoSectors": ["Assurance & Mutuelles"]}) is None
    assert detect_declared_exclusion("Capgemini", {"noGoSectors": ["Assurance & Mutuelles"]}) is None
    # jamais un préfixe lâche : « banque » ne touche pas « Banquette »
    assert detect_declared_exclusion("Banquette SA", {"noGoSectors": ["Banque de détail"]}) is None


def test_stale_signals_fires_only_when_every_signal_is_archived():
    old = [{"freshness": "archive"}, {"freshness": "archive"}]
    c = detect_stale_signals({"recentSignals": old})
    assert c is not None and c["case"] == "signal trop ancien" and c["strength"] == "soft"
    assert "2" in c["problem"]
    assert detect_stale_signals({"recentSignals": [*old, {"freshness": "current"}]}) is None
    assert detect_stale_signals({"recentSignals": []}) is None  # absence ≠ ancien
    assert detect_stale_signals(None) is None


def test_stale_signals_names_the_dated_need_as_to_confirm_never_as_absent():
    """#3243 (recette R16, 15/10) — entité radiée, signal de mars 2022 : Laura
    disait « pas de besoin actuel… besoin historique non documenté ». Le besoin
    EXISTE (un signal archivé) : il est nommé, daté, et marqué « à confirmer »."""
    old = [{"title": "Refonte de l'ERP", "date": "2022-03-14", "freshness": "archive"}]
    c = detect_stale_signals({"recentSignals": old})
    assert c is not None
    text = " ".join(str(v) for v in c.values())
    assert "Refonte de l'ERP" in c["problem"] and "2022" in c["problem"]
    assert "besoin à confirmer" in text
    assert "non documenté" not in text


def test_stale_signals_without_title_still_says_to_confirm():
    c = detect_stale_signals({"recentSignals": [{"freshness": "archive"}]})
    assert c is not None and "besoin à confirmer" in " ".join(str(v) for v in c.values())


def test_unsuitable_account_names_the_verdict_and_never_a_probability():
    c = detect_unsuitable_account({"contacts": [], "recentSignals": []}, {}, company="Acme")
    assert c is not None
    assert c["case"] == "compte pas encore une cible"
    text = " ".join(str(v) for v in c.values())
    assert "%" not in text and "probab" not in text.lower()


def test_unsuitable_account_is_silent_without_analysis():
    assert detect_unsuitable_account(None, {}) is None


def test_departed_contact_fires_only_on_a_marked_named_line():
    summary = (
        "Sarah Martin - DSI - economic - parti de l’entreprise - contact_id: c-1\n"
        "Paul Roy - RSSI - technical - contact_id: c-2"
    )
    challenge = detect_departed_contact(summary)
    assert challenge is not None
    assert challenge["case"] == "contacter une personne partie"
    assert challenge["strength"] == "firm"
    assert "Sarah Martin" in challenge["problem"]
    assert "Paul Roy" not in challenge["problem"]
    assert challenge["alternative"]


def test_departed_contact_says_no_when_nobody_is_marked_or_summary_is_absent():
    assert detect_departed_contact("Paul Roy - RSSI - technical - contact_id: c-2") is None
    assert detect_departed_contact("") is None
    assert detect_departed_contact(None) is None


def test_the_marker_is_the_exact_string_the_api_writes():
    # apps/api chat-context.service.ts::DEPARTED_CONTACT_MARKER — une seule chaîne, deux côtés.
    assert DEPARTED_CONTACT_MARKER == "parti de l’entreprise"


def test_recipe_detectors_name_only_recipe_scenarios_with_a_real_detector():
    assert RECIPE_DETECTORS == {
        "contacter une personne partie": "detect_departed_contact",
        "prospecter un partenaire existant comme un client": "detect_partner_prospected_as_client",
        "attaquer le CEO mondial": "detect_too_senior_contact",
        "envoyer cinquante CV à froid": "detect_mass_cold_submissions",
        # #3243.4 — les deux derniers scénarios relisent des détecteurs DÉJÀ câblés (GA-26).
        "investir dans un compte sans accès": "detect_closed_for_access_level",
        "présenter un besoin historique comme actuel": "detect_stale_signals",
    }
    assert set(RECIPE_DETECTORS) == set(RECIPE_SCENARIOS)
    assert set(RECIPE_DETECTORS) <= set(RECIPE_SCENARIOS)


def test_partner_prospected_as_client_fires_on_a_partnership_archetype():
    challenge = detect_partner_prospected_as_client({"actorType": "ESN"}, company="Alten")
    assert challenge is not None
    assert challenge["case"] == "prospecter un partenaire existant comme un client"
    assert challenge["strength"] == "soft"
    assert "Alten" in challenge["problem"]
    assert challenge["alternative"]
    assert "%" not in challenge["problem"] + challenge["impact"]


def test_partner_prospected_as_client_says_no_on_a_client_absent_or_unknown_type():
    assert detect_partner_prospected_as_client({"actorType": "client final"}, company="TF1") is None
    assert detect_partner_prospected_as_client({}, company="X") is None
    assert detect_partner_prospected_as_client(None) is None
    assert detect_partner_prospected_as_client({"actorType": "type inconnu"}) is None


def test_partner_challenge_reads_the_account_row_and_the_nested_analysis_shapes():
    """#3243 (recette Y17) : la ligne de compte porte `actor_type`, Phase 1
    `actorType` — dans le dossier (`raw_analysis`) ou à plat."""
    assert detect_partner_prospected_as_client({"actor_type": "ESN"}, company="CAPGEMINI") is not None
    assert detect_partner_prospected_as_client({"raw_analysis": {"actorType": "ESN"}}) is not None
    assert detect_partner_prospected_as_client({"actor_type": None, "raw_analysis": None}) is None
    assert detect_partner_prospected_as_client({"actor_type": "client final"}) is None


def test_too_senior_contact_fires_on_a_named_general_manager():
    summary = (
        "Pierre Durand - CEO Groupe - economic - nommé dans le message - contact_id: c-1\n"
        "Paul Roy - RSSI - technical - contact_id: c-2"
    )
    challenge = detect_too_senior_contact(summary)
    assert challenge is not None
    assert challenge["case"] == "interlocuteur beaucoup trop haut"
    assert challenge["strength"] == "soft"
    assert "Pierre Durand" in challenge["problem"]
    assert "Paul Roy" not in challenge["problem"]
    assert challenge["alternative"]
    assert "%" not in challenge["problem"] + challenge["impact"]


def test_too_senior_contact_says_no_on_unnamed_or_operational_targets():
    # Même titre, mais NON nommé dans le message : jamais un faux positif.
    assert detect_too_senior_contact("Pierre Durand - CEO - economic - contact_id: c-1") is None
    # Nommé, mais DSI (le décideur ESN) ou titre inconnu : rien.
    assert detect_too_senior_contact(f"Sarah Martin - DSI - economic - {NAMED_CONTACT_MARKER} - contact_id: c-2") is None
    assert detect_too_senior_contact(f"Sarah Martin - ? - economic - {NAMED_CONTACT_MARKER}") is None
    assert detect_too_senior_contact("") is None
    assert detect_too_senior_contact(None) is None


def test_the_named_marker_is_the_exact_string_the_api_writes():
    # apps/api chat-context.service.ts::NAMED_CONTACT_MARKER
    assert NAMED_CONTACT_MARKER == "nommé dans le message"


def test_r40_stale_signals_forbid_the_wrong_phrasing_and_name_the_formula() -> None:
    """#3243 (r40) — Laura disait « aucun besoin confirmé » : la formule est « besoin à confirmer », seule."""
    c = detect_stale_signals({"recentSignals": [{"title": "Migration SI", "date": "2021-03-14", "freshness": "archive"}]})
    assert c is not None
    alternative = str(c["alternative"])
    assert "« besoin à confirmer »" in alternative
    assert "aucun besoin confirmé" in alternative  # nommée comme formulation INTERDITE
    assert "jamais" in alternative.lower()


def test_r40_prepare_an_action_prepares_the_default_gesture() -> None:
    """#3243 (r40) — « prépare une action sur X » : on prépare le geste par défaut, on ne demande pas « Quel geste ? »."""
    from app.prompts.commercial_challenge_policy import commercial_challenge_policy_block

    block = commercial_challenge_policy_block()
    assert "PRÉPARE UNE ACTION" in block
    assert "Quel geste" in block  # cité comme question interdite
    assert "prepare_message_for_contact" in block
