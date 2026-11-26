"""Deterministic buying-committee typing (Knowledge Pack v2 taxonomy).

Covers the title → committee-role mapping, the Power/Interest matrix coherence,
the committee assembly (role coverage / missing seats / quadrant grouping) and
the "never fabricate a role" rule (unknown title → to_qualify).
"""

from __future__ import annotations

import pytest

from app.knowledge.buying_committee import (
    COMMITTEE_ROLES,
    CORE_COMMITTEE_ROLES,
    INTEREST_MAX,
    MULTITHREADING_ROLES,
    POWER_MAX,
    QUADRANT_CHAMPIONS,
    QUADRANT_FIELD_RELAY,
    QUADRANT_MONITOR,
    QUADRANT_TO_QUALIFY,
    QUADRANT_TO_SATISFY,
    assemble_buying_committee,
    approach_order,
    classify_committee_role,
    committee_message_angle,
    committee_prompt_block,
    evaluate_multithreading,
    sector_committee_seats,
    _member_from_contact,
)

# ── Title → committee role (deterministic, pack-sourced) ──────────────────────


@pytest.mark.parametrize(
    ("title", "role"),
    [
        # TECHNICAL_BUYER — IT deciders.
        ("DSI", "technical_buyer"),
        ("Directeur des Systèmes d'Information", "technical_buyer"),
        ("CTO", "technical_buyer"),
        ("RSSI", "technical_buyer"),
        ("Head of Engineering", "technical_buyer"),
        ("Directeur Data", "technical_buyer"),
        # ECONOMIC_BUYER — budget / finance (non-achats).
        ("Directeur Financier", "economic_buyer"),
        ("CFO", "economic_buyer"),
        ("Contrôleur de Gestion", "economic_buyer"),
        # PROCUREMENT — the acheteur / achats gate (committee lens).
        ("Directeur des Achats", "procurement"),
        ("Responsable Achats", "procurement"),
        ("IT Procurement Manager", "procurement"),
        ("Vendor Manager", "procurement"),
        ("Acheteur IT", "procurement"),
        # USER_BUYER — utilisateurs / delivery / business line.
        ("Développeur", "user_buyer"),
        ("Développeur Full Stack", "user_buyer"),
        ("Product Owner", "user_buyer"),
        ("Tech Lead", "user_buyer"),
        ("Chef de Projet", "user_buyer"),
        ("Ingénieur DevOps", "user_buyer"),
        ("Data Scientist", "user_buyer"),
        ("Directeur Commercial", "user_buyer"),
        ("Directeur des Opérations", "user_buyer"),
        # INFLUENCER — prescripteurs (expert ICs).
        ("Architecte SI", "influencer"),
        ("Solution Architect", "influencer"),
        ("Expert Cybersécurité", "influencer"),
        ("Référent Technique", "influencer"),
        # CHAMPION — top exec / transformation.
        ("CEO", "champion"),
        ("Directeur Général", "champion"),
        ("Directeur de la Transformation", "champion"),
        # TO_QUALIFY — not deducible from the title (never fabricated).
        ("Chargé de mission", "to_qualify"),
        ("Assistant", "to_qualify"),
        ("", "to_qualify"),
        (None, "to_qualify"),
        # GOUVERNANCE — un membre du conseil d'administration n'est PAS un
        # utilisateur opérationnel accessible : c'est un sponsor lointain, à
        # qualifier (restitution TF1 p23/p34). Un administrateur SYSTÈME, lui,
        # reste un vrai utilisateur (gov=False).
        ("Administrateur", "to_qualify"),
        ("Administratrice", "to_qualify"),
        ("Président du conseil d'administration", "to_qualify"),
        ("Membre du conseil de surveillance", "to_qualify"),
        ("Administrateur systèmes et réseaux", "user_buyer"),
        ("Administrateur base de données", "user_buyer"),
        # Intern guard — even "Stagiaire DSI" is never a decider.
        ("Stagiaire DSI", "to_qualify"),
        ("Alternant Data", "to_qualify"),
    ],
)
def test_classify_committee_role_maps_known_titles(title: str | None, role: str) -> None:
    assert classify_committee_role(title)["role"] == role


def test_role_is_always_a_known_committee_role() -> None:
    for title in ["DSI", "Développeur", "Chargé de mission", "", None, "Directeur des Achats"]:
        assert classify_committee_role(title)["role"] in COMMITTEE_ROLES


# ── Nouvelles familles (#2791, épopée Buying Committee multi-secteur) ────────
#
# #2311.13 (RH), .11 (juridique), .12 (conformité), .16 (partenaire), .14
# (direction de programme) — cinq familles du comité canonique (LAU-FINAL-052)
# qui ne matchaient AUCUN détecteur existant (vérifié `git grep` avant d'écrire
# les motifs ci-dessous) : ajoutées en toute fin de chaîne, APRÈS achats/
# décideurs/prescripteur/opérationnel, donc sans changer un seul rôle déjà
# classé (golden `apps/ia/app/eval/golden/*.json` inchangés).
@pytest.mark.parametrize(
    ("title", "role"),
    [
        ("DRH", "hr"),
        ("Directrice des Ressources Humaines", "hr"),
        ("Chief Human Resources Officer", "hr"),
        ("HRBP", "hr"),
        ("Responsable Talent Acquisition", "hr"),
        ("Directeur Juridique", "legal"),
        ("General Counsel", "legal"),
        ("Juriste", "legal"),
        ("Responsable Conformité", "compliance"),
        ("Compliance Officer", "compliance"),
        ("Délégué à la Protection des Données", "compliance"),
        ("Data Protection Officer", "compliance"),
        ("Directeur des Partenariats", "partner"),
        ("Alliance Manager", "partner"),
        ("Channel Manager", "partner"),
        ("Directeur de Programme", "program_management"),
        ("Program Manager", "program_management"),
        ("PMO", "program_management"),
    ],
)
def test_classify_committee_role_maps_new_families(title: str, role: str) -> None:
    assert classify_committee_role(title)["role"] == role


def test_new_families_never_shadow_an_existing_detector() -> None:
    """Un titre déjà classé par un détecteur EXISTANT (achats/décideur/
    prescripteur/opérationnel) garde son rôle — les nouvelles familles ne sont
    regardées qu'en dernier recours (jamais de régression sur un titre connu)."""
    assert classify_committee_role("Directeur des Achats")["role"] == "procurement"
    assert classify_committee_role("Directeur Financier")["role"] == "economic_buyer"
    assert classify_committee_role("Chef de Projet")["role"] == "user_buyer"


# #2311.18 — adaptation sectorielle CYBER (RSSI/IAM/GRC/SOC). Le RSSI est déjà
# classé (`technical_buyer`, ligne 38 ci-dessus). Un titre IAM/SOC PORTANT DÉJÀ
# un mot générique (analyste/ingénieur/engineer) était déjà classé `user_buyer`
# par `_OPERATIONAL_USER_RE` — vérifié AVANT d'écrire, pour ne reclasser AUCUN
# titre déjà couvert. Le vrai trou, mesuré (`git grep -i "\bIAM\b\|\bSOC\b"` sur
# `buying_committee.py` → 0 résultat) : un acronyme SEUL, sans mot générique
# (« Responsable IAM », « Manager SOC »), tombait `to_qualify`. GRC (Gouvernance
# Risque Conformité) rejoint la famille `compliance` déjà posée (#2311.12) —
# additif, jamais avant `_OPERATIONAL_USER_RE` (« Analyste GRC » reste
# `user_buyer`, via « analyste », pas reclassé).
@pytest.mark.parametrize(
    ("title", "role"),
    [
        ("Analyste SOC", "user_buyer"),
        ("SOC Analyst", "user_buyer"),
        ("Ingénieur IAM", "user_buyer"),
        ("IAM Engineer", "user_buyer"),
        # Le vrai ajout : l'acronyme SEUL, sans mot générique — tombait
        # `to_qualify` avant ce lot.
        ("Responsable IAM", "user_buyer"),
        ("Manager SOC", "user_buyer"),
        ("Analyste GRC", "user_buyer"),
        ("GRC Manager", "compliance"),
    ],
)
def test_classify_committee_role_maps_cyber_sector_titles(title: str, role: str) -> None:
    assert classify_committee_role(title)["role"] == role


def test_cyber_sector_titles_never_shadow_an_existing_detector() -> None:
    """« Société » ne doit jamais matcher le motif SOC (frontière de mot) — un
    titre sans signal déductible reste `to_qualify`, jamais un rôle fabriqué."""
    assert classify_committee_role("Réceptionniste de la société")["role"] == "to_qualify"
    assert classify_committee_role("RSSI")["role"] == "technical_buyer"


# ── Power / Interest matrix coherence ─────────────────────────────────────────


def test_it_decider_is_high_power_to_satisfy() -> None:
    prof = classify_committee_role("DSI")
    assert prof["power"] >= 3
    assert prof["quadrant"] == QUADRANT_TO_SATISFY  # decider to convince, not a champion


def test_developer_is_low_power_high_interest_field_relay() -> None:
    prof = classify_committee_role("Développeur")
    assert prof["power"] < 3
    assert prof["interest"] >= 3
    assert prof["quadrant"] == QUADRANT_FIELD_RELAY


def test_top_exec_champion_is_champions_quadrant() -> None:
    prof = classify_committee_role("CEO")
    assert prof["power"] >= 3
    assert prof["interest"] >= 3
    assert prof["quadrant"] == QUADRANT_CHAMPIONS


def test_to_qualify_has_no_fabricated_position() -> None:
    prof = classify_committee_role("Chargé de mission")
    assert prof["role"] == "to_qualify"
    assert prof["quadrant"] == QUADRANT_TO_QUALIFY
    assert prof["power"] == 0
    assert prof["interest"] == 0


@pytest.mark.parametrize(
    "title",
    [
        "DSI",
        "CTO",
        "Directeur Financier",
        "Directeur des Achats",
        "Développeur",
        "Architecte SI",
        "CEO",
        "Product Owner",
        "Chargé de mission",
        "",
        None,
    ],
)
def test_power_interest_within_bounds(title: str | None) -> None:
    prof = classify_committee_role(title)
    assert 0 <= prof["power"] <= POWER_MAX
    assert 0 <= prof["interest"] <= INTEREST_MAX
    assert prof["quadrant"] in {
        QUADRANT_CHAMPIONS,
        QUADRANT_TO_SATISFY,
        QUADRANT_FIELD_RELAY,
        QUADRANT_MONITOR,
        QUADRANT_TO_QUALIFY,
    }


# ── Seniority refines power ───────────────────────────────────────────────────


def test_seniority_refines_champion_power() -> None:
    c_level = classify_committee_role("Directeur de la Transformation", seniority="c_level")
    operational = classify_committee_role("Directeur de la Transformation", seniority="operationnel")
    assert c_level["power"] > operational["power"]
    assert c_level["quadrant"] == QUADRANT_CHAMPIONS
    # A field-level champion loses the power axis → field relay, not a power seat.
    assert operational["quadrant"] == QUADRANT_FIELD_RELAY


def test_it_decider_stays_high_power_even_as_expert() -> None:
    prof = classify_committee_role("DSI", seniority="expert")
    assert prof["power"] >= 3
    assert prof["quadrant"] == QUADRANT_TO_SATISFY


# ── Function refines interest for field roles ─────────────────────────────────


def test_it_proximal_function_bumps_field_interest() -> None:
    it_proximal = classify_committee_role("Architecte", seniority="expert", function="Cybersecurite")
    off_topic = classify_committee_role("Architecte", seniority="expert", function="RH / Talent")
    assert it_proximal["role"] == off_topic["role"] == "influencer"
    assert it_proximal["interest"] > off_topic["interest"]


def test_function_never_flips_a_decider_into_champions() -> None:
    # An economic buyer with an IT function must NOT be nudged into CHAMPIONS.
    prof = classify_committee_role("Directeur Financier", function="Data / BI / Analytics")
    assert prof["quadrant"] == QUADRANT_TO_SATISFY


# ── Committee assembly ────────────────────────────────────────────────────────


def _sample_contacts() -> list[dict]:
    return [
        {"fullName": "Alice Martin", "title": "DSI", "family": "IT / Infrastructure", "hierarchyLevel": "direction"},
        {"fullName": "Bob Durand", "title": "Directeur Financier", "family": "Finance"},
        {"fullName": "Carla Petit", "title": "Développeur", "family": "Developpement / Architecture"},
        {"fullName": "David Roux", "title": "Directeur de la Transformation"},
        {"fullName": "Eve Blanc", "title": "Responsable Achats"},
    ]


def test_assemble_committee_types_every_member() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    assert len(committee["members"]) == 5
    roles = {m["fullName"]: m["committeeRole"] for m in committee["members"]}
    assert roles["Alice Martin"] == "technical_buyer"
    assert roles["Bob Durand"] == "economic_buyer"
    assert roles["Carla Petit"] == "user_buyer"
    assert roles["David Roux"] == "champion"
    assert roles["Eve Blanc"] == "procurement"


def test_assemble_committee_role_coverage_and_no_gaps() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    assert committee["roleCoverage"] == {
        "technical_buyer": 1,
        "economic_buyer": 1,
        "user_buyer": 1,
        "champion": 1,
        "procurement": 1,
    }
    assert committee["missingRoles"] == []
    assert "Comité d'achat" in committee["summary"]


def test_assemble_committee_groups_by_quadrant() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    by_q = committee["byQuadrant"]
    assert "David Roux" in by_q[QUADRANT_CHAMPIONS]
    assert "Alice Martin" in by_q[QUADRANT_TO_SATISFY]
    assert "Carla Petit" in by_q[QUADRANT_FIELD_RELAY]


def test_assemble_committee_surfaces_missing_seats() -> None:
    committee = assemble_buying_committee([{"fullName": "Solo DSI", "title": "DSI"}])
    assert committee["roleCoverage"] == {"technical_buyer": 1}
    assert set(committee["missingRoles"]) == set(CORE_COMMITTEE_ROLES) - {"technical_buyer"}
    assert "Sièges à couvrir" in committee["summary"]


def test_empty_committee_is_all_gaps() -> None:
    committee = assemble_buying_committee([])
    assert committee["members"] == []
    assert committee["missingRoles"] == list(CORE_COMMITTEE_ROLES)
    assert committee["byQuadrant"] == {}
    assert "à constituer" in committee["summary"]


def test_contact_with_no_name_or_title_is_skipped() -> None:
    committee = assemble_buying_committee([{"family": "IT / Infrastructure"}])
    assert committee["members"] == []


def test_blocker_fallback_honours_prior_classification() -> None:
    # A blocker is an INDICE (not a title): the title-only classifier can't emit
    # it, but a prior "blocker" tag on the contact is honoured (never invented).
    committee = assemble_buying_committee(
        [{"fullName": "Gate Keeper", "title": "Chargé de mission", "role": "blocker"}]
    )
    assert committee["members"][0]["committeeRole"] == "blocker"


def test_unknown_title_without_prior_role_stays_to_qualify() -> None:
    committee = assemble_buying_committee([{"fullName": "Someone", "title": "Chargé de mission"}])
    assert committee["members"][0]["committeeRole"] == "to_qualify"
    assert committee["members"][0]["quadrant"] == QUADRANT_TO_QUALIFY


def test_assembly_is_deterministic() -> None:
    contacts = _sample_contacts()
    assert assemble_buying_committee(contacts) == assemble_buying_committee(contacts)


# ── #3263.20 — la source du contact voyage jusqu'au siège ──────────────────────
#
# Reparentage : `contact["source"]` est DÉJÀ dans le même dict que celui que
# `org_graph_assembler.py` lit (`_get(contact, "source")`) — jamais un second
# calcul, jamais une nouvelle collecte.


def test_committee_member_carries_the_contact_source() -> None:
    committee = assemble_buying_committee([{"fullName": "Alice Martin", "title": "DSI", "source": "apollo"}])
    assert committee["members"][0]["source"] == "apollo"


def test_committee_member_source_is_none_when_the_contact_has_none() -> None:
    committee = assemble_buying_committee([{"fullName": "Alice Martin", "title": "DSI"}])
    assert committee["members"][0]["source"] is None


# ── Prompt block ──────────────────────────────────────────────────────────────


def test_committee_prompt_block_renders_members() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    block = committee_prompt_block(committee)
    assert "COMITÉ D'ACHAT" in block
    assert "David Roux" in block  # champion surfaced
    assert "Alice Martin" in block  # decider surfaced


def test_committee_prompt_block_empty_when_no_members() -> None:
    assert committee_prompt_block(assemble_buying_committee([])) == ""


def test_committee_prompt_block_lists_missing_seats() -> None:
    committee = assemble_buying_committee([{"fullName": "Solo DSI", "title": "DSI"}])
    block = committee_prompt_block(committee)
    assert "Sièges à couvrir" in block


# ── #2311.23 — le comité change selon l'objectif (comprendre/ouvrir/vendre) ──
#
# Doctrine c76 (« le rôle change l'ORDRE, jamais le CONTENU ») : l'objectif ne
# retire ni n'ajoute aucun membre — il change seulement la PRIORITÉ de
# lecture des quadrants dans le narratif.


def _quadrant_order(block: str) -> list[str]:
    return [line.split(" : ")[0].lstrip("- ") for line in block.splitlines() if line.startswith("- ") and " : " in line]


def test_prompt_block_defaults_to_the_historical_order_without_an_objective() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    assert committee_prompt_block(committee) == committee_prompt_block(committee, None)
    order = _quadrant_order(committee_prompt_block(committee))
    assert order[0].startswith("CHAMPIONS")


def test_ouvrir_objective_keeps_the_historical_order() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    assert committee_prompt_block(committee, "ouvrir") == committee_prompt_block(committee)


def test_vendre_objective_leads_with_deciders_to_convince() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    order = _quadrant_order(committee_prompt_block(committee, "vendre"))
    assert order[0].startswith("DÉCIDEURS À CONVAINCRE")


def test_comprendre_objective_leads_with_field_relay() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    order = _quadrant_order(committee_prompt_block(committee, "comprendre"))
    assert order[0].startswith("RELAIS TERRAIN")


def test_objective_never_drops_or_adds_a_member() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    member_names = [m["fullName"] for m in committee["members"]]
    assert member_names  # sanity: the fixture has exploitable members
    for objective in ("vendre", "comprendre", "ouvrir", "inconnu", None):
        block = committee_prompt_block(committee, objective)
        for name in member_names:
            assert name in block


def test_unknown_objective_falls_back_to_the_historical_order() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    assert committee_prompt_block(committee, "autre chose") == committee_prompt_block(committee)


class TestIncompleteIdentity:
    """Un contact dont on n'a que le prénom ne peut pas être engagé.

    Restitution TF1 : « Jose », prénom seul, siégeait au comité d'achat comme
    utilisateur/relais terrain avec une cadence bi-mensuelle — alors qu'on ne
    peut ni le retrouver sur LinkedIn ni lui écrire. La machine d'états p22 est
    explicite : l'identité n'est VÉRIFIÉE qu'avec un nom complet.
    """

    def test_first_name_only_is_to_qualify(self) -> None:
        member = _member_from_contact({"fullName": "Jose", "title": "Senior Project Manager"})
        assert member is not None
        assert member["committeeRole"] == "to_qualify"

    def test_a_full_name_keeps_its_title_derived_role(self) -> None:
        member = _member_from_contact({"fullName": "Jose Martins", "title": "Senior Project Manager"})
        assert member is not None
        assert member["committeeRole"] == "user_buyer"

    def test_a_role_to_fill_without_any_name_is_unchanged(self) -> None:
        # « Directeur Technique TF1+ (à identifier) » : pas une personne, un siège
        # à pourvoir — le titre décide, comme avant.
        member = _member_from_contact({"fullName": "", "title": "CTO"})
        assert member is not None
        assert member["committeeRole"] == "technical_buyer"

    def test_hyphenated_first_name_alone_is_still_incomplete(self) -> None:
        member = _member_from_contact({"fullName": "Jean-Pierre", "title": "Directeur Financier"})
        assert member is not None
        assert member["committeeRole"] == "to_qualify"


class TestEvidenceLevel:
    """#2311.24 — le niveau de preuve par rôle (nommé/probable/à rechercher/inconnu).

    Déterministe, sur les deux seuls signaux déjà en main pour un membre :
    a-t-on un NOM complet (WHO), a-t-on un RÔLE résolu (WHAT). Rien n'est
    deviné — un titre non classable ou un nom incomplet restent nommés comme
    tels, jamais absorbés en silence dans un niveau plus confiant.
    """

    def test_named_and_resolved_role_is_named(self) -> None:
        member = _member_from_contact({"fullName": "Jose Martins", "title": "Directeur des Systèmes d'Information"})
        assert member is not None
        assert member["evidenceLevel"] == "named"

    def test_full_name_but_unresolvable_title_is_probable(self) -> None:
        # On sait QUI (nom complet), mais le titre ne rapproche d'aucun rôle
        # connu du comité — c'est la PERSONNE qui est sûre, pas le siège.
        member = _member_from_contact({"fullName": "Jose Martins", "title": "Chargé de mission transverse"})
        assert member is not None
        assert member["evidenceLevel"] == "probable"

    def test_role_resolved_but_no_name_is_to_research(self) -> None:
        # « CTO (à identifier) » : le siège est connu par le titre, mais
        # personne n'y a encore été rattaché — à rechercher, pas à qualifier.
        member = _member_from_contact({"fullName": "", "title": "CTO"})
        assert member is not None
        assert member["evidenceLevel"] == "to_research"

    def test_incomplete_name_and_unresolvable_role_is_unknown(self) -> None:
        member = _member_from_contact({"fullName": "Jose", "title": "Chargé de mission transverse"})
        assert member is not None
        assert member["evidenceLevel"] == "unknown"

    def test_evidence_level_always_carries_a_french_label(self) -> None:
        member = _member_from_contact({"fullName": "Jose Martins", "title": "CTO"})
        assert member is not None
        assert member["evidenceLevelLabel"] == "Nommé"


# ── Le prisme du VENDEUR entre dans le comité (item 79 du Recovery Pack) ──────
#
# La chaîne de décision industrielle existait et était testée depuis le 24/08,
# mais ce site d'appel ne la passait pas : un « Directeur d'usine » ressortait
# ``user_buyer`` — relais terrain à relancer toutes les deux semaines — chez une
# société qui vend de l'ingénierie industrielle et pour qui c'est le décideur.


@pytest.mark.parametrize(
    "title",
    [
        "Directeur d'usine",
        "Responsable Méthodes",
        "Responsable Maintenance",
        "Responsable Bureau d'Études",
    ],
)
def test_industrial_seller_reads_industrial_deciders_as_technical_buyers(title: str) -> None:
    assert classify_committee_role(title, industrial=True)["role"] == "technical_buyer"


@pytest.mark.parametrize(
    "title",
    [
        "Directeur d'usine",
        "Responsable Méthodes",
        "Responsable Maintenance",
        "Responsable Bureau d'Études",
    ],
)
def test_it_seller_committee_is_unchanged(title: str) -> None:
    """La garde de non-régression : sans le prisme, la sortie reste ce qu'elle
    était. Pour une ESN informatique, un directeur d'usine n'EST pas un décideur —
    c'est sa DSI qui l'est — et lui donner ce rang ferait viser la mauvaise
    personne dans tous les messages du plan."""
    assert classify_committee_role(title, industrial=False)["role"] != "technical_buyer"


def test_the_lens_travels_all_the_way_to_the_assembled_committee() -> None:
    """Ce que le test ci-dessus ne prouve PAS : que le paramètre traverse
    l'assemblage. C'est exactement là qu'il se perdait — la fonction pure était
    juste, personne ne la lui passait."""
    contacts = [{"fullName": "Marie Dubois", "title": "Responsable Méthodes"}]
    it_roles = [m["committeeRole"] for m in assemble_buying_committee(contacts)["members"]]
    industrial_roles = [m["committeeRole"] for m in assemble_buying_committee(contacts, industrial=True)["members"]]
    assert it_roles == ["to_qualify"]
    assert industrial_roles == ["technical_buyer"]


# ── Adaptation sectorielle Automobile — programme/safety (#2311.21) ──────────


@pytest.mark.parametrize(
    "title",
    [
        "Directeur de Programme",
        "Safety Manager",
        "Responsable Sécurité Produit",
    ],
)
def test_automotive_sector_titles_are_technical_buyers_for_an_industrial_seller(title: str) -> None:
    assert classify_committee_role(title, industrial=True)["role"] == "technical_buyer"


@pytest.mark.parametrize(
    "title",
    [
        "Directeur de Programme",
        "Safety Manager",
        "Responsable Sécurité Produit",
    ],
)
def test_it_seller_committee_is_unchanged_for_automotive_titles(title: str) -> None:
    assert classify_committee_role(title, industrial=False)["role"] != "technical_buyer"


# ── Adaptation sectorielle Pharma — validation/procédés (#2311.22) ───────────


@pytest.mark.parametrize(
    "title",
    [
        "Qualified Person",
        "Responsable Pharmacovigilance",
        "Regulatory Affairs Manager",
    ],
)
def test_pharma_sector_titles_are_technical_buyers_for_an_industrial_seller(title: str) -> None:
    assert classify_committee_role(title, industrial=True)["role"] == "technical_buyer"


@pytest.mark.parametrize(
    "title",
    [
        "Qualified Person",
        "Responsable Pharmacovigilance",
        "Regulatory Affairs Manager",
    ],
)
def test_it_seller_committee_is_unchanged_for_pharma_titles(title: str) -> None:
    assert classify_committee_role(title, industrial=False)["role"] != "technical_buyer"


# ── #2791 — sièges du comité propres au SECTEUR, nommés sans contact ─────────
#
# Recette écran 27/09 : « comité d'achat Roche » (pharma) ne rendait que les
# 8 catégories génériques. `sector_committee_seats` nomme les sièges qu'un
# secteur CONNU impose de couvrir, indépendamment de tout contact classé.


def test_pharma_sector_names_its_seats_even_with_no_contact() -> None:
    seats = sector_committee_seats("Industrie pharmaceutique")
    assert "Affaires réglementaires" in seats
    assert "Assurance qualité (QA)" in seats
    assert "Pharmacovigilance" in seats


def test_automobile_sector_names_its_seats_even_with_no_contact() -> None:
    seats = sector_committee_seats("Équipementier automobile")
    assert "Sécurité fonctionnelle / produit" in seats
    assert "Direction de programme" in seats


def test_unmatched_sector_is_an_empty_tuple_never_a_guessed_name() -> None:
    assert sector_committee_seats("Banque de détail") == ()
    assert sector_committee_seats(None) == ()
    assert sector_committee_seats("") == ()


def test_sector_match_is_case_and_accent_insensitive_on_the_keyword() -> None:
    assert sector_committee_seats("PHARMACEUTIQUE") == sector_committee_seats("pharmaceutique")


# #2791 (#2311.18/.20, lot V15 28/09) — la recette du 27/09 (ROCHE, pharma)
# avait trouvé le même trou pour Cyber et Environnement : les DEUX secteurs
# ont déjà un pack de CLASSIFICATION de contact (RSSI/IAM/GRC/SOC ; HSE/EHS,
# `decision_role.py` + `buying_committee.py`), mais ni l'un ni l'autre ne
# nommait ses sièges SANS contact déjà classé — exactement le bug que le lot
# N8 avait corrigé pour pharma/automobile seulement. Vocabulaire réutilisé
# depuis les mêmes détecteurs déjà livrés, aucune seconde liste inventée.


def test_cyber_sector_names_its_seats_even_with_no_contact() -> None:
    seats = sector_committee_seats("Cybersécurité")
    assert "RSSI / Responsable sécurité" in seats
    assert "Responsable IAM" in seats
    assert "Responsable SOC" in seats
    assert "GRC / Conformité SI" in seats


def test_environment_sector_names_its_seats_even_with_no_contact() -> None:
    seats = sector_committee_seats("Gestion des déchets et de l'environnement")
    assert "HSE / Sécurité industrielle" in seats


# ── #3263 (BEL-SC-234) — SPONSOR MÉTIER, un siège distinct du décideur ───────
#
# La spec bêta liste onze rôles canoniques dont « sponsor métier » ; RÈGLE
# explicite : « ne pas confondre sponsor et décideur ». Avant ce lot, un titre
# ne matchant ni achats/décideur/prescripteur/opérationnel/RH/juridique/
# conformité/partenariat/direction de programme tombait `to_qualify` — y
# compris un titre qui se nomme littéralement « Sponsor ». Motif étroit,
# vérifié `git grep -i "sponsor"` sur `decision_role.py` et ce fichier avant
# d'écrire (0 résultat) : ajouté en TOUT dernier recours, après les cinq
# familles de #2791, donc sans reclasser un seul titre déjà couvert.


@pytest.mark.parametrize(
    "title",
    [
        "Sponsor",
        "Sponsor Métier",
        "Sponsor du projet",
        "Executive Sponsor",
        "Parrain du projet",
    ],
)
def test_classify_committee_role_maps_sponsor_titles(title: str) -> None:
    assert classify_committee_role(title)["role"] == "sponsor"


def test_sponsor_never_shadows_an_existing_detector() -> None:
    """Un titre qui contiendrait accidentellement « sponsor » à côté d'un signal
    déjà classé garde ce rôle : le motif sponsor n'est regardé qu'en dernier
    recours (aucune régression sur un titre déjà classé)."""
    assert classify_committee_role("Directeur Général, sponsor du programme")["role"] == "champion"
    assert classify_committee_role("DSI, sponsor de la migration")["role"] == "technical_buyer"


def test_sponsor_is_not_confused_with_the_economic_decider() -> None:
    """La RÈGLE de la spec : sponsor ≠ décideur. Un sponsor n'a pas le pouvoir
    budgétaire d'un décideur économique — il pèse, mais doit être convaincu, pas
    assimilé à celui qui signe."""
    sponsor = classify_committee_role("Sponsor Métier")
    economic = classify_committee_role("Directeur Financier")
    assert sponsor["role"] != economic["role"]
    assert sponsor["role"] == "sponsor"


def test_sponsor_is_a_known_committee_role() -> None:
    assert "sponsor" in COMMITTEE_ROLES
    assert classify_committee_role("Sponsor")["role"] in COMMITTEE_ROLES


def test_sponsor_is_not_part_of_the_five_core_seats() -> None:
    """Ajouter un sixième siège « core » ferait apparaître un nouveau manque sur
    tous les comités existants (golden sets, démo) — le sponsor est un rôle
    identifiable, comme RH/juridique/conformité/partenariat/programme avant lui,
    jamais un siège dont l'absence doit être signalée par `missingRoles`."""
    assert "sponsor" not in CORE_COMMITTEE_ROLES


# ── #3263 (BEL-SC-234) — MULTITHREADING : fils couverts / manquants / ────────
# dépendance excessive à une personne
#
# La spec demande d'ÉVALUER, pas de reclasser : réutilise l'assemblage déjà
# testé (`assemble_buying_committee`) et le niveau de preuve déjà posé
# (#2311.24, `evidenceLevel`) — un fil n'est « couvert » qu'avec un membre
# NOMMÉ (WHO connu), jamais un simple rôle résolu sans personne rattachée.


def test_all_core_threads_covered_when_every_seat_has_a_named_member() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    result = evaluate_multithreading(committee)
    assert set(result["coveredThreads"]) == {
        "technical_buyer",
        "economic_buyer",
        "user_buyer",
        "champion",
        "procurement",
    }
    assert result["missingThreads"] == ["sponsor"]


def test_missing_threads_when_no_member_is_named() -> None:
    committee = assemble_buying_committee([{"fullName": "", "title": "CTO"}])
    result = evaluate_multithreading(committee)
    assert result["coveredThreads"] == []
    assert "technical_buyer" in result["missingThreads"]


def test_empty_committee_has_every_thread_missing() -> None:
    result = evaluate_multithreading(assemble_buying_committee([]))
    assert result["coveredThreads"] == []
    assert set(result["missingThreads"]) == set(MULTITHREADING_ROLES)
    assert result["overreliance"] is None


def test_overreliance_flags_a_single_named_contact_among_several() -> None:
    committee = assemble_buying_committee(
        [
            {"fullName": "Alice Martin", "title": "DSI"},
            {"fullName": "", "title": "Directeur Financier"},  # siège à pourvoir, pas une personne
            {"fullName": "Jose", "title": "Développeur"},  # prénom seul → to_qualify, pas nommé
        ]
    )
    result = evaluate_multithreading(committee)
    assert result["overreliance"] == {"fullName": "Alice Martin", "roles": ["technical_buyer"]}


def test_no_overreliance_when_at_least_two_people_are_named() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    result = evaluate_multithreading(committee)
    assert result["overreliance"] is None


def test_no_overreliance_on_a_single_contact_account() -> None:
    """Un compte avec un SEUL contact au total n'est pas une dépendance à
    surveiller — il n'y a simplement personne d'autre à ajouter pour l'instant."""
    committee = assemble_buying_committee([{"fullName": "Alice Martin", "title": "DSI"}])
    result = evaluate_multithreading(committee)
    assert result["overreliance"] is None


def test_multithreading_is_deterministic() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    assert evaluate_multithreading(committee) == evaluate_multithreading(committee)


# ── #3263.27 (épopée #3282) — ORDRE D'APPROCHE ───────────────────────────────
# Séquence les membres NOMMÉS, distincte d'`opening_movement.py` (niveaux, pas
# personnes). Même ordre de quadrant que `committee_prompt_block`.


def test_approach_order_leads_with_the_champion_by_default() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    order = approach_order(committee)
    assert order[0]["fullName"] == "David Roux"  # Directeur de la Transformation → champion
    assert order[0]["committeeRole"] == "champion"


def test_approach_order_follows_the_objective_quadrant_order() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    sell_order = approach_order(committee, "vendre")
    assert sell_order[0]["committeeRole"] in {"economic_buyer", "technical_buyer"}


def test_approach_order_never_sequences_an_unnamed_seat() -> None:
    committee = assemble_buying_committee(
        [
            {"fullName": "Alice Martin", "title": "DSI"},
            {"fullName": "", "title": "Directeur Financier"},  # siège à pourvoir
            {"fullName": "Jose", "title": "Développeur"},  # prénom seul, jamais nommé
        ]
    )
    order = approach_order(committee)
    assert [entry["fullName"] for entry in order] == ["Alice Martin"]


def test_approach_order_is_empty_without_any_named_member() -> None:
    committee = assemble_buying_committee([{"fullName": "", "title": "CTO"}])
    assert approach_order(committee) == []


def test_approach_order_is_deterministic() -> None:
    committee = assemble_buying_committee(_sample_contacts())
    assert approach_order(committee) == approach_order(committee)
# BEL-SC-235 — ANGLE PAR RÔLE (#3264.22/.24/.27) : les trois rôles sans palier
# hiérarchique (champion, sponsor→economic_buyer, partenaire) ont un angle de
# message ; les autres restent couverts par le levier hiérarchique existant.
@pytest.mark.parametrize(
    ("role", "expected_fragment"),
    [
        ("champion", "apprentissage et capacité d'action"),
        ("economic_buyer", "impact et coût du statu quo"),
        ("partner", "valeur mutuelle et règles"),
    ],
)
def test_committee_message_angle_covers_the_three_roles_without_hierarchy_lever(
    role: str, expected_fragment: str
) -> None:
    angle = committee_message_angle(role)
    assert angle is not None
    assert expected_fragment in angle


@pytest.mark.parametrize("role", ["technical_buyer", "user_buyer", "procurement", "to_qualify", "influencer"])
def test_committee_message_angle_is_none_for_roles_already_covered_by_hierarchy_lever(role: str) -> None:
    # Ces rôles sont déjà couverts par `persona_lever_block` (palier
    # hiérarchique) : aucun second angle, jamais deux consignes concurrentes
    # pour le même contact.
    assert committee_message_angle(role) is None
